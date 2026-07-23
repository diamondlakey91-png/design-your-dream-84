# One Shared Project Type System

Turn Project Type into a real platform-wide field: one library, one selector, stable IDs, and consistent behavior everywhere. No visual redesign — reuses existing Permivio components, dark theme, blue accents, cards, and typography.

## Where Project Type lives today (inspection results)

Hardcoded / freeform in these screens and helpers — will be replaced:

- `src/lib/projectTypeMap.ts` — informal 16-item catalog (kept and promoted to source of truth, expanded with aliases + metadata).
- `src/routes/_authenticated/dashboard.tsx` — Quick-create modal: hardcoded `<select>` seeded with "Tenant Fit-Out".
- `src/routes/_authenticated/projects.$id.tsx` — Edit form: freeform `<Input>` (80 chars).
- `src/routes/_authenticated/report.tsx` — Compliance report intake: freeform text field.
- `src/routes/_authenticated/jurisdictions.tsx` — Jurisdiction request form: freeform text.
- `src/components/project/IntakeWizard.tsx` — Uses the friendly enum but as a bespoke chip grid.
- `src/components/project/OverviewTab.tsx` — Displays raw `project.project_type` string.
- Server helpers referencing the string field: `projects.functions.ts`, `scope.functions.ts`, `compliance.functions.ts`, `chat.functions.ts`, `permitAnalysis.functions.ts`, `dueDiligence.functions.ts`, `roadmapEnrich.functions.ts`, `permitRules.ts`, `jurisdictionSync.functions.ts`, `jurisdictionProfiles.functions.ts`, `planReview.functions.ts`, `checklist.functions.ts`, `intake.functions.ts`, `intakeQuestions.ts`, `reportShares.functions.ts`, `mcp/tools/list-projects.ts`, `routes/api/chat.stream.ts`, `share.reports.$token.tsx`.

## Architecture

```text
project_type_categories  ─┐
project_types            ─┼──► ProjectTypeSelector (single | primary+additional | multi | readonly | ai-recommend)
project_type_aliases     ─┘         │
                                    ├─► IntakeWizard, ProjectEdit, QuickCreate, Report intake,
project_type_id (stable) ───────────┤   Jurisdictions request, Filters, AI Assistant,
+ additional_project_type_ids       │   Due Diligence, Roadmap rules, Compliance reports
+ custom description / source /     │
  confidence / confirmed_at         └─► Read-only card display
```

- **One catalog:** `public.project_types` (+ categories, aliases). Seeded from the current `FRIENDLY_PROJECT_TYPES` plus new entries the request implies (restaurant remodel, ADU, storefront modification, EV charger, pool enclosure, hood suppression, sprinkler modification, MEP-only, sign, change-of-use, etc.).
- **One component:** `src/components/project-type/ProjectTypeSelector.tsx` with `mode` prop (`single | primary_additional | multi | readonly | ai_recommend`), searchable, categorized, keyboard/screen-reader accessible, mobile-friendly, alias-aware.
- **One data hook:** `useProjectTypes()` — TanStack Query against a public read-only server fn `listProjectTypes()`.
- **Stable IDs everywhere** — new columns store IDs, old text field kept for backfill visibility only.

## Database (single migration)

1. `project_type_categories` — id, name, description, icon, display_order, active.
2. `project_types` — id, category_id, client_label, internal_name, short_description, residential_or_commercial, common_scope_triggers[], follow_up_question_ids[], possible_permit_categories[], possible_agency_categories[], possible_document_categories[], display_order, active, timestamps.
3. `project_type_aliases` — id, project_type_id, alias, keyword_only bool.
4. `projects` gets: `primary_project_type_id`, `additional_project_type_ids uuid[]`, `custom_project_type_description text`, `project_type_source text`, `project_type_confidence numeric`, `project_type_confirmed_at`, `project_type_confirmed_by uuid`. Existing `project_type text` **stays** (backfill display, no data loss).
5. Same fields optional on `scope_of_work` (`primary_project_type_id`, `additional_project_type_ids`) — keeps `friendly_project_type` for backward compat, but the ID becomes canonical.
6. RLS: catalog tables read-only to `authenticated` + `anon`; admin write via `has_role(auth.uid(),'admin')`. Project-level fields keep existing row-owner policies.
7. GRANTs per Cloud rules.
8. Seed the catalog with ~30 project types across categories: Commercial TI, New Construction, Residential Alteration, Change of Use, Site & Exterior, Signage, Specialty (ADU, EV charger, pool, hood, sprinkler).
9. Seed aliases: TI, build-out, fit-out, ground-up, restaurant remodel, ADU, mother-in-law suite, MEP, storefront, Ansul, hood, sprinklers, pool cage, charger, etc.

## Legacy backfill

Server function `backfillProjectTypes` (admin-only) that:

- Reads each `projects.project_type` text value.
- Maps via alias table + fuzzy match to a `project_type_id` with a confidence score.
- Confidence ≥ 0.8 → sets `primary_project_type_id`, `project_type_source='imported'`, `project_type_confidence`.
- Below threshold → leaves ID null, keeps original text, marks needs confirmation.
- Never deletes or overwrites the original `project_type` text.

UI shows "Project type needs confirmation" chip on any project with a legacy string but no ID.

## Shared component API

```ts
<ProjectTypeSelector
  mode="single" | "primary_additional" | "multi" | "readonly" | "ai_recommend"
  value={{ primaryId, additionalIds, customDescription }}
  onChange={next => ...}
  showRecentlyUsed
  allowNotSure
  allowOther
  label="What are you planning to do?"
  helperText="Choose the option that best describes your project…"
  aiSuggestions={[{ id, confidence, reason }]}
/>
```

- Searchable combobox with category headers, alias hits highlighted.
- Recently used (localStorage per user).
- "I'm not sure" surfaces AI recommendation flow; "Other" enables custom description field.
- Readonly mode renders primary chip + compact additional list, same look as existing project cards.
- AI-recommend mode shows suggestions with Accept / Dismiss per item.

## Rollout to screens

| Screen | Mode |
|---|---|
| Dashboard quick create | single |
| Projects edit page | primary_additional |
| IntakeWizard step 3 | primary_additional (AI hints after scope text) |
| Overview / Project card | readonly |
| Due Diligence intake | primary (readonly if already set) |
| Roadmap generation | reads IDs, no UI |
| Compliance Report intake (`/report`) | single |
| Jurisdictions request form | single |
| Permit Lookup / filters | multi |
| Dashboard filters | multi |
| Reporting filters | multi |
| AI Assistant / chat | readonly context (no reselect) |
| Document analysis confirm | ai_recommend |

## AI + rule engine wiring

- `permitRules.ts` and enrichment functions accept `primary_project_type_id + additional_project_type_ids` and use `internal_name` + `residential_or_commercial` from the catalog row.
- Follow-up question resolver reads `follow_up_question_ids` from the selected types.
- AI assistant + document analysis produce `{ id, confidence, reason }[]` for `ai_recommend` mode; user must confirm before writing to project.
- Recalc warning shown before overwriting a saved primary type: "Changing the project type may update the recommended permits, documents, questions, and timeline."

## Files (new / changed)

**New**
- `src/lib/projectTypes.functions.ts` — `listProjectTypes`, `listCategories`, `resolveAlias`, `setProjectType`, `confirmAiRecommendation`, `backfillProjectTypes` (admin).
- `src/components/project-type/ProjectTypeSelector.tsx`
- `src/components/project-type/ProjectTypeBadge.tsx` (readonly chip reused in cards)
- `src/hooks/useProjectTypes.ts`
- Migration: catalog tables, project columns, seed data.

**Edited (replace hardcoded lists / freeform inputs)**
- Dashboard quick create, Projects edit page, Report intake, Jurisdictions request form, IntakeWizard, OverviewTab, ScopeTab, DueDiligenceReport, RoadmapView, filters.
- Rule + AI helpers to consume IDs instead of freeform strings (kept string fallback for pre-backfill records).

## Validation checklist (post-implementation)

- One catalog file/table, zero hardcoded `<select>` lists.
- Existing projects still load; those with unmapped legacy strings show the confirmation banner.
- New projects save stable IDs on primary + additional fields.
- Aliases route correctly (TI → Tenant improvement, ADU → Accessory dwelling unit, etc.).
- Multi-select filters return combined results.
- AI recommendations require explicit confirm.
- No visual redesign — all changes reuse existing tokens/components.

## Out of scope (explicit)

- No admin CRUD screen for the catalog in this pass; admin edits go through migrations for now (spec says "create a manageable structure" — the tables + admin RLS satisfy that; UI can come later).
- No changes to authentication, layout, navigation, branding, or color tokens.
