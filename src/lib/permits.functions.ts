import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getEntitlement, requireFeature, requireProjectQuota } from "@/lib/entitlements";


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
    const ent = await getEntitlement(context.supabase, context.userId);
    await requireProjectQuota(context.supabase, context.userId, ent);
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

// ---- Jurisdiction grounding: pull cached profile and format as context ----
function slugifyJurisdiction(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type JProfileRow = {
  name: string; state: string | null; department: string | null; portal_url: string | null;
  overview: string | null;
  permits: Array<{ name: string; when_required?: string; typical_reviewers?: string }> | null;
  fees: Array<{ label: string; detail?: string }> | null;
  timelines: Array<{ stage: string; typical_duration: string }> | null;
  source_urls: string[] | null;
  refreshed_at: string | null;
};

async function loadJurisdictionContextBlock(
  supabase: { from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: JProfileRow | null }> } } } },
  jurisdiction: string,
): Promise<{ block: string; hasData: boolean; profile: JProfileRow | null }> {
  const slug = slugifyJurisdiction(jurisdiction);
  if (!slug) return { block: "", hasData: false, profile: null };
  const { data: profile } = await supabase
    .from("jurisdiction_profiles")
    .select("name, state, department, portal_url, overview, permits, fees, timelines, source_urls, refreshed_at")
    .eq("slug", slug).maybeSingle();
  if (!profile) {
    return {
      block: `\n\n[JURISDICTION CONTEXT for "${jurisdiction}"]\nNo cached jurisdiction profile on file. Use general knowledge for ${jurisdiction} and clearly say when a specific fee, code section, or review duration is not verified. Tell the user they can run "Live Jurisdiction Refresh" from the project page to pull authoritative data.`,
      hasData: false,
      profile: null,
    };
  }
  const permitLines = (profile.permits ?? []).slice(0, 12).map((p) => `- ${p.name}${p.when_required ? ` — when: ${p.when_required}` : ""}${p.typical_reviewers ? ` — reviewers: ${p.typical_reviewers}` : ""}`).join("\n") || "(none cached)";
  const feeLines = (profile.fees ?? []).slice(0, 10).map((f) => `- ${f.label}${f.detail ? ` — ${f.detail}` : ""}`).join("\n") || "(none cached)";
  const timelineLines = (profile.timelines ?? []).slice(0, 10).map((t) => `- ${t.stage}: ${t.typical_duration}`).join("\n") || "(none cached)";
  const sources = (profile.source_urls ?? []).slice(0, 8).map((u) => `- ${u}`).join("\n") || "(none)";
  const block = `\n\n[JURISDICTION CONTEXT — ${profile.name}${profile.state ? `, ${profile.state}` : ""}${profile.refreshed_at ? ` · refreshed ${profile.refreshed_at.slice(0,10)}` : ""}]
Department: ${profile.department ?? "Building Department"}
Portal: ${profile.portal_url ?? "(unknown)"}
Overview: ${profile.overview ?? ""}
Permits typically required:
${permitLines}
Fees:
${feeLines}
Review timelines (typical):
${timelineLines}
Sources (cite these URLs by number when you use their facts):
${sources}

Rules for using this context:
- Prefer facts from this block over generic knowledge.
- When you quote a duration, fee, or requirement from this block, append the source URL in parentheses.
- If a stage/fee is not listed, say "not cached for this jurisdiction — verify with the portal above" instead of guessing a number.`;
  return { block, hasData: true, profile };
}

const SYSTEM_PROMPT = `You are the Permivio Permit Assistant — a specialist that helps contractors, architects, and developers identify the building, trade, planning, and regulatory permits required for construction projects in specific United States jurisdictions.

Core rules:
- Anchor every answer to the jurisdiction the user names (city + state, or county). If they didn't name one, ask for it before listing permits.
- If a [JURISDICTION CONTEXT] block is provided below, treat it as the source of truth. Cite its source URLs in parentheses next to any specific fee, timeline, or requirement you use from it.
- Cite the responsible department by name when you know it (e.g. "LADBS", "NYC DOB", "Dallas Development Services", "Chicago Department of Buildings", "SF DBI"). If uncertain, say "the local Building Department" — never invent a department name.
- Distinguish permit types: building, MEP (mechanical/electrical/plumbing), fire, health, zoning/planning, sign, right-of-way/encroachment, grading, demolition, stormwater/SWPPP, ADA, historic review, environmental (CEQA/NEPA), and Certificate of Occupancy.
- Note when a permit typically requires stamped drawings from a licensed architect or engineer, and when a licensed contractor of record is required.
- Flag common jurisdiction-specific quirks when relevant (e.g. Title 24 energy in California, LL97 in NYC, Chapter 11B in California, Florida wind-load, coastal commission, historic districts).
- Be explicit about what you don't know. If a rule depends on scope you weren't told (square footage, occupancy type, change of use, tenant improvement vs. new build), ask a focused follow-up.
- Never fabricate fee amounts, review timelines, or code section numbers. If no [JURISDICTION CONTEXT] block is provided and you don't have verified data, give a national typical range and label it as an estimate, then recommend running "Live Jurisdiction Refresh" from the project page.

Timeline questions:
- When asked "how long will this take", produce a phased estimate: Intake/Completeness → Plan Review (per discipline) → Corrections/Resubmittal → Approval/Issuance → Inspections → CO.
- Use durations from the [JURISDICTION CONTEXT] block when present; otherwise state a typical national range (e.g. "residential alteration: 2–6 weeks plan review; commercial new build: 8–20 weeks") and mark it "estimate — verify locally".
- Always add a total elapsed-time range and call out variables that shift it (resubmittals, third-party review, fire marshal, historic).

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
  match_confidence: z.enum(["high", "medium", "low"]).default("medium"),
  match_score: z.number().min(0).max(100).default(60),
  match_reason: z.string().default(""),
});

const AddressLookupSchema = z.object({
  jurisdiction: z.string(),
  portal_name: z.string(),
  portal_url: z.string(),
  search_url: z.string().default(""),
  findings: z.array(AddressFindingSchema).max(25),
  summary: z.string(),
  overall_confidence: z.enum(["high", "medium", "low", "none"]).default("medium"),
  no_match_reason: z.string().default(""),
  sources_scanned: z.object({
    official_portal: z.boolean().default(false),
    direct_portal_search: z.boolean().default(false),
    web_search: z.boolean().default(false),
  }).default({ official_portal: false, direct_portal_search: false, web_search: false }),
});

// Direct portal search URL templates for jurisdictions where the public portal
// is not well-indexed by Google (Accela, EnerGov, etc). Extend as needed —
// each entry returns URLs we can hand to Firecrawl to scrape address-scoped
// search results directly from the source of truth.
function buildDirectPortalSearchUrls(jurisdiction: string, address: string): string[] {
  const j = jurisdiction.toLowerCase();
  const streetOnly = address.replace(/,.*$/, "").trim();
  const enc = encodeURIComponent(streetOnly);
  const urls: string[] = [];

  if (/baltimore(\s+city)?,\s*md/.test(j)) {
    // Baltimore City ePermits — Accela Citizen Access global search
    urls.push(`https://cels.baltimorehousing.org/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/baltimore\s+county,\s*md/.test(j)) {
    urls.push(`https://permits.baltimorecountymd.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/washington,?\s*dc|district of columbia/.test(j)) {
    urls.push(`https://eservices.dcra.dc.gov/DCRAPermitApplicationSearch/Search/Permit?address=${enc}`);
  }
  if (/new york,?\s*ny|nyc/.test(j)) {
    urls.push(`https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?requestid=1&allbin=&houseno=${enc}`);
  }
  if (/los angeles,?\s*ca/.test(j)) {
    urls.push(`https://www.ladbsservices2.lacity.org/OnlineServices/PermitReport/PermitReportAddress?address=${enc}`);
  }
  if (/chicago,?\s*il/.test(j)) {
    urls.push(`https://webapps1.chicago.gov/buildingrecords/?addr=${enc}`);
  }
  if (/san francisco,?\s*ca/.test(j)) {
    urls.push(`https://dbiweb02.sfgov.org/dbipts/default.aspx?page=AddressLookup&Address=${enc}`);
  }
  if (/seattle,?\s*wa/.test(j)) {
    urls.push(`https://cosaccela.seattle.gov/portal/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/boston,?\s*ma/.test(j)) {
    urls.push(`https://www.boston.gov/permits?search=${enc}`);
  }
  if (/austin,?\s*tx/.test(j)) {
    urls.push(`https://abc.austintexas.gov/web/permit/public-search-other?reset=true&t_selected_search=CAP&t_selected_property=STREET_NUMBER&t_selected_permit_type=BP&t_STREET_NUMBER=${enc}`);
  }
  if (/miami,?\s*fl/.test(j)) {
    urls.push(`https://apps.miamigov.com/eBuilding/PropertySearch.aspx?address=${enc}`);
  }
  if (/philadelphia,?\s*pa/.test(j)) {
    urls.push(`https://eclipse.phila.gov/phillylmsprod/int/lms/Login.aspx#address=${enc}`);
  }
  // Virginia
  if (/arlington(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ARLINGTON/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
    urls.push(`https://permits.arlingtonva.us/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/fairfax(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://www.fairfaxcounty.gov/plan2build/permit-status?address=${enc}`);
    urls.push(`https://aca-prod.accela.com/FFXC/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/loudoun(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://aca-prod.accela.com/LOUDOUN/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/prince\s+william(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://eservices.pwcgov.org/BuildingDevelopment/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/alexandria,?\s*va/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ALEXANDRIA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/richmond,?\s*va/.test(j)) {
    urls.push(`https://energov.richmondgov.com/EnerGov_Prod/SelfService#/search?searchText=${enc}`);
  }
  if (/virginia\s+beach,?\s*va/.test(j)) {
    urls.push(`https://energov.vbgov.com/EnerGov_Prod/SelfService#/search?searchText=${enc}`);
  }
  // Additional major jurisdictions
  if (/houston,?\s*tx/.test(j)) {
    urls.push(`https://ipermits.houstontx.gov/publicsearch/PermitSearch?SearchText=${enc}`);
  }
  if (/dallas,?\s*tx/.test(j)) {
    urls.push(`https://developdallas.dallascityhall.com/publicsearch/PermitSearch?SearchText=${enc}`);
  }
  if (/phoenix,?\s*az/.test(j)) {
    urls.push(`https://apps-secure.phoenix.gov/PDD/Search/Permits?address=${enc}`);
  }
  if (/san\s+diego,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/SANDIEGO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/denver,?\s*co/.test(j)) {
    urls.push(`https://aca-prod.accela.com/denver/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/atlanta,?\s*ga/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ATLANTA_GA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/portland,?\s*or/.test(j)) {
    urls.push(`https://www.portlandmaps.com/search/?query=${enc}`);
  }
  if (/minneapolis,?\s*mn/.test(j)) {
    urls.push(`https://aca-prod.accela.com/MINNEAPOLIS/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/nashville,?\s*tn|davidson\s+county,?\s*tn/.test(j)) {
    urls.push(`https://epermits.nashville.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/charlotte,?\s*nc|mecklenburg,?\s*nc/.test(j)) {
    urls.push(`https://aca-prod.accela.com/CLTNC/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/raleigh,?\s*nc/.test(j)) {
    urls.push(`https://aca-prod.accela.com/RALEIGH/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }

  // Generic Accela guess for any jurisdiction not hardcoded above (~thousands of
  // agencies run on Accela Civic Platform at aca-prod.accela.com/<AGENCY>/). Uses
  // a slugified jurisdiction name so we always have at least one portal-side URL
  // to hand Firecrawl, instead of relying solely on web search.
  if (urls.length === 0) {
    const slug = jurisdiction
      .toLowerCase()
      .replace(/,.*$/, "")
      .replace(/\bcounty\b/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24);
    if (slug) {
      urls.push(`https://aca-prod.accela.com/${slug.toUpperCase()}/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
    }
  }

  return urls;
}



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

    // 2b. Known-jurisdiction direct search URLs. Many municipal portals (Accela,
    // EnerGov, etc.) do not expose individual permit records to Google, so
    // address-only web search misses active applications. For jurisdictions we
    // know, hit the portal's own search endpoint directly.
    const directSearchUrls = buildDirectPortalSearchUrls(jurisdictionGuess, addr);

    // 3. Search the web for permit records at this specific address.
    // Try multiple address variants to catch differing portal formats.
    const streetOnly = addr.replace(/,.*$/, "").trim(); // "1603 Whetstone Way"
    const cityState = jurisdictionGuess;
    const addressQueries = [
      `"${addr}" permit ${cityState}`,
      `"${streetOnly}" permit ${cityState} site:.gov`,
      `"${streetOnly}" ${cityState} accela OR energov OR opengov OR citizenserve OR permits`,
    ];
    const addressHitsNested = await Promise.all(
      addressQueries.map((q) => firecrawlSearch(fcKey, q, 5).catch(() => [])),
    );
    const seenUrls = new Set<string>();
    const addressHits = addressHitsNested.flat().filter((h) => {
      if (seenUrls.has(h.url)) return false;
      seenUrls.add(h.url);
      return true;
    });

    // 4. Scrape portal landing + direct portal search URLs + top address hits.
    const portalScrape = await firecrawlScrape(fcKey, portal.url).catch(() => ({ markdown: "", title: "" }));
    const directScrapes = (
      await Promise.all(
        directSearchUrls.map(async (u: string) => {
          try {
            const s = await firecrawlScrape(fcKey, u);
            return `DIRECT PORTAL SEARCH: ${u}\n${s.markdown.slice(0, 4000)}`;
          } catch {
            return "";
          }
        }),
      )
    ).filter(Boolean).join("\n\n---\n\n");
    const addressScrapes = (
      await Promise.all(
        addressHits.slice(0, 4).map(async (h) => {
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

DIRECT PORTAL SEARCH RESULTS (authoritative — prefer these over web search when present)
${directScrapes || "(none)"}

ADDRESS SEARCH RESULTS (web)
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
      "source_url": "URL from the sources above",
      "match_confidence": "high | medium | low",
      "match_score": 0-100,
      "match_reason": "1 sentence: exactly why this record matches (or partially matches) the queried address. Cite the field that matched: full street number + name, street only, block range, parcel/APN, unit, etc."
    }
  ],
  "summary": "2-4 sentence plain-English summary explaining what was found and how well it matches.",
  "overall_confidence": "high | medium | low | none",
  "no_match_reason": "If findings is empty OR overall_confidence is low/none, explain in 1-2 sentences WHY (e.g. 'Portal returned zero rows for this street number', 'Only nearby addresses on the same block appeared', 'Portal requires interactive session Firecrawl cannot render'). Empty string if high/medium confidence.",
  "sources_scanned": {
    "official_portal": ${portalScrape.markdown ? "true" : "false"},
    "direct_portal_search": ${directScrapes ? "true" : "false"},
    "web_search": ${addressScrapes ? "true" : "false"}
  }
}

MATCH SCORING RULES
- high (85-100): permit's address string contains the exact street number AND street name from the query.
- medium (55-84): street name matches and street number is within the same block range (e.g. 1601-1699), OR parcel/APN matches, OR record explicitly names the property.
- low (1-54): only the street name matches (different number), or the source is a summary/news article referencing the address without a portal record.
- Never include a finding with match_score < 25. Drop it and mention in no_match_reason instead.

RULES
- Only include a finding if the source text clearly shows a permit tied to this address (or a very close match). Otherwise return findings: [].
- Never fabricate a permit number, status, or date.
- portal_url and any source_url must be real URLs from the source text above.
- Always populate match_reason with a specific, verifiable justification — never generic ("looks similar").`;

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
      search_url: parsed.search_url || directSearchUrls[0] || "",
      findings: parsed.findings,
      summary: parsed.summary,
      overall_confidence: parsed.overall_confidence,
      no_match_reason: parsed.no_match_reason,
      sources_scanned: {
        official_portal: Boolean(portalScrape.markdown),
        direct_portal_search: Boolean(directScrapes),
        web_search: Boolean(addressScrapes),
      },
      searched_at: new Date().toISOString(),
    };
  });

// ---- Permit-number lookup + live tracking ----

// Build direct portal URLs for searching by permit / record number.
// Most Accela agencies accept the record # in QueryText; EnerGov uses searchText.
function buildDirectPortalUrlsForPermitNumber(jurisdiction: string, permitNumber: string): string[] {
  const j = jurisdiction.toLowerCase();
  const enc = encodeURIComponent(permitNumber.trim());
  const urls: string[] = [];

  const accela = (agency: string) =>
    `https://aca-prod.accela.com/${agency}/Cap/GlobalSearchResults.aspx?QueryText=${enc}`;
  const energov = (host: string) =>
    `https://${host}/EnerGov_Prod/SelfService#/search?searchText=${enc}`;

  if (/baltimore(\s+city)?,\s*md/.test(j)) urls.push(`https://cels.baltimorehousing.org/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/baltimore\s+county,\s*md/.test(j)) urls.push(`https://permits.baltimorecountymd.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/washington,?\s*dc|district of columbia/.test(j)) urls.push(`https://eservices.dcra.dc.gov/DCRAPermitApplicationSearch/Search/Permit?permitNumber=${enc}`);
  if (/new york,?\s*ny|nyc/.test(j)) urls.push(`https://a810-bisweb.nyc.gov/bisweb/JobsQueryByNumberServlet?passjobnumber=${enc}`);
  if (/los angeles,?\s*ca/.test(j)) urls.push(`https://www.ladbsservices2.lacity.org/OnlineServices/PermitReport/PermitReportPermitNumber?permitnumber=${enc}`);
  if (/chicago,?\s*il/.test(j)) urls.push(`https://webapps1.chicago.gov/buildingrecords/?pmt=${enc}`);
  if (/san francisco,?\s*ca/.test(j)) urls.push(`https://dbiweb02.sfgov.org/dbipts/default.aspx?page=PermitDetails&PermitNumber=${enc}`);
  if (/seattle,?\s*wa/.test(j)) urls.push(`https://cosaccela.seattle.gov/portal/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/boston,?\s*ma/.test(j)) urls.push(`https://www.boston.gov/permits?search=${enc}`);
  if (/austin,?\s*tx/.test(j)) urls.push(`https://abc.austintexas.gov/web/permit/public-search-other?reset=true&t_selected_search=CAP&t_CAP_NUMBER=${enc}`);
  if (/miami,?\s*fl/.test(j)) urls.push(`https://apps.miamigov.com/eBuilding/PermitSearch.aspx?permit=${enc}`);
  if (/philadelphia,?\s*pa/.test(j)) urls.push(`https://eclipse.phila.gov/phillylmsprod/int/lms/Login.aspx#permit=${enc}`);
  if (/arlington(\s+county)?,?\s*va/.test(j)) { urls.push(accela("ARLINGTON")); urls.push(`https://permits.arlingtonva.us/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`); }
  if (/fairfax(\s+county)?,?\s*va/.test(j)) urls.push(accela("FFXC"));
  if (/loudoun(\s+county)?,?\s*va/.test(j)) urls.push(accela("LOUDOUN"));
  if (/prince\s+william(\s+county)?,?\s*va/.test(j)) urls.push(`https://eservices.pwcgov.org/BuildingDevelopment/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/alexandria,?\s*va/.test(j)) urls.push(accela("ALEXANDRIA"));
  if (/richmond,?\s*va/.test(j)) urls.push(energov("energov.richmondgov.com"));
  if (/virginia\s+beach,?\s*va/.test(j)) urls.push(energov("energov.vbgov.com"));
  if (/houston,?\s*tx/.test(j)) urls.push(`https://ipermits.houstontx.gov/publicsearch/PermitSearch?SearchText=${enc}`);
  if (/dallas,?\s*tx/.test(j)) urls.push(`https://developdallas.dallascityhall.com/publicsearch/PermitSearch?SearchText=${enc}`);
  if (/phoenix,?\s*az/.test(j)) urls.push(`https://apps-secure.phoenix.gov/PDD/Search/Permits?permit=${enc}`);
  if (/san\s+diego,?\s*ca/.test(j)) urls.push(accela("SANDIEGO"));
  if (/denver,?\s*co/.test(j)) urls.push(accela("denver"));
  if (/atlanta,?\s*ga/.test(j)) urls.push(accela("ATLANTA_GA"));
  if (/minneapolis,?\s*mn/.test(j)) urls.push(accela("MINNEAPOLIS"));
  if (/nashville,?\s*tn|davidson\s+county,?\s*tn/.test(j)) urls.push(`https://epermits.nashville.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/charlotte,?\s*nc|mecklenburg,?\s*nc/.test(j)) urls.push(accela("CLTNC"));
  if (/raleigh,?\s*nc/.test(j)) urls.push(accela("RALEIGH"));

  // Generic Accela fallback for any jurisdiction not hardcoded.
  if (urls.length === 0) {
    const slug = jurisdiction.toLowerCase().replace(/,.*$/, "").replace(/\bcounty\b/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 24);
    if (slug) urls.push(accela(slug.toUpperCase()));
  }
  return urls;
}

const PermitNumberLookupInput = z.object({
  jurisdiction: z.string().trim().min(2).max(200),
  permit_number: z.string().trim().min(2).max(80),
});

const PermitNumberSchema = z.object({
  permit_number: z.string().default(""),
  permit_type: z.string().default(""),
  status: z.string().default("Unknown"),
  address: z.string().default(""),
  applicant: z.string().default(""),
  filed_date: z.string().default(""),
  updated_date: z.string().default(""),
  issued_date: z.string().default(""),
  expiration_date: z.string().default(""),
  next_inspection: z.string().default(""),
  description: z.string().default(""),
  fees_due: z.string().default(""),
  reviewers: z.array(z.object({ discipline: z.string(), status: z.string(), name: z.string().default("") })).max(20).default([]),
  timeline: z.array(z.object({ date: z.string(), event: z.string() })).max(30).default([]),
  source_url: z.string().default(""),
  portal_name: z.string().default(""),
  jurisdiction: z.string().default(""),
  found: z.boolean().default(false),
  no_match_reason: z.string().default(""),
});

async function scrapePermitByNumber(fcKey: string, aiKey: string, jurisdiction: string, permitNumber: string) {
  const urls = buildDirectPortalUrlsForPermitNumber(jurisdiction, permitNumber);
  const scrapes = (await Promise.all(
    urls.map(async (u) => {
      try {
        const s = await firecrawlScrape(fcKey, u);
        return `PORTAL URL: ${u}\n${(s.markdown || "").slice(0, 5000)}`;
      } catch { return ""; }
    })
  )).filter(Boolean).join("\n\n---\n\n");

  // Also do a targeted web search in case the direct URLs miss.
  const webHits = await firecrawlSearch(fcKey, `"${permitNumber}" ${jurisdiction} permit site:.gov OR accela OR energov`, 5).catch(() => []);
  const webScrapes = (await Promise.all(
    webHits.slice(0, 3).map(async (h) => {
      try {
        const s = await firecrawlScrape(fcKey, h.url);
        return `WEB: ${h.url}\n${(s.markdown || "").slice(0, 2500)}`;
      } catch { return `WEB: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`; }
    })
  )).join("\n\n---\n\n");

  const prompt = `Extract the live status of a specific permit from the source text. Never invent data.

JURISDICTION: ${jurisdiction}
PERMIT NUMBER: ${permitNumber}

DIRECT PORTAL SOURCES (authoritative):
${scrapes || "(none)"}

WEB SOURCES:
${webScrapes || "(none)"}

Return ONLY JSON:
{
  "permit_number": "as listed (should match query)",
  "permit_type": "e.g. Building, Electrical, MEP, Grading, CofO",
  "status": "Issued | Under Review | Submitted | Approved | Finaled | Expired | Withdrawn | Plan Review | Ready to Issue | Unknown",
  "address": "as listed",
  "applicant": "if listed",
  "filed_date": "YYYY-MM-DD or as listed",
  "updated_date": "YYYY-MM-DD or as listed",
  "issued_date": "YYYY-MM-DD or empty",
  "expiration_date": "YYYY-MM-DD or empty",
  "next_inspection": "if listed, else empty",
  "description": "1 short clause",
  "fees_due": "if listed, else empty",
  "reviewers": [{"discipline": "Fire / Zoning / Structural", "status": "Approved | Pending | Rejected", "name": ""}],
  "timeline": [{"date": "YYYY-MM-DD", "event": "what happened"}],
  "source_url": "canonical URL from sources above",
  "portal_name": "portal or department name",
  "jurisdiction": "${jurisdiction}",
  "found": true or false,
  "no_match_reason": "1 sentence if not found; empty otherwise"
}`;

  const raw = await callLovableAI(aiKey, [
    { role: "system", content: "You extract structured live permit status from real portal text. Output valid JSON only, no prose, no fences." },
    { role: "user", content: prompt },
  ]);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const parsed = PermitNumberSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
  return { parsed, sourceUrls: urls };
}

export const lookupPermitByNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PermitNumberLookupInput.parse(input))
  .handler(async ({ data }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");
    const { parsed, sourceUrls } = await scrapePermitByNumber(fcKey, aiKey, data.jurisdiction, data.permit_number);
    return { ...parsed, tried_urls: sourceUrls, searched_at: new Date().toISOString() };
  });

export const linkPermitToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      permit_number: z.string().trim().min(2).max(80),
      jurisdiction: z.string().trim().min(2).max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const { data: proj, error: pErr } = await context.supabase
      .from("projects").select("id, jurisdiction, name").eq("id", data.project_id).maybeSingle();
    if (pErr || !proj) throw new Error("Project not found");
    const juris = (data.jurisdiction || proj.jurisdiction || "").trim();
    if (!juris) throw new Error("Project has no jurisdiction. Set one first.");

    const { parsed } = await scrapePermitByNumber(fcKey, aiKey, juris, data.permit_number);

    const { error: uErr } = await context.supabase
      .from("projects")
      .update({
        linked_permit_number: data.permit_number,
        linked_permit_url: parsed.source_url || null,
        linked_permit_data: parsed,
        linked_permit_synced_at: new Date().toISOString(),
      })
      .eq("id", data.project_id);
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: parsed.found
        ? `Linked live permit ${data.permit_number} (${parsed.status}) from ${parsed.portal_name || juris}.`
        : `Linked permit ${data.permit_number} but no live record found yet.`,
    });

    return { linked: parsed };
  });

export const refreshLinkedPermit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const { data: proj, error: pErr } = await context.supabase
      .from("projects").select("id, jurisdiction, linked_permit_number").eq("id", data.project_id).maybeSingle();
    if (pErr || !proj) throw new Error("Project not found");
    if (!proj.linked_permit_number) throw new Error("No permit is linked to this project.");
    const juris = proj.jurisdiction || "";
    if (!juris) throw new Error("Project has no jurisdiction.");

    const { parsed } = await scrapePermitByNumber(fcKey, aiKey, juris, proj.linked_permit_number);
    const { error: uErr } = await context.supabase
      .from("projects")
      .update({
        linked_permit_url: parsed.source_url || null,
        linked_permit_data: parsed,
        linked_permit_synced_at: new Date().toISOString(),
      })
      .eq("id", data.project_id);
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Refreshed live permit ${proj.linked_permit_number} — status ${parsed.status}.`,
    });
    return { linked: parsed };
  });

export const unlinkPermit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({
        linked_permit_number: null,
        linked_permit_url: null,
        linked_permit_data: null,
        linked_permit_synced_at: null,
      })
      .eq("id", data.project_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


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
    requireFeature(await getEntitlement(context.supabase, context.userId), "docReader");
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

// ============= AI Plan Review =============
const PlanReviewSchema = z.object({
  overall_summary: z.string().default(""),
  overall_risk: z.enum(["low", "medium", "high"]).default("medium"),
  sheets_detected: z.array(z.string()).max(50).default([]),
  jurisdiction_context: z.object({
    jurisdiction: z.string().default(""),
    applied_amendments: z.array(z.string()).max(30).default([]),
    source_urls: z.array(z.string()).max(15).default([]),
  }).default({ jurisdiction: "", applied_amendments: [], source_urls: [] }),
  findings: z.array(z.object({
    category: z.enum(["missing_exits", "ada", "fire_code", "permitting_mistake", "other"]),
    severity: z.enum(["low", "medium", "high"]).default("medium"),
    title: z.string(),
    detail: z.string(),
    code_reference: z.string().default(""),
    local_amendment: z.string().default(""),
    sheet_reference: z.string().default(""),
    recommendation: z.string().default(""),
    // Location on the plan for visual markup (page is 1-indexed; bbox is normalized 0-1
    // with origin top-left). All optional — omit when the AI can't localize the issue.
    page: z.number().int().min(1).max(500).optional(),
    bbox: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    }).optional(),
  })).max(60).default([]),
});

// Fetch jurisdiction-specific code amendments (works for any of 20k+ US jurisdictions).
// Returns a compact markdown context block or "" if nothing usable was found.
async function fetchJurisdictionAmendments(
  fcKey: string | undefined,
  jurisdiction: string,
): Promise<{ context: string; sources: string[] }> {
  if (!fcKey || !jurisdiction || jurisdiction === "the local jurisdiction") {
    return { context: "", sources: [] };
  }
  const queries = [
    `"${jurisdiction}" building code local amendments site:.gov`,
    `"${jurisdiction}" fire code amendments OR ordinance site:.gov`,
    `"${jurisdiction}" accessibility OR ADA amendments code site:.gov`,
  ];
  const searches = await Promise.all(
    queries.map((q) => firecrawlSearch(fcKey, q, 3).catch(() => [])),
  );
  const seen = new Set<string>();
  const candidates: Array<{ url: string; title?: string; description?: string }> = [];
  for (const hits of searches) {
    for (const h of hits) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      if (/(\.gov|municode|ecode360|codepublishing|amlegal|generalcode)/i.test(h.url)) {
        candidates.push(h);
      }
    }
  }
  const targets = candidates.slice(0, 3);
  if (targets.length === 0) return { context: "", sources: [] };

  const scrapes = await Promise.all(targets.map(async (h) => {
    try {
      const s = await firecrawlScrape(fcKey, h.url);
      return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 2800)}`;
    } catch {
      return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
    }
  }));
  return { context: scrapes.join("\n\n---\n\n"), sources: targets.map((t) => t.url) };
}


// Internal: run plan review for one document. Reused by reviewPlan + batchReviewPlans.
async function runPlanReviewForDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  docId: string,
) {
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!aiKey) throw new Error("AI is not configured");
  const fcKey = process.env.FIRECRAWL_API_KEY;

  const { data: doc } = await supabase.from("project_documents").select("*").eq("id", docId).maybeSingle();
  if (!doc) throw new Error("Document not found");

  const { data: project } = await supabase
    .from("projects").select("name, jurisdiction, project_type, location")
    .eq("id", doc.project_id).maybeSingle();

  const { data: signed, error: sErr } = await supabase
    .storage.from("project-docs").createSignedUrl(doc.storage_path, 600);
  if (sErr || !signed?.signedUrl) throw new Error("Could not access document");

  const mime = doc.mime_type || "application/pdf";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
  if (!isImage && !isPdf) throw new Error("Only PDF or image plans can be reviewed.");

  const juris = project?.jurisdiction || "the local jurisdiction";
  const ptype = project?.project_type || "the project";

  let profileContext = "";
  if (project?.jurisdiction) {
    const { data: prof } = await supabase
      .from("jurisdiction_profiles")
      .select("name, state, department, overview, permits, fees, timelines, source_urls")
      .eq("slug", toSlug(project.jurisdiction))
      .maybeSingle();
    if (prof) profileContext = `CACHED JURISDICTION PROFILE\n${JSON.stringify(prof).slice(0, 2500)}`;
  }

  const { context: amendmentsContext, sources: amendmentSources } =
    await fetchJurisdictionAmendments(fcKey, juris);

  const jurisBlock = [profileContext, amendmentsContext].filter(Boolean).join("\n\n===\n\n");

  const instruction = `You are a licensed plan reviewer analyzing construction drawings for ${ptype} in ${juris}. Review the attached plan set for issues that THIS jurisdiction's plan checker would flag — using the jurisdiction's LOCAL amendments to the model codes wherever provided below, not just the base IBC/IFC/ADA.

${jurisBlock ? `JURISDICTION-SPECIFIC CONTEXT (authoritative — prefer over model-code defaults when they conflict):\n${jurisBlock}\n\n` : `No cached jurisdictional data was available. Apply the currently adopted code cycle for ${juris} (state-adopted IBC/IFC/IECC + any local amendments you are confident about). If unsure which cycle applies, cite the model code and note "verify local amendment".\n\n`}Focus on FOUR categories:
1. missing_exits — insufficient exits, exit access travel distance, dead-end corridors, exit width, exit signage/illumination (IBC Ch.10 + local amendments).
2. ada — accessibility: door clearances, ramp slopes, restroom fixture clearances, accessible route, parking, reach ranges, signage (ADA 2010 / ICC A117.1 + state accessibility code, e.g. CBC 11B in CA, TAS in TX, MAAB in MA, NYC Ch.11).
3. fire_code — fire separation, occupancy separation, sprinkler/alarm coverage, fire-rated assemblies, hydrant/FDC access (IBC Ch.7-9, IFC + local fire amendments).
4. permitting_mistake — missing sheets, incomplete title block, missing code analysis, unstamped drawings, missing energy compliance (IECC or state equivalent — e.g. Title 24 CA, Stretch Code MA), zoning setbacks, jurisdiction-specific submittal requirements.

Return ONLY valid JSON in this exact shape (no fences, no prose):
{
  "overall_summary": "3-5 sentence assessment referencing the jurisdiction",
  "overall_risk": "low" | "medium" | "high",
  "sheets_detected": ["A0.0", "A1.1", ...],
  "jurisdiction_context": {
    "jurisdiction": "${juris}",
    "applied_amendments": ["short label of each local amendment or code cycle you applied"],
    "source_urls": ${JSON.stringify(amendmentSources)}
  },
  "findings": [
    {
      "category": "missing_exits" | "ada" | "fire_code" | "permitting_mistake" | "other",
      "severity": "low" | "medium" | "high",
      "title": "short label (<80 chars)",
      "detail": "what is wrong and where (<240 chars)",
      "code_reference": "model code, e.g. IBC 1006.2.1 or ADA 404.2.3",
      "local_amendment": "jurisdiction-specific amendment/section if applicable, else ''",
      "sheet_reference": "e.g. A2.1 or 'not shown'",
      "recommendation": "concrete fix (<200 chars)",
      "page": 1,
      "bbox": { "x": 0.12, "y": 0.34, "w": 0.18, "h": 0.09 }
    }
  ]
}

Rules: only flag issues you can actually see or reasonably infer from the plan. If the plan appears compliant in a category, omit it. Never fabricate specific code sections or local amendment numbers — leave those fields blank if unsure. If the document is not a plan set, return findings: [] and explain in overall_summary.

LOCATION (VERY IMPORTANT for markup): for every finding you visually identify on a sheet, include:
- "page": the 1-indexed page number of the PDF (or 1 for a single image) that contains the issue.
- "bbox": normalized box coordinates {x, y, w, h} in [0,1], where (0,0) is the TOP-LEFT of that page/image, x+w and y+h must stay <= 1, and the box tightly frames the problem region (e.g. the missing exit, the non-compliant door, the fire-rated wall). Do not include a bbox that fills the whole page; leave bbox off entirely if you can't localize the issue.`;

  const contentParts: unknown[] = [{ type: "text", text: instruction }];
  if (isImage) {
    contentParts.push({ type: "image_url", image_url: { url: signed.signedUrl } });
  } else {
    const fileResp = await fetch(signed.signedUrl);
    if (!fileResp.ok) throw new Error("Could not download plan for review");
    const buf = new Uint8Array(await fileResp.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    contentParts.push({ type: "file", file: { filename: doc.name, file_data: `data:${mime};base64,${b64}` } });
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: "You are a senior plan reviewer. Output valid JSON only, no prose, no code fences." },
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
  let parsed: z.infer<typeof PlanReviewSchema>;
  try {
    parsed = PlanReviewSchema.parse(JSON.parse(cleaned.slice(s, e + 1)));
  } catch {
    throw new Error("AI returned an unreadable review. Try again.");
  }

  const { data: updated, error: uErr } = await supabase
    .from("project_documents")
    .update({ plan_review: parsed, plan_reviewed_at: new Date().toISOString() })
    .eq("id", docId).select("*").single();
  if (uErr) throw new Error(uErr.message);

  const high = parsed.findings.filter(f => f.severity === "high").length;
  await supabase.from("activity").insert({
    user_id: userId,
    project_id: doc.project_id,
    description: `AI plan review on "${doc.name}" — ${parsed.findings.length} finding${parsed.findings.length === 1 ? "" : "s"}${high ? ` (${high} high-severity)` : ""}.`,
  });

  return { document: updated, review: parsed };
}

export const reviewPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "planReview");
    return runPlanReviewForDocument(context.supabase, context.userId, data.id);
  });

// Batch review + consolidated PermitHealth report across all plan documents in a project.
export const batchReviewPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    project_id: z.string().uuid(),
    force: z.boolean().optional().default(false),
  }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "planReview");
    const { supabase, userId } = context;

    const { data: docs } = await supabase
      .from("project_documents")
      .select("id, name, mime_type, plan_review, plan_reviewed_at")
      .eq("project_id", data.project_id);

    const isPlan = (d: { name: string; mime_type: string | null }) =>
      (d.mime_type || "").startsWith("image/") ||
      (d.mime_type || "") === "application/pdf" ||
      d.name.toLowerCase().endsWith(".pdf");

    const plans = (docs ?? []).filter(isPlan);
    if (plans.length === 0) throw new Error("No plan documents (PDF or image) to review.");

    const targets = data.force ? plans : plans.filter((d) => !d.plan_reviewed_at);

    // Run reviews sequentially — Gemini gets angry with parallel large PDFs.
    const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];
    for (const d of targets) {
      try {
        await runPlanReviewForDocument(supabase, userId, d.id);
        results.push({ id: d.id, name: d.name, ok: true });
      } catch (err) {
        results.push({ id: d.id, name: d.name, ok: false, error: err instanceof Error ? err.message : "Failed" });
      }
    }

    // Reload all plans (now with fresh reviews).
    const { data: refreshed } = await supabase
      .from("project_documents")
      .select("id, name, plan_review, plan_reviewed_at")
      .eq("project_id", data.project_id)
      .in("id", plans.map((p) => p.id));

    type Finding = {
      category: string; severity: "low"|"medium"|"high"; title: string; detail: string;
      code_reference?: string; local_amendment?: string; sheet_reference?: string; recommendation?: string;
      document_name: string; document_id: string;
    };
    const allFindings: Finding[] = [];
    const perDoc: Array<{ id: string; name: string; risk: string; count: number; summary: string }> = [];
    const jurisdictions = new Set<string>();
    const amendments = new Set<string>();
    const sources = new Set<string>();

    for (const d of refreshed ?? []) {
      const pr = d.plan_review as {
        overall_summary?: string; overall_risk?: "low"|"medium"|"high";
        jurisdiction_context?: { jurisdiction?: string; applied_amendments?: string[]; source_urls?: string[] };
        findings?: Array<Omit<Finding, "document_name" | "document_id">>;
      } | null;
      if (!pr) continue;
      const findings = pr.findings ?? [];
      for (const f of findings) allFindings.push({ ...f, document_name: d.name, document_id: d.id });
      perDoc.push({
        id: d.id, name: d.name,
        risk: pr.overall_risk || "medium",
        count: findings.length,
        summary: pr.overall_summary || "",
      });
      if (pr.jurisdiction_context?.jurisdiction) jurisdictions.add(pr.jurisdiction_context.jurisdiction);
      (pr.jurisdiction_context?.applied_amendments || []).forEach((a) => amendments.add(a));
      (pr.jurisdiction_context?.source_urls || []).forEach((u) => sources.add(u));
    }

    const bySeverity = { high: 0, medium: 0, low: 0 };
    const byCategory: Record<string, number> = {};
    for (const f of allFindings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    }

    // Composite plan-health score (independent of project health).
    let planHealth = 100;
    planHealth -= bySeverity.high * 10;
    planHealth -= bySeverity.medium * 4;
    planHealth -= bySeverity.low * 1;
    planHealth = Math.max(0, Math.min(100, planHealth));
    const risk: "low"|"medium"|"high" =
      bySeverity.high >= 3 || planHealth < 50 ? "high" :
      bySeverity.high >= 1 || planHealth < 75 ? "medium" : "low";

    const topFindings = [...allFindings]
      .sort((a, b) => (a.severity === "high" ? -1 : b.severity === "high" ? 1 : a.severity === "medium" ? -1 : 1))
      .slice(0, 10);

    const report = {
      generated_at: new Date().toISOString(),
      project_id: data.project_id,
      documents_total: plans.length,
      documents_reviewed: perDoc.length,
      documents_newly_reviewed: results.filter((r) => r.ok).length,
      documents_failed: results.filter((r) => !r.ok),
      total_findings: allFindings.length,
      by_severity: bySeverity,
      by_category: byCategory,
      plan_health_score: planHealth,
      overall_risk: risk,
      jurisdictions: Array.from(jurisdictions),
      applied_amendments: Array.from(amendments).slice(0, 20),
      source_urls: Array.from(sources).slice(0, 15),
      per_document: perDoc,
      top_findings: topFindings,
      all_findings: allFindings,
    };

    await supabase.from("activity").insert({
      user_id: userId,
      project_id: data.project_id,
      description: `Batch plan review: ${perDoc.length} plan${perDoc.length === 1 ? "" : "s"} · ${allFindings.length} finding${allFindings.length === 1 ? "" : "s"} (${bySeverity.high} high) · Health ${planHealth}.`,
    });

    return report;
  });

// ============= Plan Review → Fix List / Reviewer Response =============
type PlanReviewFinding = {
  category: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  code_reference?: string;
  local_amendment?: string;
  sheet_reference?: string;
  recommendation?: string;
};

const categoryToChecklist: Record<string, string> = {
  missing_exits: "Life Safety",
  ada: "Accessibility",
  fire_code: "Fire Code",
  permitting_mistake: "Submittal",
  other: "Plan Review",
};

// Turn plan-review findings into checklist items appended to the project.
export const addPlanReviewFixesToChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase
      .from("project_documents")
      .select("id, name, project_id, plan_review")
      .eq("id", data.document_id).maybeSingle();
    if (!doc) throw new Error("Document not found");
    const pr = doc.plan_review as { findings?: PlanReviewFinding[] } | null;
    const findings = pr?.findings ?? [];
    if (findings.length === 0) throw new Error("No findings to convert");

    const { data: existing } = await context.supabase
      .from("permit_items").select("sort_order").eq("project_id", doc.project_id);
    const startOrder = (existing ?? []).reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 1;

    const rows = findings.map((f, idx) => {
      const refs = [f.code_reference, f.local_amendment && `Local: ${f.local_amendment}`, f.sheet_reference && `Sheet ${f.sheet_reference}`]
        .filter(Boolean).join(" · ");
      const notes = [
        f.detail,
        f.recommendation ? `Fix: ${f.recommendation}` : "",
        refs,
        `From plan review of "${doc.name}"`,
      ].filter(Boolean).join("\n");
      return {
        user_id: context.userId,
        project_id: doc.project_id,
        name: `[${f.severity.toUpperCase()}] ${f.title}`,
        category: categoryToChecklist[f.category] || "Plan Review",
        required: f.severity !== "low",
        notes,
        sort_order: startOrder + idx,
      };
    });

    const { data: inserted, error } = await context.supabase
      .from("permit_items").insert(rows).select("*");
    if (error) throw new Error(error.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: doc.project_id,
      description: `Added ${inserted.length} fix${inserted.length === 1 ? "" : "es"} to checklist from plan review.`,
    });
    return { inserted_count: inserted.length };
  });

// AI-drafted reviewer response letter addressing each finding.
export const draftReviewerResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) throw new Error("AI is not configured");

    const { data: doc } = await context.supabase
      .from("project_documents")
      .select("id, name, project_id, plan_review")
      .eq("id", data.document_id).maybeSingle();
    if (!doc) throw new Error("Document not found");
    const pr = doc.plan_review as {
      overall_summary?: string;
      jurisdiction_context?: { jurisdiction?: string };
      findings?: PlanReviewFinding[];
    } | null;
    const findings = pr?.findings ?? [];
    if (findings.length === 0) throw new Error("No findings to draft against");

    const { data: project } = await context.supabase
      .from("projects").select("name, jurisdiction, project_type, location")
      .eq("id", doc.project_id).maybeSingle();

    const juris = pr?.jurisdiction_context?.jurisdiction || project?.jurisdiction || "the local jurisdiction";

    const findingsBlock = findings.map((f, i) => `#${i + 1} [${f.severity.toUpperCase()} · ${f.category}] ${f.title}
Issue: ${f.detail}
Code: ${f.code_reference || "—"}${f.local_amendment ? ` (Local: ${f.local_amendment})` : ""}
Sheet: ${f.sheet_reference || "—"}
Proposed fix: ${f.recommendation || "—"}`).join("\n\n");

    const prompt = `You are drafting a formal comment-response letter from the design team back to the ${juris} plan reviewer for project "${project?.name ?? ""}"${project?.location ? ` at ${project.location}` : ""}.

For EACH finding below, write a concise, professional response in this exact format:

Comment #N — <short restatement of the reviewer's concern>
Response: <2-4 sentences: acknowledge, explain what was corrected, cite the sheet or detail that now addresses it, reference the applicable code section>.

Rules:
- Be direct and respectful. No filler.
- Cite specific sheet numbers and code sections when provided.
- If the fix is a design change, describe the change; if it's a clarification, state it plainly.
- Do not invent sheet numbers or code sections that weren't given.
- Start with a one-paragraph cover note addressed to the plan reviewer, then the numbered responses.
- End with a single-line sign-off placeholder.

FINDINGS:
${findingsBlock}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You are a licensed architect drafting formal plan-review comment responses. Output plain text only." },
          { role: "user", content: prompt },
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
    const letter = (j.choices?.[0]?.message?.content ?? "").trim();
    if (!letter) throw new Error("AI returned an empty response");

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: doc.project_id,
      description: `Drafted reviewer response letter for "${doc.name}" (${findings.length} comment${findings.length === 1 ? "" : "s"}).`,
    });

    return { letter, finding_count: findings.length };
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
      .from("inspections")
      .update(patch as never)
      .eq("id", data.id)
      .select("*").single();
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
      context.supabase.from("deadlines").select("due_date").eq("project_id", data.project_id),
      context.supabase.from("inspections").select("status").eq("project_id", data.project_id),
    ]);
    const project = proj.data;
    const permits = items.data ?? [];
    const deadlines = dls.data ?? [];
    const inspections = insp.data ?? [];

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdue = deadlines.filter((d) => d.due_date && new Date(d.due_date) < today).length;
    const upcoming7 = deadlines.filter((d) => {
      if (!d.due_date) return false;
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

// ============================================================
// AI COPILOT — client updates, agendas, risk flags, summaries
// ============================================================



async function callGeminiJSON<T>(prompt: string, system: string, schema: z.ZodType<T>): Promise<T> {
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!aiKey) throw new Error("AI is not configured");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
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
  const raw = (j.choices?.[0]?.message?.content ?? "").trim().replace(/```json|```/g, "").trim();
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  try {
    return schema.parse(JSON.parse(raw.slice(s, e + 1)));
  } catch {
    throw new Error("AI returned an unreadable response. Try again.");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherProjectContext(supabase: any, projectId: string) {
  const [p, items, deadlines, activity, insp] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("permit_items").select("*").eq("project_id", projectId),
    supabase.from("deadlines").select("*").eq("project_id", projectId).order("due_date", { ascending: true }),
    supabase.from("activity").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(15),
    supabase.from("inspections").select("*").eq("project_id", projectId).order("scheduled_date", { ascending: true }),
  ]);
  return { project: p.data, items: items.data ?? [], deadlines: deadlines.data ?? [], activity: activity.data ?? [], inspections: insp.data ?? [] };
}

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

// ---- Summarize reviewer comments across all analyzed docs ----
const ReviewerSummarySchema = z.object({
  top_themes: z.array(z.string()).max(8).default([]),
  by_discipline: z.array(z.object({
    discipline: z.string(),
    items: z.array(z.string()).max(10).default([]),
  })).max(10).default([]),
  suggested_response_order: z.array(z.string()).max(10).default([]),
});

export const summarizeReviewerComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "aiCopilot");
    const { data: docs } = await context.supabase

      .from("project_documents")
      .select("name, ai_summary, ai_action_items, plan_review")
      .eq("project_id", data.project_id);
    const analyzed = (docs ?? []).filter((d) => d.ai_summary || d.ai_action_items || d.plan_review);
    if (analyzed.length === 0) throw new Error("Analyze or plan-review at least one document first.");
    const prompt = `Consolidate reviewer comments across these documents into themes an owner/PM can act on:

${JSON.stringify(analyzed)}

Return ONLY JSON: { "top_themes": ["..."], "by_discipline": [{ "discipline": "Mechanical", "items": ["..."] }], "suggested_response_order": ["do this first", "..."] }.
Only use facts present. Skip disciplines with no comments.`;
    return callGeminiJSON(prompt, "You group construction plan-review comments into actionable themes. Output JSON only.", ReviewerSummarySchema);
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

// ---- Schedule risks ----
const RiskSchema = z.object({
  overall_risk: z.enum(["low", "medium", "high"]).default("medium"),
  risks: z.array(z.object({
    severity: z.enum(["low", "medium", "high"]).default("medium"),
    title: z.string(),
    detail: z.string(),
    mitigation: z.string().default(""),
    related: z.string().default(""),
  })).max(15).default([]),
});

export const flagScheduleRisks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "aiCopilot");
    const ctx = await gatherProjectContext(context.supabase, data.project_id);

    if (!ctx.project) throw new Error("Project not found");
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Identify schedule and permitting risks for this project as of ${today}.
PROJECT: ${JSON.stringify({ name: ctx.project.name, jurisdiction: ctx.project.jurisdiction, project_type: ctx.project.project_type, stage: ctx.project.current_stage })}
PERMITS: ${JSON.stringify(ctx.items.map((i: { name: string; status: string; due_date: string | null }) => ({ name: i.name, status: i.status, due: i.due_date })))}
DEADLINES: ${JSON.stringify(ctx.deadlines.map((d: { title: string; due_date: string | null }) => ({ title: d.title, due: d.due_date })))}
INSPECTIONS: ${JSON.stringify(ctx.inspections.map((i: { type: string; scheduled_date: string | null; result: string | null }) => ({ type: i.type, date: i.scheduled_date, result: i.result })))}
RECENT ACTIVITY: ${JSON.stringify(ctx.activity.map((a: { description: string }) => a.description))}

Flag: overdue items, tight review windows, inspection sequencing gaps, missing statuses, jurisdiction-specific bottlenecks. Only flag issues supported by the data.

Return ONLY JSON: { "overall_risk": "low|medium|high", "risks": [{ "severity": "high", "title": "...", "detail": "...", "mitigation": "...", "related": "permit or deadline reference" }] }.`;
    return callGeminiJSON(prompt, "You are a permit risk analyst. Only flag concrete, data-supported risks. Output JSON only.", RiskSchema);
  });


// ============================================================
// REDLINED PLAN PDF — burns AI review bboxes onto the plan
// ============================================================

// Severity → RGB (0-1) used for both the box outline and label chip fill.
function severityRgb(sev: string): [number, number, number] {
  if (sev === "high") return [0.85, 0.15, 0.15];
  if (sev === "medium") return [0.95, 0.55, 0.05];
  return [0.10, 0.55, 0.35];
}

export const generateRedlinedPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "planReview");

    const { data: doc } = await context.supabase
      .from("project_documents").select("*").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Document not found");
    const review = doc.plan_review as z.infer<typeof PlanReviewSchema> | null;
    if (!review || !Array.isArray(review.findings) || review.findings.length === 0) {
      throw new Error("Run Plan Review first — no findings to markup.");
    }

    const mime = doc.mime_type || "application/pdf";
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) throw new Error("Only PDF or image plans can be marked up.");

    const { data: signed, error: sErr } = await context.supabase
      .storage.from("project-docs").createSignedUrl(doc.storage_path, 600);
    if (sErr || !signed?.signedUrl) throw new Error("Could not access document");
    const srcResp = await fetch(signed.signedUrl);
    if (!srcResp.ok) throw new Error("Could not download plan");
    const srcBytes = new Uint8Array(await srcResp.arrayBuffer());

    // Lazy-load pdf-lib on the server to keep the client bundle lean.
    const { PDFDocument, StandardFonts, rgb, degrees: _deg } = await import("pdf-lib");
    void _deg;

    let pdf: import("pdf-lib").PDFDocument;
    if (isPdf) {
      pdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    } else {
      pdf = await PDFDocument.create();
      const img = mime.includes("png")
        ? await pdf.embedPng(srcBytes)
        : await pdf.embedJpg(srcBytes);
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }

    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pages = pdf.getPages();

    // Group findings by page (1-indexed → 0-indexed). Findings with no page default to page 1.
    const byPage = new Map<number, Array<{ n: number; f: z.infer<typeof PlanReviewSchema>["findings"][number] }>>();
    review.findings.forEach((f, idx) => {
      const p = Math.min(Math.max((f.page ?? 1) - 1, 0), pages.length - 1);
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p)!.push({ n: idx + 1, f });
    });

    let drawn = 0;
    for (const [pageIdx, items] of byPage) {
      const page = pages[pageIdx];
      const { width, height } = page.getSize();
      for (const { n, f } of items) {
        if (!f.bbox) continue;
        const { x, y, w, h } = f.bbox;
        // AI uses top-left origin; pdf-lib uses bottom-left. Convert.
        const px = Math.max(0, x) * width;
        const py = Math.max(0, height - (y + h) * height);
        const pw = Math.max(6, Math.min(w * width, width - px));
        const ph = Math.max(6, Math.min(h * height, height - py));
        const [r, g, b] = severityRgb(f.severity);

        // Semi-transparent fill + hard outline.
        page.drawRectangle({
          x: px, y: py, width: pw, height: ph,
          color: rgb(r, g, b),
          opacity: 0.12,
          borderColor: rgb(r, g, b),
          borderWidth: 2,
          borderOpacity: 1,
        });

        // Numbered chip anchored to the box's top-left corner.
        const label = String(n);
        const chipSize = 18;
        const chipX = px;
        const chipY = py + ph - chipSize;
        page.drawRectangle({
          x: chipX, y: chipY, width: chipSize + label.length * 4, height: chipSize,
          color: rgb(r, g, b), opacity: 0.95,
        });
        page.drawText(label, {
          x: chipX + 5, y: chipY + 4, size: 11, font, color: rgb(1, 1, 1),
        });
        drawn++;
      }
    }

    // Append a findings-index page so the numbered chips resolve to explanations.
    const indexPage = pdf.addPage([612, 792]); // US Letter
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const draw = (t: string, x: number, y: number, size = 10, bold = false, color: [number,number,number] = [0,0,0]) => {
      indexPage.drawText(t, { x, y, size, font: bold ? font : regular, color: rgb(color[0], color[1], color[2]) });
    };
    draw("AI PLAN REVIEW — REDLINE INDEX", 40, 750, 14, true);
    draw(`${doc.name}`, 40, 732, 10, false, [0.35, 0.35, 0.35]);
    if (review.jurisdiction_context?.jurisdiction) {
      draw(`Jurisdiction: ${review.jurisdiction_context.jurisdiction}`, 40, 718, 9, false, [0.35, 0.35, 0.35]);
    }
    draw(`Overall risk: ${review.overall_risk.toUpperCase()}  ·  Findings: ${review.findings.length}`, 40, 704, 9, false, [0.35, 0.35, 0.35]);

    let cursor = 680;
    review.findings.forEach((f, idx) => {
      if (cursor < 60) {
        const p = pdf.addPage([612, 792]);
        p.drawText("REDLINE INDEX (cont.)", { x: 40, y: 750, size: 12, font, color: rgb(0,0,0) });
        cursor = 720;
        // Swap indexPage reference implicitly via closure by rebinding draw target:
        // simplest: draw remaining directly on p
        const [r, g, b] = severityRgb(f.severity);
        p.drawRectangle({ x: 40, y: cursor - 2, width: 14, height: 14, color: rgb(r,g,b) });
        p.drawText(String(idx + 1), { x: 44, y: cursor + 2, size: 9, font, color: rgb(1,1,1) });
        p.drawText(`[${f.severity.toUpperCase()}] ${f.title}`.slice(0, 90), { x: 62, y: cursor + 2, size: 10, font, color: rgb(0,0,0) });
        cursor -= 14;
        const wrap = (t: string, max: number) => {
          const words = t.split(/\s+/); const out: string[] = []; let line = "";
          for (const w of words) { if ((line + " " + w).length > max) { out.push(line); line = w; } else { line = line ? line + " " + w : w; } }
          if (line) out.push(line); return out;
        };
        wrap(f.detail, 105).forEach((line) => { p.drawText(line, { x: 62, y: cursor, size: 9, font: regular, color: rgb(0.25, 0.25, 0.25) }); cursor -= 11; });
        const meta = [f.sheet_reference && `Sheet ${f.sheet_reference}`, f.code_reference, f.local_amendment && `Local: ${f.local_amendment}`].filter(Boolean).join("  ·  ");
        if (meta) { p.drawText(meta.slice(0, 110), { x: 62, y: cursor, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) }); cursor -= 10; }
        if (f.recommendation) { wrap("→ " + f.recommendation, 110).forEach((line) => { p.drawText(line, { x: 62, y: cursor, size: 8, font: regular, color: rgb(0.15, 0.4, 0.15) }); cursor -= 10; }); }
        cursor -= 8;
        return;
      }
      const [r, g, b] = severityRgb(f.severity);
      indexPage.drawRectangle({ x: 40, y: cursor - 2, width: 14, height: 14, color: rgb(r,g,b) });
      indexPage.drawText(String(idx + 1), { x: 44, y: cursor + 2, size: 9, font, color: rgb(1,1,1) });
      indexPage.drawText(`[${f.severity.toUpperCase()}] ${f.title}`.slice(0, 90), { x: 62, y: cursor + 2, size: 10, font, color: rgb(0,0,0) });
      cursor -= 14;
      const wrap = (t: string, max: number) => {
        const words = t.split(/\s+/); const out: string[] = []; let line = "";
        for (const w of words) { if ((line + " " + w).length > max) { out.push(line); line = w; } else { line = line ? line + " " + w : w; } }
        if (line) out.push(line); return out;
      };
      wrap(f.detail, 105).forEach((line) => { indexPage.drawText(line, { x: 62, y: cursor, size: 9, font: regular, color: rgb(0.25, 0.25, 0.25) }); cursor -= 11; });
      const meta = [f.sheet_reference && `Sheet ${f.sheet_reference}`, f.code_reference, f.local_amendment && `Local: ${f.local_amendment}`].filter(Boolean).join("  ·  ");
      if (meta) { indexPage.drawText(meta.slice(0, 110), { x: 62, y: cursor, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) }); cursor -= 10; }
      if (f.recommendation) {
        wrap("→ " + f.recommendation, 110).forEach((line) => { indexPage.drawText(line, { x: 62, y: cursor, size: 8, font: regular, color: rgb(0.15, 0.4, 0.15) }); cursor -= 10; });
      }
      cursor -= 8;
    });

    const outBytes = await pdf.save();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = `${doc.storage_path.replace(/\.[^/.]+$/, "")}.redlined-${stamp}.pdf`;
    const { error: upErr } = await context.supabase.storage
      .from("project-docs").upload(outPath, outBytes, {
        contentType: "application/pdf", upsert: true,
      });
    if (upErr) throw new Error(upErr.message);
    const { data: outSigned, error: signErr } = await context.supabase.storage
      .from("project-docs").createSignedUrl(outPath, 3600);
    if (signErr || !outSigned?.signedUrl) throw new Error("Could not sign redlined PDF");

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: doc.project_id,
      description: `Generated redlined plan PDF for "${doc.name}" — ${drawn} markup${drawn === 1 ? "" : "s"} across ${byPage.size} page${byPage.size === 1 ? "" : "s"}.`,
    });

    return { url: outSigned.signedUrl, path: outPath, markups: drawn, pages: byPage.size };
  });

/* -------------------- BATCH REPORT — one-click PDF export -------------------- */

const BatchReportPdfSchema = z.object({
  project_id: z.string().uuid(),
  report: z.object({
    generated_at: z.string().optional(),
    documents_reviewed: z.number(),
    documents_newly_reviewed: z.number().optional(),
    documents_total: z.number().optional(),
    documents_failed: z.array(z.object({ name: z.string() })).optional(),
    jurisdictions: z.array(z.string()).default([]),
    applied_amendments: z.array(z.string()).default([]),
    plan_health_score: z.number(),
    overall_risk: z.enum(["low", "medium", "high"]),
    total_findings: z.number(),
    by_severity: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
    by_category: z.record(z.string(), z.number()).default({}),
    top_findings: z.array(z.object({
      severity: z.enum(["low", "medium", "high"]),
      category: z.string().optional().default(""),
      title: z.string(),
      detail: z.string(),
      document_name: z.string(),
      sheet_reference: z.string().optional().nullable(),
      code_reference: z.string().optional().nullable(),
      local_amendment: z.string().optional().nullable(),
      recommendation: z.string().optional().nullable(),
    })).default([]),
  }),
});

export const generateBatchReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchReportPdfSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "planReview");

    const { data: project } = await context.supabase
      .from("projects").select("id, name, jurisdiction, location, project_type")
      .eq("id", data.project_id).maybeSingle();
    if (!project) throw new Error("Project not found");

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    const r = data.report;
    const brand = rgb(0.10, 0.55, 0.90);
    const muted = rgb(0.42, 0.42, 0.45);
    const dark = rgb(0.10, 0.11, 0.13);

    const wrap = (t: string, max: number) => {
      const words = t.split(/\s+/); const out: string[] = []; let line = "";
      for (const w of words) { if ((line + " " + w).length > max) { out.push(line); line = w; } else { line = line ? line + " " + w : w; } }
      if (line) out.push(line); return out;
    };

    let page = pdf.addPage([612, 792]);
    let y = 752;
    const newPage = () => { page = pdf.addPage([612, 792]); y = 752; };
    const ensure = (need: number) => { if (y - need < 60) newPage(); };

    // Header
    page.drawText("CONSOLIDATED PERMITHEALTH REPORT", { x: 40, y, size: 10, font, color: brand });
    y -= 22;
    page.drawText(project.name || "Project", { x: 40, y, size: 22, font, color: dark });
    y -= 18;
    const subtitle = [project.project_type, project.jurisdiction, project.location].filter(Boolean).join(" · ");
    if (subtitle) { page.drawText(subtitle.slice(0, 90), { x: 40, y, size: 10, font: regular, color: muted }); y -= 14; }
    const generated = r.generated_at ? new Date(r.generated_at).toLocaleString() : new Date().toLocaleString();
    page.drawText(`Generated ${generated}`, { x: 40, y, size: 9, font: regular, color: muted });
    y -= 24;
    page.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 0.5, color: rgb(0.85,0.85,0.88) });
    y -= 22;

    // Metric cards
    const riskRgb = r.overall_risk === "high" ? rgb(0.85, 0.15, 0.15) : r.overall_risk === "medium" ? rgb(0.95, 0.55, 0.05) : rgb(0.10, 0.55, 0.35);
    const cards: Array<{ label: string; value: string; sub: string; color?: import("pdf-lib").RGB }> = [
      { label: "PLAN HEALTH", value: String(r.plan_health_score), sub: `${r.overall_risk.toUpperCase()} RISK`, color: riskRgb },
      { label: "FINDINGS", value: String(r.total_findings), sub: `${r.by_severity.high} HIGH`, color: rgb(0.85,0.15,0.15) },
      { label: "MEDIUM", value: String(r.by_severity.medium), sub: "", color: rgb(0.95,0.55,0.05) },
      { label: "LOW", value: String(r.by_severity.low), sub: "", color: rgb(0.10,0.55,0.35) },
    ];
    const cardW = 128, cardH = 62, gap = 10;
    cards.forEach((c, i) => {
      const x = 40 + i * (cardW + gap);
      page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, borderColor: rgb(0.88,0.88,0.9), borderWidth: 0.5, color: rgb(0.98,0.98,0.99) });
      page.drawText(c.label, { x: x + 8, y: y - 14, size: 8, font, color: muted });
      page.drawText(c.value, { x: x + 8, y: y - 40, size: 24, font, color: c.color ?? dark });
      if (c.sub) page.drawText(c.sub, { x: x + 8, y: y - 54, size: 7, font, color: muted });
    });
    y -= cardH + 20;

    // Summary line
    const summary = `${r.documents_reviewed} plan${r.documents_reviewed === 1 ? "" : "s"} analyzed${r.documents_newly_reviewed ? ` · ${r.documents_newly_reviewed} newly reviewed` : ""}${r.jurisdictions.length > 0 ? ` · ${r.jurisdictions.join(", ")}` : ""}`;
    wrap(summary, 100).forEach((line) => { page.drawText(line, { x: 40, y, size: 10, font: regular, color: dark }); y -= 13; });
    y -= 8;

    // Categories
    const catEntries = Object.entries(r.by_category || {});
    if (catEntries.length > 0) {
      ensure(30);
      page.drawText("BY CATEGORY", { x: 40, y, size: 9, font, color: muted }); y -= 14;
      let cx = 40;
      catEntries.forEach(([k, v]) => {
        const label = `${k.replace(/_/g, " ").toUpperCase()} · ${v}`;
        const w = regular.widthOfTextAtSize(label, 8) + 12;
        if (cx + w > 572) { cx = 40; y -= 16; ensure(20); }
        page.drawRectangle({ x: cx, y: y - 4, width: w, height: 14, borderColor: rgb(0.85,0.85,0.88), borderWidth: 0.5, color: rgb(1,1,1) });
        page.drawText(label, { x: cx + 6, y: y, size: 8, font: regular, color: dark });
        cx += w + 6;
      });
      y -= 22;
    }

    if (r.documents_failed && r.documents_failed.length > 0) {
      ensure(24);
      page.drawText("FAILED TO REVIEW", { x: 40, y, size: 9, font, color: rgb(0.85,0.15,0.15) }); y -= 12;
      wrap(r.documents_failed.map((f) => f.name).join(", "), 110).forEach((line) => { page.drawText(line, { x: 40, y, size: 9, font: regular, color: dark }); y -= 12; });
      y -= 6;
    }

    // Findings
    if (r.top_findings.length > 0) {
      ensure(30);
      page.drawText("TOP FINDINGS", { x: 40, y, size: 10, font, color: brand }); y -= 16;
      r.top_findings.forEach((f, idx) => {
        ensure(70);
        const [sr, sg, sb] = f.severity === "high" ? [0.85,0.15,0.15] : f.severity === "medium" ? [0.95,0.55,0.05] : [0.10,0.55,0.35];
        page.drawRectangle({ x: 40, y: y - 3, width: 18, height: 14, color: rgb(sr,sg,sb) });
        page.drawText(String(idx + 1), { x: 44, y: y + 1, size: 9, font, color: rgb(1,1,1) });
        page.drawText(`[${f.severity.toUpperCase()}] ${f.title}`.slice(0, 88), { x: 64, y: y + 1, size: 10, font, color: dark });
        y -= 14;
        const cat = (f.category || "").replace(/_/g, " ");
        if (cat) { page.drawText(cat.toUpperCase(), { x: 64, y, size: 7, font, color: muted }); y -= 10; }
        wrap(f.detail, 108).forEach((line) => { ensure(14); page.drawText(line, { x: 64, y, size: 9, font: regular, color: dark }); y -= 11; });
        const meta = [f.document_name, f.sheet_reference && `Sheet ${f.sheet_reference}`, f.code_reference, f.local_amendment && `Local: ${f.local_amendment}`].filter(Boolean).join("  ·  ");
        if (meta) { ensure(12); page.drawText(meta.slice(0, 115), { x: 64, y, size: 8, font: regular, color: muted }); y -= 10; }
        if (f.recommendation) { wrap("→ " + f.recommendation, 110).forEach((line) => { ensure(12); page.drawText(line, { x: 64, y, size: 8, font: regular, color: rgb(0.15, 0.4, 0.15) }); y -= 10; }); }
        y -= 8;
      });
    }

    if (r.applied_amendments && r.applied_amendments.length > 0) {
      ensure(24);
      y -= 4;
      page.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 0.5, color: rgb(0.85,0.85,0.88) });
      y -= 14;
      page.drawText("APPLIED JURISDICTION AMENDMENTS", { x: 40, y, size: 8, font, color: muted }); y -= 12;
      wrap(r.applied_amendments.join(" · "), 115).forEach((line) => { ensure(12); page.drawText(line, { x: 40, y, size: 8, font: regular, color: dark }); y -= 10; });
    }

    // Footer on every page
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Permivio · PermitHealth Report · Page ${i + 1} of ${pages.length}`, { x: 40, y: 30, size: 8, font: regular, color: muted });
    });

    const outBytes = await pdf.save();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = `${context.userId}/${data.project_id}/reports/permithealth-${stamp}.pdf`;
    const { error: upErr } = await context.supabase.storage
      .from("project-docs").upload(outPath, outBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: signErr } = await context.supabase.storage
      .from("project-docs").createSignedUrl(outPath, 3600);
    if (signErr || !signed?.signedUrl) throw new Error("Could not sign report PDF");

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Exported PermitHealth report PDF — health ${r.plan_health_score}, ${r.total_findings} findings.`,
    });

    return { url: signed.signedUrl, path: outPath };
  });

