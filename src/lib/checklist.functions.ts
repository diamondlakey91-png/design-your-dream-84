import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callLovableAI, SYSTEM_PROMPT, PERMIT_STATUSES, ExtractedItem, loadJurisdictionContextBlock } from "@/lib/ai.shared";

// ---- Permit checklist ----
export const listPermitItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("permit_items")
      .select("*")
      .eq("project_id", data.project_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updatePermitItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(PERMIT_STATUSES).optional(),
      notes: z.string().max(2000).optional(),
      due_date: z.string().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { status?: string; notes?: string; due_date?: string | null } = {};
    if (data.status) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.due_date !== undefined) patch.due_date = data.due_date;
    const { data: row, error } = await context.supabase
      .from("permit_items").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    if (data.status) {
      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: row.project_id,
        description: `${row.name} → ${data.status.replace(/_/g, " ")}`,
      });
    }
    return row;
  });

export const addPermitItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      name: z.string().min(1).max(200),
      category: z.string().max(80).default("Building"),
      required: z.boolean().default(true),
      due_date: z.string().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("permit_items")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        name: data.name,
        category: data.category,
        required: data.required,
        due_date: data.due_date ?? null,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Added checklist item: ${data.name}`,
    });
    return row;
  });

export const deletePermitItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("permit_items").select("name, project_id").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("permit_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row) {
      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: row.project_id,
        description: `Removed checklist item: ${row.name}`,
      });
    }
    return { ok: true };
  });

// AI checklist generation
const ChecklistItemSchema = z.object({
  name: z.string(),
  category: z.string(),
  required: z.boolean(),
  why: z.string().optional(),
});

export const generatePermitChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");
    const { data: p } = await context.supabase
      .from("projects").select("*").eq("id", data.project_id).maybeSingle();
    if (!p) throw new Error("Project not found");

    const prompt = `Generate a permit checklist for this project. Return ONLY valid JSON, no prose.

Project: ${p.name}
Type: ${p.project_type}
Location: ${p.location || "unspecified"}
Jurisdiction: ${p.jurisdiction || "unspecified"}

Return this JSON shape:
{"items":[{"name":"Building Permit","category":"Building","required":true,"why":"..."}]}

Rules:
- 6 to 14 items, in chronological order (pre-construction → construction → final inspections → occupancy).
- category is one of: Building, MEP, Fire, Health, Zoning, Sign, Right-of-Way, Grading, Demolition, Stormwater, Historic, Environmental, Occupancy.
- required=true for likely-required, false for conditional.
- name is the specific permit/approval name; where jurisdiction is known, use the local term (e.g. "LADBS Building Permit", "NYC DOB PW1 Filing").
- why is one short clause explaining trigger.

PROJECT-TYPE RULES (critical — tailor the list to "${p.project_type}"):
- Tenant Fit-Out / Tenant Improvement / TI: focus on interior alterations — Zoning Use Approval, Building (Alteration/TI), MEP (Mech/Elec/Plumb) sub-permits, Fire (sprinkler/alarm modification, hood suppression if applicable), Health (if food service), Sign. Usually NO grading, stormwater, or site work. If restaurant/food service, include Health Dept plan review + Hood/Grease permits.
- New Build / Ground-Up Construction: include site work — Zoning/Site Plan, Grading, Stormwater/SWPPP, Erosion Control, Right-of-Way, Utility connections (water/sewer/gas/electric), Building (New), full MEP, Fire (sprinkler/alarm new), Elevator (if applicable), Landscape, Final CofO.
- Shell / Core-and-Shell: Building (Shell), MEP rough-in, Fire base system, Zoning/Site, Grading/Stormwater — but NO interior finish or occupancy-load-specific items; note tenant CofO will be separate.
- Renovation / Alteration (existing structure, no new occupancy): Building (Alteration), targeted MEP, Fire (as impacted), Historic review if in a district. Skip grading/site unless footprint changes.
- Change of Use: Zoning Use Approval FIRST, then Building (Change of Occupancy), Fire re-evaluation for new occupancy classification, Health (if food), plus a new Certificate of Occupancy reflecting the new use.
- Demolition: Demolition permit, Asbestos/Lead survey (Environmental), Right-of-Way (dumpster/protection), Utility disconnects, Erosion Control.
- Addition: Zoning (setback/FAR check), Building (Addition), MEP tie-in, Grading/Stormwater if footprint expands, Fire.

MANDATORY FINAL ITEM (unless project type is Demolition or Shell-only):
- The LAST item MUST be a Certificate of Occupancy (or Temporary CofO where applicable). Name it precisely for the jurisdiction (e.g. "Arlington County Certificate of Occupancy", "NYC DOB Certificate of Occupancy (CO)", "LADBS Certificate of Occupancy"). category = "Occupancy". required = true. why = "Issued only after all final inspections pass; required before legal occupancy."
- For Shell projects: end with "Shell Building Final" (Occupancy category) and note tenant CofO is separate.
- For Demolition: end with "Final Demolition Inspection & Site Closeout" instead of CofO.`;

    const raw = await callLovableAI(apiKey, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);
    // Strip fences
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    let parsed: { items: Array<z.infer<typeof ChecklistItemSchema>> };
    try {
      parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    } catch {
      throw new Error("AI returned unparseable checklist. Try again.");
    }
    const items = z.object({ items: z.array(ChecklistItemSchema).min(1).max(20) }).parse(parsed).items;

    // Replace existing checklist
    await context.supabase.from("permit_items").delete().eq("project_id", data.project_id);

    const rows = items.map((it, idx) => ({
      user_id: context.userId,
      project_id: data.project_id,
      name: it.name,
      category: it.category,
      required: it.required,
      notes: it.why ?? "",
      sort_order: idx,
    }));
    const { data: inserted, error } = await context.supabase
      .from("permit_items").insert(rows).select("*");
    if (error) throw new Error(error.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `AI generated ${inserted.length} checklist items.`,
    });
    return inserted;
  });

// ---- Guided intake: create project + checklist from a chat thread ----
const IntakeInput = z.object({
  thread_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  project_type: z.string().min(1).max(80),
  location: z.string().min(1).max(200),
  jurisdiction: z.string().max(200).default(""),
  scope: z.string().min(10).max(2000),
  size: z.string().max(120).default(""),
  occupancy: z.string().max(120).default(""),
  work_type: z.string().max(120).default(""),
});

export const intakeGenerateChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IntakeInput.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    // Verify thread ownership
    const { data: thread } = await context.supabase
      .from("chat_threads").select("id, project_id").eq("id", data.thread_id).maybeSingle();
    if (!thread) throw new Error("Thread not found");

    // Create the project
    const { data: project, error: perr } = await context.supabase
      .from("projects")
      .insert({
        user_id: context.userId,
        name: data.name,
        location: data.location,
        project_type: data.project_type,
        jurisdiction: data.jurisdiction,
        permit_count: 6,
        permits_issued: 0,
        current_stage: 0,
        status: "Pre-Planning",
      })
      .select("*").single();
    if (perr) throw new Error(perr.message);

    // Attach to the thread
    await context.supabase.from("chat_threads")
      .update({ project_id: project.id })
      .eq("id", data.thread_id);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: project.id,
      description: `Project "${project.name}" created from AI intake.`,
    });

    // Load cached jurisdiction context (grounds checklist in real permits/timelines/sources)
    const jc = data.jurisdiction
      ? await loadJurisdictionContextBlock(context.supabase, data.jurisdiction)
      : { block: "", hasData: false, profile: null };

    // Ask AI for a checklist tailored to the intake scope
    const prompt = `Generate a permit checklist for this project based on the intake below. Return ONLY valid JSON, no prose.

Project: ${data.name}
Type: ${data.project_type}
Work type: ${data.work_type || "unspecified"}
Occupancy / Use: ${data.occupancy || "unspecified"}
Size: ${data.size || "unspecified"}
Location: ${data.location}
Jurisdiction: ${data.jurisdiction || "unspecified"}
Scope described by user:
"""${data.scope}"""
${jc.block}

Return this JSON shape:
{"items":[{"name":"Building Permit","category":"Building","required":true,"why":"..."}]}

Rules:
- 6 to 14 items, in chronological order (pre-construction → construction → occupancy).
- category one of: Building, MEP, Fire, Health, Zoning, Sign, Right-of-Way, Grading, Demolition, Stormwater, Historic, Environmental, Occupancy.
- required=true for clearly-required based on scope; false for conditional/only-if-triggered.
- name uses the local term when jurisdiction is known (e.g. "LADBS Building Permit", "NYC DOB PW1 Filing"). If a JURISDICTION CONTEXT block is provided above, prefer permit names listed there.
- why is one short clause tied to the scope (mention the trigger from the intake). When a stage's typical duration is in the JURISDICTION CONTEXT, append " (~<duration>)" to why for that item.`;

    const raw = await callLovableAI(apiKey, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    let parsed: { items: Array<z.infer<typeof ChecklistItemSchema>> };
    try {
      parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    } catch {
      throw new Error("AI returned unparseable checklist. Try again.");
    }
    const items = z.object({ items: z.array(ChecklistItemSchema).min(1).max(20) }).parse(parsed).items;

    const rows = items.map((it, idx) => ({
      user_id: context.userId,
      project_id: project.id,
      name: it.name,
      category: it.category,
      required: it.required,
      notes: it.why ?? "",
      sort_order: idx,
    }));
    const { data: inserted, error: ierr } = await context.supabase
      .from("permit_items").insert(rows).select("*");
    if (ierr) throw new Error(ierr.message);

    // Update project.permit_count to match generated required-count
    const requiredCount = items.filter((i) => i.required).length || items.length;
    await context.supabase.from("projects")
      .update({ permit_count: requiredCount })
      .eq("id", project.id);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: project.id,
      description: `AI generated ${inserted.length} checklist items from intake.`,
    });

    // Post a summary message into the chat thread so the user sees the result inline
    const summaryLines = items.map((it) => `- **${it.name}** — ${it.category}${it.required ? " · [REQUIRED]" : " · [CONDITIONAL]"}${it.why ? ` — ${it.why}` : ""}`).join("\n");
    const summary = `Created project **${project.name}** (${data.project_type}${data.size ? `, ${data.size}` : ""}) in ${data.location}${data.jurisdiction ? ` — jurisdiction: ${data.jurisdiction}` : ""}.

Generated a **${inserted.length}-item permit checklist** based on your scope:

${summaryLines}

Open the project to track status, upload docs, and sync live with the jurisdiction portal. Ask me follow-ups here — I'll answer in the context of this project.`;

    await context.supabase.from("chat_messages").insert({
      user_id: context.userId,
      thread_id: data.thread_id,
      role: "assistant",
      content: summary,
      parts: [{ type: "text", text: summary }],
    });
    await context.supabase.from("chat_threads")
      .update({ last_message_at: new Date().toISOString(), title: data.name.slice(0, 60) })
      .eq("id", data.thread_id);

    return { project, items: inserted };
  });

export const addPermitItemsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      items: z.array(ExtractedItem).min(1).max(20),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("permit_items").select("sort_order").eq("project_id", data.project_id);
    const startOrder = (existing ?? []).reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 1;

    const rows = data.items.map((it, idx) => ({
      user_id: context.userId,
      project_id: data.project_id,
      name: it.name,
      category: it.category,
      required: it.required,
      notes: it.why ?? "",
      sort_order: startOrder + idx,
    }));
    const { data: inserted, error } = await context.supabase
      .from("permit_items").insert(rows).select("*");
    if (error) throw new Error(error.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Added ${inserted.length} checklist item${inserted.length === 1 ? "" : "s"} from AI chat.`,
    });
    return { inserted };
  });
