// Phase 2C Plan Review workspace reads/writes. Reuses qaqc_reviews / qaqc_findings /
// qaqc_sheets / plan_sets — no parallel review system. All reads run as the caller (RLS).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FINDING_STATUSES } from "@/lib/planReviewUx";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function staffCheck(sb: any, userId: string) {
  const [a, i] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
    sb.rpc("has_role", { _user_id: userId, _role: "internal_ai" }),
  ]);
  return { admin: a.data === true, internal: i.data === true, staff: a.data === true || i.data === true };
}

/** Everything the Plan Review entry + pre-run screen needs. Viewing is free. */
export const getPlanReviewOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const pid = data.project_id;
    const [proj, conf, sets, reviews, findings] = await Promise.all([
      sb.from("projects").select("id,name,location,jurisdiction,project_type,work_type,occupancy_class,scope_description").eq("id", pid).maybeSingle(),
      sb.from("jurisdiction_confirmations").select("status,city,state,formatted_address").eq("project_id", pid).maybeSingle(),
      sb.from("plan_sets").select("id,title,version_number,is_current,issue_date,revision_label,document_ids,sheet_count,disciplines,created_at").eq("project_id", pid).eq("archived", false).order("version_number", { ascending: false }),
      sb.from("qaqc_reviews").select("id,plan_set_id,revision_label,status,created_at,completed_at,error,document_ids").eq("project_id", pid).order("created_at", { ascending: false }),
      sb.from("qaqc_findings").select("review_id,status,severity,qaqc_reviews!inner(project_id)").eq("qaqc_reviews.project_id", pid),
    ]);
    if (!proj.data) throw new Error("Project not found");
    const setIds = (sets.data ?? []).map((s) => s.id);
    const { data: psheets } = setIds.length
      ? await sb.from("plan_set_sheets").select("plan_set_id,discipline").in("plan_set_id", setIds)
      : { data: [] as Array<{ plan_set_id: string; discipline: string | null }> };
    const { creditBalance } = await import("@/lib/commerce.server");
    const [balance, roles] = await Promise.all([
      creditBalance(sb, context.userId, "plan_review_credits"),
      staffCheck(sb, context.userId),
    ]);
    const counts: Record<string, { total: number; open: number; high: number }> = {};
    for (const f of findings.data ?? []) {
      const c = (counts[f.review_id] ??= { total: 0, open: 0, high: 0 });
      c.total++;
      if (f.status === "open" || f.status === "needs_review") {
        c.open++;
        if (f.severity === "critical" || f.severity === "high") c.high++;
      }
    }
    return {
      project: proj.data,
      jurisdiction: conf.data ?? null,
      planSets: (sets.data ?? []).map((s) => {
        const rows = (psheets ?? []).filter((x) => x.plan_set_id === s.id);
        const disc = Array.from(new Set([...(s.disciplines ?? []), ...rows.map((r) => r.discipline).filter(Boolean) as string[]]));
        return { ...s, known_sheets: rows.length || s.sheet_count || 0, file_count: (s.document_ids ?? []).length, disciplines: disc };
      }),
      reviews: (reviews.data ?? []).map((r) => ({ ...r, counts: counts[r.id] ?? { total: 0, open: 0, high: 0 } })),
      balance,
      internalAccess: roles.internal,
      staff: roles.staff,
    };
  });

export const setQaQcFindingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ finding_id: z.string().uuid(), status: z.enum(FINDING_STATUSES) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("qaqc_findings").update({ status: data.status }).eq("id", data.finding_id).select("id,status").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Finding not found");
    return row;
  });

/** Short-lived link to a drawing that belongs to the review (never an arbitrary doc). */
export const getReviewDrawingUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ review_id: z.string().uuid(), document_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: review } = await sb.from("qaqc_reviews").select("id,project_id,document_ids").eq("id", data.review_id).maybeSingle();
    if (!review || !(review.document_ids ?? []).includes(data.document_id)) throw new Error("Drawing not found");
    const { data: doc } = await sb.from("project_documents").select("id,name,mime_type,storage_path,project_id").eq("id", data.document_id).maybeSingle();
    if (!doc || doc.project_id !== review.project_id) throw new Error("Drawing not found");
    const { data: signed } = await sb.storage.from("project-docs").createSignedUrl(doc.storage_path, 600);
    if (!signed?.signedUrl) throw new Error("Could not open this drawing");
    return { url: signed.signedUrl, name: doc.name, mime_type: doc.mime_type };
  });

// ------------------------------------------------ internal beta evaluation (staff only)

export const listReviewEvaluations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ review_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await staffCheck(context.supabase, context.userId);
    if (!roles.staff) return { staff: false, evaluations: [] };
    const { data: rows } = await context.supabase.from("qaqc_evaluations").select("*").eq("review_id", data.review_id).order("created_at");
    return { staff: true, evaluations: rows ?? [] };
  });

export const saveFindingEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    review_id: z.string().uuid(),
    finding_id: z.string().uuid(),
    accuracy: z.enum(["accurate", "partially_accurate", "false_positive"]).nullable(),
    usefulness: z.enum(["useful", "not_useful"]).nullable(),
    notes: z.string().max(2000).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    if (!(await staffCheck(sb, context.userId)).staff) throw new Error("Not permitted");
    const { data: f } = await sb.from("qaqc_findings").select("id,review_id").eq("id", data.finding_id).maybeSingle();
    if (!f || f.review_id !== data.review_id) throw new Error("Finding not found");
    const { data: existing } = await sb.from("qaqc_evaluations").select("id").eq("finding_id", data.finding_id).eq("evaluator_id", context.userId).maybeSingle();
    const row = { accuracy: data.accuracy, usefulness: data.usefulness, notes: data.notes };
    const res = existing
      ? await sb.from("qaqc_evaluations").update(row).eq("id", existing.id)
      : await sb.from("qaqc_evaluations").insert({ ...row, review_id: data.review_id, finding_id: data.finding_id, kind: "finding", evaluator_id: context.userId });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

export const addMissedIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    review_id: z.string().uuid(), sheet_number: z.string().max(40).nullable(), notes: z.string().min(3).max(2000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    if (!(await staffCheck(sb, context.userId)).staff) throw new Error("Not permitted");
    const { error } = await sb.from("qaqc_evaluations").insert({
      review_id: data.review_id, kind: "missed_issue", sheet_number: data.sheet_number, notes: data.notes, evaluator_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Beta metrics for one review, from the review itself + the unified AI usage ledger. */
export const getPlanReviewMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ review_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    if (!(await staffCheck(sb, context.userId)).staff) throw new Error("Not permitted");
    const { data: r } = await sb.from("qaqc_reviews").select("*").eq("id", data.review_id).maybeSingle();
    if (!r) throw new Error("Review not found");
    const [{ data: f }, { data: sh }] = await Promise.all([
      sb.from("qaqc_findings").select("severity,confidence,code_basis,jurisdiction_source_url,verification").eq("review_id", r.id),
      sb.from("qaqc_sheets").select("discipline,index_state").eq("review_id", r.id),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usage } = r.request_key
      ? await supabaseAdmin.from("ai_usage_log").select("model,input_tokens,output_tokens,estimated_cost,credits_charged,refunded,internal_use,success,error,created_at,request_key")
          .or(`request_key.eq."${r.request_key}",request_key.like."${r.request_key}:failed:*"`)
      : { data: [] };
    const findings = f ?? [];
    const sev: Record<string, number> = {};
    for (const x of findings) sev[x.severity] = (sev[x.severity] ?? 0) + 1;
    const u = usage ?? [];
    return {
      plan_set_id: r.plan_set_id,
      revision_label: r.revision_label,
      sheet_count: r.sheet_count ?? (sh ?? []).filter((s) => s.index_state !== "missing_from_upload").length,
      disciplines: Array.from(new Set((sh ?? []).map((s) => s.discipline))),
      duration_seconds: r.started_at && r.completed_at ? Math.round((+new Date(r.completed_at) - +new Date(r.started_at)) / 1000) : null,
      findings: findings.length,
      by_severity: sev,
      citations: findings.filter((x) => (x.code_basis ?? "").trim()).length,
      citations_with_source: findings.filter((x) => (x.jurisdiction_source_url ?? "").trim()).length,
      citations_verified: findings.filter((x) => x.verification === "verified_requirement").length,
      low_confidence: findings.filter((x) => x.confidence === "low").length,
      models: Array.from(new Set(u.map((x) => x.model).filter(Boolean))),
      input_tokens: u.reduce((a, x) => a + (x.input_tokens ?? 0), 0),
      output_tokens: u.reduce((a, x) => a + (x.output_tokens ?? 0), 0),
      estimated_cost_usd: u.reduce((a, x) => a + Number(x.estimated_cost ?? 0), 0),
      credits_charged: u.reduce((a, x) => a + (x.credits_charged ?? 0), 0),
      credits_restored: u.filter((x) => x.refunded).length,
      internal_use: u.some((x) => x.internal_use),
      attempts: u.length,
      failures: u.filter((x) => !x.success).length,
    };
  });
