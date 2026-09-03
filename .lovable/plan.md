# Plan QA/QC + Site Investigation (additive)

Two new professional modules added on top of the existing PERMIVIO project workspace. No redesign: same dark navy theme, same tab bar, same card/typography patterns, same navigation.

## What exists today (reused, not rebuilt)

- **Project workspace tabs** in `projects.$id.tsx` (overview, scope, checklist, docs, qa/qc, response matrix, deadlines, inspections, timeline) — new modules become two more tabs in that same bar.
- **Plan review engine** (`planReview.functions.ts`): per-sheet AI review, findings with severity + evidence quotes, redlined PDF, batch consolidated report, fix-list → checklist.
- **QA/QC gate** (`qaqc.functions.ts` + `QaQcTab.tsx`, table `qa_signoffs`): readiness rollup and sign-off before submission.
- **Documents** (`project_documents`, `documents.functions.ts`, `DocsTab`) plus storage bucket and AI document classification.
- **Jurisdiction stack**: `jurisdiction.functions.ts` (exact AHJ resolution + confirmation), `jurisdictions`, `authorities`, `code_adoptions`, `official_sources`, `jurisdiction_profiles`, `portalRegistry`, `mdVaAuthorities`.
- **Research + AI plumbing**: Firecrawl helpers (`firecrawl.shared.ts`), Lovable AI gateway (`ai.shared.ts`), verification labels (`verification.ts`), project-type library (`projectTypes.functions.ts`, `ProjectTypeSelector`).
- **Reports**: `compliance_reports`, due-diligence report, `pdf-lib` PDF generation, `report_shares` for client links.
- **Roadmap / timeline / correction matrix**: `permit_roadmaps`, `roadmap_*`, `deadlines`, `comment_responses` — the integration targets for findings.

## New database tables

**Module 1 — Plan QA/QC**
- `qaqc_reviews` — one review run per project (+ optional revision label), jurisdiction snapshot, codes researched, readiness score/category, model + version, status.
- `qaqc_sheets` — drawing inventory: sheet number, title, discipline, revision, revision date, professional of record, seal status, source document, index-vs-upload state (present / missing / not indexed / duplicate / superseded).
- `qaqc_findings` — finding number, severity (critical/high/medium/low/informational), category, discipline, sheet ref, location, summary, plain-language explanation, why it matters, code/coordination basis, jurisdiction source URL, recommended action, responsible discipline, verification status, resolved flag.
- `qaqc_revision_diffs` — sheet-level added/removed/revised/changed-scope comparison between two reviews.
- `professional_reviews` — shared human-review queue for both modules: target type + id, requested by, reviewer, status (requested / in_review / reviewed / changes_requested), notes, reviewed_at.

**Module 2 — Site Investigation**
- `site_investigations` — project link, address snapshot, project type, free-form notes, jurisdiction snapshot, feasibility rating (green/yellow/orange/red/gray), status, report JSON (all 25 sections), model/version.
- `site_investigation_findings` — category (zoning, utilities, environmental, transportation, parking, signage, health, fire, permits, risks, questions), classification (likely permitted / conditional / potentially not permitted / needs confirmation), detail, source URL, verification status.
- `site_investigation_permits` — likely approval, agency, why required, trigger, sequence order, timeline estimate, source, verification status.

All tables: `GRANT` to `authenticated` + `service_role`, RLS scoped to the owning project's user (plus admin role via `has_role`), and activity logging like existing modules.

**Config, not hardcoded:** `src/lib/qaqcConfig.ts` (categories 1–12, discipline list, severity definitions, readiness bands) and `src/lib/siteInvestigationConfig.ts` (research categories, feasibility ratings, the 25 report sections). Both modules read labels/ordering from these files, and admin screens list them read-only.

## Module 1 workflow

1. **Ingest** — user selects uploaded plan documents (existing `project_documents`; no re-upload, no re-entry of address/jurisdiction/type/scope).
2. **Inventory** — AI pass per document extracts sheets, titles, disciplines, revisions, seal visibility; compare index vs uploaded sheets; write `qaqc_sheets` with missing/duplicate/superseded flags.
3. **Jurisdiction research** — reuse AHJ resolution + `code_adoptions`/`official_sources`, with Firecrawl top-up for adopted editions, amendments, submission and seal standards. Every code row shows source, edition, effective date, last verified, verification status. Nothing invented: unknown → "Needs agency confirmation".
4. **Category analysis** — one AI pass per category group (project info, cover/code analysis, life safety, accessibility, architectural, structural, mech, elec, plumbing, fire protection, civil/site, cross-discipline), each grounded in the jurisdiction snapshot and the sheet inventory. Findings written with the full required field set.
5. **Report** — "PERMIVIO Pre-Submission Plan QA/QC Report" view: executive summary, jurisdiction, codes, inventory, missing/duplicate sheets, critical/high lists, discipline sections, cross-discipline conflicts, missing documents, submission issues, items needing professional confirmation, recommended actions, permit-readiness score (Not Ready / Needs Corrections / Substantially Ready / Ready for Human Final Review — never "Code Compliant"). PDF export via `pdf-lib`.
6. **Revisions** — re-run against a new revision label, then a diff view (added / removed / revised sheets, changed scope, equipment, notes, code data).
7. **Reviewer comments** — reuse the existing Response Matrix (`comment_responses`) for the correction matrix; QA/QC links to it rather than duplicating it.

## Module 2 workflow

1. **Simple intake** — address (prefilled from project), "What are you considering doing at this property?" via the shared project-type library, free-form notes, optional document picks.
2. **Research** — geocode + exact AHJ resolution, then Firecrawl-backed research over official sources for property, zoning, environmental/flood, utilities, transportation, parking, signage, health, fire.
3. **Analysis** — zoning classification per proposed use, development feasibility, permit feasibility list (approval, agency, why, trigger, sequence, timeline, source, verification), utility feasibility (capacity always "requires provider confirmation" unless sourced), timeline with concurrency and critical path, overall rating green/yellow/orange/red/gray.
4. **Report** — all 25 sections in the existing report card style, plus "Generate Client Report": client name, project name, address, prepared date, report number, PERMIVIO branding, sources, disclaimer, PDF export, and a client presentation mode that hides model/debug metadata.

## Project integration

- QA/QC missing discipline/document → checklist + roadmap document item marked missing.
- Site Investigation conditional-use/entitlement → timeline/deadline entitlement dependency.
- Utility extension risk → utility coordination action item.
- Both write to `activity` so the project timeline reflects runs and sign-offs.

## Professional limitation language

Every report header and PDF footer carries: "PERMIVIO provides pre-submission quality control and permitting intelligence. Findings should be reviewed by the appropriate licensed design professional and authority having jurisdiction where required." Banned strings ("Plans Approved", "Code Certified", "Engineering Approved", "Guaranteed Feasible", "Code Compliant") are excluded from prompts and asserted against in unit tests. "Professionally Reviewed" renders only when a `professional_reviews` row for that report reaches `reviewed`.

## Phasing

- **Phase 1 (MVP, this build):** migrations + config modules; Plan QA/QC tab with inventory, jurisdiction/code panel, category findings, readiness score, report view + PDF; Site Investigation tab with intake, research/analysis, 25-section report + client PDF; "Request Professional Review" on both; admin review queue at `/admin/reviews`.
- **Phase 2:** revision-vs-revision diff UI, deeper cross-discipline pairing, roadmap/utility auto-actions expansion.
- **Phase 3:** per-jurisdiction submission-standard library growth, reviewer scoring of AI findings, saved report templates.

## Technical notes

- New server functions: `src/lib/qaqcReview.functions.ts`, `src/lib/qaqcInventory.functions.ts`, `src/lib/siteInvestigation.functions.ts`, `src/lib/professionalReview.functions.ts` — all `createServerFn` with `requireSupabaseAuth`, called from components via `useServerFn` (never from public loaders).
- New components under `src/components/project/`: `PlanQaQcTab.tsx`, `QaQcInventoryTable.tsx`, `QaQcFindingList.tsx`, `QaQcReportView.tsx`, `SiteInvestigationTab.tsx`, `SiteInvestigationReport.tsx`, `ProfessionalReviewButton.tsx` — built from existing card/badge/verification-label primitives.
- Two tabs added to the existing project tab array: `plan qa/qc` and `site investigation`. Existing `qa/qc` submission-gate tab stays as-is.
- AI via Lovable AI gateway (Gemini) with Zod-validated JSON and lenient normalization like `compliance.functions.ts`; PDFs via `pdf-lib` with WinAnsi sanitization.
