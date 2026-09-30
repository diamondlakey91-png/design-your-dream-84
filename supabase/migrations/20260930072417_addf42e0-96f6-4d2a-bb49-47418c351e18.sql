CREATE OR REPLACE FUNCTION public.log_project_activity_extra()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'permit_items' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.depends_on IS DISTINCT FROM OLD.depends_on THEN
      INSERT INTO public.activity(project_id,user_id,description,action,object_type,object_id)
      VALUES (NEW.project_id, coalesce(auth.uid(),NEW.user_id), 'Prerequisites updated: '||NEW.name, 'roadmap_dependency_changed', 'permit_items', NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'project_documents' THEN
    IF NEW.document_category IS DISTINCT FROM OLD.document_category
       AND NEW.permit_item_id IS DISTINCT FROM OLD.permit_item_id AND NEW.permit_item_id IS NOT NULL
       AND NOT (NEW.plan_reviewed_at IS NOT NULL AND OLD.plan_reviewed_at IS DISTINCT FROM NEW.plan_reviewed_at) THEN
      INSERT INTO public.activity(project_id,user_id,description,action,object_type,object_id)
      VALUES (NEW.project_id, coalesce(auth.uid(),NEW.user_id),
        coalesce(NEW.name,'Document')||' linked to '||coalesce((SELECT name FROM public.permit_items WHERE id=NEW.permit_item_id),'roadmap item'),
        'document_linked', 'project_documents', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;