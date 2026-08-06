CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============ user_settings ============
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company TEXT,
  job_title TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  notify_email_digest BOOLEAN NOT NULL DEFAULT true,
  notify_permit_status BOOLEAN NOT NULL DEFAULT true,
  notify_deadlines BOOLEAN NOT NULL DEFAULT true,
  notify_corrections BOOLEAN NOT NULL DEFAULT true,
  notify_inspections BOOLEAN NOT NULL DEFAULT true,
  digest_frequency TEXT NOT NULL DEFAULT 'weekly',
  brand_company_name TEXT,
  brand_license_number TEXT,
  brand_contact_email TEXT,
  brand_contact_phone TEXT,
  brand_address TEXT,
  brand_accent_color TEXT NOT NULL DEFAULT '#3B82F6',
  brand_logo_url TEXT,
  brand_footer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own settings"
  ON public.user_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ portal_credentials ============
CREATE TABLE public.portal_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'permit',
  portal_url TEXT,
  jurisdiction TEXT,
  username TEXT NOT NULL,
  password_encrypted TEXT,
  notes TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_credentials TO authenticated;
GRANT ALL ON public.portal_credentials TO service_role;
ALTER TABLE public.portal_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own portal credentials"
  ON public.portal_credentials FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX portal_credentials_user_idx ON public.portal_credentials(user_id, created_at DESC);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER portal_credentials_updated_at BEFORE UPDATE ON public.portal_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();