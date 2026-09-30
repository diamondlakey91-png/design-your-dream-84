CREATE TABLE public.plan_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  jurisdiction text,
  project_type text,
  occupancy text,
  revision_label text,
  issue_date date,
  sheet_count integer NOT NULL DEFAULT 0,
  disciplines text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  source_review_id uuid REFERENCES public.qaqc_reviews(id) ON DELETE SET NULL,
  reused_from_id uuid REFERENCES public.plan_sets(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_set_sheets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_set_id uuid NOT NULL REFERENCES public.plan_sets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  sheet_number text,
  sheet_title text,
  discipline text,
  revision_number text,
  revision_date text,
  page_index integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_sets TO authenticated;
GRANT ALL ON public.plan_sets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_set_sheets TO authenticated;
GRANT ALL ON public.plan_set_sheets TO service_role;

ALTER TABLE public.plan_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_set_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_sets_select" ON public.plan_sets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (project_id IS NOT NULL AND public.can_access_project(project_id)));
CREATE POLICY "plan_sets_insert" ON public.plan_sets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (project_id IS NULL OR public.can_write_project(project_id)));
CREATE POLICY "plan_sets_update" ON public.plan_sets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (project_id IS NOT NULL AND public.can_write_project(project_id)))
  WITH CHECK (user_id = auth.uid() OR (project_id IS NOT NULL AND public.can_write_project(project_id)));
CREATE POLICY "plan_sets_delete" ON public.plan_sets FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "plan_set_sheets_select" ON public.plan_set_sheets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plan_sets s WHERE s.id = plan_set_id
    AND (s.user_id = auth.uid() OR (s.project_id IS NOT NULL AND public.can_access_project(s.project_id)))));
CREATE POLICY "plan_set_sheets_insert" ON public.plan_set_sheets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.plan_sets s WHERE s.id = plan_set_id
    AND (s.user_id = auth.uid() OR (s.project_id IS NOT NULL AND public.can_write_project(s.project_id)))));
CREATE POLICY "plan_set_sheets_update" ON public.plan_set_sheets FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plan_sets s WHERE s.id = plan_set_id
    AND (s.user_id = auth.uid() OR (s.project_id IS NOT NULL AND public.can_write_project(s.project_id)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plan_sets s WHERE s.id = plan_set_id
    AND (s.user_id = auth.uid() OR (s.project_id IS NOT NULL AND public.can_write_project(s.project_id)))));
CREATE POLICY "plan_set_sheets_delete" ON public.plan_set_sheets FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plan_sets s WHERE s.id = plan_set_id AND s.user_id = auth.uid()));

CREATE INDEX plan_sets_project_idx ON public.plan_sets(project_id);
CREATE INDEX plan_sets_user_idx ON public.plan_sets(user_id, created_at DESC);
CREATE INDEX plan_sets_search_idx ON public.plan_sets
  USING gin (to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(jurisdiction,'') || ' ' || coalesce(project_type,'') || ' ' ||
    coalesce(occupancy,'') || ' ' || coalesce(revision_label,'') || ' ' || coalesce(notes,'')));
CREATE INDEX plan_sets_tags_idx ON public.plan_sets USING gin (tags);
CREATE INDEX plan_sets_disciplines_idx ON public.plan_sets USING gin (disciplines);
CREATE INDEX plan_set_sheets_set_idx ON public.plan_set_sheets(plan_set_id);
CREATE INDEX plan_set_sheets_number_idx ON public.plan_set_sheets(sheet_number);

CREATE TRIGGER plan_sets_touch BEFORE UPDATE ON public.plan_sets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();