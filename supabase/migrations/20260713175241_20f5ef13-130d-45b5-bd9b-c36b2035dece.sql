
-- Roles infrastructure
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Portal mappings (admin-managed jurisdiction -> portal directory)
CREATE TABLE public.portal_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction TEXT NOT NULL,
  state TEXT NOT NULL,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  address_search_template TEXT,
  permit_search_template TEXT,
  plan_review_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction, state, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_mappings TO authenticated;
GRANT ALL ON public.portal_mappings TO service_role;
ALTER TABLE public.portal_mappings ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read active mappings (needed for deep-link lookup).
CREATE POLICY "Signed-in users can view active portal mappings"
  ON public.portal_mappings FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert portal mappings"
  ON public.portal_mappings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update portal mappings"
  ON public.portal_mappings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete portal mappings"
  ON public.portal_mappings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER portal_mappings_touch_updated_at
  BEFORE UPDATE ON public.portal_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
