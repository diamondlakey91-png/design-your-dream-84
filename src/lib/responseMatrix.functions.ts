import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callLovableAI } from "@/lib/ai.shared";

// ---- Response Matrix: reviewer comments + drafted official responses ----

export const listCommentResponses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("comment_responses")
      .select("*")
      .eq("project_id", data.project_id)
      .order("comment_no", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addCommentResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project_id: z.string().uuid(),
        comment_text: z.string().min(1),
        discipline: z.string().default("General"),
        sheet_reference: z.string().optional(),
        code_reference: z.string().optional(),
        severity: z.enum(["low", "medium", "high"]).default("medium"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("comment_responses")
      .select("comment_no")
      .eq("project_id", data.project_id);
    const nextNo = (existing ?? []).reduce((m, r) => Math.max(m, r.comment_no ?? 0), 0) + 1;

    const { data: row, error } = await context.supabase
      .from("comment_responses")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        comment_no: nextNo,
        comment_text: data.comment_text,
        discipline: data.discipline,
        sheet_reference: data.sheet_reference ?? null,
        code_reference: data.code_reference ?? null,
        severity: data.severity,
        verification: "needs_human_review",
        source: "manual",
        status: "open",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCommentResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        comment_text: z.string().optional(),
        discipline: z.string().optional(),
        sheet_reference: z.string().nullable().optional(),
        code_reference: z.string().nullable().optional(),
        severity: z.enum(["low", "medium", "high"]).optional(),
        response_text: z.string().nullable().optional(),
        status: z.enum(["open", "in_progress", "drafted", "responded", "resolved", "n_a"]).optional(),
        assignee: z.string().nullable().optional(),
        verification: z.enum(["verified_requirement", "ai_suggested_issue", "needs_human_review"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("comment_responses")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCommentResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("comment_responses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Pull reviewer comments / plan-review findings from analyzed documents into the matrix.
export const importCommentsFromDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: docs } = await context.supabase
      .from("project_documents")
      .select("id, name, plan_review")
      .eq("project_id", data.project_id);

    const { data: existing } = await context.supabase
      .from("comment_responses")
      .select("comment_no, comment_text")
      .eq("project_id", data.project_id);
    const seen = new Set((existing ?? []).map((r) => (r.comment_text ?? "").trim().toLowerCase()));
    let nextNo = (existing ?? []).reduce((m, r) => Math.max(m, r.comment_no ?? 0), 0) + 1;

    const rows: Array<{
      user_id: string;
      project_id: string;
      document_id: string;
      comment_no: number;
      discipline: string;
      sheet_reference: string | null;
      code_reference: string | null;
      severity: string;
      verification: string;
      comment_text: string;
      response_text: string | null;
      status: string;
      source: string;
    }> = [];
    for (const doc of docs ?? []) {
      const pr = doc.plan_review as {
        findings?: Array<{
          category?: string;
          severity?: string;
          title?: string;
          detail?: string;
          code_reference?: string;
          sheet_reference?: string;
          recommendation?: string;
        }>;
      } | null;
      for (const f of pr?.findings ?? []) {
        const text = [f.title, f.detail].filter(Boolean).join(" — ").trim();
        if (!text || seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        rows.push({
          user_id: context.userId,
          project_id: data.project_id,
          document_id: doc.id,
          comment_no: nextNo++,
          discipline: f.category ? String(f.category).replace(/_/g, " ") : "General",
          sheet_reference: f.sheet_reference ?? null,
          code_reference: f.code_reference ?? null,
          severity: f.severity === "high" || f.severity === "low" ? f.severity : "medium",
          verification: "ai_suggested_issue",
          comment_text: text,
          response_text: f.recommendation ? `Proposed fix: ${f.recommendation}` : null,
          status: "open",
          source: `AI plan review · ${doc.name}`,
        });
      }
    }

    if (rows.length === 0) return { inserted_count: 0 };
    const { data: inserted, error } = await context.supabase.from("comment_responses").insert(rows).select("id");
    if (error) throw new Error(error.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Imported ${inserted.length} reviewer comment${inserted.length === 1 ? "" : "s"} into the Response Matrix.`,
    });
    return { inserted_count: inserted.length };
  });

// AI-draft an official response for a single comment row.
export const draftMatrixResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), tone: z.enum(["formal", "concise"]).default("formal") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const aiKey = process.env["LOVABLE_API_KEY"];
    if (!aiKey) throw new Error("AI is not configured");

    const { data: row } = await context.supabase
      .from("comment_responses")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Comment not found");

    const { data: project } = await context.supabase
      .from("projects")
      .select("name, jurisdiction, project_type, location")
      .eq("id", row.project_id)
      .maybeSingle();

    const content = await callLovableAI(
      aiKey,
      [
        {
          role: "system",
          content:
            "You are a permit expeditor drafting formal plan-review comment responses. Output plain text only — a single response paragraph, no headings, no sign-off. Never invent sheet numbers or code sections that were not provided. Never assert a code violation as confirmed.",
        },
        {
          role: "user",
          content: `Project: ${project?.name ?? "—"}${project?.location ? ` at ${project.location}` : ""}
Jurisdiction: ${project?.jurisdiction ?? "the local jurisdiction"}
Project type: ${project?.project_type ?? "—"}
Discipline: ${row.discipline}
Sheet: ${row.sheet_reference || "—"}
Code reference: ${row.code_reference || "—"}
Reviewer comment: ${row.comment_text}
Existing notes: ${row.response_text || "—"}

Write a ${data.tone === "concise" ? "2-3 sentence" : "3-5 sentence"} professional response to this reviewer comment: acknowledge it, state what was corrected or clarified, and cite the sheet/code only if given above.`,
        },
      ],
      "google/gemini-2.5-flash",
    );

    const response_text = String(content ?? "").trim();
    if (!response_text) throw new Error("AI returned an empty response");

    const { data: updated, error } = await context.supabase
      .from("comment_responses")
      .update({ response_text, status: row.status === "open" ? "drafted" : row.status })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });
