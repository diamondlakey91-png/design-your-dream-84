CREATE TABLE public.jurisdiction_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  portal_name text NOT NULL DEFAULT '',
  portal_url text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jurisdiction_syncs TO authenticated;
GRANT ALL ON public.jurisdiction_syncs TO service_role;

ALTER TABLE public.jurisdiction_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own jurisdiction syncs" ON public.jurisdiction_syncs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER jurisdiction_syncs_touch
  BEFORE UPDATE ON public.jurisdiction_syncs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.jurisdiction_syncs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jurisdiction_syncs;