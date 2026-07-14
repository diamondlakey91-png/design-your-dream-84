
-- jurisdiction_profiles: admin verification
ALTER TABLE public.jurisdiction_profiles
  ADD COLUMN IF NOT EXISTS verified_by TEXT;

CREATE POLICY "Admins can update any profile"
  ON public.jurisdiction_profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- health_environmental_portals: add verification concept (currently has none)
ALTER TABLE public.health_environmental_portals
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_verified_date DATE,
  ADD COLUMN IF NOT EXISTS verified_by TEXT;
