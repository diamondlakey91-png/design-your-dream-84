
# Scope of Work Intelligence — Plan

Additive feature. No redesign. Reuses existing PERMIVIO cards, typography, colors, spacing, dark theme, blue/purple accents, and current navigation. New screens live inside the existing project shell.

## 1. Screen Flow

```text
Project Dashboard
  └─ [New tab: "Scope & Roadmap"]  (added alongside Overview / Docs / Checklist / Inspections)
       ├─ Step 1  Scope Intake (multi-section form, single page, sticky Save)
       │         └─ Autosave draft → scope_of_work row (status=draft)
       ├─ Step 2  Jurisdiction Resolution (auto, with manual override card)
       │         └─ Confirms City / County / State authorities
       ├─ Step 3  AI Analysis (progress card, cancellable, ~20–60s)
       │         └─ Streams status: "Resolving jurisdiction → Fetching agencies → Matching permits → Drafting roadmap"
       ├─ Step 4  Follow-up Questions (only if AI marks gaps)
       │         └─ Answers loop back into analysis (re-run partial)
       └─ Step 5  Permit Roadmap View (result)
                 ├─ Permits list (grouped by agency)  — each card has verification badge
                 ├─ Documents required
                 ├─ Sequence & Critical Path (visual timeline)
                 ├─ Fees & Review Timelines (with source links)
                 ├─ Risks & Missing Info
                 ├─ Sources panel (citations)
                 └─ [Send to Checklist] [Request Human Verification] [Export PDF]
```

Empty-state on Overview: "Add Scope of Work to generate roadmap" CTA using existing outlined card style.

## 2. Intake Questions (grouped, matches user list exactly)

Location & Classification
- Project address (autocomplete, required)
- Residential or Commercial (radio)
- Existing occupancy / use
- Proposed occupancy / use
- Project type (New construction / TI / Change of occupancy / Addition / Alteration / Repair / Demolition / Shell / Core & shell)
- Construction classification (IBC I-A … V-B, or IRC)
- Construction value ($)
- Square footage (gross / affected)

Scope Description
- Detailed scope of work (long text)

Trade Involvement (each: Yes / No / Unsure)
- Interior, Exterior, Structural, Electrical, Mechanical, Plumbing
- Fire alarm, Fire sprinkler / suppression
- Food service, Signage
- Site development, Grading, Stormwater, Right-of-way, Utility

Dates
- Target construction start date
- Target opening / TCO date

## 3. Conditional Question Logic

Only reveal deeper questions when triggered — keeps the form short.

- Residential → hide "Construction classification IBC" (default IRC); show "Number of dwelling units".
- Commercial + Food service = Yes → ask: seating count, grease-producing equipment, Type I/II hood, grease interceptor sized?, water/sewer impact.
- Change of occupancy → force re-answer of Existing vs Proposed use; add "Is sprinkler system in place?" and "Egress reconfigured?"
- Structural = Yes → ask: load-bearing wall changes, foundation work, roof structure, seismic retrofit.
- Fire sprinkler = Yes → NFPA 13/13R/13D, new/modification, # heads (optional).
- Site development / Grading / Stormwater = Yes → disturbed area (sq ft / acres), impervious added, floodplain, wetlands proximity.
- Right-of-way = Yes → sidewalk, curb cut, lane closure, encroachment.
- Utility = Yes → water, sewer, gas, electric, telecom; new service vs modification.
- Signage = Yes → wall / freestanding / illuminated / electronic; historic district?
- Construction value ≥ jurisdiction threshold OR sq ft ≥ threshold → flag likely design-professional stamp requirement.
- Target opening date < AI-estimated timeline → risk flag ("aggressive schedule").

Logic runs client-side (rules file) so the form stays snappy; AI does not gate the intake.

## 4. Database Tables and Fields

New tables (public schema, RLS on, GRANT to authenticated + service_role). Existing `projects`, `permit_items`, `jurisdiction_profiles`, `chat_threads` untouched.

`scope_of_work`
- id uuid pk, project_id fk projects, user_id fk auth.users
- address, address_normalized, lat, lng
- occupancy_existing, occupancy_proposed
- residential_or_commercial (enum)
- project_type (enum), construction_type (enum), dwelling_units int
- construction_value_cents bigint, sq_ft_gross int, sq_ft_affected int
- scope_text text
- trades jsonb  (interior/exterior/structural/electrical/mechanical/plumbing/fire_alarm/fire_sprinkler/food_service/signage/site_dev/grading/stormwater/row/utility → {involved: 'yes'|'no'|'unsure', details: jsonb})
- target_start_date, target_open_date
- status enum(draft, submitted, analyzing, needs_followup, complete)
- created_at, updated_at

`permit_roadmaps`
- id uuid pk, scope_id fk scope_of_work, project_id fk projects
- jurisdiction_id fk jurisdiction_profiles (nullable if unresolved)
- summary text
- health_score int, confidence numeric
- generated_by_model text, prompt_version text
- created_at

`roadmap_permits`
- id, roadmap_id fk permit_roadmaps
- name, agency, level enum(city, county, state, federal, utility)
- category enum(zoning, building, electrical, mechanical, plumbing, fire, health, site, environmental, row, utility, business_license, sign, tco, co)
- likelihood enum(required, likely, conditional, not_required)
- verification enum(verified, ai_assisted, needs_agency_confirmation)
- fee_estimate_cents nullable, fee_basis text
- review_days_min, review_days_max
- sequence_order int, depends_on uuid[], concurrent_with uuid[], critical_path bool
- notes, source_ids uuid[]

`roadmap_documents`
- id, roadmap_id, permit_id nullable, name, description, required bool, verification enum, source_ids uuid[]

`roadmap_agencies`
- id, roadmap_id, name, level, jurisdiction, url, phone, role, verification enum, source_id nullable

`roadmap_sources`
- id, roadmap_id, url, title, publisher, retrieved_at, quote, kind enum(agency_site, code, ordinance, portal, other)

`roadmap_risks`
- id, roadmap_id, severity enum(low, med, high), category, message, mitigation

`roadmap_followups`
- id, roadmap_id, question, field_hint, answered_value, answered_at

`roadmap_verifications` (human review workflow)
- id, roadmap_id, item_table, item_id, requested_by, assigned_to, status enum(open, in_review, verified, rejected), notes, evidence_url, decided_at

All tables: `ALTER TABLE ... ENABLE RLS`; policies scoped to `project.owner_id = auth.uid()` (via join) and admin role via `has_role`. `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`; `GRANT ALL ... TO service_role`.

## 5. AI Analysis Workflow

Server function `analyzeScope` (protected, `createServerFn` + `requireSupabaseAuth`), streamed via existing chat.stream route pattern. Steps:

1. Load `scope_of_work` row; validate required fields with zod.
2. Resolve jurisdiction (see §6). Persist `jurisdiction_id`.
3. Build research context:
   - Look up cached `jurisdiction_profiles` + `portalRegistry` + `healthAgencyRegistry`.
   - Fan-out Firecrawl searches (reuse existing `tryFirecrawlContext` pattern): building, zoning, fire, health, DPW/site, utility, business license, sign, ROW — scoped `site:.gov`.
   - Scrape up to N pages in parallel; keep quotes + URLs into `roadmap_sources`.
4. Rule-based pre-filter: from trades + project_type → shortlist candidate permit categories, mandatory CO/TCO for occupancy changes and new construction.
5. LLM pass (Gemini 2.0 Flash, JSON mode, low temp) with a structured template. Prompt requires: every permit/document/agency must reference a source_id OR be labeled `needs_agency_confirmation`. No invention: if not in scraped context and not model-code default (IBC/IRC/NFPA/NEC), mark `ai_assisted` and add a follow-up question.
6. Normalize JSON (extend existing `normalizeComplianceJson`) → zod parse → insert into roadmap tables in a single transaction.
7. If AI returned `followups[]`, set `scope_of_work.status = needs_followup` and surface Step 4 UI.
8. On completion, mirror required permits into existing `permit_items` (checklist) via "Send to Checklist" action so downstream tracking still works.

Prompt/version stored on `permit_roadmaps.prompt_version` for reproducibility.

## 6. Jurisdiction Matching Logic

Reuse existing helpers; add explicit resolver:

1. Geocode address (existing Google Maps key) → lat/lng + administrative components.
2. From components extract: state, county, incorporated city (if any). Detect unincorporated → county authority.
3. Match to `jurisdiction_profiles` by `(state, city)` then `(state, county)`. If none → create profile stub (unverified) and surface manual confirm.
4. Overlay state-level authorities (health, environmental, DOT for ROW on state roads, state fire marshal for regulated occupancies).
5. Detect special overlays: historic district, floodplain (FEMA layer if available; else follow-up), coastal, tribal, airport.
6. Emit `authority_stack` = [city, county, state, federal-if-applicable, utility providers]. This stack is passed to the LLM and constrains recommendations.
7. User can override matched jurisdiction; override recorded on roadmap.

## 7. Permit Recommendation Model

Hybrid: rule table + LLM refinement.

Rule table (`permit_rules`, seeded, editable by admins later):
- Input signals: project_type, occupancy_existing→proposed, trades, thresholds (value, sq_ft, disturbed area).
- Output: candidate permits with default likelihood + category + typical reviewing agency.
- Examples: `food_service=yes → Health permit (county/state)`; `change_of_occupancy=yes → CO required`; `disturbed_area ≥ 5000 sqft → grading + SWPPP`; `structural=yes → building + structural review`; `signage=yes AND illuminated → sign + electrical`.

LLM refines: adjusts likelihood using jurisdiction context, adds jurisdiction-specific permits (e.g., NYC LAA, DC BOCA-derived, Baltimore ZAD), removes non-applicable ones, and cites sources.

Concurrency and dependencies encoded as `depends_on` / `concurrent_with` on `roadmap_permits`. Critical-path = longest chain of dependencies until CO.

## 8. Timeline Calculation Model

- Each permit has `review_days_min/max` (from source or model-code default).
- Build a DAG: nodes = permits + inspections + CO; edges = dependencies.
- Earliest-start / earliest-finish computed forward pass from `target_start_date` (or today).
- Latest-finish computed backward from `target_open_date`.
- Critical path = zero-slack nodes; flagged in UI.
- Construction & inspection timeline appended after permit issuance milestones, using rough duration inputs (project_type + sq_ft heuristic; user editable).
- If total exceeds target_open_date → risk entry auto-created ("Schedule at risk by N days").

## 9. Verification Model

Every recommendation carries `verification` ∈ {`verified`, `ai_assisted`, `needs_agency_confirmation`}.

- `verified`: sourced from a `.gov` page scraped this run OR from an existing `jurisdiction_profiles` field previously marked verified. Must have `source_id`.
- `ai_assisted`: derived from model code (IBC, IRC, IFC, NFPA, NEC, IECC) or rule table; no jurisdiction-specific source; labeled with the code section.
- `needs_agency_confirmation`: rule/LLM inferred but lacking both source and model-code basis; auto-generates a follow-up or human verification task.

Badges rendered with the existing colored-chip component (green/amber/blue) — no new design tokens.

## 10. Source Citation Model

- Only sources with `url` starting `https://` and host in an allowed list (`*.gov`, `*.us`, jurisdictional custom TLDs) count as `verified`.
- Each source stored once per roadmap in `roadmap_sources` with `retrieved_at` + `quote` (≤ 400 chars).
- Permits, documents, agencies, fees, timelines each reference `source_ids uuid[]`.
- UI: click any badge → drawer listing sources with quote preview + outbound link.
- Model-code citations stored as sources with `kind='code'` and `publisher='ICC/NFPA/…'`, `url` optional.

## 11. Error and Empty States

- No address → intake blocks submission with inline error (existing form pattern).
- Jurisdiction unresolved → yellow banner "We could not confirm your jurisdiction — confirm City/County" with dropdowns.
- Firecrawl/network failure → roadmap still generated with `ai_assisted` labels; banner "Live jurisdiction sources unavailable — verify before submission." Retry button.
- AI returned invalid JSON after 2 retries → toast + "Retry analysis" CTA; scope status returns to `submitted`.
- Zero permits detected → empty-state card "Scope appears exempt — confirm with jurisdiction" plus follow-up question set.
- No target dates → timeline shown as relative days.
- Rate limit (429) / credits (402) → existing gateway error toasts.

## 12. Human Verification Workflow

- User clicks "Request Human Verification" on any card → creates `roadmap_verifications` row (status=open).
- Admin role (`has_role('admin')`) sees `/admin/verifications` queue (reuses existing admin route pattern).
- Admin can attach evidence URL, set status to `verified` or `rejected`, and add notes.
- On `verified`, the underlying item's `verification` promoted to `verified`; source added.
- Notification (in-app, existing pattern) to the requesting user.
- Aggregate: a roadmap's overall confidence increases as items are verified.

## 13. Minimum Viable Version (MVP)

Ship in one release:
- New `Scope & Roadmap` tab on Project view.
- `scope_of_work` intake with all listed fields + conditional logic.
- Jurisdiction resolution using existing geocoder + `jurisdiction_profiles`.
- `analyzeScope` server function with rule table + Gemini pass + Firecrawl fan-out (reuse existing infra).
- Roadmap tables + read-only Roadmap view with badges, sources drawer, sequence list.
- "Send to Checklist" writes into existing `permit_items`.
- PDF export reusing `pdf-lib` sanitizer pattern.
- Follow-up question loop (single round).
- Verification labels enforced.

Explicitly out of MVP: DAG visualization, admin verification queue UI, FEMA/historic overlays, editable rule table UI, multi-round follow-ups.

## 14. Recommended Development Phases

Phase 1 — Data + intake (no AI)
- Migrations, RLS, GRANTs, zod schemas.
- Intake form + autosave + conditional logic.
- Jurisdiction resolver + manual override.

Phase 2 — Rule engine
- Seed `permit_rules`.
- Deterministic roadmap draft from rules only (no LLM). Verifiable baseline.

Phase 3 — AI enrichment
- Firecrawl fan-out + source capture.
- Gemini pass + normalization + verification labeling.
- Follow-up questions loop.

Phase 4 — Roadmap UX
- Roadmap view, sources drawer, badges, "Send to Checklist", PDF export.

Phase 5 — Timeline & critical path
- DAG builder, CPM computation, target-date risk flagging.

Phase 6 — Human verification
- `roadmap_verifications` queue, admin UI, promotion flow, notifications.

Phase 7 — Overlays & polish
- Floodplain / historic / airport / tribal detection.
- Editable rule table (admin).
- Multi-round follow-ups, confidence scoring, per-jurisdiction learning.

## Technical Details

- Files added (planned): `src/lib/scope.functions.ts`, `src/lib/scope.server.ts`, `src/lib/jurisdictionResolver.server.ts`, `src/lib/permitRules.ts`, `src/lib/roadmapNormalize.ts`, `src/routes/_authenticated/projects.$id.scope.tsx`, `src/routes/_authenticated/projects.$id.roadmap.tsx`, `src/routes/_authenticated/admin.verifications.tsx` (phase 6), migration files under Supabase migration tool.
- Reuses: `tryFirecrawlContext`, `normalizeComplianceJson` pattern, `JurisdictionAutocomplete`, existing chip/badge components, `pdf-lib` sanitizer `san`, `useSubscription` gating (Beta unlocks all).
- Auth: all server functions gated by `requireSupabaseAuth`; admin queue gated by `has_role('admin')`.
- Model: `google/gemini-2.0-flash`, JSON mode, temp 0.2, max_tokens 32k; prompt version pinned.
- Streaming: reuse `/api/chat.stream` transport pattern for progress; final result written server-side then fetched.
- No changes to existing screens beyond adding the new tab entry.

Awaiting approval before implementation.
