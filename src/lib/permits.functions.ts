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

// ---- Chat ----
export const listChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const SendChatInput = z.object({
  content: z.string().min(1).max(2000),
  project_id: z.string().uuid().optional().nullable(),
});

const STAGE_NAMES = ["Pre-Planning", "Plans Submitted", "In Review", "Approved", "Issued"];

async function callLovableAI(apiKey: string, messages: Array<{ role: string; content: string }>) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model: "google/gemini-2.5-pro", messages }),
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

    const { data: history } = await context.supabase
      .from("chat_messages")
      .select("role, content")
      .order("created_at", { ascending: true })
      .limit(30);

    // Optional project context
    let projectContext = "";
    if (data.project_id) {
      const { data: p } = await context.supabase
        .from("projects").select("*").eq("id", data.project_id).maybeSingle();
      if (p) {
        projectContext = `\n\n[Active project context]\n- Name: ${p.name}\n- Type: ${p.project_type}\n- Location: ${p.location || "unspecified"}\n- Jurisdiction: ${p.jurisdiction || "unspecified"}\n- Current stage: ${STAGE_NAMES[p.current_stage]} (${p.current_stage + 1}/5)\n- Permits: ${p.permits_issued}/${p.permit_count} issued\nUse this context when the user's question refers to "this project", "my project", or asks about next steps.`;
      }
    }

    const { data: userMsg, error: uerr } = await context.supabase
      .from("chat_messages")
      .insert({ user_id: context.userId, role: "user", content: data.content })
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
      .insert({ user_id: context.userId, role: "assistant", content: reply })
      .select("*").single();
    if (aerr) throw new Error(aerr.message);

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

export const clearChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("chat_messages").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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
    const patch: Record<string, unknown> = {};
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
    return row;
  });

export const deletePermitItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("permit_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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
    return row;
  });

export const deleteDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("deadlines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

