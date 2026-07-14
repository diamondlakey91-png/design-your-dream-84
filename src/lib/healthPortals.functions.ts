import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HEALTH_AGENCY_SERVICE_TYPES, HEALTH_AGENCY_TYPES } from "@/lib/healthAgencyRegistry";

const HealthPortalMappingInputSchema = z.object({
  id: z.string().uuid().optional(),
  jurisdiction: z.string().min(1).max(200),
  state: z.string().min(2).max(2),
  agency_type: z.enum(HEALTH_AGENCY_TYPES as [string, ...string[]]),
  service_types: z.array(z.enum(HEALTH_AGENCY_SERVICE_TYPES as [string, ...string[]])).default([]),
  url: z.string().url(),
  address_search_template: z.string().url().optional().nullable(),
  permit_search_template: z.string().url().optional().nullable(),
  plan_review_url: z.string().url().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
});

export type HealthPortalMappingRow = {
  id: string;
  jurisdiction: string;
  state: string;
  agency_type: string;
  service_types: string[];
  url: string;
  address_search_template: string | null;
  permit_search_template: string | null;
  plan_review_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

/** List health/environmental portal mappings visible to the caller (active for all users; all for admins). */
export const listHealthPortalMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("health_environmental_portals")
      .select("*")
      .order("state", { ascending: true })
      .order("jurisdiction", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as HealthPortalMappingRow[];

  });

/** Create or update a health/environmental portal mapping (admin only). */
export const upsertHealthPortalMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => HealthPortalMappingInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const payload = {
      jurisdiction: data.jurisdiction.trim(),
      state: data.state.trim().toUpperCase(),
      agency_type: data.agency_type,
      service_types: data.service_types,
      url: data.url.trim(),
      address_search_template: data.address_search_template?.trim() || null,
      permit_search_template: data.permit_search_template?.trim() || null,
      plan_review_url: data.plan_review_url?.trim() || null,
      notes: data.notes?.trim() || null,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { data: row, error } = await (context.supabase as any)
        .from("health_environmental_portals")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row as HealthPortalMappingRow;
    }
    const { data: row, error } = await (context.supabase as any)
      .from("health_environmental_portals")
      .insert({ ...payload, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as HealthPortalMappingRow;

  });

/** Delete a health/environmental portal mapping (admin only). */
export const deleteHealthPortalMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("health_environmental_portals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
