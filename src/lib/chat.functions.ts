import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getEntitlement, requireFeature } from "@/lib/entitlements";
import { callLovableAI, callGeminiJSON, gatherProjectContext, SYSTEM_PROMPT, loadJurisdictionContextBlock, ExtractedItem } from "@/lib/ai.shared";

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
    let jurisdictionBlock = "";
    const p = thread.projects as { name: string; project_type: string; location: string; jurisdiction: string; current_stage: number; permits_issued: number; permit_count: number } | null;
    if (p) {
      projectContext = `\n\n[Active project context]\n- Name: ${p.name}\n- Type: ${p.project_type}\n- Location: ${p.location || "unspecified"}\n- Jurisdiction: ${p.jurisdiction || "unspecified"}\n- Current stage: ${STAGE_NAMES[p.current_stage]} (${p.current_stage + 1}/5)\n- Permits: ${p.permits_issued}/${p.permit_count} issued\nUse this context when the user's question refers to "this project", "my project", or asks about next steps.`;
      if (p.jurisdiction) {
        const jc = await loadJurisdictionContextBlock(context.supabase, p.jurisdiction);
        jurisdictionBlock = jc.block;
      }
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
      { role: "system", content: SYSTEM_PROMPT + projectContext + jurisdictionBlock },
      ...(history ?? []),
      { role: "user", content: data.content },
    ];

    const reply = await callLovableAI(apiKey, messages, "google/gemini-2.5-flash");

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

    const jc = p.jurisdiction
      ? await loadJurisdictionContextBlock(context.supabase, p.jurisdiction)
      : { block: "", hasData: false, profile: null };

    const userPrompt = `Summarize the concrete next steps for this project.

Project: ${p.name}
Type: ${p.project_type}
Location: ${p.location || "unspecified"}
Jurisdiction: ${p.jurisdiction || "unspecified"}
Current pipeline stage: ${STAGE_NAMES[p.current_stage]} (${p.current_stage + 1} of 5)
Permits issued: ${p.permits_issued} of ${p.permit_count}
Recent activity:
${(recent ?? []).map((a) => `- ${a.description}`).join("\n") || "- (none)"}
${jc.block}

Produce:
1. One short sentence stating exactly where this project stands.
2. A markdown list of the next 3–5 concrete actions the team should take THIS WEEK, given the stage and jurisdiction. Each action starts with a verb. If a jurisdiction-specific submittal is required to advance, name it.
3. A "**Timeline to next milestone**" line with a duration range. Use the JURISDICTION CONTEXT timelines when present (cite the source URL in parentheses); otherwise give a national typical range and label it "estimate".
4. A one-line watch-out (what commonly delays this stage in this jurisdiction).

No preamble, no closing pleasantries.`;

    const reply = await callLovableAI(apiKey, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    return { summary: reply };
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

// ---- Draft client update ----
const ClientUpdateSchema = z.object({
  subject: z.string(),
  body_markdown: z.string(),
  highlights: z.array(z.string()).max(6).default([]),
});

export const draftClientUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    project_id: z.string().uuid(),
    tone: z.enum(["formal", "friendly", "brief"]).default("friendly"),
    audience: z.string().max(120).default("Client / owner"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "aiCopilot");
    const ctx = await gatherProjectContext(context.supabase, data.project_id);

    if (!ctx.project) throw new Error("Project not found");
    const prompt = `Draft a ${data.tone} status update email for ${data.audience} on this permit project.

PROJECT: ${JSON.stringify({ name: ctx.project.name, jurisdiction: ctx.project.jurisdiction, project_type: ctx.project.project_type, location: ctx.project.location, stage: ctx.project.current_stage, status: ctx.project.status })}
PERMITS: ${JSON.stringify(ctx.items.map((i: { name: string; status: string; due_date: string | null }) => ({ name: i.name, status: i.status, due: i.due_date })))}
UPCOMING DEADLINES: ${JSON.stringify(ctx.deadlines.slice(0, 8).map((d: { title: string; due_date: string | null }) => ({ title: d.title, due: d.due_date })))}
RECENT ACTIVITY: ${JSON.stringify(ctx.activity.slice(0, 8).map((a: { description: string }) => a.description))}
INSPECTIONS: ${JSON.stringify(ctx.inspections.slice(0, 5).map((i: { type: string; scheduled_date: string | null; result: string | null }) => ({ type: i.type, date: i.scheduled_date, result: i.result })))}

Return ONLY JSON: { "subject": "...", "body_markdown": "email in markdown with a greeting, 3-5 short paragraphs covering progress / next steps / any blockers / dates, and a professional sign-off placeholder", "highlights": ["bullet 1"] }

Only use facts from the data. If a field is missing, don't fabricate it. Never invent permit numbers or approval dates.`;
    return callGeminiJSON(prompt, "You are a construction project manager writing concise, accurate client updates. Output JSON only.", ClientUpdateSchema);
  });

// ---- Meeting agenda ----
const AgendaSchema = z.object({
  title: z.string(),
  duration_minutes: z.number().int().default(30),
  attendees_suggested: z.array(z.string()).max(10).default([]),
  agenda: z.array(z.object({
    minutes: z.number().int().default(5),
    topic: z.string(),
    notes: z.string().default(""),
  })).max(15).default([]),
  decisions_needed: z.array(z.string()).max(10).default([]),
});

export const generateMeetingAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    project_id: z.string().uuid(),
    meeting_type: z.enum(["kickoff", "weekly_status", "pre_submittal", "review_response", "inspection_prep"]).default("weekly_status"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "aiCopilot");
    const ctx = await gatherProjectContext(context.supabase, data.project_id);

    if (!ctx.project) throw new Error("Project not found");
    const prompt = `Generate a ${data.meeting_type.replace("_", " ")} meeting agenda for this permit project.
PROJECT: ${JSON.stringify({ name: ctx.project.name, jurisdiction: ctx.project.jurisdiction, stage: ctx.project.current_stage })}
PERMITS: ${JSON.stringify(ctx.items.map((i: { name: string; status: string; due_date: string | null }) => ({ name: i.name, status: i.status, due: i.due_date })))}
DEADLINES: ${JSON.stringify(ctx.deadlines.slice(0, 8).map((d: { title: string; due_date: string | null }) => ({ title: d.title, due: d.due_date })))}
INSPECTIONS: ${JSON.stringify(ctx.inspections.slice(0, 5).map((i: { type: string; scheduled_date: string | null; result: string | null }) => ({ type: i.type, date: i.scheduled_date, result: i.result })))}

Return ONLY JSON: { "title": "...", "duration_minutes": 30, "attendees_suggested": ["Owner", "GC", "Architect"], "agenda": [{ "minutes": 5, "topic": "...", "notes": "..." }], "decisions_needed": ["..."] }.`;
    return callGeminiJSON(prompt, "You produce tight, actionable construction meeting agendas. Output JSON only.", AgendaSchema);
  });

// ---- Daily briefing ----
const DailyBriefingSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  focus_today: z.array(z.object({
    project: z.string(),
    action: z.string(),
    why: z.string(),
  })),
  risks: z.array(z.string()),
  wins: z.array(z.string()),
});

export const generateDailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [projs, dls, acts, insp] = await Promise.all([
      context.supabase.from("projects").select("id, name, jurisdiction, project_type, status, current_stage, permit_count, permits_issued").eq("user_id", context.userId),
      context.supabase.from("deadlines").select("title, due_date, project_id").order("due_date", { ascending: true }).limit(30),
      context.supabase.from("activity").select("description, created_at, project_id").order("created_at", { ascending: false }).limit(20),
      context.supabase.from("inspections").select("inspection_type, status, scheduled_date, project_id").order("scheduled_date", { ascending: true }).limit(20),
    ]);
    const projects = projs.data ?? [];
    if (projects.length === 0) {
      return {
        headline: "No projects yet",
        summary: "Create your first project to unlock daily briefings.",
        focus_today: [],
        risks: [],
        wins: [],
        generated_at: new Date().toISOString(),
      };
    }
    const pMap = new Map(projects.map((p) => [p.id, p.name] as const));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const compactDl = (dls.data ?? []).map((d) => ({
      project: (d.project_id && pMap.get(d.project_id)) || "?",
      title: d.title,
      due: d.due_date,
      days: d.due_date ? Math.round((new Date(d.due_date).getTime() - today.getTime()) / 86400000) : null,
    }));
    const compactAct = (acts.data ?? []).map((a) => ({ project: (a.project_id && pMap.get(a.project_id)) || "?", msg: a.description }));
    const compactInsp = (insp.data ?? []).map((i) => ({ project: (i.project_id && pMap.get(i.project_id)) || "?", type: i.inspection_type, status: i.status, when: i.scheduled_date }));

    const prompt = `You are the user's chief-of-staff for commercial permitting. Produce a concise morning briefing.
Today: ${new Date().toISOString().slice(0, 10)}

PROJECTS (${projects.length}):
${JSON.stringify(projects, null, 2)}

UPCOMING/RECENT DEADLINES:
${JSON.stringify(compactDl, null, 2)}

RECENT ACTIVITY:
${JSON.stringify(compactAct, null, 2)}

INSPECTIONS:
${JSON.stringify(compactInsp, null, 2)}

Return ONLY JSON with keys: headline (one line, punchy), summary (2-3 sentences), focus_today (up to 3 items: {project, action, why}), risks (up to 3 short strings), wins (up to 2 short strings). Prioritize overdue and this-week deadlines, failed inspections, and projects with no recent activity.`;

    const brief = await callGeminiJSON(prompt, "You are a decisive commercial permitting chief-of-staff. Return JSON only.", DailyBriefingSchema);
    return { ...brief, generated_at: new Date().toISOString() };
  });
