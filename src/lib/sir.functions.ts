import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const sirRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().email("A valid email is required").max(320),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.string().trim().max(80).optional().or(z.literal("")),
  projectStage: z.string().trim().max(80).optional().or(z.literal("")),
  siteAddress: z.string().trim().max(300).optional().or(z.literal("")),
  jurisdiction: z.string().trim().min(1, "City / state / county is required").max(300),
  parcelApn: z.string().trim().max(120).optional().or(z.literal("")),
  approxSize: z.string().trim().max(120).optional().or(z.literal("")),
  intendedUse: z.string().trim().min(1, "Intended use is required").max(4000),
  existingBuilding: z.string().trim().max(40).optional().or(z.literal("")),
  reportNeeded: z.string().trim().max(80).optional().or(z.literal("")),
  targetDate: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  // Honeypot — must stay empty
  website: z.string().max(0).optional().or(z.literal("")),
});

export type SirRequestInput = z.infer<typeof sirRequestSchema>;

export const submitSirRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => sirRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sir_requests").insert({
      name: data.name,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      role: data.role || null,
      project_stage: data.projectStage || null,
      site_address: data.siteAddress || null,
      jurisdiction: data.jurisdiction,
      parcel_apn: data.parcelApn || null,
      approx_size: data.approxSize || null,
      intended_use: data.intendedUse,
      existing_building: data.existingBuilding || null,
      report_needed: data.reportNeeded || null,
      target_date: data.targetDate || null,
      notes: data.notes || null,
    });
    if (error || !row) throw new Error("Could not submit your request. Please try again.");

    // Kick off real research immediately so the report shell is populated when a
    // Permivio reviewer opens the request. Failures never block the submission.
    try {
      await runResearch(row.id);
    } catch (err) {
      console.error("[sir] auto research failed:", (err as Error).message);
    }

    return { ok: true as const, id: row.id };
  });

/** Resolve jurisdiction → research official sources → persist the structured scope. */
async function runResearch(requestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { researchSirRequestRow, SIR_RESEARCH_MODEL } = await import("@/lib/sirResearch.server");

  const { data: row } = await supabaseAdmin.from("sir_requests").select("*").eq("id", requestId).maybeSingle();
  if (!row) throw new Error("Request not found");

  await supabaseAdmin.from("sir_requests").update({ research_status: "running", research_error: null }).eq("id", requestId);

  try {
    const { resolved, research, sources } = await researchSirRequestRow(row);
    const { error } = await supabaseAdmin
      .from("sir_requests")
      .update({
        research_status: "complete",
        research: research as never,
        resolved_jurisdiction: resolved as never,
        research_sources: sources as never,
        research_model: SIR_RESEARCH_MODEL,
        researched_at: new Date().toISOString(),
        research_error: null,
      })
      .eq("id", requestId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (err) {
    await supabaseAdmin
      .from("sir_requests")
      .update({ research_status: "failed", research_error: (err as Error).message.slice(0, 500) })
      .eq("id", requestId);
    throw err;
  }
}

async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Admin: every request with its research state. */
export const listSirRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("sir_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Admin: (re)run the research pass for one request. */
export const researchSirRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    return runResearch(data.id);
  });

/** Admin: move a request through intake triage. */
export const updateSirRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["new", "reviewing", "scoped", "quoted", "won", "closed"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("sir_requests").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
