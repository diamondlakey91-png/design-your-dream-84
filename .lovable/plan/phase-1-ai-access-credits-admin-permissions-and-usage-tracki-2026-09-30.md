# Phase 1 — AI access, credits, admin permissions and usage tracking

Scope: Permivio only. The Lakey Permit Group website is not touched. No UI redesign; only small text additions in existing cards where a message or cost must appear.

## Important before we start
- Beta mode is currently on, and no membership plan has prices or credit amounts yet (Stripe sandbox is also disconnected).
- Once "block by default" ships, **every non-admin customer is blocked from AI runs** until they have a plan with credits, a purchased report, or an admin credit grant. Admins keep running for free (logged as internal use).
- Recommended: ship the block, then give beta testers credits through Admin → Tools → Membership plans → manual adjustment.

## 1. Block by default (first task)
- Replace the current pass-through in the credit-charging step: no subscription, inactive plan, missing plan limit, or zero balance now **stops the run** with a clear message ("This run needs a credit. Choose a plan or buy a report on the Tools page.").
- Only exceptions: platform admins (internal use, still logged) and runs covered by an already-purchased report/order entitlement.
- Beta mode no longer grants free AI runs; it still controls page/feature visibility only.

## 2. Charge only on "Run" actions
- Metered (1 credit each, refunded automatically on failure, refund recorded in the ledger):
  - Plan Review, Plan QA/QC → plan review credits
  - Reviewer summary, Response Matrix drafts → correction review credits
  - Permit Finder, Permit Analysis, Roadmap enrichment, Permit Lookup, Property/jurisdiction research, Checklist generation, Document reading → AI query credits
  - AI Assistant chat messages (including the streaming chat and the connected-assistant tool) → AI query credits
  - SIR / Feasibility research → covered by the purchased report order (no double charge)
- Always free: viewing, signing in, creating projects, uploading files, downloads, background permit-status refreshes (logged as internal use).
- Buttons send a per-click ID so a double click charges once and a deliberate re-run charges again.

## 3. Admin permissions (server-side)
- Every admin operation (plan/cost management, product catalog edits, viewing all usage, balance adjustments) re-checks the admin role in the roles table on the server before doing anything. Audit existing admin functions and close any that only rely on hidden buttons.

## 4. Usage tracking
- New AI usage log covering every AI call: user, organization, operation, project, provider, model, success/failure, error, tokens in/out, estimated cost, credits charged, linked credit transaction, internal-use marker, request ID.
- One shared wrapper around AI Gateway calls writes the row, so no call site can skip logging.
- Users see their own rows; admins see all; only the server writes.
- Admin gets an "AI usage" list in the existing admin Tools area (existing table style).

## 5. Catalog completeness
- Check every active paid product has a credit type and cost; fill the missing ones (1 credit unless the product already states otherwise) and flag any I cannot infer for you to confirm.
- Billing panel: verify each credit type, balance, and per-run cost displays correctly; add the missing "AI query" row if absent.

## Technical details
- `chargeIncludedUsage` in `commerce.server.ts` becomes fail-closed; returns `{usageId, internal}`; throws a typed `CreditRequiredError` (HTTP 402-style message) instead of returning null.
- New `src/lib/aiCall.server.ts`: `runMeteredAi({ ctx, operation, creditType, key, projectId }, fn)` → charge → call gateway → log to `ai_usage_log` → refund + log on failure. Migrate the 16 gateway call sites in `src/lib/*.functions.ts`, `routes/api/chat.stream.ts`, `mcp/tools/ask-assistant.ts`, `refresh-linked-permits.ts` (internal).
- Migration: `ai_usage_log` table + GRANTs (select to authenticated, all to service_role) + RLS (own rows or `has_role admin`; no client writes); indexes on user_id, created_at, operation. Add `ai_queries` credit settings to products where missing via data update.
- `agent_usage_ledger` stays as-is for agent runs; new log references run IDs where available.
- Tests: fail-closed cases (no sub, no limit, zero balance), admin internal bypass, refund on failure, idempotent retry, logging on success/failure. Verify with tsgo + vitest + one live run.
