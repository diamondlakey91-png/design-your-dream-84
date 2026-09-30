ALTER TABLE public.permit_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS agency text,
  ADD COLUMN IF NOT EXISTS application_url text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS requirement_confidence text NOT NULL DEFAULT 'potential',
  ADD COLUMN IF NOT EXISTS fee_text text,
  ADD COLUMN IF NOT EXISTS review_timing text,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS depends_on uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS roadmap_permit_id uuid,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE public.permit_items DROP CONSTRAINT IF EXISTS permit_items_requirement_confidence_chk;
ALTER TABLE public.permit_items ADD CONSTRAINT permit_items_requirement_confidence_chk
  CHECK (requirement_confidence IN ('verified','needs_verification','potential'));

CREATE OR REPLACE FUNCTION public.guard_permit_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_trusted_writer() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.requirement_confidence = 'verified' THEN NEW.requirement_confidence := 'needs_verification'; END IF;
    NEW.fee_text := NULL; NEW.review_timing := NULL; NEW.last_verified_at := NULL; NEW.roadmap_permit_id := NULL;
  ELSE
    IF NEW.requirement_confidence = 'verified' AND OLD.requirement_confidence IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'Only Permivio can mark a requirement verified';
    END IF;
    IF NEW.fee_text IS DISTINCT FROM OLD.fee_text OR NEW.review_timing IS DISTINCT FROM OLD.review_timing
       OR NEW.last_verified_at IS DISTINCT FROM OLD.last_verified_at OR NEW.roadmap_permit_id IS DISTINCT FROM OLD.roadmap_permit_id THEN
      RAISE EXCEPTION 'Sourced fee, timing and verification fields are set only by Permivio';
    END IF;
  END IF;
  -- prerequisites must be other items on the same project
  IF array_length(NEW.depends_on,1) > 0 THEN
    IF NEW.id = ANY(NEW.depends_on) THEN RAISE EXCEPTION 'An item cannot depend on itself'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(NEW.depends_on) d WHERE NOT EXISTS
      (SELECT 1 FROM public.permit_items p WHERE p.id = d AND p.project_id IS NOT DISTINCT FROM NEW.project_id)) THEN
      RAISE EXCEPTION 'Prerequisites must belong to the same project';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_permit_item ON public.permit_items;
CREATE TRIGGER guard_permit_item BEFORE INSERT OR UPDATE ON public.permit_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_permit_item();

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS document_category text NOT NULL DEFAULT 'other';
ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_category_chk;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_category_chk CHECK (document_category IN
  ('drawings','specifications','application','survey','engineering','correction','correspondence','inspection','approval','certificate','supporting','other'));

ALTER TABLE public.plan_sets
  ADD COLUMN IF NOT EXISTS version_number integer,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS plan_sets_one_current_per_project
  ON public.plan_sets(project_id) WHERE is_current AND project_id IS NOT NULL;

-- Team file access: registered project files readable by anyone who can access the project
DROP POLICY IF EXISTS "project team docs read" ON storage.objects;
CREATE POLICY "project team docs read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-docs' AND EXISTS (
    SELECT 1 FROM public.project_documents d
    WHERE d.storage_path = storage.objects.name
      AND d.project_id IS NOT NULL
      AND public.can_access_project(d.project_id)
  )
);

CREATE OR REPLACE FUNCTION public.log_project_activity()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE pid uuid; actor uuid; act text; descr text; otype text := TG_TABLE_NAME;
BEGIN
  IF TG_TABLE_NAME = 'project_documents' THEN
    pid := NEW.project_id; actor := coalesce(auth.uid(), NEW.user_id);
    IF TG_OP = 'INSERT' THEN act := 'document_uploaded'; descr := 'Document uploaded: ' || coalesce(NEW.name, 'file');
    ELSIF NEW.plan_reviewed_at IS NOT NULL AND OLD.plan_reviewed_at IS DISTINCT FROM NEW.plan_reviewed_at THEN
      act := 'plan_review_completed'; descr := 'Plan review completed: ' || coalesce(NEW.name, 'plan');
    ELSIF NEW.document_category IS DISTINCT FROM OLD.document_category THEN
      act := 'document_classified'; descr := coalesce(NEW.name,'Document') || ' classified as ' || NEW.document_category;
    ELSIF NEW.permit_item_id IS DISTINCT FROM OLD.permit_item_id AND NEW.permit_item_id IS NOT NULL THEN
      act := 'document_linked'; descr := coalesce(NEW.name,'Document') || ' linked to ' ||
        coalesce((SELECT name FROM public.permit_items WHERE id = NEW.permit_item_id), 'roadmap item');
    ELSE RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'permit_roadmaps' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
    pid := NEW.project_id; actor := auth.uid(); act := 'roadmap_generated'; descr := 'Permit roadmap generated';
  ELSIF TG_TABLE_NAME = 'inspections' THEN
    pid := NEW.project_id; actor := coalesce(auth.uid(), NEW.user_id);
    IF TG_OP = 'INSERT' THEN act := 'inspection_added'; descr := 'Inspection added: ' || coalesce(NEW.inspection_type, 'inspection');
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      act := 'inspection_' || lower(coalesce(NEW.status, 'updated'));
      descr := 'Inspection ' || coalesce(NEW.inspection_type, '') || ' → ' || coalesce(NEW.status, 'updated');
    ELSE RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'permit_items' THEN
    IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
    pid := NEW.project_id; actor := coalesce(auth.uid(), NEW.user_id);
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      act := 'roadmap_item_status'; descr := NEW.name || ' → ' || replace(NEW.status, '_', ' ');
    ELSIF NEW.depends_on IS DISTINCT FROM OLD.depends_on THEN
      act := 'roadmap_dependency_changed'; descr := 'Prerequisites updated: ' || NEW.name;
    ELSE RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'plan_sets' THEN
    pid := NEW.project_id; actor := coalesce(auth.uid(), NEW.user_id);
    IF TG_OP = 'INSERT' THEN
      act := CASE WHEN coalesce(NEW.version_number,1) > 1 THEN 'plan_version_uploaded' ELSE 'plan_set_created' END;
      descr := 'Plan set created: ' || NEW.title || coalesce(' (V' || NEW.version_number || ')', '');
    ELSIF NEW.is_current AND NOT OLD.is_current THEN
      act := 'current_plan_set_changed'; descr := 'Current plan set: ' || NEW.title || coalesce(' (V' || NEW.version_number || ')', '');
    ELSE RETURN NEW; END IF;
  ELSE RETURN NEW; END IF;
  IF pid IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity(project_id, user_id, description, action, object_type, object_id)
  VALUES (pid, actor, descr, act, otype, NEW.id);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS log_activity_permit_items ON public.permit_items;
CREATE TRIGGER log_activity_permit_items AFTER UPDATE ON public.permit_items
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();
DROP TRIGGER IF EXISTS log_activity_plan_sets ON public.plan_sets;
CREATE TRIGGER log_activity_plan_sets AFTER INSERT OR UPDATE ON public.plan_sets
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();
REVOKE EXECUTE ON FUNCTION public.guard_permit_item() FROM PUBLIC, anon, authenticated;