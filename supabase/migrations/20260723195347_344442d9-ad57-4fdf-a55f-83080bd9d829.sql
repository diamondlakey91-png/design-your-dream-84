
-- Enums
CREATE TYPE public.scope_status AS ENUM ('draft','submitted','analyzing','needs_followup','complete');
CREATE TYPE public.res_or_com AS ENUM ('residential','commercial','mixed_use');
CREATE TYPE public.scope_project_type AS ENUM ('new_construction','tenant_improvement','change_of_occupancy','addition','alteration','repair','demolition','shell','core_and_shell','other');
CREATE TYPE public.verification_label AS ENUM ('verified','ai_assisted','needs_agency_confirmation');
CREATE TYPE public.permit_likelihood AS ENUM ('required','likely','conditional','not_required');
CREATE TYPE public.authority_level AS ENUM ('city','county','state','federal','utility','special_district');
CREATE TYPE public.permit_category AS ENUM ('zoning','building','electrical','mechanical','plumbing','fire','health','site','environmental','row','utility','business_license','sign','tco','co','other');
CREATE TYPE public.source_kind AS ENUM ('agency_site','code','ordinance','portal','other');
CREATE TYPE public.risk_severity AS ENUM ('low','medium','high');
CREATE TYPE public.verification_status AS ENUM ('open','in_review','verified','rejected');

-- scope_of_work
CREATE TABLE public.scope_of_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  address text,
  address_normalized text,
  lat double precision,
  lng double precision,
  residential_or_commercial public.res_or_com,
  occupancy_existing text,
  occupancy_proposed text,
  project_type public.scope_project_type,
  construction_type text,
  dwelling_units integer,
  construction_value_cents bigint,
  sq_ft_gross integer,
  sq_ft_affected integer,
  scope_text text,
  trades jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_start_date date,
  target_open_date date,
  status public.scope_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scope_of_work TO authenticated;
GRANT ALL ON public.scope_of_work TO service_role;
ALTER TABLE public.scope_of_work ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sow owner rw" ON public.scope_of_work FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = scope_of_work.project_id AND p.user_id = auth.uid())
         OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = scope_of_work.project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_sow_touch BEFORE UPDATE ON public.scope_of_work FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_sow_project ON public.scope_of_work(project_id);

-- permit_roadmaps
CREATE TABLE public.permit_roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id uuid NOT NULL REFERENCES public.scope_of_work(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  jurisdiction_id uuid REFERENCES public.jurisdiction_profiles(id) ON DELETE SET NULL,
  authority_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  confidence numeric,
  health_score integer,
  generated_by_model text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_roadmaps TO authenticated;
GRANT ALL ON public.permit_roadmaps TO service_role;
ALTER TABLE public.permit_roadmaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roadmap owner rw" ON public.permit_roadmaps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = permit_roadmaps.project_id AND p.user_id = auth.uid())
         OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = permit_roadmaps.project_id AND p.user_id = auth.uid()));
CREATE TRIGGER trg_roadmap_touch BEFORE UPDATE ON public.permit_roadmaps FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_roadmap_project ON public.permit_roadmaps(project_id);
CREATE INDEX idx_roadmap_scope ON public.permit_roadmaps(scope_id);

-- Reusable RLS helper via parent roadmap
CREATE OR REPLACE FUNCTION public.roadmap_visible(_roadmap_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.permit_roadmaps r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = _roadmap_id
      AND (p.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  )
$$;

-- roadmap_sources (must exist before permits/documents reference-by-id semantics but FKs are informal here)
CREATE TABLE public.roadmap_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.permit_roadmaps(id) ON DELETE CASCADE,
  url text,
  title text,
  publisher text,
  kind public.source_kind NOT NULL DEFAULT 'other',
  quote text,
  retrieved_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_sources TO authenticated;
GRANT ALL ON public.roadmap_sources TO service_role;
ALTER TABLE public.roadmap_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources rw" ON public.roadmap_sources FOR ALL TO authenticated
  USING (public.roadmap_visible(roadmap_id)) WITH CHECK (public.roadmap_visible(roadmap_id));
CREATE INDEX idx_sources_roadmap ON public.roadmap_sources(roadmap_id);

-- roadmap_permits
CREATE TABLE public.roadmap_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.permit_roadmaps(id) ON DELETE CASCADE,
  name text NOT NULL,
  agency text,
  level public.authority_level,
  category public.permit_category,
  likelihood public.permit_likelihood NOT NULL DEFAULT 'likely',
  verification public.verification_label NOT NULL DEFAULT 'ai_assisted',
  fee_estimate_cents bigint,
  fee_basis text,
  review_days_min integer,
  review_days_max integer,
  sequence_order integer,
  depends_on uuid[] NOT NULL DEFAULT '{}',
  concurrent_with uuid[] NOT NULL DEFAULT '{}',
  critical_path boolean NOT NULL DEFAULT false,
  notes text,
  source_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_permits TO authenticated;
GRANT ALL ON public.roadmap_permits TO service_role;
ALTER TABLE public.roadmap_permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permits rw" ON public.roadmap_permits FOR ALL TO authenticated
  USING (public.roadmap_visible(roadmap_id)) WITH CHECK (public.roadmap_visible(roadmap_id));
CREATE INDEX idx_rpermits_roadmap ON public.roadmap_permits(roadmap_id);

-- roadmap_documents
CREATE TABLE public.roadmap_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.permit_roadmaps(id) ON DELETE CASCADE,
  permit_id uuid REFERENCES public.roadmap_permits(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  required boolean NOT NULL DEFAULT true,
  verification public.verification_label NOT NULL DEFAULT 'ai_assisted',
  source_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_documents TO authenticated;
GRANT ALL ON public.roadmap_documents TO service_role;
ALTER TABLE public.roadmap_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs rw" ON public.roadmap_documents FOR ALL TO authenticated
  USING (public.roadmap_visible(roadmap_id)) WITH CHECK (public.roadmap_visible(roadmap_id));
CREATE INDEX idx_rdocs_roadmap ON public.roadmap_documents(roadmap_id);

-- roadmap_agencies
CREATE TABLE public.roadmap_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.permit_roadmaps(id) ON DELETE CASCADE,
  name text NOT NULL,
  level public.authority_level,
  jurisdiction text,
  url text,
  phone text,
  role text,
  verification public.verification_label NOT NULL DEFAULT 'ai_assisted',
  source_id uuid REFERENCES public.roadmap_sources(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_agencies TO authenticated;
GRANT ALL ON public.roadmap_agencies TO service_role;
ALTER TABLE public.roadmap_agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agencies rw" ON public.roadmap_agencies FOR ALL TO authenticated
  USING (public.roadmap_visible(roadmap_id)) WITH CHECK (public.roadmap_visible(roadmap_id));
CREATE INDEX idx_ragencies_roadmap ON public.roadmap_agencies(roadmap_id);

-- roadmap_risks
CREATE TABLE public.roadmap_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.permit_roadmaps(id) ON DELETE CASCADE,
  severity public.risk_severity NOT NULL DEFAULT 'medium',
  category text,
  message text NOT NULL,
  mitigation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_risks TO authenticated;
GRANT ALL ON public.roadmap_risks TO service_role;
ALTER TABLE public.roadmap_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risks rw" ON public.roadmap_risks FOR ALL TO authenticated
  USING (public.roadmap_visible(roadmap_id)) WITH CHECK (public.roadmap_visible(roadmap_id));
CREATE INDEX idx_rrisks_roadmap ON public.roadmap_risks(roadmap_id);

-- roadmap_followups
CREATE TABLE public.roadmap_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.permit_roadmaps(id) ON DELETE CASCADE,
  question text NOT NULL,
  field_hint text,
  answered_value text,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_followups TO authenticated;
GRANT ALL ON public.roadmap_followups TO service_role;
ALTER TABLE public.roadmap_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followups rw" ON public.roadmap_followups FOR ALL TO authenticated
  USING (public.roadmap_visible(roadmap_id)) WITH CHECK (public.roadmap_visible(roadmap_id));
CREATE INDEX idx_rfollowups_roadmap ON public.roadmap_followups(roadmap_id);

-- roadmap_verifications (human review workflow)
CREATE TABLE public.roadmap_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.permit_roadmaps(id) ON DELETE CASCADE,
  item_table text NOT NULL,
  item_id uuid NOT NULL,
  requested_by uuid,
  assigned_to uuid,
  status public.verification_status NOT NULL DEFAULT 'open',
  notes text,
  evidence_url text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_verifications TO authenticated;
GRANT ALL ON public.roadmap_verifications TO service_role;
ALTER TABLE public.roadmap_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verifications owner read" ON public.roadmap_verifications FOR SELECT TO authenticated
  USING (public.roadmap_visible(roadmap_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "verifications owner insert" ON public.roadmap_verifications FOR INSERT TO authenticated
  WITH CHECK (public.roadmap_visible(roadmap_id) AND requested_by = auth.uid());
CREATE POLICY "verifications admin update" ON public.roadmap_verifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_rver_touch BEFORE UPDATE ON public.roadmap_verifications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_rver_roadmap ON public.roadmap_verifications(roadmap_id);
