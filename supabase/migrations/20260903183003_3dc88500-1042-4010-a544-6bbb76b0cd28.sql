-- Enums -------------------------------------------------------------------
CREATE TYPE public.sir_workflow_status AS ENUM (
  'research_not_started','research_in_progress','research_complete',
  'qaqc_failed','corrections_required','qaqc_passed',
  'lpg_review_pending','lpg_reviewed','approved_for_client_delivery'
);

CREATE TYPE public.sir_verification_status AS ENUM (
  'verified','preliminary_analysis','pending_confirmation',
  'client_input_required','not_available','conflict_detected'
);

CREATE TYPE public.sir_confidence AS ENUM ('high','medium','low');

CREATE TYPE public.sir_agent AS ENUM (
  'lead','intake_scope','property_jurisdiction','document_intelligence',
  'zoning_entitlement','building_fire_health','utilities_infrastructure',
  'transportation_access','environmental_constraints','fee_schedule',
  'risk_feasibility','report_composition','qa_validation'
);

CREATE TYPE public.sir_task_status AS ENUM (
  'pending','running','complete','failed','skipped','integration_required'
);

CREATE TYPE public.sir_reviewer_status AS ENUM (
  'unreviewed','approved','modified','requires_confirmation','suppressed','rejected'
);

CREATE TYPE public.sir_source_tier AS ENUM (
  'official_code','official_gis','official_map','official_instructions',
  'official_fee_schedule','official_utility','agency_correspondence',
  'client_document','secondary'
);

CREATE TYPE public.sir_recommendation AS ENUM (
  'proceed','proceed_with_conditions','further_investigation_required',
  'high_risk','not_recommended'
);

-- Assignments --------------------------------------------------------------
CREATE TABLE public.sir_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.sir_requests(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  tier text NOT NULL DEFAULT 'project_feasibility',
  complexity_level int NOT NULL DEFAULT 2,
  status public.sir_workflow_status NOT NULL DEFAULT 'research_not_started',
  revision int NOT NULL DEFAULT 1,
  project_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  research_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  executive_summary text,
  recommendation public.sir_recommendation,
  recommendation_basis text,
  composed_report jsonb,
  internal_notes text,
  source_freshness_days int NOT NULL DEFAULT 180,
  research_started_at timestamptz,
  research_completed_at timestamptz,
  qaqc_passed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  released_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sir_assignments TO authenticated;
GRANT ALL ON public.sir_assignments TO service_role;
ALTER TABLE public.sir_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sir_assignments_owner_read" ON public.sir_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "sir_assignments_admin_all" ON public.sir_assignments
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Agent task / audit records ----------------------------------------------
CREATE TABLE public.sir_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.sir_assignments(id) ON DELETE CASCADE,
  agent public.sir_agent NOT NULL,
  module text NOT NULL,
  task text NOT NULL,
  status public.sir_task_status NOT NULL DEFAULT 'pending',
  sequence int NOT NULL DEFAULT 0,
  revision int NOT NULL DEFAULT 1,
  input_version int NOT NULL DEFAULT 1,
  output_version int NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  sources_found int NOT NULL DEFAULT 0,
  findings_created int NOT NULL DEFAULT 0,
  error text,
  retry_count int NOT NULL DEFAULT 0,
  reviewer_action text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sir_agent_runs TO authenticated;
GRANT ALL ON public.sir_agent_runs TO service_role;
ALTER TABLE public.sir_agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sir_agent_runs_admin_all" ON public.sir_agent_runs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sir_agent_runs_owner_read" ON public.sir_agent_runs
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sir_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  ));

-- Findings ----------------------------------------------------------------
CREATE TABLE public.sir_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.sir_assignments(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  revision int NOT NULL DEFAULT 1,
  agent public.sir_agent NOT NULL,
  module text NOT NULL,
  research_question text NOT NULL,
  finding text NOT NULL,
  analysis text,
  applicability text,
  verification_status public.sir_verification_status NOT NULL DEFAULT 'preliminary_analysis',
  ai_confidence public.sir_confidence NOT NULL DEFAULT 'medium',
  geographic_applicability text,
  agency text,
  risk_level text,
  cost_impact text,
  schedule_impact text,
  recommended_action text,
  confirmation_required boolean NOT NULL DEFAULT true,
  reviewer_status public.sir_reviewer_status NOT NULL DEFAULT 'unreviewed',
  reviewer_note text,
  internal_note text,
  client_visible boolean NOT NULL DEFAULT true,
  effective_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sir_findings TO authenticated;
GRANT ALL ON public.sir_findings TO service_role;
ALTER TABLE public.sir_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sir_findings_admin_all" ON public.sir_findings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sir_findings_owner_read" ON public.sir_findings
  FOR SELECT TO authenticated USING (client_visible AND EXISTS (
    SELECT 1 FROM public.sir_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  ));

-- Citations ---------------------------------------------------------------
CREATE TABLE public.sir_finding_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES public.sir_findings(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.sir_assignments(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  publishing_authority text,
  url text,
  document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  locator text,
  effective_date date,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  supports text,
  tier public.sir_source_tier NOT NULL DEFAULT 'secondary',
  link_ok boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sir_finding_sources TO authenticated;
GRANT ALL ON public.sir_finding_sources TO service_role;
ALTER TABLE public.sir_finding_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sir_finding_sources_admin_all" ON public.sir_finding_sources
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sir_finding_sources_owner_read" ON public.sir_finding_sources
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sir_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  ));

-- Conflicts --------------------------------------------------------------
CREATE TABLE public.sir_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.sir_assignments(id) ON DELETE CASCADE,
  module text NOT NULL,
  summary text NOT NULL,
  finding_a uuid REFERENCES public.sir_findings(id) ON DELETE SET NULL,
  finding_b uuid REFERENCES public.sir_findings(id) ON DELETE SET NULL,
  conflicting_sources text,
  affects_feasibility boolean NOT NULL DEFAULT false,
  assigned_to text NOT NULL DEFAULT 'qaqc',
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sir_conflicts TO authenticated;
GRANT ALL ON public.sir_conflicts TO service_role;
ALTER TABLE public.sir_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sir_conflicts_admin_all" ON public.sir_conflicts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sir_conflicts_owner_read" ON public.sir_conflicts
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sir_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  ));

-- QA/QC exceptions -------------------------------------------------------
CREATE TABLE public.sir_qa_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.sir_assignments(id) ON DELETE CASCADE,
  revision int NOT NULL DEFAULT 1,
  check_name text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  blocking boolean NOT NULL DEFAULT false,
  detail text NOT NULL,
  finding_id uuid REFERENCES public.sir_findings(id) ON DELETE SET NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sir_qa_exceptions TO authenticated;
GRANT ALL ON public.sir_qa_exceptions TO service_role;
ALTER TABLE public.sir_qa_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sir_qa_exceptions_admin_all" ON public.sir_qa_exceptions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sir_qa_exceptions_owner_read" ON public.sir_qa_exceptions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sir_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  ));

-- Client follow-up questions --------------------------------------------
CREATE TABLE public.sir_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.sir_assignments(id) ON DELETE CASCADE,
  module text NOT NULL,
  question text NOT NULL,
  why_it_matters text,
  answer text,
  answered_at timestamptz,
  answered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.sir_followups TO authenticated;
GRANT ALL ON public.sir_followups TO service_role;
ALTER TABLE public.sir_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sir_followups_admin_all" ON public.sir_followups
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sir_followups_owner_read" ON public.sir_followups
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sir_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  ));
CREATE POLICY "sir_followups_owner_answer" ON public.sir_followups
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sir_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.sir_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  ));

-- Indexes & touch triggers ----------------------------------------------
CREATE INDEX sir_assignments_request_idx ON public.sir_assignments(request_id);
CREATE INDEX sir_assignments_project_idx ON public.sir_assignments(project_id);
CREATE INDEX sir_agent_runs_assignment_idx ON public.sir_agent_runs(assignment_id, sequence);
CREATE INDEX sir_findings_assignment_idx ON public.sir_findings(assignment_id, module);
CREATE INDEX sir_finding_sources_finding_idx ON public.sir_finding_sources(finding_id);
CREATE INDEX sir_conflicts_assignment_idx ON public.sir_conflicts(assignment_id);
CREATE INDEX sir_qa_exceptions_assignment_idx ON public.sir_qa_exceptions(assignment_id);
CREATE INDEX sir_followups_assignment_idx ON public.sir_followups(assignment_id);

CREATE TRIGGER sir_assignments_touch BEFORE UPDATE ON public.sir_assignments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sir_agent_runs_touch BEFORE UPDATE ON public.sir_agent_runs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sir_findings_touch BEFORE UPDATE ON public.sir_findings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sir_conflicts_touch BEFORE UPDATE ON public.sir_conflicts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sir_qa_exceptions_touch BEFORE UPDATE ON public.sir_qa_exceptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sir_followups_touch BEFORE UPDATE ON public.sir_followups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();