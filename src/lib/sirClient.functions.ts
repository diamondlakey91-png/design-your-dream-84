import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Client-facing Site Investigation Report workspace: a signed-in client submits
 * a brief, watches the research progress and downloads the report once a
 * Permivio professional has reviewed and released it. Every read is scoped to
 * the caller's own briefs.
 */

const briefSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(200),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().email("A valid email is required").max(320),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  projectStage: z.string().trim().max(80).optional().or(z.literal("")),
  siteAddress: z.string().trim().max(300).optional().or(z.literal("")),
  jurisdiction: z.string().trim().min(1, "City / county / state is required").max(300),
  parcelApn: z.string().trim().max(120).optional().or(z.literal("")),
  approxSize: z.string().trim().max(120).optional().or(z.literal("")),
  intendedUse: z.string().trim().min(1, "Describe the intended use / scope").max(4000),
  existingBuilding: z.enum(["yes", "no", "unknown"]).optional(),
  targetDate: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  /** Which Permivio product this brief produces. */
  kind: z.enum(["sir", "feasibility"]).default("sir"),
});

export type SirBriefInput = z.infer<typeof briefSchema>;

/** Client: submit a brief and start the research pass in the background. */
export const submitSirBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => briefSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sir_requests")
      .insert({
        client_user_id: context.userId,
        name: data.name,
        company: data.company || null,
        email: data.email,
        phone: data.phone || null,
        project_stage: data.projectStage || null,
        site_address: data.siteAddress || null,
        jurisdiction: data.jurisdiction,
        parcel_apn: data.parcelApn || null,
        approx_size: data.approxSize || null,
        intended_use: data.intendedUse,
        existing_building: data.existingBuilding || null,
        target_date: data.targetDate || null,
        notes: data.notes || null,
        report_kind: data.kind,
        report_needed: data.kind === "feasibility" ? "Project Feasibility Report" : "Site Investigation Report",
        research_status: "queued",
      } as never)
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Could not submit your brief. Please try again.");

    // The research pass runs in the background so the client gets an instant
    // confirmation; it persists its own status and can be re-run by a reviewer.
    const { runResearch } = await import("@/lib/sirResearchRunner.server");
    const work = runResearch(row.id).catch((err: unknown) => {
      console.error("[sir] client brief research failed:", (err as Error).message);
    });
    try {
      const spec = "cloudflare:workers";
      const mod = (await import(/* @vite-ignore */ spec)) as { waitUntil?: (p: Promise<unknown>) => void };
      if (typeof mod.waitUntil === "function") mod.waitUntil(work);
    } catch {
      void work;
    }

    return { ok: true as const, id: row.id };
  });

const PROGRESS_COLUMNS =
  "id, created_at, report_kind, name, company, jurisdiction, site_address, intended_use, approx_size, target_date, research_status, research_error, researched_at, resolved_jurisdiction, research_audit, qa_status, review_stage, review_status, reviewer_name, reviewer_credential, reviewed_at, released_to_client_at";

/** Client: every brief the caller has submitted, newest first. */
export const listMySirBriefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["sir", "feasibility"]).default("sir") }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sir_requests")
      .select(PROGRESS_COLUMNS)
      .eq("client_user_id", context.userId)
      .eq("report_kind", data.kind)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Client: one brief with its research progress. The report body is only
 * included once a professional review has been released to the client.
 */
export const getMySirBrief = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sir_requests")
      .select("*")
      .eq("id", data.id)
      .eq("client_user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Brief not found");

    const released = Boolean(row.released_to_client_at);
    return {
      released,
      kind: (row as { report_kind?: string }).report_kind ?? "sir",
      brief: {
        id: row.id,
        created_at: row.created_at,
        name: row.name,
        company: row.company,
        email: row.email,
        jurisdiction: row.jurisdiction,
        site_address: row.site_address,
        intended_use: row.intended_use,
        approx_size: row.approx_size,
        existing_building: row.existing_building,
        target_date: row.target_date,
        notes: row.notes,
      },
      progress: {
        research_status: row.research_status,
        research_error: row.research_error,
        researched_at: row.researched_at,
        resolved_jurisdiction: row.resolved_jurisdiction,
        research_audit: row.research_audit,
        qa_status: row.qa_status,
        review_stage: row.review_stage,
        review_status: row.review_status,
        reviewer_name: row.reviewer_name,
        reviewer_credential: row.reviewer_credential,
        reviewer_summary: row.reviewer_summary,
        reviewed_at: row.reviewed_at,
        released_to_client_at: row.released_to_client_at,
      },
      // Findings stay internal until a professional signs off and releases it,
      // so a client never reads unreviewed AI research as a deliverable.
      report: released
        ? {
            research: row.research,
            sources: row.research_sources,
            finding_reviews: row.finding_reviews,
          }
        : null,
    };
  });

/** Client: download the released report PDF for one of the caller's briefs. */
export const downloadMySirReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sir_requests")
      .select("*")
      .eq("id", data.id)
      .eq("client_user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Brief not found");
    if (!row.released_to_client_at) {
      throw new Error("Your report is still in professional review. It will be available here once it is released.");
    }
    const { renderSirReportPdf } = await import("@/lib/sirReportPdf.server");
    return renderSirReportPdf(row);
  });
