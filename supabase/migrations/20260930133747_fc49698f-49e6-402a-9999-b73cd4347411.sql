CREATE TABLE public.regulatory_research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  address text NOT NULL,
  address_hash text NOT NULL,
  scope_hash text,
  trigger text NOT NULL DEFAULT 'auto' CHECK (trigger IN ('auto','refresh','address_change','scope_change')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','researching','completed','completed_with_warnings','needs_human_verification','failed')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_step int NOT NULL DEFAULT 0,
  escalations jsonb NOT NULL DEFAULT '[]'::jsonb,
  usage jsonb NOT NULL DEFAULT '{"deterministic_calls":0,"paid_data_calls":0,"ai_calls":0,"tokens":0,"estimated_cost_usd":0,"duration_ms":0}'::jsonb,
  error text,
  lease_until timestamptz,
  requested_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regulatory_research_jobs TO authenticated;
GRANT ALL ON public.regulatory_research_jobs TO service_role;
ALTER TABLE public.regulatory_research_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research jobs team read" ON public.regulatory_research_jobs FOR SELECT TO authenticated
  USING (public.can_access_project(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE INDEX regulatory_research_jobs_project_idx ON public.regulatory_research_jobs(project_id, created_at DESC);
CREATE TRIGGER regulatory_research_jobs_touch BEFORE UPDATE ON public.regulatory_research_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();