CREATE TABLE public.project_regulatory_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fact_type text NOT NULL CHECK (fact_type IN ('property','jurisdiction','agency','flood','zoning','future_land_use','overlay','code','local_amendment','scope_attribute','permit_candidate','special_condition')),
  fact_key text NOT NULL,
  label text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_value text,
  source_org text,
  source_title text,
  source_url text,
  provider text NOT NULL,
  source_tier smallint NOT NULL DEFAULT 7 CHECK (source_tier BETWEEN 1 AND 7),
  origin text NOT NULL DEFAULT 'research' CHECK (origin IN ('research','stored','user','human')),
  verification text NOT NULL DEFAULT 'needs_verification' CHECK (verification IN ('verified','needs_verification','potential')),
  limitation text,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  source_updated_at timestamptz,
  effective_date date,
  recheck_after timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, fact_type, fact_key)
);
GRANT SELECT, INSERT, UPDATE ON public.project_regulatory_facts TO authenticated;
GRANT ALL ON public.project_regulatory_facts TO service_role;
ALTER TABLE public.project_regulatory_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reg facts team read" ON public.project_regulatory_facts FOR SELECT TO authenticated
  USING (public.can_access_project(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "reg facts scope insert" ON public.project_regulatory_facts FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));
CREATE POLICY "reg facts scope update" ON public.project_regulatory_facts FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id)) WITH CHECK (public.can_write_project(project_id));
CREATE INDEX project_regulatory_facts_project_idx ON public.project_regulatory_facts(project_id, fact_type);

CREATE OR REPLACE FUNCTION public.guard_regulatory_fact()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF public.is_trusted_writer() THEN RETURN NEW; END IF;
  -- Customers may only record their own scope attributes, never research facts or verification.
  IF NEW.fact_type <> 'scope_attribute' THEN
    RAISE EXCEPTION 'Researched regulatory facts are written only by Permivio' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.fact_type <> 'scope_attribute' THEN
    RAISE EXCEPTION 'Researched regulatory facts are written only by Permivio' USING ERRCODE = '42501';
  END IF;
  IF NEW.verification = 'verified' THEN NEW.verification := 'needs_verification'; END IF;
  NEW.origin := 'user'; NEW.source_tier := 7; NEW.verified_by := NULL; NEW.verified_at := NULL;
  NEW.provider := 'customer_confirmation'; NEW.created_by := coalesce(NEW.created_by, auth.uid());
  RETURN NEW;
END $$;
CREATE TRIGGER guard_regulatory_fact BEFORE INSERT OR UPDATE ON public.project_regulatory_facts
  FOR EACH ROW EXECUTE FUNCTION public.guard_regulatory_fact();
CREATE TRIGGER project_regulatory_facts_touch BEFORE UPDATE ON public.project_regulatory_facts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.permit_items ADD COLUMN IF NOT EXISTS regulatory_fact_id uuid REFERENCES public.project_regulatory_facts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS permit_items_regulatory_fact_uniq ON public.permit_items(project_id, regulatory_fact_id) WHERE regulatory_fact_id IS NOT NULL;