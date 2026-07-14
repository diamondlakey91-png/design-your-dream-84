import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { generateBatchReportPdf, batchReviewPlans } from "@/lib/planReview.functions";
import { ShareReportDialog } from "@/components/project/ShareReportDialog";

export function BatchReport({ report, projectId, onClose }: { report: Awaited<ReturnType<typeof batchReviewPlans>>; projectId: string; onClose: () => void }) {
  const riskColor = report.overall_risk === "high" ? "text-destructive" : report.overall_risk === "medium" ? "text-amber-600" : "text-emerald-600";
  const [shareOpen, setShareOpen] = useState(false);
  const pdfFn = useServerFn(generateBatchReportPdf);
  const pdf = useMutation({
    mutationFn: () => pdfFn({ data: { project_id: projectId, report: report as never } }),
    onSuccess: (r: unknown) => {
      const url = (r as { url: string }).url;
      window.open(url, "_blank", "noopener");
      toast.success("Report PDF ready");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to export PDF"),
  });
  return (
    <div className="rounded-xl border border-brand/40 bg-brand/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-brand">Consolidated PermitHealth Report</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {report.documents_reviewed} plan{report.documents_reviewed === 1 ? "" : "s"} analyzed
            {report.documents_newly_reviewed > 0 ? ` · ${report.documents_newly_reviewed} newly reviewed` : ""}
            {report.jurisdictions.length > 0 ? ` · ${report.jurisdictions.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => pdf.mutate()} disabled={pdf.isPending} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50">
            {pdf.isPending ? "Exporting…" : "Export PDF"}
          </button>
          <button onClick={() => setShareOpen(true)} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80">Share</button>
          <button onClick={onClose} className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">Close</button>
        </div>
      </div>
      {shareOpen && <ShareReportDialog projectId={projectId} report={report} onClose={() => setShareOpen(false)} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Plan Health</p>
          <p className={`text-2xl font-bold ${riskColor}`}>{report.plan_health_score}</p>
          <p className="text-[10px] uppercase text-muted-foreground">{report.overall_risk} risk</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Findings</p>
          <p className="text-2xl font-bold">{report.total_findings}</p>
          <p className="text-[10px] uppercase text-destructive">{report.by_severity.high} high</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Medium</p>
          <p className="text-2xl font-bold text-amber-600">{report.by_severity.medium}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Low</p>
          <p className="text-2xl font-bold text-emerald-600">{report.by_severity.low}</p>
        </div>
      </div>

      {Object.keys(report.by_category).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(report.by_category).map(([k, v]) => (
            <span key={k} className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border border-border bg-background">
              {k.replace(/_/g, " ")} · {v}
            </span>
          ))}
        </div>
      )}

      {report.documents_failed.length > 0 && (
        <div className="text-xs text-destructive">
          Failed to review: {report.documents_failed.map((f) => f.name).join(", ")}
        </div>
      )}

      {report.top_findings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Top findings</p>
          <ul className="space-y-1.5">
            {report.top_findings.map((f, i) => (
              <li key={i} className="text-xs rounded-md border border-border bg-background p-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${f.severity === "high" ? "bg-destructive/15 text-destructive" : f.severity === "medium" ? "bg-amber-500/15 text-amber-700 dark:text-amber-500" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-500"}`}>{f.severity}</span>
                  <span className="text-[9px] font-mono uppercase text-muted-foreground">{f.category.replace(/_/g, " ")}</span>
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{f.detail}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {f.document_name}{f.sheet_reference ? ` · ${f.sheet_reference}` : ""}{f.code_reference ? ` · ${f.code_reference}` : ""}{f.local_amendment ? ` · Local: ${f.local_amendment}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.applied_amendments.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Applied amendments: {report.applied_amendments.slice(0, 6).join(" · ")}
        </p>
      )}
    </div>
  );
}
