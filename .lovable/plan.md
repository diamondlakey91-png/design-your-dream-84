# Permivio Permit Assistant — Structured Rebuild

Ship a dedicated, structured Permit Assistant experience layered on top of the existing chat/thread infrastructure. Chat streaming stays as-is; this adds the structured "analysis" mode you specified.

## What gets built

**1. New database table: `permit_analyses`**
- Stores generated roadmaps as JSON (`analysis` jsonb) plus intake snapshot (`intake` jsonb).
- Linked to `project_id` (optional) and `user_id`.
- RLS: owner-only. Standard GRANTs.

**2. Server function: `generatePermitAnalysis`** (`src/lib/permits.functions.ts`)
- Input: intake object (project name, address, city/county/state/zip, use, scope, sqft, value, dates, optional parties).
- Uses `google/gemini-2.5-pro` with jurisdiction context (existing `loadJurisdictionContextBlock`) and a strict JSON prompt returning:
  - `summary`, `permits[]`, `documents[]`, `agencies[]`, `sequence[]`, `inspections[]`, `risks[]`, `next_actions[]`, `sources[]`, `assumptions[]`, `missing_info[]`.
- Every item carries `verification_status` (`likely | possible | confirmed | verification_needed | insufficient_info`) and priority where applicable.
- Robust JSON extraction with truncation fallback.
- Saves result to `permit_analyses`, returns the record.

**3. New route: `/assistant/analysis`** (`src/routes/_authenticated/assistant.analysis.tsx`)
Two-pane responsive layout:
- **Left / top (mobile):** Intake form (all required + optional fields, editable), suggested-questions chips, "Load sample project" button (Arlington VA restaurant TI), "Generate analysis" CTA.
- **Right / below:** Rendered structured analysis with card sections:
  - Project Summary card
  - Likely Required Permits (color-coded status chips)
  - Required Documents checklist (checkbox toggles)
  - Agencies & Departments
  - Approval Sequence (vertical stepper)
  - Inspections
  - Risks & Missing Info (amber/red)
  - Recommended Next Actions
  - Sources & Verification (with "not verified" fallback text)
  - Disclaimer footer (verbatim text you provided)
- Action buttons: Save to project, Convert to checklist (writes to `permit_items`), Assign next actions (creates `deadlines`), Draft jurisdiction email (uses existing copilot), Export PDF (reuses `generateBatchReportPdf` pattern), Start new, Edit intake.

**4. Assistant landing update** (`src/routes/_authenticated/assistant.tsx`)
- Add a prominent "Start structured permit analysis" card that opens `/assistant/analysis`.
- Keep existing threaded chat below.

**5. Design polish**
- Reuse existing Permivio tokens (near-black, deep navy, electric blue/violet). Add glass panel utility class if missing.
- Status color legend: emerald (confirmed), amber (verification needed), red (risk/missing).

## Explicit non-goals (per your MVP scope)
- No new billing, portal integrations, or automated submission.
- No changes to streaming chat endpoint.
- Uses existing Firecrawl/jurisdiction sync for source verification only when a matching profile exists — otherwise shows the "not yet verified" fallback rather than inventing sources.

## Technical notes
- `analysis` JSON kept schema-lite (Output prompt only, parsed with `extractJsonFromResponse`) to avoid Gemini strict-schema failures on nested arrays.
- Checklist conversion maps `permits[]` → `permit_items` rows with `verification_status` in `notes`.
- Next-actions assignment maps `next_actions[]` with `suggested_due_date` → `deadlines`.
- Sources rendered only when `sources[]` non-empty; otherwise the fallback message.
- Sample-project button pre-fills intake with the Arlington restaurant TI you specified and runs the generator, tagging every result as `verification_needed`.
