
CREATE TABLE IF NOT EXISTS public.compliance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  address text NOT NULL,
  project_type text NOT NULL,
  agent_id text NOT NULL,
  jurisdiction text,
  state text,
  status text NOT NULL DEFAULT 'generating',
  summary text,
  report jsonb,
  contacts jsonb DEFAULT '[]'::jsonb,
  timeline jsonb DEFAULT '[]'::jsonb,
  cost_estimate jsonb DEFAULT '{}'::jsonb,
  sources jsonb DEFAULT '[]'::jsonb,
  wbs jsonb DEFAULT '[]'::jsonb,
  confidence numeric,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_reports TO authenticated;
GRANT ALL ON public.compliance_reports TO service_role;

ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own compliance reports" ON public.compliance_reports;
CREATE POLICY "Users manage own compliance reports" ON public.compliance_reports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS touch_compliance_reports ON public.compliance_reports;
CREATE TRIGGER touch_compliance_reports BEFORE UPDATE ON public.compliance_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
