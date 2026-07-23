
-- =====================================================================
-- Shared Project Type system (catalog + aliases + project fields)
-- =====================================================================

-- ---------- Categories ----------
CREATE TABLE public.project_type_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name text NOT NULL UNIQUE,
  description text,
  icon text,
  display_order int NOT NULL DEFAULT 100,
  active_status boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_type_categories TO anon, authenticated;
GRANT ALL ON public.project_type_categories TO service_role;
ALTER TABLE public.project_type_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories are readable" ON public.project_type_categories FOR SELECT USING (true);
CREATE POLICY "admins manage categories" ON public.project_type_categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_ptc_touch BEFORE UPDATE ON public.project_type_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- Project types ----------
CREATE TABLE public.project_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.project_type_categories(id) ON DELETE RESTRICT,
  client_label text NOT NULL,
  internal_name text NOT NULL UNIQUE,
  short_description text,
  residential_or_commercial text NOT NULL CHECK (residential_or_commercial IN ('residential','commercial','mixed_use')),
  common_scope_triggers text[] NOT NULL DEFAULT '{}',
  follow_up_question_ids text[] NOT NULL DEFAULT '{}',
  possible_permit_categories text[] NOT NULL DEFAULT '{}',
  possible_agency_categories text[] NOT NULL DEFAULT '{}',
  possible_document_categories text[] NOT NULL DEFAULT '{}',
  display_order int NOT NULL DEFAULT 100,
  active_status boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_types TO anon, authenticated;
GRANT ALL ON public.project_types TO service_role;
ALTER TABLE public.project_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "types are readable" ON public.project_types FOR SELECT USING (true);
CREATE POLICY "admins manage types" ON public.project_types FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_pt_touch BEFORE UPDATE ON public.project_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_project_types_category ON public.project_types(category_id);
CREATE INDEX idx_project_types_active ON public.project_types(active_status, display_order);

-- ---------- Aliases / search keywords ----------
CREATE TABLE public.project_type_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type_id uuid NOT NULL REFERENCES public.project_types(id) ON DELETE CASCADE,
  alias text NOT NULL,
  keyword_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_type_id, alias)
);
GRANT SELECT ON public.project_type_aliases TO anon, authenticated;
GRANT ALL ON public.project_type_aliases TO service_role;
ALTER TABLE public.project_type_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aliases are readable" ON public.project_type_aliases FOR SELECT USING (true);
CREATE POLICY "admins manage aliases" ON public.project_type_aliases FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_pta_lower_alias ON public.project_type_aliases (lower(alias));

-- ---------- Project columns (keep existing project_type text for legacy display) ----------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS primary_project_type_id uuid REFERENCES public.project_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS additional_project_type_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_project_type_description text,
  ADD COLUMN IF NOT EXISTS project_type_source text CHECK (project_type_source IN ('user_selected','ai_recommended','document_extracted','imported','admin_selected')),
  ADD COLUMN IF NOT EXISTS project_type_confidence numeric,
  ADD COLUMN IF NOT EXISTS project_type_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS project_type_confirmed_by uuid;

CREATE INDEX IF NOT EXISTS idx_projects_primary_type ON public.projects(primary_project_type_id);

-- ---------- Scope of work canonical IDs ----------
ALTER TABLE public.scope_of_work
  ADD COLUMN IF NOT EXISTS primary_project_type_id uuid REFERENCES public.project_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS additional_project_type_ids uuid[] NOT NULL DEFAULT '{}';

-- =====================================================================
-- Seed catalog
-- =====================================================================

INSERT INTO public.project_type_categories (category_name, description, icon, display_order) VALUES
  ('Commercial Interior', 'Tenant improvements, remodels, and interior fit-outs for commercial spaces.', 'building-2', 10),
  ('New Construction', 'Ground-up construction of new buildings.', 'hammer', 20),
  ('Residential Alteration', 'Additions, renovations, and interior work on existing homes.', 'home', 30),
  ('Change of Use', 'Converting a space from one use to another.', 'refresh-cw', 40),
  ('Site & Exterior', 'Grading, paving, drainage, decks, and other exterior work.', 'trees', 50),
  ('Signage', 'Exterior signs, monument signs, and storefront lettering.', 'flag', 60),
  ('Specialty', 'Focused work like ADUs, EV chargers, pools, hoods, and sprinklers.', 'sparkles', 70),
  ('Other', 'Anything that does not fit the categories above.', 'more-horizontal', 999)
ON CONFLICT (category_name) DO NOTHING;

-- Insert project types via CTE for readable inserts
WITH cat AS (SELECT id, category_name FROM public.project_type_categories)
INSERT INTO public.project_types
  (category_id, client_label, internal_name, short_description, residential_or_commercial,
   common_scope_triggers, possible_permit_categories, possible_agency_categories, possible_document_categories, display_order)
SELECT c.id, x.client_label, x.internal_name, x.short_description, x.roc,
       x.triggers, x.permits, x.agencies, x.docs, x.ord
FROM (VALUES
  -- Commercial Interior
  ('Commercial Interior', 'Open a restaurant', 'open_restaurant', 'Turn a space into a new restaurant.', 'commercial',
     ARRAY['restaurant','food','kitchen','dining']::text[],
     ARRAY['building','mechanical','electrical','plumbing','fire','health','signage']::text[],
     ARRAY['building','fire','health','zoning']::text[],
     ARRAY['floor_plan','mep','hood_details','plumbing_riser','food_service_layout']::text[], 10),
  ('Commercial Interior', 'Remodel an existing restaurant', 'remodel_restaurant', 'Update or expand a working restaurant.', 'commercial',
     ARRAY['restaurant','remodel','kitchen upgrade']::text[],
     ARRAY['building','mechanical','electrical','plumbing','fire','health']::text[],
     ARRAY['building','fire','health']::text[],
     ARRAY['floor_plan','mep']::text[], 20),
  ('Commercial Interior', 'Open a retail store', 'open_retail', 'Fit out a space as a shop or store.', 'commercial',
     ARRAY['retail','store','shop']::text[],
     ARRAY['building','electrical','mechanical','signage']::text[],
     ARRAY['building','zoning']::text[],
     ARRAY['floor_plan','mep']::text[], 30),
  ('Commercial Interior', 'Remodel a retail space', 'remodel_retail', 'Update an existing retail store.', 'commercial',
     ARRAY['retail','remodel']::text[], ARRAY['building','electrical','mechanical']::text[], ARRAY['building']::text[], ARRAY['floor_plan']::text[], 40),
  ('Commercial Interior', 'Office renovation', 'office_renovation', 'Renovate offices or workspace.', 'commercial',
     ARRAY['office','workspace','cubicles']::text[], ARRAY['building','electrical','mechanical']::text[], ARRAY['building']::text[], ARRAY['floor_plan','mep']::text[], 50),
  ('Commercial Interior', 'Medical or dental office', 'medical_dental', 'Fit out or renovate a clinical space.', 'commercial',
     ARRAY['medical','dental','clinic','healthcare']::text[], ARRAY['building','mechanical','electrical','plumbing','health']::text[], ARRAY['building','health']::text[], ARRAY['floor_plan','mep','medical_gas']::text[], 60),
  ('Commercial Interior', 'Commercial tenant improvement', 'commercial_ti', 'General TI for any commercial space.', 'commercial',
     ARRAY['ti','tenant improvement','build-out','fit-out']::text[], ARRAY['building','electrical','mechanical','plumbing']::text[], ARRAY['building']::text[], ARRAY['floor_plan','mep']::text[], 70),
  ('Commercial Interior', 'MEP-only work', 'mep_only', 'Mechanical, electrical, and/or plumbing work with no interior remodel.', 'commercial',
     ARRAY['mep','electrical','plumbing','mechanical','hvac']::text[], ARRAY['electrical','mechanical','plumbing']::text[], ARRAY['building']::text[], ARRAY['mep']::text[], 80),
  ('Commercial Interior', 'Storefront modification', 'storefront_modification', 'Alter the storefront, entry, or facade of a commercial space.', 'commercial',
     ARRAY['storefront','facade','entry']::text[], ARRAY['building','signage']::text[], ARRAY['building','zoning']::text[], ARRAY['elevations','floor_plan']::text[], 90),

  -- New Construction
  ('New Construction', 'New commercial building', 'new_commercial', 'Ground-up commercial construction.', 'commercial',
     ARRAY['ground-up','new building','shell']::text[], ARRAY['building','site','mechanical','electrical','plumbing','fire']::text[], ARRAY['building','fire','zoning','planning']::text[], ARRAY['civil','architectural','structural','mep']::text[], 10),
  ('New Construction', 'New residential building', 'new_residential', 'Ground-up house or small multifamily.', 'residential',
     ARRAY['ground-up','new home','single family','multifamily']::text[], ARRAY['building','site','mechanical','electrical','plumbing']::text[], ARRAY['building','zoning','planning']::text[], ARRAY['site_plan','architectural','structural','mep']::text[], 20),
  ('New Construction', 'Core and shell', 'core_and_shell', 'Ground-up building shell without interior fit-out.', 'commercial',
     ARRAY['shell','core and shell']::text[], ARRAY['building','site']::text[], ARRAY['building','zoning']::text[], ARRAY['architectural','structural','site_plan']::text[], 30),

  -- Residential Alteration
  ('Residential Alteration', 'Home addition', 'home_addition', 'Add square footage to an existing home.', 'residential',
     ARRAY['addition','bump-out','second story']::text[], ARRAY['building','electrical','mechanical','plumbing']::text[], ARRAY['building','zoning']::text[], ARRAY['site_plan','architectural','structural']::text[], 10),
  ('Residential Alteration', 'Kitchen or bathroom renovation', 'kitchen_bath_reno', 'Interior remodel of kitchen or bath.', 'residential',
     ARRAY['kitchen','bath','remodel']::text[], ARRAY['building','electrical','plumbing','mechanical']::text[], ARRAY['building']::text[], ARRAY['floor_plan']::text[], 20),
  ('Residential Alteration', 'Interior remodel', 'residential_interior_remodel', 'General interior remodel of an existing home.', 'residential',
     ARRAY['remodel','interior']::text[], ARRAY['building','electrical','plumbing','mechanical']::text[], ARRAY['building']::text[], ARRAY['floor_plan']::text[], 30),
  ('Residential Alteration', 'Deck or patio', 'deck_patio', 'Exterior deck, patio, or hardscape.', 'residential',
     ARRAY['deck','patio','hardscape']::text[], ARRAY['building']::text[], ARRAY['building','zoning']::text[], ARRAY['site_plan','architectural']::text[], 40),

  -- Change of Use
  ('Change of Use', 'Change how a space will be used', 'change_of_use', 'Convert use — e.g. office to restaurant.', 'commercial',
     ARRAY['change of use','conversion']::text[], ARRAY['building','fire','health','zoning']::text[], ARRAY['building','fire','health','zoning','planning']::text[], ARRAY['floor_plan','use_analysis']::text[], 10),

  -- Site & Exterior
  ('Site & Exterior', 'Exterior site work', 'exterior_site_work', 'Grading, paving, drainage, or utility work.', 'commercial',
     ARRAY['site','grading','paving','drainage']::text[], ARRAY['site','grading','stormwater']::text[], ARRAY['engineering','planning','environmental']::text[], ARRAY['civil','site_plan','swppp']::text[], 10),
  ('Site & Exterior', 'Pool or spa', 'pool_spa', 'New in-ground pool or spa, including pool enclosures.', 'residential',
     ARRAY['pool','spa','pool cage']::text[], ARRAY['building','electrical','plumbing']::text[], ARRAY['building','health']::text[], ARRAY['site_plan','pool_details']::text[], 20),

  -- Signage
  ('Signage', 'Sign installation', 'sign_installation', 'New or altered exterior signage.', 'commercial',
     ARRAY['sign','signage','monument sign','wall sign']::text[], ARRAY['signage','electrical']::text[], ARRAY['building','zoning']::text[], ARRAY['sign_elevation','site_plan']::text[], 10),

  -- Specialty
  ('Specialty', 'Accessory dwelling unit (ADU)', 'adu', 'Add a small independent dwelling to a residential lot.', 'residential',
     ARRAY['adu','mother-in-law','in-law suite','granny flat','casita']::text[], ARRAY['building','electrical','mechanical','plumbing']::text[], ARRAY['building','zoning','planning']::text[], ARRAY['site_plan','architectural','structural']::text[], 10),
  ('Specialty', 'EV charging station', 'ev_charger', 'Install one or more electric vehicle chargers.', 'commercial',
     ARRAY['ev','charger','charging station']::text[], ARRAY['electrical']::text[], ARRAY['building']::text[], ARRAY['electrical_riser','site_plan']::text[], 20),
  ('Specialty', 'Kitchen hood / suppression', 'hood_suppression', 'Type I/II kitchen hood or Ansul-style suppression system.', 'commercial',
     ARRAY['hood','ansul','type i','type ii','suppression']::text[], ARRAY['mechanical','fire']::text[], ARRAY['building','fire','health']::text[], ARRAY['hood_details','mep']::text[], 30),
  ('Specialty', 'Fire sprinkler work', 'fire_sprinkler', 'Install or modify a fire sprinkler system.', 'commercial',
     ARRAY['sprinkler','fire sprinkler','sprinkler modification']::text[], ARRAY['fire','sprinkler']::text[], ARRAY['fire','building']::text[], ARRAY['sprinkler_plans']::text[], 40),
  ('Specialty', 'Demolition', 'demolition', 'Demolish all or part of a structure.', 'commercial',
     ARRAY['demo','demolition','tear-down']::text[], ARRAY['demolition','building']::text[], ARRAY['building','environmental']::text[], ARRAY['demo_plan','asbestos_survey']::text[], 50),

  -- Other
  ('Other', 'Other project type', 'other', 'Something else — describe below.', 'commercial',
     ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], 999),
  ('Other', 'I''m not sure', 'not_sure', 'Ask PERMIVIO to help figure out the right project type.', 'commercial',
     ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], 998)
) AS x(category_name, client_label, internal_name, short_description, roc, triggers, permits, agencies, docs, ord)
JOIN cat c ON c.category_name = x.category_name
ON CONFLICT (internal_name) DO NOTHING;

-- Seed aliases
INSERT INTO public.project_type_aliases (project_type_id, alias)
SELECT pt.id, a.alias
FROM public.project_types pt
JOIN (VALUES
  ('commercial_ti','TI'), ('commercial_ti','tenant improvement'), ('commercial_ti','build-out'),
  ('commercial_ti','buildout'), ('commercial_ti','fit-out'), ('commercial_ti','fitout'),
  ('new_commercial','ground-up'), ('new_commercial','groundup'), ('new_commercial','new construction'),
  ('new_residential','ground-up'), ('new_residential','new home'), ('new_residential','new house'),
  ('remodel_restaurant','restaurant remodel'), ('remodel_restaurant','restaurant renovation'),
  ('open_restaurant','new restaurant'), ('open_restaurant','food service'),
  ('adu','ADU'), ('adu','mother-in-law suite'), ('adu','mother in law'), ('adu','granny flat'), ('adu','casita'), ('adu','accessory dwelling'),
  ('pool_spa','pool cage'), ('pool_spa','pool enclosure'), ('pool_spa','spa'),
  ('mep_only','MEP'), ('mep_only','mechanical electrical plumbing'),
  ('storefront_modification','storefront'), ('storefront_modification','facade'),
  ('ev_charger','EV charger'), ('ev_charger','charging station'), ('ev_charger','charger'),
  ('hood_suppression','Ansul'), ('hood_suppression','hood'), ('hood_suppression','type I hood'), ('hood_suppression','type II hood'),
  ('fire_sprinkler','sprinklers'), ('fire_sprinkler','sprinkler modification'), ('fire_sprinkler','NFPA 13'),
  ('change_of_use','CO'), ('change_of_use','change of occupancy'), ('change_of_use','conversion'),
  ('sign_installation','signage'), ('sign_installation','monument sign'), ('sign_installation','wall sign'),
  ('demolition','demo'), ('demolition','tear down'), ('demolition','tear-down'),
  ('office_renovation','office remodel'), ('office_renovation','workspace remodel'),
  ('medical_dental','medical office'), ('medical_dental','dental office'), ('medical_dental','clinic'),
  ('kitchen_bath_reno','kitchen remodel'), ('kitchen_bath_reno','bathroom remodel'), ('kitchen_bath_reno','bath remodel'),
  ('home_addition','addition'), ('home_addition','bump out'), ('home_addition','second story'),
  ('exterior_site_work','sitework'), ('exterior_site_work','grading'), ('exterior_site_work','paving'), ('exterior_site_work','drainage')
) AS a(internal_name, alias) ON a.internal_name = pt.internal_name
ON CONFLICT (project_type_id, alias) DO NOTHING;
