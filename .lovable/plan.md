# Simplified Intake + Due Diligence Report

Goal: a first-time user can enter an address, pick a plain-language project type, describe the work, and get a full Due Diligence report and Permit Roadmap — without knowing occupancy classes, construction types, agencies, or code sections. The existing dark theme, navigation, cards, and tabs stay exactly as they are.

## 1. Screen flow (new intake wizard)

Replaces only the intake surface. Existing project pages, tabs, roadmap UI, and pipeline are untouched.

```text
New Project  →  1. Address        (structured, geocoded)
             →  2. Jurisdiction   (confirm resolved AHJs)
             →  3. Project type   (plain-language cards)
             →  4. Scope          (freeform + upload)
             →  5. Smart follow-ups  (only relevant, plain English)
             →  6. Due Diligence report
             →  7. Generate Permit Roadmap
```

Each step saves a draft. The user can leave and resume — status shown as "Draft", "Answer a few questions", "Ready for analysis", "Report ready", "Roadmap created".

## 2. Fields removed from initial intake (moved to follow-ups or AI extraction)

Removed from the first screens (kept in the data model, filled later):

- IBC occupancy classification
- Construction type (I-A … V-B)
- Gross vs. affected square footage
- Dwelling unit count
- Construction value
- Target open/start dates (moved to a short "Timeline" follow-up)
- The current trade matrix (electrical/mechanical/plumbing/fire alarm/sprinkler/food service/signage/site/utility/ROW) — asked as plain-language yes/no/unsure follow-ups instead
- "Occupancy existing → proposed" — asked as "Is the way the space will be used changing?"

## 3. Follow-up question logic (plain language, conditional)

A small rule table decides which questions to ask, driven by `project_type` + scope keywords. Only ask what's relevant.

- Restaurant / kitchen keywords → food service, hood, grease, seating
- Any tenant improvement / remodel → walls added/removed, MEP changes
- New construction / addition → site work, utilities, structural
- Any commercial → signage, existing CO
- Site work keywords ("grading", "paving", "drainage") → site + stormwater
- Change of use project type → "Is the way the space being used changing?" forced

Answer options everywhere: Yes / No / Unsure / Upload a document / Ask me later. "Unsure" shows a one-line explanation of why it matters and offers to extract from uploaded plans.

## 4. Jurisdiction resolution workflow

Already shipped as `JurisdictionConfirmCard`. In the new flow it becomes step 2, before project details, so agencies are known before follow-ups are chosen.

- Google geocode → county, municipality, incorporated status
- Curated authority map (extending the existing Anne Arundel + Annapolis entries) supplies exact agency names
- Confirmed → verifications may be AI-Assisted; unconfirmed → everything downgrades to "Needs Confirmation"
- Actions: Confirm, Correct, Request human verification

No behavior change from the last turn — just repositioned earlier in the flow.

## 5. Document upload + AI extraction

One drop zone accepts plans, permits, CO letters, reviewer comments, utility docs. Reuse existing `project-docs` bucket and `project_documents` table.

Extraction (Gemini, existing gateway): address, existing/proposed use, suggested occupancy + construction type, sq ft, occupant load, project team, code editions, drawing disciplines, permit numbers, utility info. Every extracted field surfaces on a "Confirm extracted info" card with per-field Confirm / Edit / Reject. Nothing extracted is treated as verified.

## 6. Due Diligence report structure

New tab on the project (or replacing the current Scope tab header) called **Due Diligence**. Rendered from a single `compliance_reports`-style record with these sections, each carrying Verified / AI-Assisted / Needs Confirmation labels:

1. Project Summary — address, type, plain-language scope, existing/proposed use, jurisdiction, target dates, missing info list
2. Jurisdiction & Agency Summary — exact building, zoning, fire, health, site-dev, utility authorities + official sources
3. Required and Possible Approvals — grouped Likely required / Conditional / Needs confirmation / Not expected; each shows name, agency, trigger, source, last checked
4. Required Documents — grouped by permit; status Uploaded / Missing / Needs confirmation
5. Recommended Submission Sequence — ordered list with parallelization badges
6. Estimated Timeline — per-permit ranges with basis label (Officially published / PERMIVIO history / AI estimate / Unknown)
7. Risks & Possible Delays — plain-language, never presented as violations
8. Recommended Next Steps — short prioritized action list

Exports as PDF using the existing `pdf-lib` pipeline.

## 7. Permit Roadmap creation workflow

Unchanged mechanics — the existing rule engine + AI enrichment + "Sync to checklist" already produce permits, agencies, documents, tasks, risks, and follow-ups. From the Due Diligence report the user clicks **Create Permit Roadmap**, which calls the existing `generateRoadmapFromRules` + `enrichRoadmapWithAI` + `sendRoadmapToChecklist` chain and lands on the current Roadmap tab.

Certificate of Occupancy readiness, inspection checklist, and deadlines are already produced by the rule engine and existing inspections/deadlines tables.

## 8. Database changes

Small and additive — no destructive migrations.

- `scope_of_work`: add `plain_scope` (text), `friendly_project_type` (text, one of the plain-language options above), `intake_step` (int), `intake_status` (text: draft / questions / ready / analyzing / report_ready / roadmap_created / human_review). Existing columns stay.
- New table `intake_answers` (project_id, question_key, answer text, source enum: user / ai_extracted / uploaded, verified bool, created/updated). Lets the same follow-up store user answers and AI-extracted answers side-by-side for confirmation.
- New table `due_diligence_reports` (project_id, jurisdiction snapshot JSON, summary JSON, approvals JSON, documents JSON, sequence JSON, timeline JSON, risks JSON, next_steps JSON, generated_by_model, prompt_version, verification_summary JSON, created/updated).
- Extend authority curation in code, not in DB — add rows to `CURATED_AUTHORITIES` in `src/lib/jurisdiction.functions.ts` as jurisdictions come online.

All new tables get GRANTs, RLS enabled, and owner-scoped policies via `projects.user_id`.

## 9. Files to modify / add

Modify:

- `src/components/project/ScopeTab.tsx` — replace multi-step technical form with the new 4-step wizard (address → project type → scope → follow-ups). Keep the same card/tab shell.
- `src/lib/scope.functions.ts` — new save action for `plain_scope` + `friendly_project_type`; keep existing writes.
- `src/lib/permitRules.ts` — map `friendly_project_type` → internal `project_type` + trade defaults; keep the rule engine untouched otherwise.
- `src/lib/roadmap.functions.ts` — no logic change; already reads confirmed jurisdiction.
- `src/routes/_authenticated/projects.$id.tsx` — add "Due Diligence" tab between Scope and Roadmap (or as new sub-tab).
- `src/components/project/JurisdictionConfirmCard.tsx` — surface it inside the intake wizard as step 2 (no visual change).

Add:

- `src/components/project/IntakeWizard.tsx` — the guided flow shell.
- `src/components/project/intake/ProjectTypeStep.tsx` — plain-language cards.
- `src/components/project/intake/ScopeStep.tsx` — textarea + upload.
- `src/components/project/intake/FollowupsStep.tsx` — conditional Q&A with Yes/No/Unsure/Upload/Later.
- `src/components/project/intake/ExtractedInfoCard.tsx` — per-field confirm UI.
- `src/components/project/DueDiligenceReport.tsx` — read-only rendered report + PDF export + "Create Permit Roadmap" CTA.
- `src/lib/dueDiligence.functions.ts` — `generateDueDiligence`, `getDueDiligence`, `regenerate`. Uses the existing Gemini gateway, jurisdiction context, follow-up answers, and extracted document fields.
- `src/lib/intakeQuestions.ts` — pure rule table: `pickQuestions(projectType, scopeText, answers) → Question[]`.
- `src/lib/documentExtract.functions.ts` — server function that runs Gemini over an uploaded doc and returns extracted fields for confirmation.

## 10. First build phase vs. later

**Phase 1 (this approval):**

- IntakeWizard shell + step 1 address (reuses existing structured address on `JurisdictionConfirmCard`)
- ProjectTypeStep with the plain-language options
- ScopeStep with textarea + upload (upload uses existing `project-docs` bucket)
- FollowupsStep with the conditional rule table and Yes/No/Unsure/Upload/Later answers
- Data model additions (`plain_scope`, `friendly_project_type`, `intake_status`, `intake_answers` table)
- Mapping `friendly_project_type` → `permitRules` inputs
- User-facing status labels replacing the technical enums in the intake UI only

**Phase 2 (next approval):**

- Due Diligence report generation and route
- Document AI extraction with per-field confirmation
- "Create Permit Roadmap" CTA from the report
- PDF export of Due Diligence

**Phase 3 (later):**

- Expanded curated authority map beyond current MD entries
- Human verification queue UI
- Officially-published timeline table populated per jurisdiction

## Technical details

- No visual redesign. New components reuse existing `Card`, `Button`, `Input`, `Badge`, tab shell, spacing, and mono-uppercase section headers.
- Status label mapping lives in one helper (`src/lib/statusLabels.ts`) so raw enums never leak into UI copy. Existing DB values stay for compatibility.
- Follow-up rules are pure functions (no I/O) — same shape as `permitRules.ts` — so they're safe to import from client components.
- Verification labeling: unchanged three-tier system (Verified / AI-Assisted / Needs Confirmation) already enforced by the rule engine after last turn's correction.
- No changes to `_authenticated` gating, storage RLS, or the existing roadmap generation contract.

Approve to start Phase 1.
