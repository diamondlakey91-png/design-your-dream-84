
CREATE TABLE public.permit_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Building',
  status TEXT NOT NULL DEFAULT 'not_started',
  required BOOLEAN NOT NULL DEFAULT true,
  due_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_items TO authenticated;
GRANT ALL ON public.permit_items TO service_role;
ALTER TABLE public.permit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own permit items" ON public.permit_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.project_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;
GRANT ALL ON public.project_documents TO service_role;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own documents" ON public.project_documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER permit_items_touch BEFORE UPDATE ON public.permit_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage RLS for private bucket 'project-docs'
CREATE POLICY "own project docs read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own project docs write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own project docs delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
