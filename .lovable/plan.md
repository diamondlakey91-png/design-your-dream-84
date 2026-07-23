
# Jurisdiction Resolution Correction — Scope of Work + Permit Roadmap

This is a logic and data-quality correction. No visual redesign. Existing PERMIVIO cards, tabs, spacing, colors, typography, icons and navigation stay exactly as they are. New content is inserted into the existing card system.

---

## 1. Files and components to modify

Server / logic
- `src/lib/scope.functions.ts` — require full structured address; reject "MD 21401"-style inputs from acting as jurisdiction.
- `src/lib/permitRules.ts` — stop using ZIP/state string as agency name; agencies come from the resolved jurisdiction, not the mailing address.
- `src/lib/roadmap.functions.ts` — block roadmap generation until jurisdiction is resolved (or explicitly marked "Needs Confirmation"); tag every permit/doc/agency with jurisdiction_id and verification level per the new rules.
- `src/lib/roadmapEnrich.functions.ts` — enrichment queries keyed on resolved municipality + county + state + adopted-code sources, not the raw mailing city; may not upgrade an item to "Verified" unless its agency is resolved.
- `src/lib/jurisdiction.functions.ts` **(new)** — `resolveAddress`, `getJurisdictionCandidates`, `confirmJurisdiction`, `overrideAuthority`, `requestHumanVerification`.
- `src/lib/geocode.server.ts` **(new, server-only)** — Google Geocoding + reverse-geocoding (uses existing `GOOGLE_MAPS_API_KEY`); returns lat/lng, place components, incorporated flag.
- `src/lib/parcel.server.ts` **(new, server-only)** — best-effort parcel + municipal-boundary lookup via existing state/county open-data portals via Firecrawl; graceful "unknown" fallback.
- `src/lib/authorityRegistry.ts` **(new)** — curated exact-agency records (building, planning/zoning, fire, health, public works, site development, environmental, ROW/transportation, utilities, historic/floodplain) keyed by county/municipality; extends existing `portalRegistry.ts` and `healthAgencyRegistry.ts`, does not replace them.
- `src/lib/adoptedCodes.ts` **(new)** — adopted code editions + local amendments by jurisdiction, with source + effective date + verified date.

UI (content changes only, existing cards / classes)
- `src/components/project/ScopeTab.tsx` — intake form gains: Street, Suite/Unit, City, State, ZIP, Parcel/Tax ID (optional). Existing free-text location field is deprecated for new projects; kept read-only for legacy.
- `src/components/project/JurisdictionConfirmCard.tsx` **(new)** — same card shell as existing project cards; shown above `RoadmapView`. Contains resolved address, parcel, municipality, county, state, incorporated flag, each authority with responsibility / source / verification / last-checked date, and actions: Confirm, Correct location, Select different authority, Request human verification.
- `src/components/project/RoadmapView.tsx` — every permit card gains: exact agency, requirement status, verification, triggering scope condition, source, last-verified date, timeline basis. Roadmap header shows "Draft — jurisdiction not confirmed" until confirmation. No layout change; new rows use existing muted / mono / badge styles.
- `src/components/project/AgencyBadge.tsx` **(new)** — renders exact-agency name + department; falls back to "Exact authority needs confirmation".

DB
- New tables: `jurisdictions`, `authorities`, `official_sources`, `jurisdiction_confirmations`, `code_adoptions`.
- New columns on `permit_roadmaps`, `roadmap_permits`, `roadmap_documents`, `roadmap_agencies` (see §3–§5).

---

## 2. Address-resolution workflow

```text
Intake form
  -> validate structured address (street + city + state + ZIP required; suite + parcel optional)
  -> POST resolveAddress
       1. Google Geocoding -> lat/lng, formatted address, place components
       2. Reverse geocode + admin boundary lookup:
            a. County (always)
            b. Municipality (only if lat/lng falls inside an incorporated city boundary)
            c. Incorporated vs unincorporated flag
       3. Parcel lookup (best effort) by county open-data / state GIS via Firecrawl
       4. Build authority candidate set from authorityRegistry keyed by:
            - incorporated municipality (if inside city limits) OR county (if unincorporated)
            - overlay authorities (state fire marshal, county health, state DOT for state roads, etc.)
       5. Return JurisdictionCandidate with confidence per authority
  -> JurisdictionConfirmCard renders candidates
  -> User action:
       Confirm      -> writes jurisdiction_confirmations row (source=user_confirmed)
       Correct      -> re-runs resolveAddress with edited fields
       Reassign     -> overrideAuthority(role, authority_id | free_text)
       Human review -> requestHumanVerification -> status=pending_review
  -> generateRoadmapFromRules is only allowed to emit verification="verified"
     for items whose agency_id belongs to a confirmed authority; everything
     else is "ai_assisted" or "needs_confirmation" per §7.
```

Rules:
- A ZIP code alone never resolves a jurisdiction. If geocoding returns only a ZIP centroid, resolution fails with `low_confidence_address`.
- Mailing city != permitting city when the parcel is unincorporated. The incorporated flag drives whether the city or the county is the primary building authority.
- If Google returns multiple candidates, the form asks the user to pick before proceeding.

---

## 3. Jurisdiction data model

`public.jurisdictions`
- id (uuid pk)
- state (text)
- county (text)
- municipality (text, nullable when unincorporated)
- incorporated (bool)
- fips_county (text, nullable)
- fips_place (text, nullable)
- centroid_lat / centroid_lng (numeric, nullable)
- created_at / updated_at

`public.jurisdiction_confirmations`
- id (uuid pk)
- project_id (uuid fk projects)
- jurisdiction_id (uuid fk jurisdictions)
- formatted_address (text)
- parcel_number (text, nullable)
- lat / lng (numeric)
- incorporated (bool)
- status ('unconfirmed' | 'user_confirmed' | 'pending_review' | 'human_verified')
- confirmed_by (uuid, nullable)
- confirmed_at (timestamptz, nullable)
- notes (text)
- created_at / updated_at

RLS: owner + admin. GRANTs to authenticated + service_role per platform rules.

---

## 4. Agency / authority data model

`public.authorities`
- id (uuid pk)
- jurisdiction_id (uuid fk)
- role ('building' | 'planning_zoning' | 'fire' | 'health' | 'public_works' | 'site_development' | 'environmental' | 'transportation_row' | 'utility_water' | 'utility_sewer' | 'utility_electric' | 'utility_gas' | 'stormwater' | 'historic' | 'floodplain' | 'other')
- official_name (text, **required — no ZIP-based placeholders**)
- department (text, nullable)
- responsibility (text)
- website (text, nullable)
- portal_url (text, nullable)
- phone (text, nullable)
- source_id (uuid fk official_sources, nullable)
- verification ('verified' | 'ai_assisted' | 'needs_confirmation')
- last_verified_at (timestamptz, nullable)
- created_at / updated_at

Uniqueness: (`jurisdiction_id`, `role`, `official_name`).

Existing `portalRegistry.ts` and `healthAgencyRegistry.ts` seed `authorities` on first jurisdiction touch; the app never emits agency names that were not seeded or explicitly entered by a user / admin.

`authorityRegistry.ts` is the code-side lookup used to seed the DB per resolved jurisdiction. Anne Arundel County, City of Annapolis, Baltimore County, etc. get exact records — never "MD 21401 — Building Department".

---

## 5. Official-source model + code adoptions

`public.official_sources`
- id (uuid pk)
- url (text)
- title (text)
- publisher (text)         -- e.g. "Anne Arundel County, MD"
- kind ('agency_site' | 'portal' | 'code' | 'ordinance' | 'amendment' | 'fee_schedule' | 'other')
- quote (text, nullable)
- fetched_at (timestamptz)
- (unique on url)

`public.code_adoptions`
- id (uuid pk)
- jurisdiction_id (uuid fk)
- discipline ('building' | 'residential' | 'fire' | 'accessibility' | 'energy' | 'plumbing' | 'mechanical' | 'electrical' | 'health')
- code_family (text)       -- IBC, IRC, IFC, NFPA 13, ICC A117.1, IECC, ASHRAE 90.1, NEC, etc.
- edition (text)           -- "2018", "2021"
- local_amendments_url (text, nullable)
- effective_date (date, nullable)
- source_id (uuid fk official_sources)
- verification ('verified' | 'ai_assisted' | 'needs_confirmation')
- last_verified_at (timestamptz, nullable)

`roadmap_permits` gains: `authority_id`, `trigger_condition` (text), `timeline_basis` ('published' | 'permivio_history' | 'ai_estimate' | 'unknown'), `code_adoption_ids` (uuid[]).
`roadmap_documents` gains: `required_by_authority_id`, `required_by_permit_id`.
`roadmap_agencies` gains: `authority_id` (nullable during migration).

All new columns nullable; migration keeps existing rows readable.

RLS + GRANTs: read-only for `authenticated` on `authorities`, `official_sources`, `code_adoptions` (they are shared reference data); write only via service_role / admin-role RPCs. `jurisdictions` and `jurisdiction_confirmations` are project-scoped.

---

## 6. Conditional-question logic

`permitRules.ts` gains a per-permit `trigger` descriptor:

```ts
{ id: 'fire_alarm', trigger: {
    question: 'Does the scope modify, extend, replace, reprogram or change coverage of the fire alarm system?',
    fields: ['trades.fire_alarm_scope'],
    codes_hint: 'NFPA 72',
  } }
```

When the scope answers are ambiguous:
- Permit is not emitted as "Required".
- A follow-up question is inserted into `roadmap_followups` referencing the exact trigger.
- The permit card renders "Pending — waiting for scope confirmation" instead of a generic "Conditional" label.

Triggers implemented for: fire alarm, fire sprinkler, health plan review, sign permit, site-development, grease interceptor, hood/ANSUL, backflow, ROW / curb cut, tree removal, floodplain development, historic COA.

---

## 7. Verification-state logic

Enforced in `roadmap.functions.ts` and `roadmapEnrich.functions.ts`:

| Condition                                                                                             | verification            |
| ----------------------------------------------------------------------------------------------------- | ----------------------- |
| Authority resolved AND item backed by an `official_sources` row AND jurisdiction confirmed by user or human | verified                |
| Authority resolved, jurisdiction confirmed, no official source yet                                    | ai_assisted             |
| Authority not resolved OR jurisdiction not confirmed OR trigger unresolved                            | needs_confirmation      |

Explicit rule: **an item may not be `ai_assisted` if its agency has not been identified.** It must be `needs_confirmation`. Code path adds an assertion + Zod refinement so this can't regress.

Roadmap header states:
- "Draft — jurisdiction not confirmed" when no confirmation row exists.
- "Confirmed by user" or "Human-verified" once set; only then may individual items be labeled `verified`.

---

## 8. Migration plan for existing generic results

Backfill migration (non-destructive):
1. Add new tables + columns; keep existing columns.
2. For every existing `permit_roadmaps` row: set `roadmap.status = 'needs_rescope'` if no `jurisdiction_confirmations` row exists.
3. For every existing `roadmap_agencies.name` matching `/^[A-Z]{2}\s?\d{5}/` (ZIP-style) OR containing "— Building Department" / "Local " prefix without a jurisdiction:
   - Set `verification = 'needs_confirmation'`.
   - Blank out `name` to `Exact authority needs confirmation` for display, keep original in `raw_name` for audit.
4. For every existing `roadmap_permits`: downgrade `verification` to `needs_confirmation` unless it already had an official source AND a resolvable authority.
5. UI: `RoadmapView` shows a one-time banner on legacy projects: "Jurisdiction was inferred from a ZIP code. Confirm your jurisdiction to generate verified requirements." Clicking opens the new intake fields in `ScopeTab` prefilled from the old free-text location where possible.
6. No data deleted. Users can re-run `Generate` / `AI enrich` after confirmation.

Rollout order:
1. DB migration (tables, columns, GRANTs, RLS, indexes).
2. Server: `geocode.server.ts`, `jurisdiction.functions.ts`, `authorityRegistry.ts`, `adoptedCodes.ts`.
3. UI: `ScopeTab` structured-address fields; `JurisdictionConfirmCard`; `AgencyBadge`.
4. `RoadmapView` per-permit fields (exact agency, trigger, source, verified date, timeline basis).
5. `permitRules.ts` trigger descriptors + `roadmap.functions.ts` verification gating.
6. `roadmapEnrich.functions.ts` re-scoped to confirmed jurisdiction + adopted codes.
7. Backfill migration for legacy roadmaps.

Approve to proceed with step 1 (schema + GRANTs + RLS).
