-- Enums
CREATE TYPE public.service_delivery_tier AS ENUM ('ai_assisted','professional_review');
CREATE TYPE public.service_order_status AS ENUM ('payment_required','paid','processing','waiting_client','ai_in_progress','professional_review','ready','delivered','cancelled','refunded');
CREATE TYPE public.service_entitlement_type AS ENUM ('purchase','admin_grant','subscription','promotional','included');
CREATE TYPE public.service_entitlement_status AS ENUM ('active','revoked','expired');

-- 1. Product catalog
CREATE TABLE public.service_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL UNIQUE,
  name text NOT NULL,
  client_title text NOT NULL,
  client_question text,
  description text NOT NULL,
  category text NOT NULL,
  base_price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  residential_price_cents integer,
  commercial_price_cents integer,
  professional_review_price_cents integer,
  rush_price_cents integer,
  complexity_multiplier numeric NOT NULL DEFAULT 1,
  sheet_pricing_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  eligibility_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  turnaround_estimate text,
  supports_professional_review boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_products TO authenticated;
GRANT ALL ON public.service_products TO service_role;
ALTER TABLE public.service_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read active products" ON public.service_products
  FOR SELECT TO authenticated USING (active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage products" ON public.service_products
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER service_products_touch BEFORE UPDATE ON public.service_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Orders
CREATE TABLE public.service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.service_products(id) ON DELETE RESTRICT,
  delivery_tier public.service_delivery_tier NOT NULL DEFAULT 'ai_assisted',
  status public.service_order_status NOT NULL DEFAULT 'payment_required',
  amount_cents integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  rush boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  stripe_session_id text,
  stripe_payment_intent_id text,
  client_notes text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_orders_user_idx ON public.service_orders(user_id);
CREATE INDEX service_orders_project_idx ON public.service_orders(project_id);
GRANT SELECT, INSERT ON public.service_orders TO authenticated;
GRANT ALL ON public.service_orders TO service_role;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own orders" ON public.service_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create own orders" ON public.service_orders
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND status = 'payment_required'
    AND (project_id IS NULL OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  );
CREATE POLICY "Admins manage orders" ON public.service_orders
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER service_orders_touch BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Order items
CREATE TABLE public.service_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.service_products(id) ON DELETE RESTRICT,
  delivery_tier public.service_delivery_tier NOT NULL DEFAULT 'ai_assisted',
  quantity integer NOT NULL DEFAULT 1,
  unit_amount_cents integer NOT NULL DEFAULT 0,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_order_items_order_idx ON public.service_order_items(order_id);
GRANT SELECT, INSERT ON public.service_order_items TO authenticated;
GRANT ALL ON public.service_order_items TO service_role;
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own order items" ON public.service_order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.service_orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
  );
CREATE POLICY "Users create own order items" ON public.service_order_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.service_orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "Admins manage order items" ON public.service_order_items
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. Entitlements (written by backend only)
CREATE TABLE public.service_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.service_products(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  entitlement_type public.service_entitlement_type NOT NULL DEFAULT 'purchase',
  entitlement_status public.service_entitlement_status NOT NULL DEFAULT 'active',
  delivery_tier public.service_delivery_tier NOT NULL DEFAULT 'ai_assisted',
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_entitlements_user_idx ON public.service_entitlements(user_id);
CREATE INDEX service_entitlements_project_idx ON public.service_entitlements(project_id);
GRANT SELECT ON public.service_entitlements TO authenticated;
GRANT ALL ON public.service_entitlements TO service_role;
ALTER TABLE public.service_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own entitlements" ON public.service_entitlements
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage entitlements" ON public.service_entitlements
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER service_entitlements_touch BEFORE UPDATE ON public.service_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Report version history
CREATE TABLE public.service_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.service_products(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  delivery_tier public.service_delivery_tier NOT NULL DEFAULT 'ai_assisted',
  title text NOT NULL,
  source_table text,
  source_id uuid,
  summary text,
  payload jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_report_versions_project_idx ON public.service_report_versions(project_id);
GRANT SELECT ON public.service_report_versions TO authenticated;
GRANT ALL ON public.service_report_versions TO service_role;
ALTER TABLE public.service_report_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own report versions" ON public.service_report_versions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage report versions" ON public.service_report_versions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER service_report_versions_touch BEFORE UPDATE ON public.service_report_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Full-service permitting requests
CREATE TABLE public.service_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  request_type text NOT NULL DEFAULT 'full_service',
  preferred_contact text,
  contact_value text,
  desired_timeline text,
  notes text,
  status text NOT NULL DEFAULT 'new',
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_upgrade_requests_user_idx ON public.service_upgrade_requests(user_id);
GRANT SELECT, INSERT ON public.service_upgrade_requests TO authenticated;
GRANT ALL ON public.service_upgrade_requests TO service_role;
ALTER TABLE public.service_upgrade_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own upgrade requests" ON public.service_upgrade_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create own upgrade requests" ON public.service_upgrade_requests
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND (project_id IS NULL OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  );
CREATE POLICY "Admins manage upgrade requests" ON public.service_upgrade_requests
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER service_upgrade_requests_touch BEFORE UPDATE ON public.service_upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Discount codes (future use)
CREATE TABLE public.service_discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  percent_off integer,
  amount_off_cents integer,
  product_id uuid REFERENCES public.service_products(id) ON DELETE CASCADE,
  max_redemptions integer,
  redemptions integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_discount_codes TO authenticated;
GRANT ALL ON public.service_discount_codes TO service_role;
ALTER TABLE public.service_discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read active codes" ON public.service_discount_codes
  FOR SELECT TO authenticated USING (active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage codes" ON public.service_discount_codes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER service_discount_codes_touch BEFORE UPDATE ON public.service_discount_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed the initial eight services
INSERT INTO public.service_products
  (product_key, name, client_title, client_question, description, category, base_price_cents, professional_review_price_cents, turnaround_estimate, deliverables, recommended_phases, display_order)
VALUES
 ('site_investigation','Site Investigation','Site Investigation / Feasibility Report','Can I do this project at this property?',
  'Research the property, jurisdiction, zoning, likely approvals, site constraints, utilities, risks, and the estimated permitting path.','feasibility',
  49900, 89900, '3-5 business days',
  '["Exact jurisdiction","Parcel information","Zoning","Existing land use","Proposed use analysis","Permit feasibility","Site constraints","Parking considerations","Utility considerations","Flood / wetland indicators","Right-of-way considerations","Likely approvals","Major risks","Timeline","Recommended next steps","Sources","Feasibility rating"]'::jsonb,
  '["due_diligence","pre_design"]'::jsonb, 1),
 ('permit_requirements','Permit Requirements Report','Permit Requirements Report','What permits and approvals will I need?',
  'A project-specific permitting requirements report based on the exact address, jurisdiction, project type, and scope.','requirements',
  39900, 79900, '3-5 business days',
  '["Exact jurisdiction","Required and possible permits","Issuing agencies","Required documents","Likely application sequence","Estimated review timelines","Published fees where verified","Dependencies","Sources","Items requiring confirmation"]'::jsonb,
  '["due_diligence","design"]'::jsonb, 2),
 ('plan_qaqc','Plan QA/QC Review','Plan QA/QC Review','Are my plans ready to submit?',
  'Upload architectural and engineering plans and receive a pre-submission review for missing information, coordination problems, major potential code issues, and jurisdiction submission concerns.','qaqc',
  79900, 149900, '5-7 business days',
  '["Drawing inventory","Missing sheets","Duplicate sheets","Revision conflicts","Architectural findings","Structural coordination findings","Mechanical findings","Electrical findings","Plumbing findings","Fire / life-safety findings","Accessibility findings","Civil / site findings","Cross-discipline conflicts","Missing documents","Submission-readiness concerns","Recommended corrections","Permit readiness status"]'::jsonb,
  '["design","pre_submission"]'::jsonb, 3),
 ('correction_analysis','Reviewer Comment / Correction Analysis','Correction Analysis','I received permit comments. What do they mean?',
  'Upload jurisdiction reviewer comments or correction letters and receive a clear breakdown of what needs to be corrected.','corrections',
  59900, 119900, '3-5 business days',
  '["Reviewer comment matrix","Plain-language explanation","Responsible design discipline","Sheet likely impacted","Required response","Recommended next step","Open / resolved tracking","Resubmission checklist"]'::jsonb,
  '["in_review","corrections"]'::jsonb, 4),
 ('permit_roadmap','Permit Roadmap','Permit Roadmap','What is the full path to getting this project approved?',
  'The project-specific permitting sequence from due diligence through final approvals.','roadmap',
  49900, 99900, '3-5 business days',
  '["Permit matrix","Agency matrix","Required documents","Submission order","Parallel tasks","Dependencies","Critical path","Estimated review timeline","Inspections","Certificate of Occupancy path","Recommended next steps"]'::jsonb,
  '["due_diligence","design","pre_submission"]'::jsonb, 5),
 ('co_readiness','Inspection & CO Readiness Review','CO Readiness Review','What do I need before I can open or close out my project?',
  'Review the project for likely final inspection, agency signoff, documentation, and Certificate of Occupancy requirements.','closeout',
  49900, 99900, '3-5 business days',
  '["Required final inspections","Outstanding permits","Fire signoffs","Health signoffs","Utility requirements","Special inspection documents","Contractor closeout items","Final affidavits","Certificate of Completion requirements","TCO / CO requirements","Outstanding risks","Final closeout checklist"]'::jsonb,
  '["construction","closeout"]'::jsonb, 6),
 ('jurisdiction_research','Jurisdiction Research Report','Jurisdiction Research Report','Who do I need to deal with for this property?',
  'Research the exact authorities having jurisdiction and the official permitting resources for the property.','research',
  29900, 59900, '2-4 business days',
  '["Building authority","Zoning authority","Fire authority","Health authority","Site-development authority","Public works / ROW authority","Permit portals","Published contacts","Adopted codes","Submission requirements","Published review timelines","Published fee schedules where available","Official sources"]'::jsonb,
  '["due_diligence","design"]'::jsonb, 7),
 ('utility_due_diligence','Utility Due Diligence','Utility Due Diligence','What utilities may affect this project?',
  'Research likely utility providers, service requirements, and coordination risks for the property.','utilities',
  39900, 79900, '3-5 business days',
  '["Electric provider","Gas provider","Water provider","Sewer provider","Telecom considerations","Fire service considerations","Existing service information when available","Potential upgrades","Potential extensions","Easement concerns","Off-site improvement concerns","Provider confirmation items","Coordination checklist"]'::jsonb,
  '["due_diligence","design"]'::jsonb, 8);