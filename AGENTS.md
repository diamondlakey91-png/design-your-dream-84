<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- All AI review/research system prompts must be built with `withRegulatoryGrounding()` from `src/lib/regulatoryGrounding.ts` — one shared evidence/citation standard keeps every agent from fabricating code citations.
- Credit balances come only from the append-only `credit_transactions` ledger; writes go through `consume_credit`/`refund_credit` (service role) or the verified payment webhook — auditable, idempotent, never a mutable counter.
- Plan limits, allowances and member prices are data (`subscription_plans`, `plan_entitlements`, `service_products`), read via `src/lib/commerce.server.ts` — so pricing changes never need code changes.
- Every paid AI "Run" goes through `runMeteredAi` (src/lib/aiMeter.server.ts) and every gateway call through `aiFetch` — credits are fail-closed (no credit = no run; only the separate `internal_ai` role — not admin — runs as logged internal use; Assistant messages use their own `ai_messages` allowance) and every call lands in `ai_usage_log`.
- Authoritative states (QA/QC sign-offs, professional review status/notes, filing submitted/monitoring/issued + submission details, jurisdiction human_verified, SIR request creation) are written only by the server (service role) or admins, enforced by DB triggers/grants via `is_trusted_writer()` — customers must never be able to manufacture Permivio/government/reviewer approval.
- Project phase, permit progress and Next Actions are deterministic rules in `src/lib/projectFoundation.ts` (read via `getProjectFoundation`) — AI may explain, but never controls core workflow state.
- Key lifecycle activity (document uploaded, plan review completed, roadmap generated, inspection added/status) is logged by the `log_project_activity` DB trigger into `activity` (action/object_type/object_id) — can't be skipped by clients.
- The project permit roadmap is `permit_items` (extended), with deterministic status/blocked/dependency rules in `src/lib/roadmapWorkflow.ts`; "verified" confidence and sourced fee/timing are set only by trusted writers (`guard_permit_item` trigger) — one roadmap system, no invented requirements.
- Plan-set versions live on `plan_sets` (`version_number`, one `is_current` per project via unique index) managed by `src/lib/planVersions.functions.ts`; versions are additive and never delete older sets/reviews.
- Project files are shared with the project team through the `project team docs read` storage policy keyed on registered `project_documents.storage_path`; `guard_document_path` stops path substitution.
