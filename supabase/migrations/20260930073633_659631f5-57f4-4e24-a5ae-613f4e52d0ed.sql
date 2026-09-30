ALTER TABLE public.qaqc_reviews
  ADD COLUMN IF NOT EXISTS plan_set_id uuid REFERENCES public.plan_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_key text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sheet_count integer;
CREATE UNIQUE INDEX IF NOT EXISTS qaqc_reviews_request_key_uq ON public.qaqc_reviews(request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS qaqc_reviews_plan_set_idx ON public.qaqc_reviews(plan_set_id);

ALTER TABLE public.qaqc_findings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS page integer,
  ADD COLUMN IF NOT EXISTS bbox jsonb,
  ADD COLUMN IF NOT EXISTS related_sheets text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid;
ALTER TABLE public.qaqc_findings ADD CONSTRAINT qaqc_findings_status_chk CHECK (status IN ('open','needs_review','accepted','not_applicable','resolved'));
ALTER TABLE public.qaqc_findings ADD CONSTRAINT qaqc_findings_confidence_chk CHECK (confidence IS NULL OR confidence IN ('high','medium','low'));
ALTER TABLE public.qaqc_findings ADD CONSTRAINT qaqc_findings_page_chk CHECK (page IS NULL OR page >= 1);
CREATE INDEX IF NOT EXISTS qaqc_findings_review_idx ON public.qaqc_findings(review_id);

-- Keep status and legacy resolved flag in sync; customers may change status only.
CREATE OR REPLACE FUNCTION public.guard_qaqc_finding()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.resolved AND NEW.status = 'open' THEN NEW.status := 'resolved'; END IF;
    NEW.resolved := (NEW.status = 'resolved');
    RETURN NEW;
  END IF;
  IF NOT public.is_trusted_writer() AND (
       NEW.review_id IS DISTINCT FROM OLD.review_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.finding_no IS DISTINCT FROM OLD.finding_no OR NEW.severity IS DISTINCT FROM OLD.severity
    OR NEW.category IS DISTINCT FROM OLD.category OR NEW.discipline IS DISTINCT FROM OLD.discipline
    OR NEW.sheet_number IS DISTINCT FROM OLD.sheet_number OR NEW.sheet_title IS DISTINCT FROM OLD.sheet_title
    OR NEW.location IS DISTINCT FROM OLD.location OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.plain_language IS DISTINCT FROM OLD.plain_language OR NEW.why_it_matters IS DISTINCT FROM OLD.why_it_matters
    OR NEW.code_basis IS DISTINCT FROM OLD.code_basis OR NEW.jurisdiction_source_url IS DISTINCT FROM OLD.jurisdiction_source_url
    OR NEW.recommended_action IS DISTINCT FROM OLD.recommended_action OR NEW.responsible_discipline IS DISTINCT FROM OLD.responsible_discipline
    OR NEW.verification IS DISTINCT FROM OLD.verification OR NEW.document_id IS DISTINCT FROM OLD.document_id
    OR NEW.page IS DISTINCT FROM OLD.page OR NEW.bbox IS DISTINCT FROM OLD.bbox
    OR NEW.related_sheets IS DISTINCT FROM OLD.related_sheets OR NEW.confidence IS DISTINCT FROM OLD.confidence
  ) THEN
    RAISE EXCEPTION 'Only the finding status can be changed';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.resolved := (NEW.status = 'resolved');
  ELSIF NEW.resolved IS DISTINCT FROM OLD.resolved THEN
    NEW.status := CASE WHEN NEW.resolved THEN 'resolved' ELSE 'open' END;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now(); NEW.status_changed_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_qaqc_finding ON public.qaqc_findings;
CREATE TRIGGER guard_qaqc_finding BEFORE INSERT OR UPDATE ON public.qaqc_findings FOR EACH ROW EXECUTE FUNCTION public.guard_qaqc_finding();

-- Findings / sheets: visible to the project team; only the review owner can add.
DROP POLICY IF EXISTS "own qaqc findings" ON public.qaqc_findings;
CREATE POLICY qaqc_findings_select ON public.qaqc_findings FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.qaqc_reviews r WHERE r.id = review_id AND (r.user_id = auth.uid() OR (r.project_id IS NOT NULL AND public.can_access_project(r.project_id)))));
CREATE POLICY qaqc_findings_insert ON public.qaqc_findings FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.qaqc_reviews r WHERE r.id = review_id AND r.user_id = auth.uid()));
CREATE POLICY qaqc_findings_update ON public.qaqc_findings FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.qaqc_reviews r WHERE r.id = review_id AND (r.user_id = auth.uid() OR (r.project_id IS NOT NULL AND public.can_write_project(r.project_id)))));
CREATE POLICY qaqc_findings_delete ON public.qaqc_findings FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.qaqc_reviews r WHERE r.id = review_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "own qaqc sheets" ON public.qaqc_sheets;
CREATE POLICY qaqc_sheets_select ON public.qaqc_sheets FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.qaqc_reviews r WHERE r.id = review_id AND (r.user_id = auth.uid() OR (r.project_id IS NOT NULL AND public.can_access_project(r.project_id)))));
CREATE POLICY qaqc_sheets_insert ON public.qaqc_sheets FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.qaqc_reviews r WHERE r.id = review_id AND r.user_id = auth.uid()));
CREATE POLICY qaqc_sheets_modify ON public.qaqc_sheets FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.qaqc_reviews r WHERE r.id = review_id AND r.user_id = auth.uid()));
CREATE POLICY qaqc_sheets_delete ON public.qaqc_sheets FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.qaqc_reviews r WHERE r.id = review_id AND r.user_id = auth.uid()));

-- Activity: started / completed / failed / finding status changed.
CREATE OR REPLACE FUNCTION public.log_plan_review_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; act text; descr text; label text; n int;
BEGIN
  IF TG_TABLE_NAME = 'qaqc_reviews' THEN
    pid := NEW.project_id;
    label := coalesce((SELECT ps.title || ' (V' || ps.version_number || ')' FROM public.plan_sets ps WHERE ps.id = NEW.plan_set_id), NEW.revision_label, 'plans');
    IF TG_OP = 'INSERT' THEN act := 'plan_review_started'; descr := 'Plan Review started: ' || label;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'complete' THEN
      SELECT count(*) INTO n FROM public.qaqc_findings WHERE review_id = NEW.id;
      act := 'plan_review_completed'; descr := 'Plan Review completed: ' || label || ' — ' || n || ' findings';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'error' THEN
      act := 'plan_review_failed'; descr := 'Plan Review failed: ' || label;
    ELSE RETURN NEW; END IF;
    IF pid IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.activity(project_id, user_id, description, action, object_type, object_id)
    VALUES (pid, coalesce(auth.uid(), NEW.user_id), descr, act, 'qaqc_reviews', NEW.id);
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    SELECT project_id INTO pid FROM public.qaqc_reviews WHERE id = NEW.review_id;
    IF pid IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.activity(project_id, user_id, description, action, object_type, object_id)
    VALUES (pid, coalesce(auth.uid(), NEW.user_id),
      'Finding #' || NEW.finding_no || ' → ' || replace(NEW.status, '_', ' ') || ': ' || left(NEW.summary, 80),
      'finding_status_changed', 'qaqc_findings', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS log_activity_qaqc_reviews ON public.qaqc_reviews;
CREATE TRIGGER log_activity_qaqc_reviews AFTER INSERT OR UPDATE OF status ON public.qaqc_reviews FOR EACH ROW EXECUTE FUNCTION public.log_plan_review_activity();
DROP TRIGGER IF EXISTS log_activity_qaqc_findings ON public.qaqc_findings;
CREATE TRIGGER log_activity_qaqc_findings AFTER UPDATE OF status ON public.qaqc_findings FOR EACH ROW EXECUTE FUNCTION public.log_plan_review_activity();

-- Internal beta evaluation (admin / internal_ai only; never customer-visible).
CREATE TABLE public.qaqc_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.qaqc_reviews(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.qaqc_findings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('finding','missed_issue')),
  accuracy text CHECK (accuracy IS NULL OR accuracy IN ('accurate','partially_accurate','false_positive')),
  usefulness text CHECK (usefulness IS NULL OR usefulness IN ('useful','not_useful')),
  sheet_number text,
  notes text,
  evaluator_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'finding') = (finding_id IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qaqc_evaluations TO authenticated;
GRANT ALL ON public.qaqc_evaluations TO service_role;
ALTER TABLE public.qaqc_evaluations ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX qaqc_evaluations_finding_uq ON public.qaqc_evaluations(finding_id, evaluator_id) WHERE finding_id IS NOT NULL;
CREATE INDEX qaqc_evaluations_review_idx ON public.qaqc_evaluations(review_id);
CREATE POLICY qaqc_evaluations_staff ON public.qaqc_evaluations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'internal_ai'::app_role))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'internal_ai'::app_role)) AND evaluator_id = auth.uid());
CREATE TRIGGER qaqc_evaluations_updated_at BEFORE UPDATE ON public.qaqc_evaluations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();