# Permivio — Architecture Review

Date: 2026-07-13
Scope: full `src/` tree, Supabase migrations, and build config as of the initial clone from `diamondlakey91-png/design-your-dream-84`.

## Stack

TanStack Start (React 19, file-based SSR routing) + Supabase (Postgres/Auth/Storage) + Stripe + Capacitor (iOS/Android wrapper). Built and synced through [Lovable.dev](https://lovable.dev) — the DB migrations (21 files, all dated 2026-07-13) and the auto-generated auth middleware confirm this was scaffolded and iterated almost entirely through AI prompts rather than hand-built incrementally.

## What's working well

- **Auth model is sound.** `src/integrations/supabase/auth-middleware.ts` forwards the caller's own JWT into a per-request Supabase client rather than using a service-role key, so Postgres Row-Level Security — not app code — is the real authorization boundary. All 17 tables have RLS enabled (verified against `supabase/migrations/*.sql`).
- **Entitlements are cleanly separated**: `src/lib/tiers.ts` is a client-safe pure data module; `src/lib/entitlements.ts` does the server-side enforcement. Good boundary between "what a plan includes" and "is this user allowed to do X right now."
- **The report-sharing feature** (`src/lib/reportShares.functions.ts`) is genuinely well done: 176-bit tokens, timing-safe password comparison, explicit expiry/revocation checks, and a deliberate RLS-bypass via `supabaseAdmin` that strips sensitive fields before returning. This is the standard the rest of the app should be held to.

## Core problem: two files are doing the job of the whole app

- **`src/lib/permits.functions.ts` is 4,640 lines and exports 68 separate server functions**, spanning projects, deadlines, chat/AI assistant, permit checklists, documents, jurisdiction sync (Firecrawl scraping), jurisdiction profiles, inspections, permit lookups, AI plan review, PDF generation, permit analysis, and daily briefings — roughly 10 unrelated feature domains in one file.
- **`src/routes/_authenticated/projects.$id.tsx` is 2,388 lines and defines 18 components inline** (`OverviewTab`, `PermitRoadmap`, `ChecklistTab`, `DocsTab`, `BatchReport`, `LiveJurisdictionSync`, `AiCopilotPanel`, etc.) — a full app's worth of UI in a single route file.
- Not isolated to these two files — `assistant.analysis.tsx` (697 lines), `assistant.$threadId.tsx` (674), `dashboard.tsx` (585), and `jurisdictions.$slug.tsx` (489) show the same pattern at smaller scale.
- Root cause: outside `src/components/ui/` (shadcn primitives), there are only **4** shared custom components in the entire app (`AppShell.tsx`, `WelcomeBanner.tsx`, `PaymentTestModeBanner.tsx`, `StripeEmbeddedCheckout.tsx`). There's effectively no feature-component layer — everything gets appended to whichever route file it's nearest to, which is exactly how AI-driven, prompt-by-prompt iteration grows a codebase without a refactor checkpoint.

## Other gaps

- **Zero test files** anywhere in the repo. Not unusual for an AI-generated MVP, but the AI checklist-generation and jurisdiction-sync logic (JSON parsing from LLM output, fee/timeline extraction) is exactly the kind of brittle-parsing code that benefits most from a few unit tests.
- **`BETA_MODE = true`** in `src/lib/tiers.ts:7` globally bypasses all paid-tier gating. Fine pre-launch, but it's a single boolean with no tracked flip date/owner — easy to forget before going live.

## Remediation plan (in progress)

1. **Split `permits.functions.ts` by domain** into separate server-function modules (projects, checklist, chat/assistant, documents, jurisdiction-sync, jurisdiction-profiles, inspections, permit-lookup, plan-review, analysis), with shared AI/Firecrawl helpers factored into a common module. Mechanical, low-risk — each `createServerFn` export is already self-contained. *Status: being executed now.*
2. **Extract the 18 components out of `projects.$id.tsx`** into `src/components/project/*.tsx`, one file per tab/feature. Same mechanical, low-risk move. *Status: being executed now.*
3. Adopt a folder convention going forward (e.g. `src/features/<domain>/{functions,components}.ts`) so new work doesn't keep landing back in one or two files by default.
4. Give `BETA_MODE` a tracked removal plan (issue/TODO with a date) before the pricing page goes live for real.
5. Add a minimal test suite around the LLM-JSON-parsing paths (`generatePermitChecklist`, `intakeGenerateChecklist`, `syncJurisdiction` extraction) since those are the most likely to silently break on a model output format change.

None of this is urgent from a correctness standpoint — the app works and the security-critical parts (auth, RLS, share tokens) are solid. It's a maintainability problem: right now, any change to "the checklist feature" or "the project page" requires reading through thousands of unrelated lines first.
