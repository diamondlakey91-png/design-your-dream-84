
CREATE TABLE public.report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  report jsonb NOT NULL,
  project_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  password_hash text,
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX report_shares_token_idx ON public.report_shares(token);
CREATE INDEX report_shares_project_idx ON public.report_shares(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_shares TO authenticated;
GRANT ALL ON public.report_shares TO service_role;

ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own report shares"
  ON public.report_shares FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER report_shares_updated_at
  BEFORE UPDATE ON public.report_shares
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
