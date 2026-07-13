ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS stage integer,
  ADD COLUMN IF NOT EXISTS permit_item_id uuid REFERENCES public.permit_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_documents_stage_idx ON public.project_documents(project_id, stage);
CREATE INDEX IF NOT EXISTS project_documents_permit_item_idx ON public.project_documents(permit_item_id);