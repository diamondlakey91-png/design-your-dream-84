
-- ============================================================
-- Jurisdiction Resolution Correction — Schema (Step 1)
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.authority_role AS ENUM (
    'building','planning_zoning','fire','health','public_works',
    'site_development','environmental','transportation_row',
    'utility_water','utility_sewer','utility_electric','utility_gas',
    'stormwater','historic','floodplain','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.source_kind AS ENUM (
    'agency_site','portal','code','ordinance','amendment','fee_schedule','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.jurisdiction_confirmation_status AS ENUM (
    'unconfirmed','user_confirmed','pending_review','human_verified'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.code_discipline AS ENUM (
    'building','residential','fire','accessibility','energy',
    'plumbing','mechanical','electrical','health'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.timeline_basis AS ENUM (
    'published','permivio_history','ai_estimate','unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- jurisdictions ----------
CREATE TABLE IF NOT EXISTS public.jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  county text NOT NULL,
  municipality text,
  incorporated boolean NOT NULL DEFAULT false,
  fips_county text,
  fips_place text,
  centroid_lat numeric,
  centroid_lng numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jurisdictions_unique_key
  ON public.jurisdictions (state, county, COALESCE(municipality,''));

GRANT SELECT ON public.jurisdictions TO authenticated;
GRANT ALL ON public.jurisdictions TO service_role;
ALTER TABLE public.jurisdictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jurisdictions readable by authenticated"
  ON public.jurisdictions FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_jurisdictions_updated_at
  BEFORE UPDATE ON public.jurisdictions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- official_sources ----------
CREATE TABLE IF NOT EXISTS public.official_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  title text NOT NULL,
  publisher text,
  kind public.source_kind NOT NULL DEFAULT 'agency_site',
  quote text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS official_sources_url_unique ON public.official_sources(url);

GRANT SELECT ON public.official_sources TO authenticated;
GRANT ALL ON public.official_sources TO service_role;
ALTER TABLE public.official_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "official_sources readable by authenticated"
  ON public.official_sources FOR SELECT TO authenticated USING (true);

-- ---------- authorities ----------
CREATE TABLE IF NOT EXISTS public.authorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  role public.authority_role NOT NULL,
  official_name text NOT NULL,
  department text,
  responsibility text,
  website text,
  portal_url text,
  phone text,
  source_id uuid REFERENCES public.official_sources(id) ON DELETE SET NULL,
  verification text NOT NULL DEFAULT 'ai_assisted',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS authorities_unique
  ON public.authorities(jurisdiction_id, role, lower(official_name));
CREATE INDEX IF NOT EXISTS authorities_by_jurisdiction ON public.authorities(jurisdiction_id);

-- Guard: block ZIP-shaped placeholder names
ALTER TABLE public.authorities
  ADD CONSTRAINT authorities_no_zip_placeholder
  CHECK (official_name !~ '^[A-Z]{2}\s?\d{5}');

GRANT SELECT ON public.authorities TO authenticated;
GRANT ALL ON public.authorities TO service_role;
ALTER TABLE public.authorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authorities readable by authenticated"
  ON public.authorities FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_authorities_updated_at
  BEFORE UPDATE ON public.authorities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- code_adoptions ----------
CREATE TABLE IF NOT EXISTS public.code_adoptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  discipline public.code_discipline NOT NULL,
  code_family text NOT NULL,
  edition text NOT NULL,
  local_amendments_url text,
  effective_date date,
  source_id uuid REFERENCES public.official_sources(id) ON DELETE SET NULL,
  verification text NOT NULL DEFAULT 'ai_assisted',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS code_adoptions_by_jur ON public.code_adoptions(jurisdiction_id);

GRANT SELECT ON public.code_adoptions TO authenticated;
GRANT ALL ON public.code_adoptions TO service_role;
ALTER TABLE public.code_adoptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "code_adoptions readable by authenticated"
  ON public.code_adoptions FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_code_adoptions_updated_at
  BEFORE UPDATE ON public.code_adoptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- jurisdiction_confirmations ----------
CREATE TABLE IF NOT EXISTS public.jurisdiction_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  jurisdiction_id uuid REFERENCES public.jurisdictions(id) ON DELETE SET NULL,
  street text NOT NULL,
  suite text,
  city text NOT NULL,
  state text NOT NULL,
  zip text NOT NULL,
  formatted_address text,
  parcel_number text,
  lat numeric,
  lng numeric,
  incorporated boolean,
  status public.jurisdiction_confirmation_status NOT NULL DEFAULT 'unconfirmed',
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_by uuid,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jur_conf_by_project ON public.jurisdiction_confirmations(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jurisdiction_confirmations TO authenticated;
GRANT ALL ON public.jurisdiction_confirmations TO service_role;
ALTER TABLE public.jurisdiction_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "confirm owner rw"
  ON public.jurisdiction_confirmations FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  );

CREATE TRIGGER trg_jur_conf_updated_at
  BEFORE UPDATE ON public.jurisdiction_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- Extend roadmap tables ----------
ALTER TABLE public.roadmap_permits
  ADD COLUMN IF NOT EXISTS authority_id uuid REFERENCES public.authorities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger_condition text,
  ADD COLUMN IF NOT EXISTS timeline_basis public.timeline_basis NOT NULL DEFAULT 'ai_estimate',
  ADD COLUMN IF NOT EXISTS code_adoption_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE public.roadmap_documents
  ADD COLUMN IF NOT EXISTS required_by_authority_id uuid REFERENCES public.authorities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_by_permit_id uuid;

ALTER TABLE public.roadmap_agencies
  ADD COLUMN IF NOT EXISTS authority_id uuid REFERENCES public.authorities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_name text,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE public.permit_roadmaps
  ADD COLUMN IF NOT EXISTS confirmation_id uuid REFERENCES public.jurisdiction_confirmations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- ---------- Backfill: sanitize existing ZIP-shaped agency names ----------
UPDATE public.roadmap_agencies
   SET raw_name = COALESCE(raw_name, name),
       name = 'Exact authority needs confirmation',
       verification = 'needs_agency_confirmation'
 WHERE name ~ '^[A-Z]{2}\s?\d{5}'
    OR name ILIKE '%— Building Department%'
    OR name ILIKE '%- Building Department%'
    OR name ILIKE 'Local %';

-- Downgrade any 'verified' permits without an authority to needs-confirmation
UPDATE public.roadmap_permits
   SET verification = 'needs_agency_confirmation'
 WHERE authority_id IS NULL AND verification = 'verified';

-- Mark legacy roadmaps as needing jurisdiction rescope
UPDATE public.permit_roadmaps r
   SET status = 'needs_rescope'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.jurisdiction_confirmations jc
    WHERE jc.project_id = r.project_id AND jc.status IN ('user_confirmed','human_verified')
 );
