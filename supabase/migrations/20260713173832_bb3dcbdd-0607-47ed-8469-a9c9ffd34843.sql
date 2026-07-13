
-- Extend jurisdiction_profiles with library fields
ALTER TABLE public.jurisdiction_profiles
  ADD COLUMN IF NOT EXISTS county text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS jurisdiction_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_verified_date date,
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS gov_website text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS office_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS office_hours text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS departments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS permit_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS submission_portals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Saved jurisdictions per user
CREATE TABLE IF NOT EXISTS public.saved_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdiction_profiles(id) ON DELETE CASCADE,
  pinned boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, jurisdiction_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_jurisdictions TO authenticated;
GRANT ALL ON public.saved_jurisdictions TO service_role;
ALTER TABLE public.saved_jurisdictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saved jurisdictions" ON public.saved_jurisdictions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER saved_jurisdictions_touch BEFORE UPDATE ON public.saved_jurisdictions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Jurisdiction requests (user requests coverage)
CREATE TABLE IF NOT EXISTS public.jurisdiction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jurisdiction_name text NOT NULL,
  state text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  project_address text NOT NULL DEFAULT '',
  permit_type text NOT NULL DEFAULT '',
  project_type text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'normal',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jurisdiction_requests TO authenticated;
GRANT ALL ON public.jurisdiction_requests TO service_role;
ALTER TABLE public.jurisdiction_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jurisdiction requests" ON public.jurisdiction_requests
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER jurisdiction_requests_touch BEFORE UPDATE ON public.jurisdiction_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
