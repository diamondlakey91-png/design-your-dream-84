-- ============ Plan QA/QC ============
CREATE TABLE public.qaqc_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  revision_label text NOT NULL DEFAULT 'Rev A',
  document_ids uuid[] NOT NULL DEFAULT '{}',
  jurisdiction_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  codes_researched jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  executive_summary text,
  readiness_score integer,
  readiness_category text NOT NULL DEFAULT 'not_ready',
  missing_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  submission_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  needs_professional_confirmation jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  prompt_version text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qaqc_reviews TO authenticated;
GRANT ALL ON public.qaqc_reviews TO service_role;
ALTER TABLE public.qaqc_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own qaqc reviews" ON public.qaqc_reviews FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX qaqc_reviews_project_idx ON public.qaqc_reviews(project_id, created_at DESC);

CREATE TABLE public.qaqc_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.qaqc_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  sheet_number text NOT NULL,
  sheet_title text,
  discipline text NOT NULL DEFAULT 'unknown',
  revision_number text,
  revision_date text,
  professional_of_record text,
  seal_status text NOT NULL DEFAULT 'not_visible',
  index_state text NOT NULL DEFAULT 'present',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qaqc_sheets TO authenticated;
GRANT ALL ON public.qaqc_sheets TO service_role;
ALTER TABLE public.qaqc_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own qaqc sheets" ON public.qaqc_sheets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX qaqc_sheets_review_idx ON public.qaqc_sheets(review_id, sort_order);

CREATE TABLE public.qaqc_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.qaqc_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  finding_no integer NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT 'project_information',
  discipline text NOT NULL DEFAULT 'architectural',
  sheet_number text,
  sheet_title text,
  location text,
  summary text NOT NULL,
  plain_language text,
  why_it_matters text,
  code_basis text,
  jurisdiction_source_url text,
  recommended_action text,
  responsible_discipline text,
  verification text NOT NULL DEFAULT 'ai_suggested',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qaqc_findings TO authenticated;
GRANT ALL ON public.qaqc_findings TO service_role;
ALTER TABLE public.qaqc_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own qaqc findings" ON public.qaqc_findings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX qaqc_findings_review_idx ON public.qaqc_findings(review_id, finding_no);

CREATE TABLE public.qaqc_revision_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  base_review_id uuid NOT NULL REFERENCES public.qaqc_reviews(id) ON DELETE CASCADE,
  compare_review_id uuid NOT NULL REFERENCES public.qaqc_reviews(id) ON DELETE CASCADE,
  added_sheets jsonb NOT NULL DEFAULT '[]'::jsonb,
  removed_sheets jsonb NOT NULL DEFAULT '[]'::jsonb,
  revised_sheets jsonb NOT NULL DEFAULT '[]'::jsonb,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qaqc_revision_diffs TO authenticated;
GRANT ALL ON public.qaqc_revision_diffs TO service_role;
ALTER TABLE public.qaqc_revision_diffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own qaqc diffs" ON public.qaqc_revision_diffs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ Site Investigation ============
CREATE TABLE public.site_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  address text NOT NULL,
  project_type_label text,
  project_type_id uuid REFERENCES public.project_types(id) ON DELETE SET NULL,
  notes text,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  jurisdiction_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  property_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  feasibility_rating text NOT NULL DEFAULT 'gray',
  executive_summary text,
  report_number text,
  client_name text,
  prepared_date date,
  model text,
  prompt_version text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_investigations TO authenticated;
GRANT ALL ON public.site_investigations TO service_role;
ALTER TABLE public.site_investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own site investigations" ON public.site_investigations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX site_investigations_project_idx ON public.site_investigations(project_id, created_at DESC);

CREATE TABLE public.site_investigation_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.site_investigations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'zoning',
  classification text NOT NULL DEFAULT 'needs_confirmation',
  title text NOT NULL,
  detail text,
  impact text,
  source_url text,
  source_title text,
  verification text NOT NULL DEFAULT 'needs_agency_confirmation',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_investigation_findings TO authenticated;
GRANT ALL ON public.site_investigation_findings TO service_role;
ALTER TABLE public.site_investigation_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own si findings" ON public.site_investigation_findings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX si_findings_inv_idx ON public.site_investigation_findings(investigation_id, sort_order);

CREATE TABLE public.site_investigation_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.site_investigations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approval text NOT NULL,
  agency text,
  why_required text,
  trigger_condition text,
  sequence_order integer NOT NULL DEFAULT 0,
  timeline_estimate text,
  concurrent boolean NOT NULL DEFAULT false,
  source_url text,
  verification text NOT NULL DEFAULT 'needs_agency_confirmation',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_investigation_permits TO authenticated;
GRANT ALL ON public.site_investigation_permits TO service_role;
ALTER TABLE public.site_investigation_permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own si permits" ON public.site_investigation_permits FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX si_permits_inv_idx ON public.site_investigation_permits(investigation_id, sequence_order);

-- ============ Shared human review queue ============
CREATE TABLE public.professional_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  requested_notes text,
  reviewer_name text,
  reviewer_notes text,
  status text NOT NULL DEFAULT 'requested',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_reviews TO authenticated;
GRANT ALL ON public.professional_reviews TO service_role;
ALTER TABLE public.professional_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own professional reviews" ON public.professional_reviews FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read professional reviews" ON public.professional_reviews FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update professional reviews" ON public.professional_reviews FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX professional_reviews_target_idx ON public.professional_reviews(target_type, target_id, created_at DESC);

-- updated_at triggers
CREATE TRIGGER qaqc_reviews_touch BEFORE UPDATE ON public.qaqc_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER qaqc_findings_touch BEFORE UPDATE ON public.qaqc_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER site_investigations_touch BEFORE UPDATE ON public.site_investigations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER professional_reviews_touch BEFORE UPDATE ON public.professional_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();