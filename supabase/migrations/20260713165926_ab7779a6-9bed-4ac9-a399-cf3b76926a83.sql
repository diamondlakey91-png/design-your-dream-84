CREATE TABLE public.permit_sync_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  permit_number TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  found BOOLEAN NOT NULL DEFAULT false,
  source_url TEXT,
  portal_name TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  trigger TEXT NOT NULL DEFAULT 'refresh',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_sync_history TO authenticated;
GRANT ALL ON public.permit_sync_history TO service_role;

ALTER TABLE public.permit_sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their permit sync history"
  ON public.permit_sync_history
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX permit_sync_history_project_idx
  ON public.permit_sync_history(project_id, created_at DESC);
