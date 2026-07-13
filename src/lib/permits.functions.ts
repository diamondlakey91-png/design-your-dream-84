import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---- Projects ----
export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [p, act] = await Promise.all([
      context.supabase.from("projects").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("activity")
        .select("*")
        .eq("project_id", data.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (p.error) throw new Error(p.error.message);
    return { project: p.data, activity: act.data ?? [] };
  });

const CreateProjectInput = z.object({
  name: z.string().min(1).max(200),
  location: z.string().max(200).default(""),
  project_type: z.string().max(80).default("Commercial"),
  jurisdiction: z.string().max(200).default(""),
  permit_count: z.number().int().min(0).max(50).default(3),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({
        user_id: context.userId,
        name: data.name,
        location: data.location,
        project_type: data.project_type,
        jurisdiction: data.jurisdiction,
        permit_count: data.permit_count,
        permits_issued: 0,
        current_stage: 0,
        status: "Pre-Planning",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: row.id,
      description: `Project "${row.name}" created.`,
    });
    return row;
  });

export const advanceStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase
      .from("projects").select("*").eq("id", data.id).maybeSingle();
    if (!p) throw new Error("Project not found");
    const next = Math.min(4, p.current_stage + 1);
    const stageNames = ["Pre-Planning", "Plans Submitted", "In Review", "Approved", "Issued"];
    const permits_issued = next === 4 ? p.permit_count : p.permits_issued;
    const { data: updated, error } = await context.supabase
      .from("projects")
      .update({ current_stage: next, status: stageNames[next], permits_issued, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.id,
      description: `Advanced to ${stageNames[next]}.`,
    });
    return updated;
  });

// ---- Deadlines ----
export const listDeadlines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("deadlines")
      .select("*, projects(name)")
      .order("due_date", { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Chat threads ----
export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chat_threads")
      .select("*, projects(name)")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    title: z.string().max(120).optional(),
    project_id: z.string().uuid().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("chat_threads")
      .insert({
        user_id: context.userId,
        title: data.title || "New chat",
        project_id: data.project_id ?? null,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(120),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chat_threads").update({ title: data.title }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setThreadProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    project_id: z.string().uuid().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chat_threads").update({ project_id: data.project_id }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("chat_threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listThreadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ thread_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", data.thread_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const SendChatInput = z.object({
  thread_id: z.string().uuid(),
  content: z.string().min(1).max(4000),
});

const STAGE_NAMES = ["Pre-Planning", "Plans Submitted", "In Review", "Approved", "Issued"];

async function callLovableAI(apiKey: string, messages: Array<{ role: string; content: string }>, model = "google/gemini-2.5-pro") {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model, messages }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    if (resp.status === 429) throw new Error("Too many requests — try again in a moment.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Please top up.");
    throw new Error(`AI error: ${txt.slice(0, 200)}`);
  }
  const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? "I couldn't generate a response.";
}

const SYSTEM_PROMPT = `You are the Permivio Permit Assistant — a specialist that helps contractors, architects, and developers identify the building, trade, planning, and regulatory permits required for construction projects in specific United States jurisdictions.

Core rules:
- Anchor every answer to the jurisdiction the user names (city + state, or county). If they didn't name one, ask for it before listing permits.
- Cite the responsible department by name when you know it (e.g. "LADBS", "NYC DOB", "Dallas Development Services", "Chicago Department of Buildings", "SF DBI"). If uncertain, say "the local Building Department" — never invent a department name.
- Distinguish permit types: building, MEP (mechanical/electrical/plumbing), fire, health, zoning/planning, sign, right-of-way/encroachment, grading, demolition, stormwater/SWPPP, ADA, historic review, environmental (CEQA/NEPA), and Certificate of Occupancy.
- Note when a permit typically requires stamped drawings from a licensed architect or engineer, and when a licensed contractor of record is required.
- Flag common jurisdiction-specific quirks when relevant (e.g. Title 24 energy in California, LL97 in NYC, Chapter 11B in California, Florida wind-load, coastal commission, historic districts).
- Be explicit about what you don't know. If a rule depends on scope you weren't told (square footage, occupancy type, change of use, tenant improvement vs. new build), ask a focused follow-up.
- Never fabricate fee amounts, review timelines, or code section numbers. If you cite a code section, only cite widely-known ones (IBC, IRC, NEC, IPC, IMC, Title 24) — otherwise say "check the adopted code edition".

Format:
- Start with a one-line summary tailored to the project + jurisdiction.
- Then a markdown list. Each item: **Permit / Approval** — one-line why, tagged \`[REQUIRED]\`, \`[LIKELY]\`, or \`[CONDITIONAL]\`. Group by phase (Pre-construction → Construction → Occupancy) when there are more than 4 items.
- End with one line: "Verify with <department name or 'the local Building Department'> — codes and thresholds change."

Keep answers tight. No filler, no repeated disclaimers, no marketing tone.`;

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendChatInput.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    // Verify thread ownership + pull project context
    const { data: thread } = await context.supabase
      .from("chat_threads").select("*, projects(*)").eq("id", data.thread_id).maybeSingle();
    if (!thread) throw new Error("Thread not found");

    const { data: history } = await context.supabase
      .from("chat_messages")
      .select("role, content")
      .eq("thread_id", data.thread_id)
      .order("created_at", { ascending: true })
      .limit(40);

    let projectContext = "";
    const p = thread.projects as { name: string; project_type: string; location: string; jurisdiction: string; current_stage: number; permits_issued: number; permit_count: number } | null;
    if (p) {
      projectContext = `\n\n[Active project context]\n- Name: ${p.name}\n- Type: ${p.project_type}\n- Location: ${p.location || "unspecified"}\n- Jurisdiction: ${p.jurisdiction || "unspecified"}\n- Current stage: ${STAGE_NAMES[p.current_stage]} (${p.current_stage + 1}/5)\n- Permits: ${p.permits_issued}/${p.permit_count} issued\nUse this context when the user's question refers to "this project", "my project", or asks about next steps.`;
    }

    const { data: userMsg, error: uerr } = await context.supabase
      .from("chat_messages")
      .insert({
        user_id: context.userId,
        thread_id: data.thread_id,
        role: "user",
        content: data.content,
        parts: [{ type: "text", text: data.content }],
      })
      .select("*").single();
    if (uerr) throw new Error(uerr.message);

    const messages = [
      { role: "system", content: SYSTEM_PROMPT + projectContext },
      ...(history ?? []),
      { role: "user", content: data.content },
    ];

    const reply = await callLovableAI(apiKey, messages);

    const { data: assistantMsg, error: aerr } = await context.supabase
      .from("chat_messages")
      .insert({
        user_id: context.userId,
        thread_id: data.thread_id,
        role: "assistant",
        content: reply,
        parts: [{ type: "text", text: reply }],
      })
      .select("*").single();
    if (aerr) throw new Error(aerr.message);

    // Auto-title on the first exchange
    if ((history?.length ?? 0) === 0 && (thread.title === "New chat" || !thread.title)) {
      const title = data.content.slice(0, 60).replace(/\s+/g, " ").trim();
      await context.supabase.from("chat_threads")
        .update({ title, last_message_at: new Date().toISOString() })
        .eq("id", data.thread_id);
    } else {
      await context.supabase.from("chat_threads")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", data.thread_id);
    }

    return { user: userMsg, assistant: assistantMsg };
  });

export const summarizeProjectNextSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    const { data: p, error } = await context.supabase
      .from("projects").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Project not found");

    const { data: recent } = await context.supabase
      .from("activity").select("description, created_at")
      .eq("project_id", data.id).order("created_at", { ascending: false }).limit(6);

    const userPrompt = `Summarize the concrete next steps for this project.

Project: ${p.name}
Type: ${p.project_type}
Location: ${p.location || "unspecified"}
Jurisdiction: ${p.jurisdiction || "unspecified"}
Current pipeline stage: ${STAGE_NAMES[p.current_stage]} (${p.current_stage + 1} of 5)
Permits issued: ${p.permits_issued} of ${p.permit_count}
Recent activity:
${(recent ?? []).map((a) => `- ${a.description}`).join("\n") || "- (none)"}

Produce:
1. One short sentence stating exactly where this project stands.
2. A markdown list of the next 3–5 concrete actions the team should take THIS WEEK, given the stage and jurisdiction. Each action starts with a verb. If a jurisdiction-specific submittal is required to advance, name it.
3. A one-line watch-out (what commonly delays this stage in this jurisdiction).

No preamble, no closing pleasantries.`;

    const reply = await callLovableAI(apiKey, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);
    return { summary: reply };
  });

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

const PERMIT_STATUSES = ["not_started", "submitted", "under_review", "approved", "issued"] as const;

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
- 6 to 12 items, in chronological order (pre-construction → construction → occupancy).
- category is one of: Building, MEP, Fire, Health, Zoning, Sign, Right-of-Way, Grading, Demolition, Stormwater, Historic, Environmental, Occupancy.
- required=true for likely-required, false for conditional.
- name is the specific permit/approval name; where jurisdiction is known, use the local term (e.g. "LADBS Building Permit", "NYC DOB PW1 Filing").
- why is one short clause explaining trigger.`;

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

Return this JSON shape:
{"items":[{"name":"Building Permit","category":"Building","required":true,"why":"..."}]}

Rules:
- 6 to 14 items, in chronological order (pre-construction → construction → occupancy).
- category one of: Building, MEP, Fire, Health, Zoning, Sign, Right-of-Way, Grading, Demolition, Stormwater, Historic, Environmental, Occupancy.
- required=true for clearly-required based on scope; false for conditional/only-if-triggered.
- name uses the local term when jurisdiction is known (e.g. "LADBS Building Permit", "NYC DOB PW1 Filing").
- why is one short clause tied to the scope (mention the trigger from the intake).`;

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

// ---- Documents ----
export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Sign URLs for each
    const withUrls = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: signed } = await context.supabase
          .storage.from("project-docs").createSignedUrl(r.storage_path, 3600);
        return { ...r, url: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

export const registerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      name: z.string().min(1).max(300),
      storage_path: z.string().min(1).max(500),
      mime_type: z.string().max(120).default(""),
      size_bytes: z.number().int().min(0).default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("project_documents")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        name: data.name,
        storage_path: data.storage_path,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Uploaded document: ${data.name}`,
    });
    return row;
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("project_documents").select("*").eq("id", data.id).maybeSingle();
    if (!row) return { ok: true };
    await context.supabase.storage.from("project-docs").remove([row.storage_path]);
    const { error } = await context.supabase.from("project_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Deadlines management ----
export const addDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      title: z.string().min(1).max(200),
      due_date: z.string(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("deadlines")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        title: data.title,
        due_date: data.due_date,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Deadline added: ${data.title} (due ${data.due_date})`,
    });
    return row;
  });

export const deleteDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("deadlines").select("title, project_id").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("deadlines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.project_id) {
      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: row.project_id,
        description: `Deadline removed: ${row.title}`,
      });
    }
    return { ok: true };
  });

// ---- Activity timeline ----
export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("activity")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---- Live Jurisdiction Sync (Firecrawl + AI) ----
export const listJurisdictionSyncs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("jurisdiction_syncs")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

type FirecrawlSearchResult = { url: string; title?: string; description?: string };

async function firecrawlSearch(apiKey: string, query: string, limit = 5): Promise<FirecrawlSearchResult[]> {
  const resp = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, limit }),
  });
  if (!resp.ok) throw new Error(`Firecrawl search failed [${resp.status}]: ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { data?: { web?: FirecrawlSearchResult[] } | FirecrawlSearchResult[] };
  const raw = Array.isArray(j.data) ? j.data : j.data?.web ?? [];
  return raw.filter((r) => r?.url);
}

async function firecrawlScrape(apiKey: string, url: string): Promise<{ markdown: string; title: string }> {
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!resp.ok) throw new Error(`Firecrawl scrape failed [${resp.status}]: ${(await resp.text()).slice(0, 200)}`);
  const j = (await resp.json()) as { data?: { markdown?: string; metadata?: { title?: string } } };
  return { markdown: j.data?.markdown ?? "", title: j.data?.metadata?.title ?? "" };
}

const FindingSchema = z.object({
  permit_or_record: z.string(),
  status: z.string(),
  applicant_or_address: z.string().optional().default(""),
  filed_or_updated: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

const SyncExtractionSchema = z.object({
  portal_name: z.string(),
  portal_url: z.string(),
  findings: z.array(FindingSchema).max(15),
  summary: z.string(),
});

export const syncJurisdiction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const { data: p } = await context.supabase
      .from("projects").select("*").eq("id", data.project_id).maybeSingle();
    if (!p) throw new Error("Project not found");
    if (!p.jurisdiction) throw new Error("Add a jurisdiction to this project first (e.g. \"Los Angeles, CA\").");

    // Insert pending row so realtime shows a live "syncing" state
    const { data: pending, error: perr } = await context.supabase
      .from("jurisdiction_syncs")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        status: "searching",
        summary: `Searching official permit portal for ${p.jurisdiction}…`,
      })
      .select("*").single();
    if (perr) throw new Error(perr.message);

    try {
      // 1. Find the jurisdiction's permit portal
      const portalQuery = `${p.jurisdiction} building permit search portal site:.gov OR "permit search" OR Accela OR "energov"`;
      const portalHits = await firecrawlSearch(fcKey, portalQuery, 5);
      if (portalHits.length === 0) throw new Error(`No official permit portal found for ${p.jurisdiction}.`);

      // Prefer .gov / accela / energov / opengov
      const preferred = portalHits.find((h) => /(\.gov|accela|energov|opengov|citizenserve|permitium|mygovernmentonline)/i.test(h.url)) ?? portalHits[0];

      await context.supabase
        .from("jurisdiction_syncs").update({
          status: "scraping",
          portal_url: preferred.url,
          portal_name: preferred.title ?? preferred.url,
          source_url: preferred.url,
          summary: `Reading ${preferred.title ?? preferred.url}…`,
        }).eq("id", pending.id);

      // 2. Also search for the project itself on the portal / news
      const projectQuery = `"${p.name}" ${p.location || p.jurisdiction} permit status`;
      const projectHits = await firecrawlSearch(fcKey, projectQuery, 3).catch(() => []);

      // 3. Scrape the portal landing page
      const scraped = await firecrawlScrape(fcKey, preferred.url);
      const portalSnippet = scraped.markdown.slice(0, 4000);

      const projectSnippets = (
        await Promise.all(
          projectHits.slice(0, 2).map(async (h) => {
            try {
              const s = await firecrawlScrape(fcKey, h.url);
              return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 2000)}`;
            } catch {
              return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
            }
          }),
        )
      ).join("\n\n---\n\n");

      // 4. Ask AI to extract structured findings
      const extractionPrompt = `You are analyzing live web content for the Permivio permit tracker.

PROJECT
- Name: ${p.name}
- Address / Location: ${p.location || "(not provided)"}
- Jurisdiction: ${p.jurisdiction}
- Type: ${p.project_type}

CANDIDATE PORTAL (${preferred.url})
${portalSnippet}

RELATED SEARCH RESULTS FOR THIS PROJECT
${projectSnippets || "(none)"}

TASK
Return ONLY valid JSON matching this exact shape:
{
  "portal_name": "official name of the permit portal or department",
  "portal_url": "canonical URL to search permits in this jurisdiction",
  "findings": [
    {
      "permit_or_record": "record number or permit type",
      "status": "Issued | Under Review | Submitted | Approved | Expired | Withdrawn | Unknown",
      "applicant_or_address": "if listed",
      "filed_or_updated": "date if listed",
      "notes": "1 short clause"
    }
  ],
  "summary": "2-4 sentence plain-English summary of what the live portal shows for this jurisdiction and whether any record appears to match this project. Be honest if no direct match was found — say 'No direct match; use the portal link to search by address.'"
}

RULES
- Never invent record numbers, status, or dates. If a field isn't in the source text, omit that finding or set the field to "".
- findings may be an empty array. Prefer accuracy over volume.
- portal_url must be a real URL taken from the sources above.`;

      const raw = await callLovableAI(aiKey, [
        { role: "system", content: "You extract structured permit-portal data. Output valid JSON only, no prose, no fences." },
        { role: "user", content: extractionPrompt },
      ]);
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      let parsed: z.infer<typeof SyncExtractionSchema>;
      try {
        parsed = SyncExtractionSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
      } catch {
        throw new Error("AI returned unparseable sync result. Try again.");
      }

      const { data: done, error: derr } = await context.supabase
        .from("jurisdiction_syncs").update({
          status: "complete",
          portal_name: parsed.portal_name || preferred.title || preferred.url,
          portal_url: parsed.portal_url || preferred.url,
          source_url: preferred.url,
          findings: parsed.findings,
          summary: parsed.summary,
          error: "",
        }).eq("id", pending.id).select("*").single();
      if (derr) throw new Error(derr.message);

      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: data.project_id,
        description: `Live jurisdiction sync: ${parsed.findings.length} record${parsed.findings.length === 1 ? "" : "s"} from ${parsed.portal_name || "portal"}.`,
      });

      return done;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("jurisdiction_syncs").update({
          status: "error",
          error: msg,
          summary: `Sync failed: ${msg}`,
        }).eq("id", pending.id);
      throw new Error(msg);
    }
  });

// ---- Apply sync findings to checklist ----
const MatchSchema = z.object({
  item_id: z.string().uuid(),
  finding_index: z.number().int().min(0),
  new_status: z.enum(PERMIT_STATUSES).nullable(),
  new_due_date: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  explanation: z.string().min(1).max(400),
});
const MatchResultSchema = z.object({ matches: z.array(MatchSchema).max(50) });

export const applySyncToChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sync_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) throw new Error("AI is not configured");

    const { data: sync } = await context.supabase
      .from("jurisdiction_syncs").select("*").eq("id", data.sync_id).maybeSingle();
    if (!sync) throw new Error("Sync not found");
    if (sync.status !== "complete") throw new Error("Sync is not complete yet");
    const findings = (sync.findings ?? []) as Array<{
      permit_or_record: string; status: string;
      applicant_or_address?: string; filed_or_updated?: string; notes?: string;
    }>;
    if (findings.length === 0) throw new Error("No findings to apply");

    const [{ data: project }, { data: items }] = await Promise.all([
      context.supabase.from("projects").select("*").eq("id", sync.project_id).maybeSingle(),
      context.supabase.from("permit_items").select("*").eq("project_id", sync.project_id),
    ]);
    if (!project) throw new Error("Project not found");
    if (!items || items.length === 0) throw new Error("No checklist items on this project. Generate a checklist first.");

    const prompt = `Match live permit-portal findings to the project's checklist items and decide the correct new status.

PROJECT
- Name: ${project.name}
- Address: ${project.location || "(unknown)"}
- Jurisdiction: ${project.jurisdiction}

CHECKLIST ITEMS (${items.length}) — id, category, name, current status, current due_date
${items.map((i) => `- ${i.id} | ${i.category} | ${i.name} | ${i.status} | ${i.due_date ?? "none"}`).join("\n")}

LIVE FINDINGS (index, record, status, applicant/address, date, notes)
${findings.map((f, ix) => `[${ix}] ${f.permit_or_record} | ${f.status} | ${f.applicant_or_address ?? ""} | ${f.filed_or_updated ?? ""} | ${f.notes ?? ""}`).join("\n")}

RULES
- Only match a finding to a checklist item when the finding is clearly about the SAME permit type (building, electrical, plumbing, mechanical, certificate of occupancy, zoning, fire, health, etc.) AND — when the finding names an applicant/address — plausibly the same project. Otherwise skip.
- Map portal statuses to allowed values: not_started | submitted | under_review | approved | issued. "Filed"/"Received"/"Submitted" → submitted. "In Review"/"Plan Check"/"Routing" → under_review. "Approved"/"Ready to Issue" → approved. "Issued"/"Finaled" → issued. Withdrawn/Expired/Denied → do NOT change status; instead include the fact in explanation and leave new_status null.
- Never downgrade a more advanced status (e.g. do not move "issued" back to "under_review"). If the portal reflects a lower status than the checklist, leave new_status null and note the discrepancy.
- new_due_date: only set if a real inspection/expiration/deadline date appears in the finding, formatted YYYY-MM-DD. Otherwise null.
- confidence: high (record explicitly names this project or address), medium (permit type matches and jurisdiction matches with weak identity), low (type match only — usually skip).
- explanation: one plain-English sentence citing the finding (e.g. "Portal shows record B-2024-01823 issued 2024-11-02 for 123 Main St").

Return ONLY JSON of shape:
{"matches":[{"item_id":"<uuid>","finding_index":0,"new_status":"issued"|null,"new_due_date":"YYYY-MM-DD"|null,"confidence":"high|medium|low","explanation":"..."}]}
Return {"matches":[]} if nothing confidently matches.`;

    const raw = await callLovableAI(aiKey, [
      { role: "system", content: "You match permit-portal records to checklist items. Output valid JSON only." },
      { role: "user", content: prompt },
    ]);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    let parsed: z.infer<typeof MatchResultSchema>;
    try { parsed = MatchResultSchema.parse(JSON.parse(cleaned.slice(s, e + 1))); }
    catch { throw new Error("AI returned unparseable matches. Try again."); }

    const itemById = new Map(items.map((i) => [i.id, i]));
    const stageRank: Record<string, number> = { not_started: 0, submitted: 1, under_review: 2, approved: 3, issued: 4 };
    const applied: Array<{ item_id: string; item_name: string; from_status: string; to_status: string | null; new_due_date: string | null; confidence: string; explanation: string; finding: string }> = [];
    const skipped: Array<{ reason: string; explanation: string }> = [];

    for (const m of parsed.matches) {
      const item = itemById.get(m.item_id);
      if (!item) { skipped.push({ reason: "unknown item", explanation: m.explanation }); continue; }
      if (m.confidence === "low") { skipped.push({ reason: "low confidence", explanation: m.explanation }); continue; }

      const finding = findings[m.finding_index];
      const findingLabel = finding ? `${finding.permit_or_record} (${finding.status})` : `finding #${m.finding_index}`;

      const patch: { status?: string; due_date?: string | null; notes?: string } = {};
      let nextStatus: string | null = null;
      if (m.new_status && stageRank[m.new_status] > stageRank[item.status]) {
        patch.status = m.new_status;
        nextStatus = m.new_status;
      }
      if (m.new_due_date) patch.due_date = m.new_due_date;

      const stamp = `[Live sync ${new Date().toISOString().slice(0, 10)}] ${m.explanation} — source: ${findingLabel}${sync.portal_url ? ` · ${sync.portal_url}` : ""}`;
      patch.notes = item.notes ? `${item.notes}\n\n${stamp}` : stamp;

      if (Object.keys(patch).length === 0) { skipped.push({ reason: "no change", explanation: m.explanation }); continue; }

      const { error: uerr } = await context.supabase
        .from("permit_items").update(patch).eq("id", item.id);
      if (uerr) { skipped.push({ reason: uerr.message, explanation: m.explanation }); continue; }

      applied.push({
        item_id: item.id,
        item_name: item.name,
        from_status: item.status,
        to_status: nextStatus,
        new_due_date: m.new_due_date,
        confidence: m.confidence,
        explanation: m.explanation,
        finding: findingLabel,
      });

      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: sync.project_id,
        description: `Live sync updated "${item.name}"${nextStatus ? ` → ${nextStatus.replace(/_/g, " ")}` : ""}${m.new_due_date ? ` (due ${m.new_due_date})` : ""}: ${m.explanation}`,
      });
    }

    return { applied, skipped, total_findings: findings.length };
  });

// ---- Inspections ----
const INSPECTION_STATUSES = ["scheduled", "passed", "failed", "rescheduled", "canceled"] as const;

export const listInspections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("inspections")
      .select("*")
      .eq("project_id", data.project_id)
      .order("scheduled_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    project_id: z.string().uuid(),
    inspection_type: z.string().min(1).max(120),
    scheduled_date: z.string().nullable().optional(),
    inspector: z.string().max(120).optional().default(""),
    permit_item_id: z.string().uuid().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("inspections")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        inspection_type: data.inspection_type,
        scheduled_date: data.scheduled_date ?? null,
        inspector: data.inspector ?? "",
        permit_item_id: data.permit_item_id ?? null,
        status: "scheduled",
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Inspection scheduled: ${data.inspection_type}${data.scheduled_date ? ` for ${data.scheduled_date}` : ""}`,
    });
    return row;
  });

export const updateInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(INSPECTION_STATUSES).optional(),
    scheduled_date: z.string().nullable().optional(),
    result_date: z.string().nullable().optional(),
    notes: z.string().max(2000).optional(),
    inspector: z.string().max(120).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const patch: {
      status?: (typeof INSPECTION_STATUSES)[number];
      scheduled_date?: string | null;
      result_date?: string | null;
      notes?: string;
      inspector?: string;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.scheduled_date !== undefined) patch.scheduled_date = data.scheduled_date;
    if (data.result_date !== undefined) patch.result_date = data.result_date;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.inspector !== undefined) patch.inspector = data.inspector;
    if (data.status === "passed" || data.status === "failed") {
      patch.result_date = data.result_date ?? new Date().toISOString().slice(0, 10);
    }
    const { data: row, error } = await context.supabase
      .from("inspections").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    if (data.status) {
      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: row.project_id,
        description: `Inspection "${row.inspection_type}" → ${data.status}`,
      });
    }
    return row;
  });

export const deleteInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("inspections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Jurisdiction Intelligence Library ----
function toSlug(s: string) {
  return s.toLowerCase().trim().replace(/[,]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export const listJurisdictionProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ q: z.string().max(120).optional().default("") }).parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("jurisdiction_profiles")
      .select("id, slug, name, state, department, portal_url, refreshed_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data.q) query = query.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getJurisdictionProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(160) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jurisdiction_profiles").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

const ProfileExtractionSchema = z.object({
  name: z.string(),
  state: z.string().default(""),
  department: z.string().default(""),
  portal_url: z.string().default(""),
  overview: z.string(),
  permits: z.array(z.object({
    name: z.string(),
    when_required: z.string().default(""),
    typical_reviewers: z.string().default(""),
  })).max(20),
  fees: z.array(z.object({
    label: z.string(),
    detail: z.string().default(""),
  })).max(20),
  timelines: z.array(z.object({
    stage: z.string(),
    typical_duration: z.string(),
  })).max(20),
  contacts: z.array(z.object({
    role: z.string(),
    detail: z.string(),
  })).max(20),
  source_urls: z.array(z.string()).max(15),
});

export const buildJurisdictionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    jurisdiction: z.string().min(2).max(160),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const slug = toSlug(data.jurisdiction);
    if (!slug) throw new Error("Invalid jurisdiction");

    // Firecrawl search + scrape top .gov/permit pages
    const hits = await firecrawlSearch(
      fcKey,
      `${data.jurisdiction} building department permits fees timeline site:.gov OR "permit fees" OR "plan review"`,
      6,
    );
    const preferred = hits
      .filter((h) => /(\.gov|accela|energov|opengov|citizenserve|permitium|mygovernmentonline)/i.test(h.url))
      .slice(0, 3);
    const targets = (preferred.length > 0 ? preferred : hits.slice(0, 3));
    if (targets.length === 0) throw new Error(`No sources found for ${data.jurisdiction}.`);

    const scrapes = await Promise.all(targets.map(async (h) => {
      try {
        const s = await firecrawlScrape(fcKey, h.url);
        return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 3500)}`;
      } catch {
        return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
      }
    }));

    const prompt = `Build a jurisdiction intelligence profile for ${data.jurisdiction}, USA. Use ONLY facts from the sources below. If you don't know, leave the field empty; never fabricate specific fee amounts or code sections.

SOURCES
${scrapes.join("\n\n---\n\n")}

Return ONLY valid JSON of this exact shape:
{
  "name": "City, ST",
  "state": "ST",
  "department": "official building/permit department name",
  "portal_url": "canonical URL for permit search or applications",
  "overview": "2-4 sentence plain-English overview of how this jurisdiction handles permits",
  "permits": [{"name":"Building Permit","when_required":"...","typical_reviewers":"Plan Check, Fire, etc."}],
  "fees": [{"label":"Building permit fee","detail":"formula or 'valuation-based; see fee schedule'"}],
  "timelines": [{"stage":"Plan review","typical_duration":"2-6 weeks"}],
  "contacts": [{"role":"Building Department","detail":"phone / email / address"}],
  "source_urls": ["https://..."]
}`;

    const raw = await callLovableAI(aiKey, [
      { role: "system", content: "You extract structured jurisdiction data. Output valid JSON only, no prose, no fences. Never fabricate specific numbers." },
      { role: "user", content: prompt },
    ]);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    let parsed: z.infer<typeof ProfileExtractionSchema>;
    try { parsed = ProfileExtractionSchema.parse(JSON.parse(cleaned.slice(s, e + 1))); }
    catch { throw new Error("AI returned unparseable profile. Try again."); }

    const payload = {
      slug,
      name: parsed.name || data.jurisdiction,
      state: parsed.state,
      department: parsed.department,
      portal_url: parsed.portal_url,
      overview: parsed.overview,
      permits: parsed.permits,
      fees: parsed.fees,
      timelines: parsed.timelines,
      contacts: parsed.contacts,
      source_urls: parsed.source_urls,
      refreshed_at: new Date().toISOString(),
      created_by: context.userId,
    };

    const { data: row, error } = await context.supabase
      .from("jurisdiction_profiles")
      .upsert(payload, { onConflict: "slug" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });


// ---- Extract permit checklist items from a chat message ----
const ExtractedItem = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  required: z.boolean(),
  why: z.string().max(400).optional(),
});

export const extractChecklistFromMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      content: z.string().min(1).max(20000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    const { data: p } = await context.supabase
      .from("projects").select("name, project_type, location, jurisdiction")
      .eq("id", data.project_id).maybeSingle();
    if (!p) throw new Error("Project not found");

    const { data: existing } = await context.supabase
      .from("permit_items").select("name").eq("project_id", data.project_id);
    const existingNames = (existing ?? []).map((r) => r.name.toLowerCase().trim());

    const prompt = `Extract permit / approval / inspection checklist items mentioned or clearly implied in the assistant reply below, for this project. Return ONLY valid JSON, no prose.

Project: ${p.name}
Type: ${p.project_type}
Location: ${p.location || "unspecified"}
Jurisdiction: ${p.jurisdiction || "unspecified"}

Existing checklist items (do NOT duplicate — case-insensitive name match):
${existingNames.length ? existingNames.map((n) => `- ${n}`).join("\n") : "(none yet)"}

Assistant reply:
"""
${data.content}
"""

Return this JSON shape:
{"items":[{"name":"Building Permit","category":"Building","required":true,"why":"..."}]}

Rules:
- 0 to 12 items. If nothing permit-like was mentioned, return {"items":[]}.
- category is one of: Building, MEP, Fire, Health, Zoning, Sign, Right-of-Way, Grading, Demolition, Stormwater, Historic, Environmental, Occupancy.
- name is the specific permit/approval name; use the local term when jurisdiction is known.
- required=true for likely-required, false for conditional.
- why is one short clause (<160 chars) explaining trigger.
- Do NOT include items whose name already appears in the existing list above.`;

    const raw = await callLovableAI(apiKey, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    let parsed: { items: Array<z.infer<typeof ExtractedItem>> };
    try {
      parsed = JSON.parse(cleaned.slice(s, e + 1));
    } catch {
      throw new Error("AI returned unparseable output. Try again.");
    }
    const items = z.object({ items: z.array(ExtractedItem).max(20) }).parse(parsed).items;
    const filtered = items.filter((it) => !existingNames.includes(it.name.toLowerCase().trim()));
    return { items: filtered };
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


// ---- Address-based live permit lookup (any jurisdiction, no project required) ----
const AddressLookupInput = z.object({
  address: z.string().trim().min(3).max(300),
  jurisdiction: z.string().trim().max(200).optional().default(""),
});

const AddressFindingSchema = z.object({
  permit_number: z.string().default(""),
  permit_type: z.string().default(""),
  status: z.string().default("Unknown"),
  address: z.string().default(""),
  applicant: z.string().default(""),
  filed_date: z.string().default(""),
  updated_date: z.string().default(""),
  description: z.string().default(""),
  source_url: z.string().default(""),
});

const AddressLookupSchema = z.object({
  jurisdiction: z.string(),
  portal_name: z.string(),
  portal_url: z.string(),
  search_url: z.string().default(""),
  findings: z.array(AddressFindingSchema).max(25),
  summary: z.string(),
});

export const lookupPermitsByAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddressLookupInput.parse(input))
  .handler(async ({ data }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const addr = data.address;
    const juris = data.jurisdiction;

    // 1. If no jurisdiction, ask AI to infer city/county/state from the address.
    let jurisdictionGuess = juris;
    if (!jurisdictionGuess) {
      const inferred = await callLovableAI(aiKey, [
        { role: "system", content: "You extract US permit jurisdictions from addresses. Reply with ONLY the jurisdiction in the form 'City, ST' or 'County, ST'. No prose." },
        { role: "user", content: `Address: ${addr}\nJurisdiction:` },
      ]);
      jurisdictionGuess = inferred.trim().split("\n")[0].slice(0, 120);
    }

    // 2. Find the official permit portal for this jurisdiction.
    const portalQuery = `${jurisdictionGuess} building permit search portal site:.gov OR Accela OR energov OR opengov OR citizenserve`;
    const portalHits = await firecrawlSearch(fcKey, portalQuery, 5);
    if (portalHits.length === 0) {
      throw new Error(`No official permit portal found for "${jurisdictionGuess}". Try entering the jurisdiction manually.`);
    }
    const portal = portalHits.find((h) => /(\.gov|accela|energov|opengov|citizenserve|permitium|mygovernmentonline|viewpointcloud)/i.test(h.url)) ?? portalHits[0];

    // 3. Search the web for permit records at this specific address.
    const addressQuery = `"${addr}" permit ${jurisdictionGuess} site:.gov OR accela OR energov OR opengov OR citizenserve`;
    const addressHits = await firecrawlSearch(fcKey, addressQuery, 6).catch(() => []);

    // 4. Scrape portal landing + top address hits.
    const portalScrape = await firecrawlScrape(fcKey, portal.url).catch(() => ({ markdown: "", title: "" }));
    const addressScrapes = (
      await Promise.all(
        addressHits.slice(0, 3).map(async (h) => {
          try {
            const s = await firecrawlScrape(fcKey, h.url);
            return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 2500)}`;
          } catch {
            return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
          }
        }),
      )
    ).join("\n\n---\n\n");

    // 5. Ask AI to extract structured permit records for this address.
    const extractionPrompt = `You are Permivio's live permit lookup. Extract permit records tied to the address below from the real source text provided. Never invent data.

ADDRESS: ${addr}
JURISDICTION (inferred): ${jurisdictionGuess}

OFFICIAL PORTAL CANDIDATE (${portal.url})
${portalScrape.markdown.slice(0, 3500)}

ADDRESS SEARCH RESULTS
${addressScrapes || "(none)"}

Return ONLY valid JSON in this shape:
{
  "jurisdiction": "City, ST (or County, ST)",
  "portal_name": "official department / portal name",
  "portal_url": "canonical portal URL",
  "search_url": "direct URL to search permits by address on this portal, if present in the sources; else empty",
  "findings": [
    {
      "permit_number": "record #",
      "permit_type": "e.g. Building, Electrical, MEP, Certificate of Occupancy",
      "status": "Issued | Under Review | Submitted | Approved | Finaled | Expired | Withdrawn | Unknown",
      "address": "as listed",
      "applicant": "if listed",
      "filed_date": "YYYY-MM-DD or as listed",
      "updated_date": "YYYY-MM-DD or as listed",
      "description": "1 short clause",
      "source_url": "URL from the sources above"
    }
  ],
  "summary": "2-4 sentence plain-English summary. If no records at this exact address were found in source text, say so honestly and direct the user to search_url."
}

RULES
- Only include a finding if the source text clearly shows a permit tied to this address (or a very close match). Otherwise return findings: [].
- Never fabricate a permit number, status, or date.
- portal_url and any source_url must be real URLs from the source text above.`;

    const raw = await callLovableAI(aiKey, [
      { role: "system", content: "You extract structured permit records from live portal text. Output valid JSON only, no prose, no fences." },
      { role: "user", content: extractionPrompt },
    ]);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    let parsed: z.infer<typeof AddressLookupSchema>;
    try {
      parsed = AddressLookupSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
    } catch {
      throw new Error("AI returned unparseable lookup result. Try again or refine the address.");
    }

    return {
      address: addr,
      jurisdiction: parsed.jurisdiction || jurisdictionGuess,
      portal_name: parsed.portal_name || portal.title || portal.url,
      portal_url: parsed.portal_url || portal.url,
      search_url: parsed.search_url,
      findings: parsed.findings,
      summary: parsed.summary,
      searched_at: new Date().toISOString(),
    };
  });

// ---- AI Document Reader ----
const DocAnalysisSchema = z.object({
  summary: z.string(),
  document_type: z.string().default(""),
  action_items: z.array(z.object({
    reviewer: z.string().default(""),
    discipline: z.string().default(""),
    request: z.string(),
    reference: z.string().default(""),
  })).max(30).default([]),
  key_dates: z.array(z.object({ label: z.string(), date: z.string() })).max(10).default([]),
});

export const analyzeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) throw new Error("AI is not configured");

    const { data: doc } = await context.supabase
      .from("project_documents").select("*").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Document not found");

    const { data: signed, error: sErr } = await context.supabase
      .storage.from("project-docs").createSignedUrl(doc.storage_path, 600);
    if (sErr || !signed?.signedUrl) throw new Error("Could not access document");

    const mime = doc.mime_type || "application/pdf";
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      throw new Error("Only PDFs and images can be analyzed right now.");
    }

    const instruction = `You are analyzing a construction / permit document for Permivio. Extract concrete action items a project manager must respond to.

Return ONLY valid JSON in this exact shape:
{
  "summary": "2-4 sentence plain-English summary of what this document is and what it requires.",
  "document_type": "e.g. Plan Review Comments, Correction Letter, Approved Permit, Inspection Report, Fee Invoice",
  "action_items": [
    { "reviewer": "e.g. Mechanical Reviewer", "discipline": "Mechanical | Electrical | Plumbing | Structural | Building | Fire | Zoning | Other", "request": "concrete action, imperative voice", "reference": "sheet #, code section, or page if listed" }
  ],
  "key_dates": [ { "label": "Deadline / Expiration / Inspection", "date": "as printed" } ]
}

Rules: never invent items not in the document. If the document is just an approval with no actions, return action_items: []. Keep each request under 160 characters.`;

    const contentParts: unknown[] = [{ type: "text", text: instruction }];
    if (isImage) {
      contentParts.push({ type: "image_url", image_url: { url: signed.signedUrl } });
    } else {
      // PDF via file part with signed URL fetched by us then base64'd
      const fileResp = await fetch(signed.signedUrl);
      if (!fileResp.ok) throw new Error("Could not download document for analysis");
      const buf = new Uint8Array(await fileResp.arrayBuffer());
      // btoa in chunks to avoid stack blowout
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      const b64 = btoa(bin);
      contentParts.push({
        type: "file",
        file: { filename: doc.name, file_data: `data:${mime};base64,${b64}` },
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You extract structured action items from construction permit documents. Output valid JSON only, no prose, no fences." },
          { role: "user", content: contentParts },
        ],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429) throw new Error("Too many requests — try again shortly.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Please top up.");
      throw new Error(`AI error: ${t.slice(0, 200)}`);
    }
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (j.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    let parsed: z.infer<typeof DocAnalysisSchema>;
    try {
      parsed = DocAnalysisSchema.parse(JSON.parse(cleaned.slice(s, e + 1)));
    } catch {
      throw new Error("AI returned an unreadable analysis. Try again.");
    }

    const { data: updated, error: uErr } = await context.supabase
      .from("project_documents")
      .update({
        ai_summary: parsed.summary,
        ai_action_items: parsed.action_items,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*").single();
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: doc.project_id,
      description: `AI analyzed "${doc.name}" — ${parsed.action_items.length} action item${parsed.action_items.length === 1 ? "" : "s"}.`,
    });

    return { document: updated, analysis: parsed };
  });

// ---- Inspection Mode fields ----
export const updateInspectionFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    checklist: z.array(z.object({
      id: z.string(),
      label: z.string(),
      checked: z.boolean(),
      failed: z.boolean().optional().default(false),
      note: z.string().optional().default(""),
    })).optional(),
    photos: z.array(z.object({ path: z.string(), caption: z.string().optional().default("") })).optional(),
    notes: z.string().max(4000).optional(),
    result: z.string().max(40).optional(),
    status: z.enum(["scheduled", "passed", "failed", "rescheduled", "canceled"]).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const patch: {
      checklist?: typeof data.checklist;
      photos?: typeof data.photos;
      notes?: string;
      result?: string;
      status?: typeof data.status;
      result_date?: string;
    } = {};
    if (data.checklist !== undefined) patch.checklist = data.checklist;
    if (data.photos !== undefined) patch.photos = data.photos;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.result !== undefined) patch.result = data.result;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "passed" || data.status === "failed") {
        patch.result_date = new Date().toISOString().slice(0, 10);
      }
    }
    const { data: row, error } = await context.supabase
      // @ts-expect-error jsonb columns typed loosely
      .from("inspections").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    if (data.status) {
      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: row.project_id,
        description: `Inspection "${row.inspection_type}" marked ${data.status}.`,
      });
    }
    return row;
  });

export const getInspection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("inspections").select("*, projects(name, jurisdiction, location)").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Inspection not found");
    // Sign each photo path
    const photos = Array.isArray(row.photos) ? row.photos as Array<{ path: string; caption?: string }> : [];
    const signed = await Promise.all(photos.map(async (p) => {
      const { data: s } = await context.supabase.storage.from("project-docs").createSignedUrl(p.path, 3600);
      return { ...p, url: s?.signedUrl ?? null };
    }));
    return { ...row, photos: signed };
  });

// ---- Health score (server-computed from project + checklist + deadlines + inspections) ----
export const computeProjectHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [proj, items, dls, insp] = await Promise.all([
      context.supabase.from("projects").select("current_stage, permit_count, permits_issued").eq("id", data.project_id).maybeSingle(),
      context.supabase.from("permit_items").select("status, required").eq("project_id", data.project_id),
      context.supabase.from("deadlines").select("due_date, completed").eq("project_id", data.project_id),
      context.supabase.from("inspections").select("status").eq("project_id", data.project_id),
    ]);
    const project = proj.data;
    const permits = items.data ?? [];
    const deadlines = dls.data ?? [];
    const inspections = insp.data ?? [];

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdue = deadlines.filter((d) => !d.completed && d.due_date && new Date(d.due_date) < today).length;
    const upcoming7 = deadlines.filter((d) => {
      if (d.completed || !d.due_date) return false;
      const diff = (new Date(d.due_date).getTime() - today.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length;

    const requiredCount = permits.filter((p) => p.required).length || permits.length;
    const doneCount = permits.filter((p) => p.status === "issued" || p.status === "approved").length;
    const notStarted = permits.filter((p) => p.status === "not_started").length;
    const inspFailed = inspections.filter((i) => i.status === "failed").length;
    const inspPassed = inspections.filter((i) => i.status === "passed").length;

    // Score: start 100, subtract penalties
    let score = 100;
    score -= overdue * 12;
    score -= upcoming7 * 3;
    score -= inspFailed * 8;
    if (requiredCount > 0) {
      const stalled = notStarted / requiredCount;
      score -= Math.round(stalled * 20);
      const progress = doneCount / requiredCount;
      score += Math.round((progress - 0.5) * 10); // bonus for >50% done, penalty <50%
    }
    if (project && project.permit_count > 0 && project.permits_issued === project.permit_count) score = Math.max(score, 92);
    score = Math.max(0, Math.min(100, score));

    let risk: "low" | "medium" | "high" = "low";
    if (score < 50 || overdue >= 2 || inspFailed >= 2) risk = "high";
    else if (score < 75 || overdue >= 1 || inspFailed >= 1 || upcoming7 >= 3) risk = "medium";

    const reasons: string[] = [];
    if (overdue) reasons.push(`${overdue} overdue deadline${overdue === 1 ? "" : "s"}`);
    if (upcoming7) reasons.push(`${upcoming7} due this week`);
    if (inspFailed) reasons.push(`${inspFailed} failed inspection${inspFailed === 1 ? "" : "s"}`);
    if (inspPassed) reasons.push(`${inspPassed} passed inspection${inspPassed === 1 ? "" : "s"}`);
    if (requiredCount > 0) reasons.push(`${doneCount}/${requiredCount} permits complete`);
    if (reasons.length === 0) reasons.push("No signals yet — add checklist items and deadlines.");

    return { score, risk, reasons, overdue, upcoming7, inspFailed, inspPassed, requiredCount, doneCount };
  });
