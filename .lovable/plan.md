# Permivio → PermitFlow-parity upgrade

Bringing the app to feature parity with PermitFlow's core, plus a project-aware AI assistant with threaded history.

## What ships

### 1. Threaded AI Permit Assistant
- Sidebar of past chats (title, last message, timestamp), "New chat" button.
- Route `/assistant/$threadId` — each conversation gets a real URL, restorable on any device.
- Server-persisted messages scoped to the user.
- **Project context** stays: attach a project to any thread and the assistant sees its jurisdiction, checklist, deadlines, and latest sync findings.
- **In-chat actions**: when the assistant generates a checklist, an "Attach to project" panel appears — pick an existing project or create a new one, and items land in `permit_items` in one click.

### 2. Jurisdiction Intelligence Library `/jurisdictions`
- Search bar over 20k+ US jurisdictions (query-driven, no static seed).
- On first search, AI + Firecrawl builds and caches a jurisdiction profile:
  department name, official portal URL, permit types with typical fee ranges, average turnaround, required professional stamps, key contacts.
- Cached in `jurisdiction_profiles` so repeats are instant. "Refresh" re-syncs.
- Detail page shows profile + a "Start a project here" CTA.

### 3. Guided Permit-Application Wizard
- Per checklist item, "Prepare application" opens a wizard.
- AI generates the jurisdiction-specific field list for that permit type (owner, contractor, valuation, scope of work, drawings required, etc.).
- User fills; validated with zod; produces a submission-ready PDF packet + JSON, saved to `project-docs` and linked from the item.

### 4. Fee & Timeline Estimator
- "Estimate" button on the project overview.
- AI itemizes each checklist item with expected fee range, review time, and total project cost/timeline for that jurisdiction.
- Stored on the project so it renders instantly on reload; regenerable.

### 5. Inspection Scheduler & Tracker
- New `inspections` table linked to `permit_items`.
- Per-item "Add inspection" (type, scheduled date, inspector, status pass/fail/pending, notes, re-inspection date).
- Realtime updates + activity log entries.
- Overdue/upcoming badges surface on dashboard.

## Technical shape

### DB (single migration)
- `chat_threads` (title, project_id nullable, model, updated_at) — RLS by user.
- `chat_messages`: add `thread_id`, `parts jsonb` (UIMessage-compatible); backfill existing rows into a "Legacy" thread.
- `jurisdiction_profiles` (slug unique, name, state, department, portal_url, permits jsonb, fees jsonb, timelines jsonb, contacts jsonb, source_urls text[]).
- `inspections` (permit_item_id, project_id, type, scheduled_date, inspector, status enum, notes, result_date).
- `projects`: add `estimate jsonb`, `estimate_generated_at`.
- `permit_items`: add `application_packet_doc_id` (fk project_documents), `application_fields jsonb`.
- Grants + RLS scoped to `auth.uid()`; realtime enabled on `chat_messages`, `inspections`, `chat_threads`.

### Server functions (`src/lib/permits.functions.ts` additions)
- Threads: `listThreads`, `createThread`, `renameThread`, `deleteThread`, `getThreadMessages`.
- Chat streaming migrated to a TanStack server route `src/routes/api/chat.ts` using `@ai-sdk/react` + AI SDK Lovable gateway (Gemini 3.5 Flash for speed, Pro auto-selected for checklist/estimate generation). Route accepts `thread_id`, `project_id`, persists both user + assistant messages via `onFinish`.
- Assistant tools exposed via AI SDK: `generate_checklist`, `estimate_project`, `lookup_jurisdiction`, `attach_checklist_to_project`, `add_inspection`.
- Jurisdiction: `searchJurisdictions`, `getOrBuildJurisdictionProfile` (Firecrawl + AI).
- Estimator: `estimateProject`.
- Inspections: `listInspections`, `addInspection`, `updateInspection`, `deleteInspection`.
- Wizard: `generateApplicationFields`, `saveApplicationDraft`, `renderApplicationPacket` (PDF via `pdf-lib`).

### Frontend
- New routes: `/_authenticated/assistant.$threadId.tsx`, `/_authenticated/jurisdictions.tsx`, `/_authenticated/jurisdictions.$slug.tsx`.
- Assistant rebuilt on **AI Elements** (`conversation`, `message`, `prompt-input`, `tool`, `shimmer`) with per-tool custom cards (checklist card with "Attach", jurisdiction card, estimate table).
- Project detail: new **Inspections** tab, **Estimate** section on Overview, **Prepare application** button per checklist item.
- Bottom nav gains **Library** icon → jurisdictions.

### Order of implementation this turn
1. Migration (all schema in one file).
2. Server functions + streaming chat route.
3. Threaded assistant UI with tool-rendering.
4. Jurisdiction library pages.
5. Inspections tab + estimator on project.
6. Wizard (fields + packet).

### Out of scope this pass
- Auto-submission to municipal portals (PermitFlow uses licensed expediters; Permivio surfaces the packet + portal link instead).
- Payment collection for permit fees.
- Multi-user org accounts.

Approve to build.