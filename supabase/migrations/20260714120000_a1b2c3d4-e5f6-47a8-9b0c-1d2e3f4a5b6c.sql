
-- Health / environmental agency directory (admin-managed, mirrors portal_mappings)
CREATE TABLE IF NOT EXISTS public.health_environmental_portals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction TEXT NOT NULL,
  state TEXT NOT NULL,
  agency_type TEXT NOT NULL CHECK (agency_type IN (
    'county_health_department',
    'state_health_department',
    'state_environmental_agency',
    'municipal_health_department'
  )),
  service_types TEXT[] NOT NULL DEFAULT '{}',
  url TEXT NOT NULL,
  address_search_template TEXT,
  permit_search_template TEXT,
  plan_review_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction, state, agency_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_environmental_portals TO authenticated;
GRANT ALL ON public.health_environmental_portals TO service_role;
ALTER TABLE public.health_environmental_portals ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read active mappings (needed for deep-link lookup).
CREATE POLICY "Signed-in users can view active health/environmental portals"
  ON public.health_environmental_portals FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert health/environmental portals"
  ON public.health_environmental_portals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update health/environmental portals"
  ON public.health_environmental_portals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete health/environmental portals"
  ON public.health_environmental_portals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER health_environmental_portals_touch_updated_at
  BEFORE UPDATE ON public.health_environmental_portals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
