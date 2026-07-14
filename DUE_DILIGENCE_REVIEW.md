# Permivio — Due-Diligence Readiness Review

Date: 2026-07-13
Question asked: what does Permivio need to become a robust permit-strategy tool that real estate developers can use for **pre-acquisition due diligence** — specifically, pulling accurate data from the *correct* jurisdiction/agencies, including Health Department requirements.

(Note: this was routed through `/ai-specialist/super/build-manager`, which is built for managing real physical construction projects — RFIs, drawings, field schedules. That doesn't fit a software product-feature review, so this was done as a direct code + product review instead.)

## What already exists (stronger foundation than it looks)

- **`src/lib/portalRegistry.ts`** — ~100 hand-curated permit-portal entries across the major civic platforms (Accela, EnerGov, ProjectDox, Momentum, OpenGov, CitizenServe, MyGovernmentOnline, Cityworks), plus a generic Accela/EnerGov URL-guessing fallback for jurisdictions not in the list, plus a DB-backed override table (`portal_mappings`) so entries can be corrected without a code deploy.
- **`buildJurisdictionProfile`** (`jurisdictionProfiles.functions.ts`) — on-demand AI+Firecrawl research: searches `.gov`/permit-platform sources, scrapes them, and asks an LLM to extract a structured profile (permits, fees, timelines, contacts) with an explicit "never fabricate specific numbers" instruction and mandatory `source_urls`.
- **`generatePermitAnalysis`** (the "Permit Intake" flow) is already the closest thing to a due-diligence report generator: it takes a full project intake (address, city/county/state, property type, scope, existing/proposed use, dates, parties) and returns a structured JSON roadmap — permits, agencies, sequence, inspections, **risks**, next actions, and sources, with an explicit `verification_status` per fact (`likely_required` / `confirmed_by_source` / `verification_needed` / etc.). This is a genuinely good shape for a due-diligence deliverable; it just isn't currently framed or marketed as one.
- **The data model anticipates human verification** — `jurisdiction_profiles` has `verification_status`, `confidence`, `last_verified_date`, and each `sources[]` entry has a `verified_by` field, and the Jurisdiction Library UI (`jurisdictions.$slug.tsx`) already renders all of this with status badges.
- **811 utility-locate coordination** (`permitLookup.functions.ts`) — a full state-by-state one-call registry, which is a real due-diligence input (utility availability/conflicts).

## The gaps, in priority order

### 1. No authoritative jurisdiction/parcel resolution (highest risk for due diligence)

Every lookup in the app starts from a **free-text jurisdiction string** the user types or an LLM infers from an address — there is no GIS/parcel data source that authoritatively answers "which agencies actually have jurisdiction over this specific parcel?" That question is harder than it looks and is exactly where due-diligence mistakes happen:

- City vs. unincorporated county (same address string, completely different building department).
- Overlapping special districts — separate fire districts, MUDs/utility districts, floodplain or coastal management authorities, historic overlay districts — that don't show up from a city/county name alone.
- Annexation edge cases (an address that looks like it's in City X but is actually still under County jurisdiction, or vice versa).

Right now the AI is trusted to guess the jurisdiction from context, with only a regex-based `parseJurisdiction` (`portalRegistry.ts`) doing state-code normalization — there's no parcel boundary lookup. For an active permit-tracking tool this is a tolerable soft spot (a human PM already knows their jurisdiction). For **pre-acquisition due diligence on a parcel a developer has never dealt with before**, this is the single biggest accuracy risk in the whole product — it's the one input everything else (fees, timelines, required permits, health requirements) gets grounded against.

**Recommendation:** integrate a parcel/GIS lookup (e.g. Regrid, ATTOM, or direct county assessor/GIS APIs where available) so an address resolves to an authoritative jurisdiction + overlay districts + zoning designation, and use *that* as the anchor for every downstream lookup instead of a free-text guess.

### 2. Health Department / environmental health: no dedicated data layer at all

You called this out specifically, and the code confirms it's a real gap, not just an impression:

- `portalRegistry.ts` is exclusively building-permit portals (Accela/EnerGov/etc.) — zero health-department or environmental-agency entries.
- `buildJurisdictionProfile`'s search query is literally `"building department permits fees timeline"` — it never searches for health department sources.
- `seedDemoJurisdictions`'s hardcoded `departments[]` for all 5 demo jurisdictions lists Building, Planning/Zoning, Fire, and Certificate of Occupancy — **no Health Department entry, in any of them.**
- "Health" exists only as a generic checklist *category label* (alongside Building, MEP, Fire, Sign, etc.) in the AI checklist-generation prompts — there's no agency contact, portal, or research flow behind it the way there is for building permits.

For a real estate developer doing due diligence, Health Department requirements are frequently **gating**, not incidental — septic/OSSF suitability and percolation-test results can determine whether raw land is buildable at all before a single building permit matters; well-permitting rules affect water-supply feasibility; food-service plan review affects retail/restaurant tenanting; state environmental agencies (wetlands, NPDES/stormwater) can add months. None of that is modeled today.

**Recommendation:** build a parallel agency-data layer for health/environmental authorities — mirroring the `portalRegistry.ts` pattern but for county health departments and state environmental agencies (septic/OSSF, well permitting, food service, on-site sewage, wetlands/NPDES) — and extend `buildJurisdictionProfile` and `generatePermitAnalysis` to search and ground against it explicitly, the same way they already do for building departments.

### 3. Verification workflow exists in the schema but nothing populates it

The UI is fully built to show `verified` / `recently_verified` / `unverified` / `review_recommended` status badges and a `verified_by` attribution on sources. But scanning the codebase, nothing ever *sets* a profile or source to `verified` except the AI's own free-text guess at extraction time (or the hardcoded `"demo"` status on seed data) — there's no admin/human review queue or "mark verified" action anywhere in the routes I found. For data that will inform a real acquisition or investment decision, showing a "Verified" badge that no human ever actually verified is worse than showing "Unverified" honestly — it's a liability, not a feature, until the workflow behind it is real.

**Recommendation:** either wire up an actual verification workflow (a reviewer role that can confirm/reject specific facts, feeding `verified_by` + `last_verified_date` for real), or — faster — relabel the AI-only path so it never displays as "Verified"/"Recently verified" without a human action behind it.

### 4. The data model assumes a committed project, not a candidate-site comparison

`projects` (current_stage, permits_issued/permit_count, one project = one address) models a project *already underway*. Due diligence usually means screening **multiple candidate parcels side by side** before committing capital to any of them — there's currently no portfolio/comparison view; each site would need its own full "project" created just to get a read on it, and there's no way to compare 3–10 candidate sites' risk/timeline/permit-burden at a glance.

**Recommendation:** add a lighter-weight "Site Screen" object (reuses the existing `generatePermitAnalysis` intake shape, since that's already close) that doesn't require creating a full tracked project, plus a comparison view across saved site screens.

## Suggested build order

1. **Health/environmental agency data layer** (gap #2) — most directly requested, and additive: doesn't touch existing building-permit logic, just extends the pattern that already exists.
2. **Verification workflow** (gap #3) — mostly UI + one new table/role; de-risks everything else you show a developer.
3. **Parcel/GIS jurisdiction resolution** (gap #1) — highest value but depends on picking and budgeting for a third-party data provider (Regrid/ATTOM/county APIs vary by cost and coverage), so it's the one that needs a product decision before engineering starts.
4. **Site-screen / comparison mode** (gap #4) — biggest UX change, best done once 1–3 give it something trustworthy to compare.

None of this is implemented yet — this is the assessment. Let me know which of these you want scoped into an actual build plan.
