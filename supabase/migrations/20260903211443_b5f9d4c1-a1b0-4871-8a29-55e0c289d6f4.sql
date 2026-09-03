-- 1. Pricing structure clarity on service_products
ALTER TABLE public.service_products
  ADD COLUMN IF NOT EXISTS review_addon_price_cents integer,
  ADD COLUMN IF NOT EXISTS rush_addon_price_cents integer,
  ADD COLUMN IF NOT EXISTS custom_quote_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS professional_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS starting_price_cents integer,
  ADD COLUMN IF NOT EXISTS report_subtitle text,
  ADD COLUMN IF NOT EXISTS recommended_project_type text,
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS full_scope jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill add-on amounts from the legacy total column
UPDATE public.service_products
SET review_addon_price_cents = GREATEST(professional_review_price_cents - base_price_cents, 0)
WHERE review_addon_price_cents IS NULL
  AND professional_review_price_cents IS NOT NULL
  AND professional_review_price_cents > base_price_cents;

UPDATE public.service_products
SET rush_addon_price_cents = rush_price_cents
WHERE rush_addon_price_cents IS NULL AND rush_price_cents IS NOT NULL;

-- 2. Saved PDF + issuance metadata on delivered report versions
ALTER TABLE public.service_report_versions
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_filename text,
  ADD COLUMN IF NOT EXISTS report_number text,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewer_name text,
  ADD COLUMN IF NOT EXISTS reviewer_title text;

-- 3. Canonical Permivio report catalog (blueprint pricing)
INSERT INTO public.service_products (
  product_key, name, client_title, report_subtitle, client_question, description, category,
  base_price_cents, review_addon_price_cents, professional_review_price_cents,
  custom_quote_required, professional_review_required, starting_price_cents,
  turnaround_estimate, recommended_project_type, is_recommended,
  supports_professional_review, deliverables, full_scope, active, display_order
) VALUES
('property_snapshot','Property Snapshot','Property Snapshot','Property identity, jurisdiction, and governing authorities',
 'What is this property and who governs it?',
 'A concise profile of the property: parcel identity, the jurisdiction that actually controls permitting, zoning designation, existing use, and the approvals most likely to apply.',
 'due_diligence',14900,15000,29900,false,false,NULL,'2-3 business days','Any property, before you commit',false,true,
 '["Property identity and parcel/APN record","Controlling jurisdiction and authorities having jurisdiction","Zoning designation and existing land use","Basic allowable-use research","Likely permits and approvals","Known constraints and official sources"]'::jsonb,
 '["Property identity","Parcel/APN information","Exact jurisdiction","Authorities having jurisdiction","Zoning designation","Existing land use","Basic allowable-use research","Likely permits and approvals","Known constraints","Official sources","Questions requiring confirmation"]'::jsonb,
 true,10),
('project_feasibility','Project Feasibility Report','Project Feasibility Report','Can this proposed use move forward at this property?',
 'Can this proposed project move forward at this property?',
 'A decision-grade feasibility opinion for a specific proposed use at a specific property, covering zoning, development standards, permit paths, utilities, risks, and potential deal killers.',
 'due_diligence',39900,22600,62500,false,false,NULL,'3-5 business days','A specific proposed use, tenant fit-out, or new build',true,true,
 '["Executive feasibility opinion","Zoning and land-use findings","Building, fire, and health permit paths","Parking, setbacks, and development standards","Permit and approval matrix plus risk matrix","Utilities, deal killers, and next steps"]'::jsonb,
 '["Executive feasibility opinion","Project and site summary","Property information","Jurisdiction and AHJ determination","Existing and proposed use analysis","Zoning and land-use findings","Development standards","Parking and loading","Access and right-of-way considerations","Building permit path","Fire and life-safety path","Health review path, when applicable","Utility considerations","Environmental and flood indicators","Permit and approval matrix","Risk matrix","Potential deal killers","Estimated permitting sequence","Outstanding due diligence","Recommended next steps","Official sources","Assumptions and limitations"]'::jsonb,
 true,20),
('development_due_diligence','Development Due Diligence Report','Development Due Diligence Report','Entitlements, civil review, and development sequence',
 'What will it take to develop this site?',
 'Full pre-development due diligence: entitlement triggers, land-use approvals, site/civil review, stormwater, transportation, utility extension risk, agency coordination, and the development sequence.',
 'due_diligence',89900,59600,149500,false,false,NULL,'7-10 business days','Ground-up development, site work, or acquisition due diligence',false,true,
 '["Entitlement and land-use approval requirements","Rezoning, variance, and conditional-use triggers","Site development and civil review requirements","Stormwater and land-disturbance requirements","Utility extension and capacity risks","Agency coordination plan and development sequence"]'::jsonb,
 '["Everything in the Project Feasibility Report","Entitlement requirements","Planning and land-use approvals","Rezoning, variance, special exception, or conditional-use triggers","Site-development and civil review","Platting or subdivision indicators","Stormwater and land-disturbance requirements","Transportation and access review","Utility extension and capacity risks","Required pre-application meetings","Agency coordination plan","Development sequence","Long-lead approvals","Recommended consultant team","Pre-acquisition or pre-lease due-diligence checklist"]'::jsonb,
 true,30),
('major_development_study','Major Development Study','Major Development Study','Multi-parcel, multi-authority, phased development evaluation',
 'How should this complex development be evaluated and phased?',
 'For large acreage, multi-parcel, mixed-use, subdivision, campus, master-planned, multi-building, phased, or multi-authority developments. Scope is defined with you before work begins, and professional review is always included.',
 'due_diligence',0,NULL,NULL,true,true,250000,'10-15+ business days','Large acreage, multi-parcel, phased, or master-planned development',false,true,
 '["Multi-parcel and phasing strategy analysis","Multi-authority and special-district coordination","Comprehensive-plan and legislative approval implications","Subdivision, plat, and infrastructure phasing","Public hearings and stakeholder process mapping","Critical path and fatal-flaw analysis"]'::jsonb,
 '["Multi-parcel analysis","Phasing strategy","Multi-authority coordination","Special districts","Annexation or jurisdictional boundary considerations","Comprehensive-plan implications","Rezoning and legislative approvals","Subdivision and plat process","Infrastructure and utility phasing","Transportation requirements","Public hearings","Community or stakeholder processes","Long-lead items","Critical path","Fatal-flaw analysis","Professional consultant needs","Custom recommendations"]'::jsonb,
 true,40),
('permit_requirements','Permit Requirements Report','Permit Requirements Report','Every permit, approval, and submission requirement for your project',
 'Exactly what permits and approvals will I need?',
 'A complete permit and approval list for your project type in your exact jurisdiction, with issuing agencies, required documents, sequence, dependencies, and published review timelines where verified.',
 'permitting',24900,20000,44900,false,false,NULL,'3-5 business days','Any project heading toward submission',false,true,
 '["Exact jurisdiction and issuing agencies","Required and possible conditional permits","Required plans and documents","Application sequence and concurrent reviews","Estimated review timelines and verified fees","Required inspections and closeout items"]'::jsonb,
 '["Exact jurisdiction","Required permits","Possible conditional permits","Issuing agencies","Required plans and documents","Contractor and professional requirements","Application sequence","Concurrent reviews","Dependencies","Estimated review timelines","Published fees where verified","Required inspections","Closeout requirements","Items requiring agency confirmation"]'::jsonb,
 true,50),
('plan_qaqc','Plan QA/QC Review','Plan QA/QC Review','Pre-submission plan set quality control',
 'Are my plans ready to submit?',
 'A pre-submission quality control review of your plan set: drawing inventory, missing sheets, numbering and revision conflicts, seals, discipline findings, coordination problems, and a submission-readiness score.',
 'quality_control',49900,40000,89900,false,false,NULL,'5-7 business days','Any plan set about to be submitted for review',false,true,
 '["Complete drawing inventory and missing sheets","Sheet numbering and revision conflicts","Missing professional seals","Discipline-by-discipline findings","Cross-discipline coordination problems","Recommended corrections and readiness score"]'::jsonb,
 '["Complete drawing inventory","Missing sheets","Duplicate sheets","Sheet numbering problems","Revision conflicts","Missing professional seals","Architectural findings","Structural coordination","Mechanical findings","Electrical findings","Plumbing findings","Fire and life-safety findings","Accessibility findings","Civil and site findings","Cross-discipline coordination problems","Missing submission documents","Jurisdiction-specific submission concerns","Recommended corrections","Submission-readiness score"]'::jsonb,
 true,60),
('correction_analysis','Correction Analysis','Correction Analysis','Reviewer comments explained, assigned, and answered',
 'What do the reviewer comments mean, and who needs to correct them?',
 'Every reviewer comment translated into plain language, assigned to the responsible discipline, matched to the affected sheet, with recommended corrections, a resubmission checklist, and a response-letter framework.',
 'permitting',29900,25000,54900,false,false,NULL,'3-5 business days','Projects with correction letters or reviewer comments',false,true,
 '["Original reviewer comment and department","Plain-language explanation","Responsible discipline and affected sheet","Required response and recommended correction","Information still needed and status","Resubmission checklist and response-letter framework"]'::jsonb,
 '["Original reviewer comment","Reviewing department","Plain-language explanation","Responsible discipline","Sheet or document likely affected","Required response","Recommended correction","Information still needed","Status","Resubmission checklist","Response-letter framework"]'::jsonb,
 true,70),
('permit_roadmap','Permit Roadmap','Permit Roadmap','The full approval path, sequence, and critical path',
 'What is the full path to getting this project approved?',
 'The complete approval path for your project: permit and agency matrices, submission order, parallel workstreams, dependencies, critical path, inspections, and the path to CO.',
 'permitting',29900,25000,54900,false,false,NULL,'3-5 business days','Projects that need a sequenced approval plan',false,true,
 '["Full permit and agency matrix","Submission order and parallel workstreams","Dependencies and critical path","Required documents and review periods","Inspections, utilities, and licensing","Milestones, responsible parties, next actions"]'::jsonb,
 '["Full permit matrix","Agency matrix","Submission order","Parallel workstreams","Dependencies","Critical path","Required documents","Estimated review periods","Inspections","Utility coordination","Licensing","TCO/CO path","Milestones","Responsible parties","Recommended next actions"]'::jsonb,
 true,80),
('co_readiness','CO Readiness Review','CO Readiness Review','What remains before opening or closeout',
 'What remains before the project can open or close out?',
 'A closeout readiness review: open permits, remaining final inspections, agency signoffs, utility releases, special inspection and testing documents, and the TCO/CO checklist.',
 'closeout',34900,30000,64900,false,false,NULL,'3-5 business days','Projects approaching opening, TCO, or CO',false,true,
 '["Open permits and required final inspections","Fire, health, and agency signoffs","Utility releases","Special-inspection and testing documents","Contractor closeout and record documents","TCO/CO checklist and opening blockers"]'::jsonb,
 '["Open permits","Required final inspections","Failed or incomplete inspections","Fire signoffs","Health signoffs","Utility releases","Special-inspection documents","Testing and certification requirements","Contractor closeout documents","Final affidavits","Record documents","TCO requirements","CO requirements","Opening blockers","Closeout responsibility matrix","Final readiness checklist"]'::jsonb,
 true,90),
('jurisdiction_research','Jurisdiction Research Report','Jurisdiction Research Report','Authorities, portals, adopted codes, and official resources',
 'Which authorities and official permitting resources apply?',
 'A directory-grade research report identifying every authority with jurisdiction over your property, plus permit portals, adopted codes, published contacts, submission instructions, and official links.',
 'research',14900,15000,29900,false,false,NULL,'2-4 business days','Any project in an unfamiliar jurisdiction',false,true,
 '["Building and zoning authorities","Fire and health authorities","Public works, ROW, and environmental authorities","Utility authorities and special districts","Permit portals and adopted codes","Published contacts, instructions, and fee schedules"]'::jsonb,
 '["Property jurisdiction","Building authority","Zoning authority","Fire authority","Health authority","Site-development authority","Public works and right-of-way authority","Environmental authority","Utility authorities","Special districts","Permit portals","Adopted codes","Published contacts","Submission instructions","Published review timelines","Published fee schedules","Official sources"]'::jsonb,
 true,100),
('utility_due_diligence','Utility Due Diligence Report','Utility Due Diligence Report','Providers, capacity indicators, and service constraints',
 'Which utilities may affect or constrain this project?',
 'Utility-focused due diligence: provider identification, existing service indicators, potential upgrades or off-site extensions, easements, conflicts, and the provider confirmation checklist.',
 'due_diligence',29900,30000,59900,false,false,NULL,'3-5 business days','Sites where service capacity or extensions are a risk',false,true,
 '["Electric, gas, water, and sewer providers","Existing service indicators","Potential upgrades and off-site extensions","Easements and utility conflicts","Fire-service and meter/transformer considerations","Provider confirmation and coordination checklist"]'::jsonb,
 '["Electric provider","Gas provider","Water provider","Sewer provider","Telecom considerations","Fire-service considerations","Existing service information when available","Capacity status","Potential service upgrades","Potential off-site extensions","Easements","Utility conflicts","Meter or transformer considerations","Provider applications","Required design information","Provider confirmation items","Utility coordination checklist","Risks and recommended next steps"]'::jsonb,
 true,110)
ON CONFLICT (product_key) DO UPDATE SET
  name = EXCLUDED.name,
  client_title = EXCLUDED.client_title,
  report_subtitle = EXCLUDED.report_subtitle,
  client_question = EXCLUDED.client_question,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  base_price_cents = EXCLUDED.base_price_cents,
  review_addon_price_cents = EXCLUDED.review_addon_price_cents,
  professional_review_price_cents = EXCLUDED.professional_review_price_cents,
  custom_quote_required = EXCLUDED.custom_quote_required,
  professional_review_required = EXCLUDED.professional_review_required,
  starting_price_cents = EXCLUDED.starting_price_cents,
  turnaround_estimate = EXCLUDED.turnaround_estimate,
  recommended_project_type = EXCLUDED.recommended_project_type,
  is_recommended = EXCLUDED.is_recommended,
  supports_professional_review = EXCLUDED.supports_professional_review,
  deliverables = EXCLUDED.deliverables,
  full_scope = EXCLUDED.full_scope,
  active = EXCLUDED.active,
  display_order = EXCLUDED.display_order,
  updated_at = now();

-- Retire any legacy duplicate catalog entries without deleting order history
UPDATE public.service_products
SET active = false
WHERE product_key NOT IN (
  'property_snapshot','project_feasibility','development_due_diligence','major_development_study',
  'permit_requirements','plan_qaqc','correction_analysis','permit_roadmap','co_readiness',
  'jurisdiction_research','utility_due_diligence'
);