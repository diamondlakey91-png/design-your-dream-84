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

const SendChatInput = z.object({ content: z.string().min(1).max(2000) });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendChatInput.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    // Load history
    const { data: history } = await context.supabase
      .from("chat_messages")
      .select("role, content")
      .order("created_at", { ascending: true })
      .limit(40);

    // Persist user message
    const { data: userMsg, error: uerr } = await context.supabase
      .from("chat_messages")
      .insert({ user_id: context.userId, role: "user", content: data.content })
      .select("*")
      .single();
    if (uerr) throw new Error(uerr.message);

    const systemPrompt = `You are the Permivio Permit Assistant — a specialist that helps contractors identify the building, trade, and regulatory permits they need for a given project and jurisdiction in the United States.

Reply in this exact structure, in plain markdown:
1. One short sentence acknowledging the project.
2. A markdown list of likely required permits. Each item: **Permit Name** — one short reason, and a tag "[REQUIRED]" or "[LIKELY]".
3. A one-sentence disclaimer that the user should verify with the local jurisdiction.

Be concise, practical, and confident. No filler.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history ?? []),
      { role: "user", content: data.content },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      if (resp.status === 429) throw new Error("Too many requests — try again in a moment.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Please top up.");
      throw new Error(`AI error: ${txt.slice(0, 200)}`);
    }
    const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const reply = json.choices?.[0]?.message?.content?.trim() ?? "I couldn't generate a response.";

    const { data: assistantMsg, error: aerr } = await context.supabase
      .from("chat_messages")
      .insert({ user_id: context.userId, role: "assistant", content: reply })
      .select("*")
      .single();
    if (aerr) throw new Error(aerr.message);

    return { user: userMsg, assistant: assistantMsg };
  });

export const clearChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("chat_messages").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
