
-- Named, persisted candidate-site comparison sets
CREATE TABLE IF NOT EXISTS public.screen_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screen_sets TO authenticated;
GRANT ALL ON public.screen_sets TO service_role;
ALTER TABLE public.screen_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own screen sets" ON public.screen_sets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER screen_sets_touch BEFORE UPDATE ON public.screen_sets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.permit_analyses
  ADD COLUMN IF NOT EXISTS screen_set_id uuid REFERENCES public.screen_sets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS permit_analyses_screen_set_idx ON public.permit_analyses (screen_set_id);
