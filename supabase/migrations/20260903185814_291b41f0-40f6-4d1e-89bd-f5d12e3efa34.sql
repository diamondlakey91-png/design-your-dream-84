-- 1. Rename firm-specific workflow status labels
ALTER TYPE public.sir_workflow_status RENAME VALUE 'lpg_review_pending' TO 'professional_review_pending';
ALTER TYPE public.sir_workflow_status RENAME VALUE 'lpg_reviewed' TO 'professionally_reviewed';

-- 2. Organization roles
CREATE TYPE public.org_role AS ENUM (
  'client',
  'client_admin',
  'project_manager',
  'permit_manager',
  'researcher',
  'qaqc_reviewer',
  'authorized_reviewer',
  'org_admin'
);

CREATE TYPE public.org_kind AS ENUM ('client', 'professional', 'platform');

-- 3. Organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  kind public.org_kind NOT NULL DEFAULT 'client',
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_email text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'client',
  title text,
  credentials text,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);

-- 4. Security-definer helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org_id AND m.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _role public.org_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org_id AND m.user_id = auth.uid() AND m.role = _role
  )
$$;

-- 5. Policies
CREATE POLICY "members read their organizations" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users create organizations" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "org admins update their organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, 'org_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(id, 'org_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members read memberships in their organizations" ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "org admins manage memberships" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, 'org_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR NOT EXISTS (SELECT 1 FROM public.organization_members x WHERE x.organization_id = organization_members.organization_id)
  );

CREATE POLICY "org admins update memberships" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, 'org_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(organization_id, 'org_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "org admins remove memberships" ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, 'org_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER organizations_touch BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER organization_members_touch BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Attach existing projects to a personal organization per owner (no data removed)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_organization ON public.projects(organization_id);

DO $$
DECLARE r record; new_org uuid;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.projects WHERE organization_id IS NULL LOOP
    INSERT INTO public.organizations (name, slug, kind, created_by)
    VALUES ('My Organization', 'org-' || replace(r.user_id::text, '-', ''), 'client', r.user_id)
    RETURNING id INTO new_org;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org, r.user_id, 'org_admin')
    ON CONFLICT DO NOTHING;

    UPDATE public.projects SET organization_id = new_org
    WHERE user_id = r.user_id AND organization_id IS NULL;
  END LOOP;
END $$;

CREATE POLICY "org members read organization projects" ON public.projects
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));