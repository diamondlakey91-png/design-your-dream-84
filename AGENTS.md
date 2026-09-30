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
