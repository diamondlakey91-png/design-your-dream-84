DROP TRIGGER IF EXISTS log_activity_documents ON public.project_documents;
CREATE TRIGGER log_activity_documents AFTER INSERT OR UPDATE OF plan_reviewed_at, document_category, permit_item_id ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();

CREATE OR REPLACE FUNCTION public.log_project_activity_extra()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- secondary events when two tracked fields change in one update
  IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'permit_items' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.depends_on IS DISTINCT FROM OLD.depends_on THEN
    INSERT INTO public.activity(project_id,user_id,description,action,object_type,object_id)
    VALUES (NEW.project_id, coalesce(auth.uid(),NEW.user_id), 'Prerequisites updated: '||NEW.name, 'roadmap_dependency_changed', 'permit_items', NEW.id);
  ELSIF TG_TABLE_NAME = 'project_documents' AND NEW.document_category IS DISTINCT FROM OLD.document_category
        AND NEW.permit_item_id IS DISTINCT FROM OLD.permit_item_id AND NEW.permit_item_id IS NOT NULL
        AND NOT (NEW.plan_reviewed_at IS NOT NULL AND OLD.plan_reviewed_at IS DISTINCT FROM NEW.plan_reviewed_at) THEN
    INSERT INTO public.activity(project_id,user_id,description,action,object_type,object_id)
    VALUES (NEW.project_id, coalesce(auth.uid(),NEW.user_id),
      coalesce(NEW.name,'Document')||' linked to '||coalesce((SELECT name FROM public.permit_items WHERE id=NEW.permit_item_id),'roadmap item'),
      'document_linked', 'project_documents', NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_project_activity_extra() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS log_activity_extra_items ON public.permit_items;
CREATE TRIGGER log_activity_extra_items AFTER UPDATE ON public.permit_items FOR EACH ROW EXECUTE FUNCTION public.log_project_activity_extra();
DROP TRIGGER IF EXISTS log_activity_extra_docs ON public.project_documents;
CREATE TRIGGER log_activity_extra_docs AFTER UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION public.log_project_activity_extra();