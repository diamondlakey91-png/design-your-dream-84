-- Phase 2A: intake context on projects (additive)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS scope_description text,
  ADD COLUMN IF NOT EXISTS occupancy_class public.res_or_com,
  ADD COLUMN IF NOT EXISTS work_type public.scope_project_type,
  ADD COLUMN IF NOT EXISTS target_start_date date,
  ADD COLUMN IF NOT EXISTS intake_notes text;

-- Phase 2A: structured activity (additive; description kept)
ALTER TABLE public.activity
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS object_type text,
  ADD COLUMN IF NOT EXISTS object_id uuid;
CREATE INDEX IF NOT EXISTS activity_project_created_idx ON public.activity(project_id, created_at DESC);

-- Automatic activity for key lifecycle events (server-side, cannot be skipped by clients)
CREATE OR REPLACE FUNCTION public.log_project_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; actor uuid; act text; descr text; otype text := TG_TABLE_NAME;
BEGIN
  IF TG_TABLE_NAME = 'project_documents' THEN
    pid := NEW.project_id; actor := coalesce(auth.uid(), NEW.user_id);
    IF TG_OP = 'INSERT' THEN act := 'document_uploaded'; descr := 'Document uploaded: ' || coalesce(NEW.name, 'file');
    ELSIF NEW.plan_reviewed_at IS NOT NULL AND OLD.plan_reviewed_at IS DISTINCT FROM NEW.plan_reviewed_at THEN
      act := 'plan_review_completed'; descr := 'Plan review completed: ' || coalesce(NEW.name, 'plan');
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
  ELSE RETURN NEW; END IF;
  IF pid IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity(project_id, user_id, description, action, object_type, object_id)
  VALUES (pid, actor, descr, act, otype, NEW.id);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_project_activity() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS log_activity_documents ON public.project_documents;
CREATE TRIGGER log_activity_documents AFTER INSERT OR UPDATE OF plan_reviewed_at ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();
DROP TRIGGER IF EXISTS log_activity_roadmaps ON public.permit_roadmaps;
CREATE TRIGGER log_activity_roadmaps AFTER INSERT ON public.permit_roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();
DROP TRIGGER IF EXISTS log_activity_inspections ON public.inspections;
CREATE TRIGGER log_activity_inspections AFTER INSERT OR UPDATE OF status ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();