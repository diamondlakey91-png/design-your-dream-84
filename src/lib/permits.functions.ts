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

