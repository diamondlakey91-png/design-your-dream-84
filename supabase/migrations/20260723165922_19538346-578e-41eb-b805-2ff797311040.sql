
CREATE TABLE public.compliance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  address text NOT NULL,
  project_type text NOT NULL,
  agent_id text NOT NULL,
  jurisdiction text,
  state text,
  status text NOT NULL DEFAULT 'ready',
  summary text,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_estimate jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  wbs jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_reports TO authenticated;
GRANT ALL ON public.compliance_reports TO service_role;

ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own compliance reports"
  ON public.compliance_reports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX compliance_reports_user_idx ON public.compliance_reports(user_id, created_at DESC);
CREATE INDEX compliance_reports_project_idx ON public.compliance_reports(project_id);

CREATE TRIGGER compliance_reports_updated_at
  BEFORE UPDATE ON public.compliance_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
