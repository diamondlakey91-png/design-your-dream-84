import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Eye, Loader2, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { ReportStageTrail, STAGE_LABEL } from "@/components/reports/ReportStageTrail";
import { getMyReport, getReportPdfUrl, requestReportAction, type ClientReportStage } from "@/lib/clientReports.functions";
import { DISCLAIMER, money } from "@/lib/toolsCatalog";

export const Route = createFileRoute("/_authenticated/reports/$id")({
  head: () => ({
    meta: [
      { title: "Report workspace — Permivio" },
      { name: "description", content: "Review your Permivio report, follow its production progress, and preview or download the branded PDF." },
      { property: "og:title", content: "Report workspace — Permivio" },
      { property: "og:description", content: "Your purchased Permivio report, its findings, and the finalized PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportDetail,
});

function ReportDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetchReport = useServerFn(getMyReport);
  const fetchPdf = useServerFn(getReportPdfUrl);
  const requestAction = useServerFn(requestReportAction);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["my-report", id], queryFn: () => fetchReport({ data: { order_id: id } }) });

  const pdf = useMutation({
    mutationFn: async (args: { version_id: string; download: boolean }) => {
      const res = await fetchPdf({ data: { version_id: args.version_id } });
      if ("error" in res) throw new Error(res.error);
      return { ...res, download: args.download };
    },
    onSuccess: (res) => {
      if (res.download) {
        const a = document.createElement("a");
        a.href = res.url;
        a.download = res.filename;
        a.rel = "noopener";
        a.click();
      } else {
        setPreviewUrl(res.url);
      }
      qc.invalidateQueries({ queryKey: ["my-report", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "We couldn't open that PDF."),
  });

  const action = useMutation({
    mutationFn: (request_type: "professional_review_upgrade" | "report_update") =>
      requestAction({ data: { order_id: id, request_type } }),
    onSuccess: (_r, type) =>
      toast.success(
        type === "professional_review_upgrade"
          ? "Professional review requested — we'll confirm scope and timing with you."
          : "Report update requested — we'll follow up with next steps.",
      ),
    onError: () => toast.error("We couldn't send that request. Please try again."),
  });

  const order = q.data?.order ?? null;
  const product = q.data?.product ?? null;
  const project = q.data?.project ?? null;
  const versions = q.data?.versions ?? [];
  const latest = versions[0] ?? null;
  const reviewed = Boolean(latest?.reviewed_at);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PermivioPageHeader
        eyebrow="Report workspace"
        title={product?.client_title ?? "Your report"}
        subtitle={product?.report_subtitle ?? "Follow production, review the findings, and download your branded PDF."}
      />

      <Link to="/reports" className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to My Reports
      </Link>

      {q.isLoading && (
        <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your report…
        </p>
      )}

      {!q.isLoading && !order && (
        <p className="mt-8 rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
          We couldn't find that report on your account.
        </p>
      )}

      {order && (
        <div className="mt-6 space-y-5">
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {project ? project.name : "Not linked to a project yet"} · {money(order.amount_cents, order.currency)}
                  {order.rush ? " · expedited" : ""}
                </p>
                {project?.location && <p className="mt-0.5 text-xs text-muted-foreground">{project.location}</p>}
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  reviewed
                    ? "border-[oklch(0.75_0.16_155)]/40 bg-[oklch(0.75_0.16_155)]/10 text-[oklch(0.82_0.15_155)]"
                    : "border-primary/40 bg-primary/10 text-primary"
                }`}
              >
                {reviewed ? <ShieldCheck className="size-3.5" /> : <Sparkles className="size-3.5" />}
                {reviewed ? "Professionally reviewed" : "AI-assisted"}
              </span>
            </div>
            <ReportStageTrail stage={(order.stage as ClientReportStage) ?? "in_research"} className="mt-5" />
            <p className="mt-4 text-xs text-muted-foreground">
              Current stage: {STAGE_LABEL[(order.stage as ClientReportStage) ?? "in_research"]}
              {product?.turnaround_estimate ? ` · typical turnaround ${product.turnaround_estimate}` : ""}
            </p>
          </section>

          {latest ? (
            <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your report</h2>
              <p className="mt-3 text-base font-semibold text-foreground">
                {latest.title ?? product?.client_title} <span className="text-muted-foreground">· v{latest.version}</span>
              </p>
              {latest.report_number && <p className="mt-1 text-xs text-muted-foreground">{latest.report_number}</p>}
              {latest.summary && <p className="mt-3 text-sm text-muted-foreground">{latest.summary}</p>}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => pdf.mutate({ version_id: latest.id, download: false })}
                  disabled={pdf.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-foreground disabled:opacity-60"
                >
                  {pdf.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />} Preview PDF
                </button>
                <button
                  onClick={() => pdf.mutate({ version_id: latest.id, download: true })}
                  disabled={pdf.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  <Download className="size-3.5" /> Download PDF
                </button>
              </div>

              {previewUrl && (
                <div className="mt-5 overflow-hidden rounded-2xl border border-border">
                  <iframe title="Report preview" src={previewUrl} className="h-[70vh] w-full bg-white" />
                </div>
              )}

              {versions.length > 1 && (
                <ul className="mt-5 space-y-2 border-t border-border pt-4">
                  {versions.slice(1).map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-foreground">
                        {v.title ?? "Report"} · v{v.version} · {new Date(v.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => pdf.mutate({ version_id: v.id, download: true })}
                        className="text-primary hover:underline"
                      >
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your report</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Your report is still being prepared. As soon as the research is complete it appears here with a branded PDF you can
                preview and download.
              </p>
              {!order.project_id && (
                <p className="mt-3 rounded-2xl border border-border bg-background/40 p-3 text-xs text-muted-foreground">
                  Link this purchase to a project so we know which site to research.
                </p>
              )}
            </section>
          )}

          <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Need more?</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {!reviewed && (
                <button
                  onClick={() => action.mutate("professional_review_upgrade")}
                  disabled={action.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-foreground disabled:opacity-60"
                >
                  <UserCheck className="size-3.5" /> Add professional review
                </button>
              )}
              <button
                onClick={() => action.mutate("report_update")}
                disabled={action.isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                Request an updated version
              </button>
              <Link
                to="/tools"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Browse other reports
              </Link>
            </div>
          </section>

          <p className="rounded-3xl border border-border bg-card/60 p-5 text-xs text-muted-foreground">{DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}
