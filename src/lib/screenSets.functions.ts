import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ScreenSetRow = {
  id: string;
  name: string;
  notes: string;
  created_at: string;
  updated_at: string;
  candidate_count: number;
};

/** List the caller's comparison sets, each with a candidate count. */
export const listScreenSets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sets, error } = await context.supabase
      .from("screen_sets")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!sets || sets.length === 0) return [] as ScreenSetRow[];

    const ids = sets.map((s) => s.id);
    const { data: analyses, error: aErr } = await context.supabase
      .from("permit_analyses")
      .select("screen_set_id")
      .in("screen_set_id", ids);
    if (aErr) throw new Error(aErr.message);

    const counts = new Map<string, number>();
    for (const a of analyses ?? []) {
      const key = (a as { screen_set_id: string | null }).screen_set_id;
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return sets.map((s) => ({ ...s, candidate_count: counts.get(s.id) ?? 0 })) as ScreenSetRow[];
  });

/** Create a new comparison set. */
export const createScreenSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    name: z.string().min(1).max(200),
    notes: z.string().max(2000).default(""),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("screen_sets")
      .insert({ user_id: context.userId, name: data.name, notes: data.notes })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Get a single comparison set by id. */
export const getScreenSet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("screen_sets").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Comparison not found");
    return row;
  });

/** Delete a comparison set. Candidate analyses inside are kept, just ungrouped (screen_set_id -> null via FK). */
export const deleteScreenSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("screen_sets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** List the full analysis rows belonging to one comparison set. */
export const listScreenSetAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ screen_set_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("permit_analyses")
      .select("*")
      .eq("screen_set_id", data.screen_set_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Remove a candidate analysis from its comparison set without deleting the analysis. */
export const removeAnalysisFromScreenSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ analysis_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("permit_analyses")
      .update({ screen_set_id: null })
      .eq("id", data.analysis_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
