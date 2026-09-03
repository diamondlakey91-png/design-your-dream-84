import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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


/** Resolve jurisdiction → research official sources → persist the structured scope. */
async function runResearch(requestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runSirLeadAgent, SIR_LEAD_AGENT_MODEL } = await import("@/lib/sirLeadAgent.server");

  const { data: row } = await supabaseAdmin.from("sir_requests").select("*").eq("id", requestId).maybeSingle();
  if (!row) throw new Error("Request not found");

  await supabaseAdmin.from("sir_requests").update({ research_status: "running", research_error: null, qa_status: "pending", review_stage: "draft" }).eq("id", requestId);

  try {
    // The Lead Project Intelligence Agent orchestrates the specialist research
    // passes and gates every claim against the harvested official evidence.
    const { resolved, research, sources, audit } = await runSirLeadAgent(row);

    // Lead SIR Agent, second half: compile the final draft, run the QA/QC gate
    // and queue it for internal professional review (or hold it as QA-blocked).
    const { leadCompileAndGate } = await import("@/lib/sirLeadOrchestrator.server");
    const gate = leadCompileAndGate(research, { sources, audit });

    const { error } = await supabaseAdmin
      .from("sir_requests")
      .update({
        research_status: "complete",
        compiled_report: gate.compiled as never,
        compiled_at: new Date().toISOString(),
        qa_report: gate.qa as never,
        qa_status: gate.qa.status,
        review_stage: gate.review_stage,
        submitted_for_review_at: gate.review_stage === "professional_review_pending" ? new Date().toISOString() : null,
        research: research as never,
        resolved_jurisdiction: resolved as never,
        research_sources: sources as never,
        research_model: SIR_LEAD_AGENT_MODEL,
        research_audit: audit as never,
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

function sirPdfSafe(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/[^\x20-\x7E]/g, " ");
}

/** Admin/reviewer: export the full Site Investigation Report as a PDF. */
export const generateSirReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row, error } = await context.supabase.from("sir_requests").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    if (!r) throw new Error("Request not found");
    if (!r.research) throw new Error("Run research before exporting the report.");

    const {
      buildSirReport,
      buildSirSnapshot,
      buildSirRiskMatrix,
      rollupSirReview,
      effectiveFindingText,
      SIR_REPORT_DISCLAIMER,
      SIR_PROFESSIONAL_REVIEW_NOTE,
      SIR_AI_RESEARCH_DISCLAIMER,
    } = await import("@/lib/sirReport");

    const sections = buildSirReport(r.research);
    const snapshot = buildSirSnapshot(r.research);
    const matrix = buildSirRiskMatrix(r.research);
    const reviews = (r.finding_reviews ?? {}) as Record<string, { decision: string; note?: string | null; revised_text?: string | null }>;
    const rollup = rollupSirReview(sections, reviews as never);
    const professionallyReviewed = r.review_status === "reviewed" && rollup.allDecided;

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([612, 792]);
    let y = 750;
    const margin = 48;
    const width = 612 - margin * 2;
    const newPage = () => { page = pdf.addPage([612, 792]); y = 750; };
    const text = (s: string, opts: { size?: number; b?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
      const size = opts.size ?? 9.5;
      const fnt = opts.b ? bold : font;
      for (const para of sirPdfSafe(s).split("\n")) {
        const words = para.split(/\s+/);
        let line = "";
        const lines: string[] = [];
        for (const w of words) {
          const t = line ? `${line} ${w}` : w;
          if (fnt.widthOfTextAtSize(t, size) > width) { lines.push(line); line = w; } else line = t;
        }
        if (line) lines.push(line);
        for (const ln of lines) {
          if (y < 60) newPage();
          page.drawText(ln, { x: margin, y, size, font: fnt, color: rgb(...(opts.color ?? [0.1, 0.12, 0.16])) });
          y -= size + 3;
        }
      }
      y -= opts.gap ?? 4;
    };
    const heading = (s: string) => { if (y < 120) newPage(); y -= 6; text(s, { size: 12, b: true, color: [0.05, 0.3, 0.75], gap: 6 }); };

    text("PERMIVIO", { size: 18, b: true, color: [0.05, 0.3, 0.75], gap: 2 });
    text("Site Investigation Report", { size: 14, b: true, gap: 6 });
    if (professionallyReviewed) {
      text("PROFESSIONALLY REVIEWED", { size: 11, b: true, color: [0.05, 0.45, 0.3], gap: 2 });
      text(`Reviewer: ${r.reviewer_name ?? ""}${r.reviewer_credential ? ` · ${r.reviewer_credential}` : ""} · ${new Date(r.reviewed_at).toLocaleDateString()}`, { size: 9, gap: 4 });
      text(SIR_PROFESSIONAL_REVIEW_NOTE, { size: 8, color: [0.35, 0.38, 0.44], gap: 6 });
    } else {
      text("AI-ASSISTED RESEARCH - NOT YET PROFESSIONALLY REVIEWED", { size: 10, b: true, color: [0.55, 0.15, 0.15], gap: 6 });
    }

    text(`Prepared for: ${r.name}${r.company ? ` (${r.company})` : ""}`);
    text(`Site address: ${r.site_address || "not provided"}`);
    text(`Jurisdiction: ${r.jurisdiction}`);
    if (r.parcel_apn) text(`Parcel / APN: ${r.parcel_apn}`);
    text(`Intended use / scope: ${r.intended_use}`);
    text(`Prepared: ${new Date().toISOString().slice(0, 10)}`, { gap: 8 });

    heading("Executive feasibility snapshot");
    for (const s of snapshot) text(`${s.label}: ${s.value}`, { gap: 1 });
    if (r.research.scope_summary) { y -= 4; text(r.research.scope_summary); }

    for (const section of sections) {
      heading(`${section.no}. ${section.title}`);
      text(section.intro, { size: 8.5, color: [0.35, 0.38, 0.44] });
      for (const m of section.modules) {
        text(m.label, { b: true, gap: 1 });
        if (m.summary) text(`   ${m.summary}`, { gap: 1 });
        for (const f of m.findings) {
          const rev = reviews[f.id];
          if (rev?.decision === "rejected") continue;
          const tags = [f.verification.replace(/_/g, " "), ...(rev ? [`reviewer ${rev.decision}`] : [])];
          text(`- ${f.title} [${tags.join(" · ")}]`, { gap: 1 });
          const detail = effectiveFindingText(f, rev as never);
          if (detail) text(`   ${detail}`, { gap: 1 });
          if (rev?.note) text(`   Reviewer note: ${rev.note}`, { size: 8, color: [0.35, 0.38, 0.44], gap: 1 });
          if (f.source) text(`   Source: ${f.source}`, { size: 8, color: [0.35, 0.38, 0.44], gap: 1 });
        }
        y -= 3;
      }
    }

    if (matrix.length) {
      heading("Risk matrix");
      for (const g of matrix) {
        text(`${g.level.toUpperCase()} severity`, { b: true, gap: 1 });
        for (const it of g.items) {
          if (reviews[it.id]?.decision === "rejected") continue;
          text(`- ${it.title}${it.why ? `: ${it.why}` : ""}`, { gap: 1 });
        }
      }
    }

    const sources = (r.research_sources ?? []) as Array<{ url: string; title: string }>;
    if (sources.length) {
      heading("Official sources");
      for (const s of sources) text(`- ${s.title || s.url}: ${s.url}`, { size: 8, gap: 1 });
    }

    const auditRec = r.research_audit as
      | { agents?: Array<{ role: string; status: string; items: number; cited: number }>; evidence_sources?: number; coverage_gaps?: string[]; citation_downgrades?: Array<{ item: string; reason: string }> }
      | null;
    if (auditRec) {
      heading("How this research was produced");
      text(SIR_AI_RESEARCH_DISCLAIMER, { size: 8.5, color: [0.35, 0.38, 0.44] });
      text(`Official source pages reviewed: ${auditRec.evidence_sources ?? 0}`, { gap: 1 });
      for (const a of auditRec.agents ?? []) {
        text(`- ${a.role}: ${a.status} · ${a.items} finding(s) · ${a.cited} source-backed`, { size: 8.5, gap: 1 });
      }
      for (const g of auditRec.coverage_gaps ?? []) text(`- Coverage gap: ${g}`, { size: 8.5, gap: 1 });
      for (const d of auditRec.citation_downgrades ?? []) {
        text(`- Downgraded from verified: ${d.item} — ${d.reason}`, { size: 8.5, gap: 1 });
      }
    }

    heading("Assumptions and limitations");
    text(SIR_REPORT_DISCLAIMER);

    const bytes = await pdf.save();
    let bin = "";
    for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    return {
      filename: `PERMIVIO-Site-Investigation-Report-${String(r.site_address || r.jurisdiction).replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}.pdf`,
      base64: btoa(bin),
    };
  });
