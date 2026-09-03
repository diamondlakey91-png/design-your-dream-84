import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runResearch } from "@/lib/sirResearchRunner.server";

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
    const { data: row, error } = await supabaseAdmin.from("sir_requests").insert({
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
    }).select("id").maybeSingle();
    if (error || !row) throw new Error("Could not submit your request. Please try again.");

    // Kick off real research in the background so the visitor gets an instant
    // confirmation. runResearch persists its own research_status/research_error,
    // and admins can re-run it, so it never blocks (or fails) the submission.
    await supabaseAdmin.from("sir_requests").update({ research_status: "queued" }).eq("id", row.id);
    const work = runResearch(row.id).catch((err: unknown) => {
      console.error("[sir] auto research failed:", (err as Error).message);
    });
    try {
      // Keep the worker alive for the background pass when the runtime supports it.
      const spec = "cloudflare:workers";
      const mod = (await import(/* @vite-ignore */ spec)) as { waitUntil?: (p: Promise<unknown>) => void };
      if (typeof mod.waitUntil === "function") mod.waitUntil(work);
    } catch {
      void work;
    }


    return { ok: true as const, id: row.id };
  });


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

/**
 * Admin/reviewer: re-run the Lead SIR Agent's compile + QA/QC gate on the
 * existing research (no new model calls) and re-queue it for review.
 */
export const compileSirForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row, error: readErr } = await context.supabase
      .from("sir_requests")
      .select("research, research_sources, research_audit")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row?.research) throw new Error("Run research before compiling the report.");

    const { leadCompileAndGate } = await import("@/lib/sirLeadOrchestrator.server");
    const gate = leadCompileAndGate(row.research, { sources: row.research_sources, audit: row.research_audit });

    const { error } = await context.supabase
      .from("sir_requests")
      .update({
        compiled_report: gate.compiled as never,
        compiled_at: new Date().toISOString(),
        qa_report: gate.qa as never,
        qa_status: gate.qa.status,
        review_stage: gate.review_stage,
        submitted_for_review_at: gate.review_stage === "professional_review_pending" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, qa: gate.qa, review_stage: gate.review_stage };
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

// ------------------------------------------------- professional review workflow

const decisionSchema = z.object({
  id: z.string().uuid(),
  finding_id: z.string().min(1).max(120),
  decision: z.enum(["approved", "modified", "rejected"]),
  note: z.string().max(2000).optional().or(z.literal("")),
  revised_text: z.string().max(4000).optional().or(z.literal("")),
});

/** Admin/reviewer: record an approve / modify / reject decision on one finding. */
export const reviewSirFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decisionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.decision === "modified" && !data.revised_text) {
      throw new Error("A modified finding requires the revised wording.");
    }
    if (data.decision === "rejected" && !data.note) {
      throw new Error("A rejected finding requires a written reason.");
    }
    const { data: row, error: readErr } = await context.supabase
      .from("sir_requests")
      .select("finding_reviews, review_status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Request not found");

    const reviews = { ...((row.finding_reviews ?? {}) as Record<string, unknown>) };
    reviews[data.finding_id] = {
      decision: data.decision,
      note: data.note || null,
      revised_text: data.revised_text || null,
      reviewer_id: context.userId,
      reviewed_at: new Date().toISOString(),
    };

    const { error } = await context.supabase
      .from("sir_requests")
      .update({
        finding_reviews: reviews as never,
        // Any edit after sign-off returns the report to in-review.
        review_status: "in_review",
        review_stage: "professional_review_pending",
        reviewed_at: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Admin/reviewer: sign off the report once every finding has a decision. */
export const finalizeSirReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reviewer_name: z.string().trim().min(1).max(200),
        reviewer_credential: z.string().trim().max(200).optional().or(z.literal("")),
        reviewer_summary: z.string().trim().max(4000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row, error: readErr } = await context.supabase
      .from("sir_requests")
      .select("research, finding_reviews, qa_status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row?.research) throw new Error("Run research before signing off the report.");
    if (row.qa_status === "blocked") {
      throw new Error("The QA/QC gate is blocking this draft. Clear the blockers and re-run QA/QC before sign-off.");
    }

    const { buildSirReport, rollupSirReview } = await import("@/lib/sirReport");
    const sections = buildSirReport(row.research);
    const rollup = rollupSirReview(sections, (row.finding_reviews ?? {}) as never);
    if (!rollup.allDecided) {
      throw new Error(`${rollup.undecided} finding(s) still need an approve, modify or reject decision.`);
    }

    const { error } = await context.supabase
      .from("sir_requests")
      .update({
        review_status: "reviewed",
        review_stage: "professionally_reviewed",
        reviewer_name: data.reviewer_name,
        reviewer_credential: data.reviewer_credential || null,
        reviewer_summary: data.reviewer_summary || null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, rollup };
  });

// ----------------------------------------------------------------- PDF export

/** Admin/reviewer: export the full Site Investigation Report as a PDF. */
export const generateSirReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row, error } = await context.supabase.from("sir_requests").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Request not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(row as any).research) throw new Error("Run research before exporting the report.");
    const { renderSirReportPdf } = await import("@/lib/sirReportPdf.server");
    return renderSirReportPdf(row);
  });
