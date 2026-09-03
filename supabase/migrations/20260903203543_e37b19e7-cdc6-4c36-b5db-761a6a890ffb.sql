-- PERMIVIO AI agent framework foundation (additive only).

CREATE TABLE IF NOT EXISTS public.agent_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL UNIQUE,
  name text NOT NULL,
  version text NOT NULL,
  description text NOT NULL,
  phases text[] NOT NULL DEFAULT '{}',
  service_products text[] NOT NULL DEFAULT '{}',
  required_inputs text[] NOT NULL DEFAULT '{}',
  optional_inputs text[] NOT NULL DEFAULT '{}',
  output_schema text NOT NULL DEFAULT 'agent_output_v1',
  dependencies text[] NOT NULL DEFAULT '{}',
  tools_allowed text[] NOT NULL DEFAULT '{}',
  max_attempts integer NOT NULL DEFAULT 3,
  timeout_ms integer NOT NULL DEFAULT 120000,
  concurrency_safe boolean NOT NULL DEFAULT true,
  human_review_required boolean NOT NULL DEFAULT false,
  client_visible_output_allowed boolean NOT NULL DEFAULT true,
  prompt_version text NOT NULL DEFAULT 'agent@1',
  model jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key text NOT NULL UNIQUE,
  name text NOT NULL,
  version text NOT NULL,
  service_product_key text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key text NOT NULL,
  workflow_version text NOT NULL DEFAULT '1.0.0',
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  sir_request_id uuid,
  service_order_id uuid,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_deliverable text NOT NULL DEFAULT 'report',
  status text NOT NULL DEFAULT 'draft',
  client_stage text NOT NULL DEFAULT 'Reviewing your project information',
  progress_percent integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1,
  supersedes_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  qa_status text NOT NULL DEFAULT 'pending',
  review_stage text NOT NULL DEFAULT 'not_started',
  professional_review_required boolean NOT NULL DEFAULT false,
  blocking_question_count integer NOT NULL DEFAULT 0,
  total_credits_reserved integer NOT NULL DEFAULT 0,
  total_credits_used integer NOT NULL DEFAULT 0,
  total_estimated_cost numeric(12,6) NOT NULL DEFAULT 0,
  failure_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_runs_org_idx ON public.agent_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_project_idx ON public.agent_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON public.agent_runs(status);

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  agent_version text NOT NULL DEFAULT '1.0.0',
  prompt_version text NOT NULL DEFAULT 'agent@1',
  model text,
  sequence integer NOT NULL DEFAULT 0,
  parallel_group integer NOT NULL DEFAULT 1,
  optional boolean NOT NULL DEFAULT false,
  dependencies text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  input_snapshot jsonb,
  output_snapshot jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_run_id, agent_key, sequence)
);
CREATE INDEX IF NOT EXISTS agent_tasks_run_idx ON public.agent_tasks(agent_run_id, sequence);

CREATE TABLE IF NOT EXISTS public.agent_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  agent_task_id uuid REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  source_type text NOT NULL,
  title text NOT NULL,
  publisher text NOT NULL,
  url text,
  uploaded_document_id text,
  code_section text,
  page_reference text,
  map_layer text,
  effective_date text,
  accessed_at timestamptz,
  geographic_scope text,
  authority_level text NOT NULL DEFAULT 'unknown',
  retrieved boolean NOT NULL DEFAULT false,
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_run_id, source_key)
);
CREATE INDEX IF NOT EXISTS agent_sources_run_idx ON public.agent_sources(agent_run_id);

CREATE TABLE IF NOT EXISTS public.agent_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  agent_task_id uuid REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  agent_key text NOT NULL,
  finding_key text NOT NULL,
  module text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  finding text NOT NULL,
  analysis text NOT NULL DEFAULT '',
  applicability text NOT NULL DEFAULT '',
  verification_status text NOT NULL DEFAULT 'pending_confirmation',
  confidence text NOT NULL DEFAULT 'medium',
  agency text,
  geographic_scope text,
  risk_level text NOT NULL DEFAULT 'none',
  cost_impact text,
  schedule_impact text,
  recommendation text,
  responsible_party text,
  confirmation_required boolean NOT NULL DEFAULT true,
  client_visible boolean NOT NULL DEFAULT true,
  review_action text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  superseded_by uuid REFERENCES public.agent_findings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_run_id, finding_key)
);
CREATE INDEX IF NOT EXISTS agent_findings_run_idx ON public.agent_findings(agent_run_id);
CREATE INDEX IF NOT EXISTS agent_findings_module_idx ON public.agent_findings(module);

CREATE TABLE IF NOT EXISTS public.agent_finding_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_finding_id uuid NOT NULL REFERENCES public.agent_findings(id) ON DELETE CASCADE,
  agent_source_id uuid NOT NULL REFERENCES public.agent_sources(id) ON DELETE CASCADE,
  supporting_excerpt text,
  support_description text,
  primary_source boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_finding_id, agent_source_id)
);

CREATE TABLE IF NOT EXISTS public.agent_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  description text NOT NULL,
  finding_ids uuid[] NOT NULL DEFAULT '{}',
  source_ids uuid[] NOT NULL DEFAULT '{}',
  severity text NOT NULL DEFAULT 'medium',
  affects text[] NOT NULL DEFAULT '{}',
  resolution_status text NOT NULL DEFAULT 'unresolved',
  resolution_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_conflicts_run_idx ON public.agent_conflicts(agent_run_id);

CREATE TABLE IF NOT EXISTS public.agent_client_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  question_key text NOT NULL,
  question text NOT NULL,
  why_it_matters text NOT NULL DEFAULT '',
  who_can_answer text,
  blocking boolean NOT NULL DEFAULT false,
  answer text,
  answered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_run_id, question_key)
);
CREATE INDEX IF NOT EXISTS agent_client_questions_run_idx ON public.agent_client_questions(agent_run_id);

CREATE TABLE IF NOT EXISTS public.agent_quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  label text NOT NULL,
  blocking boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_run_id, check_key)
);
CREATE INDEX IF NOT EXISTS agent_quality_checks_run_idx ON public.agent_quality_checks(agent_run_id);

CREATE TABLE IF NOT EXISTS public.agent_review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  agent_finding_id uuid REFERENCES public.agent_findings(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name text,
  stage text NOT NULL DEFAULT 'professional_review',
  action text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_review_actions_run_idx ON public.agent_review_actions(agent_run_id);

CREATE TABLE IF NOT EXISTS public.agent_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  agent_task_id uuid REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  charge_key text NOT NULL UNIQUE,
  entry_type text NOT NULL DEFAULT 'usage',
  model text,
  input_units integer NOT NULL DEFAULT 0,
  output_units integer NOT NULL DEFAULT 0,
  research_calls integer NOT NULL DEFAULT 0,
  document_pages integer NOT NULL DEFAULT 0,
  estimated_cost numeric(12,6) NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_usage_ledger_run_idx ON public.agent_usage_ledger(agent_run_id);

-- Grants -------------------------------------------------------------------
GRANT SELECT ON public.agent_definitions TO authenticated;
GRANT ALL ON public.agent_definitions TO service_role;
GRANT SELECT ON public.agent_workflows TO authenticated;
GRANT ALL ON public.agent_workflows TO service_role;
GRANT SELECT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
GRANT SELECT ON public.agent_tasks TO authenticated;
GRANT ALL ON public.agent_tasks TO service_role;
GRANT SELECT ON public.agent_sources TO authenticated;
GRANT ALL ON public.agent_sources TO service_role;
GRANT SELECT ON public.agent_findings TO authenticated;
GRANT ALL ON public.agent_findings TO service_role;
GRANT SELECT ON public.agent_finding_sources TO authenticated;
GRANT ALL ON public.agent_finding_sources TO service_role;
GRANT SELECT ON public.agent_conflicts TO authenticated;
GRANT ALL ON public.agent_conflicts TO service_role;
GRANT SELECT, UPDATE ON public.agent_client_questions TO authenticated;
GRANT ALL ON public.agent_client_questions TO service_role;
GRANT SELECT ON public.agent_quality_checks TO authenticated;
GRANT ALL ON public.agent_quality_checks TO service_role;
GRANT SELECT, INSERT ON public.agent_review_actions TO authenticated;
GRANT ALL ON public.agent_review_actions TO service_role;
GRANT SELECT ON public.agent_usage_ledger TO authenticated;
GRANT ALL ON public.agent_usage_ledger TO service_role;

-- Access helpers -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_agent_run(_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_runs r
    WHERE r.id = _run_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR r.requested_by = auth.uid()
        OR (r.organization_id IS NOT NULL AND public.is_org_member(r.organization_id))
        OR (r.project_id IS NOT NULL AND public.can_access_project(r.project_id))
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_agent_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_agent_run(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_agent_reviewer(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
    OR (_org_id IS NOT NULL AND (
      public.has_org_role(_org_id, 'qaqc_reviewer')
      OR public.has_org_role(_org_id, 'authorized_reviewer')
      OR public.has_org_role(_org_id, 'org_admin')
    ))
$$;
REVOKE EXECUTE ON FUNCTION public.is_agent_reviewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_agent_reviewer(uuid) TO authenticated, service_role;

-- RLS ----------------------------------------------------------------------
ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_finding_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_client_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read the agent catalog"
  ON public.agent_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage the agent catalog"
  ON public.agent_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Signed-in users can read the workflow catalog"
  ON public.agent_workflows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage the workflow catalog"
  ON public.agent_workflows FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view their agent runs"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR requested_by = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR (project_id IS NOT NULL AND public.can_access_project(project_id))
  );
CREATE POLICY "Admins manage agent runs"
  ON public.agent_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view agent tasks"
  ON public.agent_tasks FOR SELECT TO authenticated USING (public.can_access_agent_run(agent_run_id));
CREATE POLICY "Admins manage agent tasks"
  ON public.agent_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view agent sources"
  ON public.agent_sources FOR SELECT TO authenticated USING (public.can_access_agent_run(agent_run_id));
CREATE POLICY "Admins manage agent sources"
  ON public.agent_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view agent findings"
  ON public.agent_findings FOR SELECT TO authenticated USING (public.can_access_agent_run(agent_run_id));
CREATE POLICY "Admins manage agent findings"
  ON public.agent_findings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view finding sources"
  ON public.agent_finding_sources FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_findings f
    WHERE f.id = agent_finding_id AND public.can_access_agent_run(f.agent_run_id)
  ));
CREATE POLICY "Admins manage finding sources"
  ON public.agent_finding_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view agent conflicts"
  ON public.agent_conflicts FOR SELECT TO authenticated USING (public.can_access_agent_run(agent_run_id));
CREATE POLICY "Admins manage agent conflicts"
  ON public.agent_conflicts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view client questions"
  ON public.agent_client_questions FOR SELECT TO authenticated USING (public.can_access_agent_run(agent_run_id));
CREATE POLICY "Members can answer client questions"
  ON public.agent_client_questions FOR UPDATE TO authenticated
  USING (public.can_access_agent_run(agent_run_id)) WITH CHECK (public.can_access_agent_run(agent_run_id));
CREATE POLICY "Admins manage client questions"
  ON public.agent_client_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view quality checks"
  ON public.agent_quality_checks FOR SELECT TO authenticated USING (public.can_access_agent_run(agent_run_id));
CREATE POLICY "Admins manage quality checks"
  ON public.agent_quality_checks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view review actions"
  ON public.agent_review_actions FOR SELECT TO authenticated USING (public.can_access_agent_run(agent_run_id));
CREATE POLICY "Reviewers can record review actions"
  ON public.agent_review_actions FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.agent_runs r
      WHERE r.id = agent_run_id AND public.is_agent_reviewer(r.organization_id)
    )
  );
CREATE POLICY "Admins manage review actions"
  ON public.agent_review_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can view the usage ledger"
  ON public.agent_usage_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage the usage ledger"
  ON public.agent_usage_ledger FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers ------------------------------------------------------
CREATE TRIGGER agent_definitions_touch BEFORE UPDATE ON public.agent_definitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER agent_workflows_touch BEFORE UPDATE ON public.agent_workflows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER agent_runs_touch BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER agent_tasks_touch BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER agent_findings_touch BEFORE UPDATE ON public.agent_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();