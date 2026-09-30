CREATE OR REPLACE FUNCTION public.guard_document_path()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_trusted_writer() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path THEN RETURN NEW; END IF;
  IF split_part(NEW.storage_path, '/', 1) = auth.uid()::text THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.project_documents d
             WHERE d.storage_path = NEW.storage_path AND d.id <> NEW.id
               AND (d.user_id = auth.uid() OR (d.project_id IS NOT NULL AND public.can_access_project(d.project_id)))) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'You can only register files you uploaded or already have access to';
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_document_path() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_document_path ON public.project_documents;
CREATE TRIGGER guard_document_path BEFORE INSERT OR UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_path();