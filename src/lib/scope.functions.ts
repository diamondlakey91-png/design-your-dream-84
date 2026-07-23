import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Trades keys must match ScopeIntake UI
export const TRADE_KEYS = [
  "interior",
  "exterior",
  "structural",
  "electrical",
  "mechanical",
  "plumbing",
  "fire_alarm",
  "fire_sprinkler",
  "food_service",
  "signage",
  "site_dev",
  "grading",
  "stormwater",
  "row",
  "utility",
] as const;
export type TradeKey = (typeof TRADE_KEYS)[number];

const TradeValue = z.object({
  involved: z.enum(["yes", "no", "unsure"]).default("unsure"),
  details: z.record(z.string(), z.any()).optional(),
});

const TradesSchema = z.record(z.string(), TradeValue).default({});

const ScopeInput = z.object({
  project_id: z.string().uuid(),
  address: z.string().max(300).optional().nullable(),
  address_normalized: z.string().max(300).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  residential_or_commercial: z
    .enum(["residential", "commercial", "mixed_use"])
    .optional()
    .nullable(),
  occupancy_existing: z.string().max(120).optional().nullable(),
  occupancy_proposed: z.string().max(120).optional().nullable(),
  project_type: z
    .enum([
      "new_construction",
      "tenant_improvement",
      "change_of_occupancy",
      "addition",
      "alteration",
      "repair",
      "demolition",
      "shell",
      "core_and_shell",
      "other",
    ])
    .optional()
    .nullable(),
  construction_type: z.string().max(20).optional().nullable(),
  dwelling_units: z.number().int().min(0).max(10000).optional().nullable(),
  construction_value_cents: z
    .number()
    .int()
    .min(0)
    .max(10_000_000_000_00)
    .optional()
    .nullable(),
  sq_ft_gross: z.number().int().min(0).max(10_000_000).optional().nullable(),
  sq_ft_affected: z.number().int().min(0).max(10_000_000).optional().nullable(),
  scope_text: z.string().max(8000).optional().nullable(),
  trades: TradesSchema.optional(),
  target_start_date: z.string().optional().nullable(), // ISO yyyy-mm-dd
  target_open_date: z.string().optional().nullable(),
  status: z
    .enum(["draft", "submitted", "analyzing", "needs_followup", "complete"])
    .optional(),
});

export const getScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("scope_of_work")
      .select("*")
      .eq("project_id", data.project_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { scope: row };
  });

export const upsertScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScopeInput.parse(input))
  .handler(async ({ data, context }) => {
    // Verify project ownership via RLS by selecting first
    const { data: proj, error: pErr } = await context.supabase
      .from("projects")
      .select("id")
      .eq("id", data.project_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proj) throw new Error("Project not found");

    const payload = {
      project_id: data.project_id,
      user_id: context.userId,
      address: data.address ?? null,
      address_normalized: data.address_normalized ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      residential_or_commercial: data.residential_or_commercial ?? null,
      occupancy_existing: data.occupancy_existing ?? null,
      occupancy_proposed: data.occupancy_proposed ?? null,
      project_type: data.project_type ?? null,
      construction_type: data.construction_type ?? null,
      dwelling_units: data.dwelling_units ?? null,
      construction_value_cents: data.construction_value_cents ?? null,
      sq_ft_gross: data.sq_ft_gross ?? null,
      sq_ft_affected: data.sq_ft_affected ?? null,
      scope_text: data.scope_text ?? null,
      trades: data.trades ?? {},
      target_start_date: data.target_start_date ?? null,
      target_open_date: data.target_open_date ?? null,
      status: data.status ?? "draft",
    };

    const { data: row, error } = await context.supabase
      .from("scope_of_work")
      .upsert(payload, { onConflict: "project_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { scope: row };
  });
