# Multi-Agent SIR Research & Report Generation

Turn the Site Investigation Report from one AI call into an orchestrated agent system: a Lead Agent that plans the assignment, 11 specialist agents that research and write structured findings with citations, a mandatory QA/QC agent, then human (LPG) review before client delivery. Everything runs server-side on the existing PERMIVIO design system — no visual redesign, no new navigation.

## What changes for the client

The intake stays simple: address, what they want to do, size, type of work, target date, known conditions, uploads, and the decision the report supports. No zoning, code-edition, permit-name or agency questions. Follow-up questions are asked only when a missing answer materially affects feasibility, in plain language.

## Data foundation (new tables)

- `sir_assignments` — one research assignment per SIR request/project: tier, complexity, research plan, status, research start/complete dates, freshness limit, revision number.
- `sir_findings` — the structured finding record with every required field: finding id, project/assignment, revision, agent, module, research question, finding, analysis, applicability, **verification status** (verified / preliminary_analysis / pending_confirmation / client_input_required / not_available / conflict_detected), **ai_confidence** (high/medium/low) as a separate field, risk level, cost impact, schedule impact, recommended action, confirmation required, reviewer status, client-visible flag, geographic applicability, agency.
- `sir_finding_sources` — citation rows: source name, publishing authority, URL or uploaded document, code section / page / table / map layer, effective date, accessed date, what the source supports, source priority tier (official → secondary).
- `sir_conflicts` — two or more findings that disagree: both preserved, conflicting sources named, assigned to QA/QC or a reviewer, feasibility impact noted.
- `sir_agent_runs` — audit record per agent execution: agent, task, start/finish, input/output version, sources found, findings created, errors, retry status, reviewer action.
- `sir_qa_exceptions` — QA/QC exception list with severity and blocking flag.
- `sir_followups` — plain-language client questions and answers.

All tables get GRANTs, RLS (owner + admin via `has_role`), and admin-only visibility for internal notes and strategy fields.

Report status enum surfaced everywhere: Research Not Started → Research In Progress → Research Complete → QA/QC Failed → Corrections Required → QA/QC Passed → LPG Review Pending → LPG Reviewed → Approved for Client Delivery.

## Agent framework

A single server-side runner (`sirAgents/*.server.ts`) with one contract per agent: typed input → strict JSON output validated with zod → findings + sources written to the database → audit row. Agents never write prose into the report directly; the Composition Agent reads only stored findings.

Specialists: 1 Intake & Scope, 2 Property/Parcel/Jurisdiction, 3 Document Intelligence, 4 Zoning & Entitlement, 5 Building/Fire/Health/Licensing, 6 Utilities & Infrastructure, 7 Transportation/Access/Site-Fit, 8 Environmental/Flood/Stormwater, 9 Fee & Schedule, 10 Risk & Feasibility, 11 Report Composition, 12 QA/QC.

Lead Agent: interprets the brief, builds the research plan (which modules apply for this tier/complexity), dispatches specialists, tracks completion, prevents duplication, opens conflicts instead of picking a winner, drafts the executive summary and feasibility recommendation from stored findings, then submits to QA/QC and routes to LPG review.

Evidence rules enforced in code, not just prompts: a finding may only be `verified` when it has at least one official-tier source with a URL; search-result snippets alone downgrade to `preliminary_analysis`; utility capacity can never be `verified` without a written provider confirmation source; missing dates, broken links and stale fee schedules raise QA warnings.

## Execution model

Long research cannot run inside one request. The assignment is queued and advanced step by step:

- `advanceSirAssignment` runs the next pending agent task and returns progress; the admin UI polls it, so a browser tab is never blocked and work resumes after interruption.
- Retry, manual reassignment, single-module rerun, source refresh, full rerun and revision comparison are all operations on the queue.
- Integrations use real services already in the project: Firecrawl for official-source search/scrape, geocoding for address/parcel, Lovable AI Gateway for the models, existing document/OCR path for uploads. Where a service is not connected (GIS/parcel APIs, DOT layers), the module is marked **Integration Required** with the interface in place — never fabricated zoning, parcel, fee, agency or code data — and staff can enter and verify findings manually.

## Report generation gate

Final client report is blocked unless: parcel + jurisdiction confirmed, required modules complete or explained, material findings carry sources or confirmation labels, high/critical risks reviewed, fee basis present, timeline assumptions disclosed, conflicts resolved or disclosed, QA/QC passed, correct review-status label. Internal drafts are always available to staff.

## UI (existing design system only)

- Admin SIR console: assignment progress by agent/module, findings table with verification + confidence badges, sources openable from each finding, conflict queue, QA/QC exception list, audit trail, retry/rerun controls, LPG review actions (approve, correct, adjust risk, require confirmation, suppress finding, internal note, approve recommendation, mark LPG Reviewed, release to client).
- Client SIR view/PDF: composed narrative sections, permit matrix, fee summary, timeline, critical items, risk register, deal killers, next actions, assumptions and limitations, citations — internal notes excluded, PROFESSIONALLY REVIEWED badge only after a real human review.

## Build order

1. Schema, status model, RLS/GRANTs, verification + confidence types.
2. Agent framework, audit trail, queue/`advanceSirAssignment`, Lead Agent + Agents 1–2.
3. Agents 3–8 (research modules) with citation enforcement and conflict creation.
4. Agents 9–10 (fee/schedule, risk/feasibility).
5. Agent 11 composition + Agent 12 QA/QC gate.
6. Admin console, LPG review workflow, client report/PDF wiring.

## Technical notes

Server-only agent code in `*.server.ts`; client-callable `sir.functions.ts` wrappers. Prompts, keys, internal reasoning and strategy notes never reach the browser. Existing `sir_requests` rows keep working: an assignment is created from a request, and the current research path becomes the Lead Agent's first pass.
