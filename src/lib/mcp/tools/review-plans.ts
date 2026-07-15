import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { runPlanReviewForDocument } from "@/lib/planReview.functions";
import { getEntitlement, requireFeature } from "@/lib/entitlements";

export default defineTool({
  name: "review_plans",
  title: "AI plan review",
  description:
    "Run AI plan review across all uploaded plan documents (PDF/image) in a Permivio project. Returns per-document findings (egress, ADA, fire code, permitting mistakes) with severity, code references, and a consolidated summary. Runs sequentially and may take a while for large projects.",
  inputSchema: {
    project_id: z.string().describe("Project UUID"),
    force: z
      .boolean()
      .optional()
      .describe("Re-review documents that already have a stored review. Defaults to false (only new plans)."),
    document_id: z
      .string()
      .optional()
      .describe("Optional single document UUID to review instead of the whole project."),
  },
  annotations: { readOnlyHint: false, openWorldHint: true },
  handler: async ({ project_id, force, document_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    if (!userId)
      return { content: [{ type: "text", text: "Missing user id in token" }], isError: true };

    try {
      requireFeature(await getEntitlement(supabase, userId), "planReview");
    } catch (e) {
      return {
        content: [{ type: "text", text: e instanceof Error ? e.message : "Plan review not available on your plan" }],
        isError: true,
      };
    }

    // Single-document mode.
    if (document_id) {
      try {
        const review = await runPlanReviewForDocument(supabase, userId, document_id);
        return {
          content: [{ type: "text", text: JSON.stringify(review, null, 2) }],
          structuredContent: { review },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: e instanceof Error ? e.message : "Plan review failed" }],
          isError: true,
        };
      }
    }

    // Project-wide batch mode.
    const { data: docs, error } = await supabase
      .from("project_documents")
      .select("id, name, mime_type, plan_review, plan_reviewed_at")
      .eq("project_id", project_id);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const isPlan = (d: { name: string; mime_type: string | null }) =>
      (d.mime_type || "").startsWith("image/") ||
      (d.mime_type || "") === "application/pdf" ||
      d.name.toLowerCase().endsWith(".pdf");

    const plans = (docs ?? []).filter(isPlan);
    if (plans.length === 0)
      return {
        content: [{ type: "text", text: "No plan documents (PDF or image) uploaded to this project." }],
        isError: true,
      };

    const targets = force ? plans : plans.filter((d) => !d.plan_reviewed_at);

    const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];
    for (const d of targets) {
      try {
        await runPlanReviewForDocument(supabase, userId, d.id);
        results.push({ id: d.id, name: d.name, ok: true });
      } catch (err) {
        results.push({ id: d.id, name: d.name, ok: false, error: err instanceof Error ? err.message : "Failed" });
      }
    }

    const { data: refreshed } = await supabase
      .from("project_documents")
      .select("id, name, plan_review, plan_reviewed_at")
      .eq("project_id", project_id)
      .in("id", plans.map((p) => p.id));

    type Finding = {
      category: string;
      severity: "low" | "medium" | "high";
      title: string;
      detail: string;
      code_reference?: string;
      recommendation?: string;
      document_name: string;
      document_id: string;
    };
    const allFindings: Finding[] = [];
    const perDoc: Array<{ id: string; name: string; risk: string; count: number; summary: string }> = [];
    for (const d of refreshed ?? []) {
      const pr = d.plan_review as {
        overall_summary?: string;
        overall_risk?: "low" | "medium" | "high";
        findings?: Array<Omit<Finding, "document_name" | "document_id">>;
      } | null;
      if (!pr) continue;
      const findings = pr.findings ?? [];
      for (const f of findings) allFindings.push({ ...f, document_name: d.name, document_id: d.id });
      perDoc.push({
        id: d.id,
        name: d.name,
        risk: pr.overall_risk || "medium",
        count: findings.length,
        summary: pr.overall_summary || "",
      });
    }

    const bySeverity = { high: 0, medium: 0, low: 0 };
    for (const f of allFindings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;

    const report = {
      project_id,
      documents_total: plans.length,
      documents_reviewed: perDoc.length,
      documents_newly_reviewed: results.filter((r) => r.ok).length,
      documents_failed: results.filter((r) => !r.ok),
      total_findings: allFindings.length,
      by_severity: bySeverity,
      per_document: perDoc,
      findings: allFindings,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      structuredContent: { report },
    };
  },
});
