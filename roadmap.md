
## Requested 2026-09-30
- [x] Adopt the uploaded AI Permitting & Compliance Agent grounding rules (Permivio-branded) across plan review, QA/QC, correction analysis, permit requirements, permit roadmap
- [x] Permit Filing tool in the catalog: submit a real permit application with live AHJ contacts + portal links
- [x] Site Investigation Report in the catalog: order a real field investigation with live AHJ contacts + boundary map
- [x] Plan set database: search and reuse past building plan sets instead of re-uploading

- [x] Commerce & entitlement foundation (plans, limits, credit ledger, member pricing, billing tab, admin plans)

## Phase 1.2 follow-ups (recorded, not started)
- [ ] A. Correction Review runs must also write to the central AI usage log (ai_usage_log), not only the credit ledger
- [ ] B. Customer-purchased Site Investigation must not be classified "Internal"; add a separate funding classification (e.g. purchased_service / order-funded) with internal_use=false — schema not yet chosen
- [x] A. (done) Correction Review runs written to ai_usage_log

## Security-hardening backlog (recorded, not started)
- [ ] credit_balance() can be called with another user's id (returns 0 under RLS; no data exposed) — restrict to caller/service role
- [ ] 9 documented DB warnings (1 extension in public, 8 SECURITY DEFINER) — intentionally unchanged
- [x] H1/M1/M2/M3/M4 beta-blocking fixes (SIR insert, QA/QC sign-offs, professional reviews, filing status, jurisdiction human-verified)
- [x] Phase 2A — Project Foundation (workspace header, overview, intake, jurisdiction context, activity, Next Actions)
- [ ] Phase 2B — Roadmap + Documents (awaiting approval)
- [ ] L1 jurisdiction profile creation + created_by/verified_by visible to customers
- [ ] L3 empty-organization first-member edge case
