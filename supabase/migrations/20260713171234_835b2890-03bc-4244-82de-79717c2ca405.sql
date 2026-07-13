
CREATE TABLE public.permit_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Permit Analysis',
  intake jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_analyses TO authenticated;
GRANT ALL ON public.permit_analyses TO service_role;

ALTER TABLE public.permit_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own analyses" ON public.permit_analyses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX permit_analyses_user_created_idx ON public.permit_analyses (user_id, created_at DESC);
CREATE INDEX permit_analyses_project_idx ON public.permit_analyses (project_id);

CREATE TRIGGER permit_analyses_touch
  BEFORE UPDATE ON public.permit_analyses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
