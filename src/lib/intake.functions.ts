import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FriendlyProjectType } from "./projectTypeMap";
import { mapFriendlyToInternal } from "./projectTypeMap";
import { deriveScopeFromAnswers, type AnswerChoice } from "./intakeQuestions";

const FRIENDLY = z.enum([
  "open_restaurant","remodel_restaurant","open_retail","remodel_retail",
  "office_renovation","medical_dental","commercial_ti","new_commercial",
  "new_residential","home_addition","kitchen_bath_reno","deck_patio",
  "change_of_use","exterior_site_work","sign_installation","other",
]);

// ---------- Save the plain-language intake header ----------
const IntakeHeaderInput = z.object({
  project_id: z.string().uuid(),
  friendly_project_type: FRIENDLY.optional().nullable(),
  plain_scope: z.string().max(8000).optional().nullable(),
  intake_step: z.number().int().min(1).max(6).optional(),
  intake_status: z
    .enum(["draft","questions","ready","analyzing","report_ready","roadmap_created","human_review"])
    .optional(),
});

export const saveIntakeHeader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IntakeHeaderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Enforce ownership
    const { data: proj } = await supabase.from("projects").select("id, user_id").eq("id", data.project_id).maybeSingle();
    if (!proj || proj.user_id !== userId) throw new Error("Project not found");

    const patch: Record<string, unknown> = {
      project_id: data.project_id,
      user_id: userId,
    };
    if (data.friendly_project_type !== undefined) patch.friendly_project_type = data.friendly_project_type;
    if (data.plain_scope !== undefined) {
      patch.plain_scope = data.plain_scope;
      patch.scope_text = data.plain_scope; // mirror for rule engine
    }
    if (data.intake_step !== undefined) patch.intake_step = data.intake_step;
    if (data.intake_status !== undefined) patch.intake_status = data.intake_status;

    if (data.friendly_project_type) {
      const mapped = mapFriendlyToInternal(data.friendly_project_type as FriendlyProjectType);
      patch.project_type = mapped.project_type;
      patch.residential_or_commercial = mapped.residential_or_commercial;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabase.from("scope_of_work") as any)
      .upsert(patch, { onConflict: "project_id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return { scope: row };
  });

// ---------- Follow-up answers ----------
const AnswerInput = z.object({
  project_id: z.string().uuid(),
  question_key: z.string().min(1).max(80),
  answer_choice: z.enum(["yes","no","unsure","later"]).optional().nullable(),
  answer_value: z.string().max(2000).optional().nullable(),
});

export const saveIntakeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnswerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj } = await supabase.from("projects").select("id, user_id").eq("id", data.project_id).maybeSingle();
    if (!proj || proj.user_id !== userId) throw new Error("Project not found");

    const row = {
      project_id: data.project_id,
      question_key: data.question_key,
      answer_choice: data.answer_choice ?? null,
      answer_value: data.answer_value ?? null,
      source: "user" as const,
      verified: true,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("intake_answers") as any)
      .upsert(row, { onConflict: "project_id,question_key,source" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getIntakeAnswers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (context.supabase.from("intake_answers") as any)
      .select("*").eq("project_id", data.project_id);
    return { answers: (rows ?? []) as Array<{ question_key: string; answer_choice: string | null; answer_value: string | null; source: string; verified: boolean }> };
  });

// ---------- Finalize: merge answers → trades, set status ready ----------
export const finalizeIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj } = await supabase.from("projects").select("id, user_id").eq("id", data.project_id).maybeSingle();
    if (!proj || proj.user_id !== userId) throw new Error("Project not found");

    // Load current scope + answers
    const { data: scope } = await supabase.from("scope_of_work").select("*").eq("project_id", data.project_id).maybeSingle();
    if (!scope) throw new Error("Start the intake first.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: answerRows } = await (supabase.from("intake_answers") as any)
      .select("question_key, answer_choice, answer_value")
      .eq("project_id", data.project_id);

    const answers: Record<string, AnswerChoice | string | undefined> = {};
    for (const r of (answerRows ?? []) as Array<{ question_key: string; answer_choice: string | null; answer_value: string | null }>) {
      if (r.answer_choice) answers[r.question_key] = r.answer_choice as AnswerChoice;
      else if (r.answer_value) answers[r.question_key] = r.answer_value;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const friendly = ((scope as any).friendly_project_type ?? null) as FriendlyProjectType | null;
    const derived = deriveScopeFromAnswers(friendly, answers);

    const patch: Record<string, unknown> = {
      trades: derived.trades,
      target_start_date: derived.target_start_date,
      target_open_date: derived.target_open_date,
      intake_status: "ready",
      status: "submitted",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("scope_of_work") as any)
      .update(patch).eq("project_id", data.project_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
