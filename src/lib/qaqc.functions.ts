import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- QA/QC gate: pre-submittal quality control across plans, comments, checklist ----

type Severity = "low" | "medium" | "high";

type PlanReview = {
  overall_risk?: Severity;
  overall_summary?: string;
  findings?: Array<{
    category?: string;
    severity?: Severity;
    title?: string;
    detail?: string;
    code_reference?: string;
    recommendation?: string;
    verification?: string;
  }>;
};

export type QaCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail" | "unknown";
  blocking: boolean;
  detail: string;
};

const isPlan = (d: { name: string; mime_type: string | null }) =>
  (d.mime_type || "").startsWith("image/") ||
  (d.mime_type || "") === "application/pdf" ||
  d.name.toLowerCase().endsWith(".pdf");

export const getQaQcStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [proj, docs, comments, items, signoffs] = await Promise.all([
      sb
        .from("projects")
        .select("id,name,jurisdiction,location,project_type")
        .eq("id", data.project_id)
        .maybeSingle(),
      sb
        .from("project_documents")
        .select("id,name,mime_type,plan_review,plan_reviewed_at,analyzed_at")
        .eq("project_id", data.project_id),
      sb
        .from("comment_responses")
        .select("id,comment_no,status,severity,discipline,comment_text,response_text")
        .eq("project_id", data.project_id),
      sb.from("permit_items").select("id,name,status,required").eq("project_id", data.project_id),
      sb
        .from("qa_signoffs")
        .select("*")
        .eq("project_id", data.project_id)
        .order("created_at", { ascending: false }),
    ]);

    if (proj.error) throw new Error(proj.error.message);
    if (!proj.data) throw new Error("Project not found");

    const allDocs = docs.data ?? [];
    const plans = allDocs.filter(isPlan);
    const reviewed = plans.filter((d) => !!d.plan_reviewed_at);
    const unreviewed = plans.filter((d) => !d.plan_reviewed_at);

    const findings: Array<{
      document_id: string;
      document_name: string;
      severity: Severity;
      title: string;
      detail: string;
      category: string;
      code_reference: string | null;
      recommendation: string | null;
      verification: string;
    }> = [];

    for (const d of reviewed) {
      const pr = (d.plan_review ?? null) as PlanReview | null;
      for (const f of pr?.findings ?? []) {
        findings.push({
          document_id: d.id,
          document_name: d.name,
          severity: (f.severity ?? "medium") as Severity,
          title: f.title ?? "Finding",
          detail: f.detail ?? "",
          category: f.category ?? "General",
          code_reference: f.code_reference ?? null,
          recommendation: f.recommendation ?? null,
          verification: f.verification ?? "needs_human_review",
        });
      }
    }

    const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const f of findings) bySeverity[f.severity] += 1;

    const allComments = comments.data ?? [];
    const openComments = allComments.filter((c) => !["resolved", "responded", "n_a"].includes(c.status ?? ""));
    const undrafted = allComments.filter(
      (c) => !["resolved", "n_a"].includes(c.status ?? "") && !(c.response_text ?? "").trim(),
    );

    const allItems = items.data ?? [];
    const requiredItems = allItems.filter((i) => i.required);
    const unstartedRequired = requiredItems.filter((i) => (i.status ?? "not_started") === "not_started");

    const checks: QaCheck[] = [
      {
        key: "plans_uploaded",
        label: "Plan set uploaded",
        status: plans.length > 0 ? "pass" : "fail",
        blocking: true,
        detail:
          plans.length > 0
            ? `${plans.length} plan document${plans.length === 1 ? "" : "s"} in the vault.`
            : "No PDF or image plan documents uploaded yet.",
      },
      {
        key: "plans_reviewed",
        label: "Every plan run through AI Plan Review",
        status: plans.length === 0 ? "unknown" : unreviewed.length === 0 ? "pass" : "fail",
        blocking: true,
        detail:
          plans.length === 0
            ? "Upload plans first."
            : unreviewed.length === 0
              ? `All ${plans.length} plans reviewed.`
              : `${unreviewed.length} not reviewed: ${unreviewed.map((d) => d.name).slice(0, 4).join(", ")}${unreviewed.length > 4 ? "…" : ""}`,
      },
      {
        key: "high_findings",
        label: "No high-severity plan review findings open",
        status: bySeverity.high === 0 ? "pass" : "fail",
        blocking: true,
        detail:
          bySeverity.high === 0
            ? "No high-severity findings recorded."
            : `${bySeverity.high} high-severity finding${bySeverity.high === 1 ? "" : "s"} require resolution or documented justification. AI Suggested — verify against the adopted code before submittal.`,
      },
      {
        key: "medium_findings",
        label: "Medium-severity findings triaged",
        status: bySeverity.medium === 0 ? "pass" : "warn",
        blocking: false,
        detail:
          bySeverity.medium === 0
            ? "None outstanding."
            : `${bySeverity.medium} medium finding${bySeverity.medium === 1 ? "" : "s"} — resolve or note the reasoning to avoid a second review cycle.`,
      },
      {
        key: "comments_closed",
        label: "Reviewer comments answered",
        status: allComments.length === 0 ? "unknown" : openComments.length === 0 ? "pass" : "fail",
        blocking: allComments.length > 0,
        detail:
          allComments.length === 0
            ? "No reviewer comments logged (first submittal, or comments not imported yet)."
            : openComments.length === 0
              ? `All ${allComments.length} comments responded or resolved.`
              : `${openComments.length} of ${allComments.length} comments still open or in progress.`,
      },
      {
        key: "responses_drafted",
        label: "Response text present for every comment",
        status: allComments.length === 0 ? "unknown" : undrafted.length === 0 ? "pass" : "warn",
        blocking: false,
        detail:
          allComments.length === 0
            ? "Nothing to draft."
            : undrafted.length === 0
              ? "Every comment carries a written response."
              : `${undrafted.length} comment${undrafted.length === 1 ? "" : "s"} without response text.`,
      },
      {
        key: "jurisdiction",
        label: "Jurisdiction and address on record",
        status: proj.data.jurisdiction && proj.data.location ? "pass" : "fail",
        blocking: true,
        detail:
          proj.data.jurisdiction && proj.data.location
            ? `${proj.data.jurisdiction} · ${proj.data.location}`
            : "Confirm the exact authority having jurisdiction and the project address before submitting.",
      },
      {
        key: "checklist",
        label: "Required permit checklist started",
        status: requiredItems.length === 0 ? "unknown" : unstartedRequired.length === 0 ? "pass" : "warn",
        blocking: false,
        detail:
          requiredItems.length === 0
            ? "No checklist generated yet."
            : unstartedRequired.length === 0
              ? `All ${requiredItems.length} required items in motion.`
              : `${unstartedRequired.length} required item${unstartedRequired.length === 1 ? "" : "s"} not started: ${unstartedRequired.map((i) => i.name).slice(0, 3).join(", ")}${unstartedRequired.length > 3 ? "…" : ""}`,
      },
    ];

    const blockers = checks.filter((c) => c.blocking && c.status === "fail");
    const warnings = checks.filter((c) => c.status === "warn");

    const latest = (signoffs.data ?? [])[0] ?? null;
    const latestSignoffStale =
      latest && latest.snapshot && typeof latest.snapshot === "object"
        ? (latest.snapshot as { plans_reviewed?: number }).plans_reviewed !== reviewed.length
        : false;

    return {
      project: {
        id: proj.data.id,
        name: proj.data.name,
        jurisdiction: proj.data.jurisdiction,
        location: proj.data.location,
        project_type: proj.data.project_type,
      },
      checks,
      gate_passed: blockers.length === 0,
      blockers: blockers.map((b) => b.label),
      warnings: warnings.map((w) => w.label),
      counts: {
        plans_total: plans.length,
        plans_reviewed: reviewed.length,
        findings_total: findings.length,
        findings_by_severity: bySeverity,
        comments_total: allComments.length,
        comments_open: openComments.length,
        required_items: requiredItems.length,
      },
      findings: findings.sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 } as const;
        return rank[a.severity] - rank[b.severity];
      }),
      open_comments: openComments.map((c) => ({
        id: c.id,
        comment_no: c.comment_no,
        status: c.status,
        severity: c.severity,
        discipline: c.discipline,
        comment_text: c.comment_text,
        has_response: !!(c.response_text ?? "").trim(),
      })),
      signoffs: signoffs.data ?? [],
      latest_signoff_stale: latestSignoffStale,
    };
  });

export const createQaSignoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project_id: z.string().uuid(),
        scope: z.enum(["pre_submittal", "resubmittal"]).default("pre_submittal"),
        signed_by_name: z.string().min(1).max(200),
        signed_by_role: z.string().max(200).optional(),
        notes: z.string().max(4000).optional(),
        gate_passed: z.boolean(),
        overridden: z.boolean().default(false),
        override_reason: z.string().max(2000).optional(),
        snapshot: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.gate_passed && !data.overridden)
      throw new Error("QA/QC gate has blocking items. Resolve them or record an explicit override reason.");
    if (data.overridden && !(data.override_reason ?? "").trim())
      throw new Error("An override requires a written reason.");

    const { data: row, error } = await context.supabase
      .from("qa_signoffs")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        scope: data.scope,
        signed_by_name: data.signed_by_name.trim(),
        signed_by_role: data.signed_by_role?.trim() || null,
        notes: data.notes?.trim() || null,
        gate_passed: data.gate_passed,
        overridden: data.overridden,
        override_reason: data.override_reason?.trim() || null,
        snapshot: data.snapshot as never,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("activity").insert({
      project_id: data.project_id,
      user_id: context.userId,
      description: `QA/QC ${data.scope.replace(/_/g, " ")} sign-off by ${data.signed_by_name.trim()}${data.overridden ? " (override)" : ""}`,
    });

    return row;
  });

export const deleteQaSignoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("qa_signoffs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
