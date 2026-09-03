import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Download, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { downloadMySirReportPdf, getMySirBrief } from "@/lib/sirClient.functions";
import { ClientSirReport } from "@/components/sir/ClientSirReport";
import { SIR_AI_RESEARCH_DISCLAIMER, type SirFindingReviews } from "@/lib/sirReport";

/* eslint-disable @typescript-eslint/no-explicit-any */

function StageRow({ done, active, label, note }: { done: boolean; active?: boolean; label: string; note?: string }) {
  return (
    <li className="flex gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-400" />
      ) : active ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-blue-300" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-slate-600" />
      )}
      <div>
        <p className={`text-sm ${done || active ? "text-white" : "text-slate-500"}`}>{label}</p>
        {note && <p className="text-xs text-slate-400">{note}</p>}
      </div>
    </li>
  );
}

/**
 * Shared client progress + released-report view for a submitted brief. Used by
 * both the Site Investigation and Project Feasibility workspaces; the product
 * only changes the wording, never the research or review gates.
 */
export function BriefProgress({
  id,
  pageTitle,
  reportTitle,
  backTo,
}: {
  id: string;
  pageTitle: string;
  reportTitle: string;
  backTo: "/sir" | "/feasibility";
}) {
  const getFn = useServerFn(getMySirBrief);
  const pdfFn = useServerFn(downloadMySirReportPdf);

  const q = useQuery({
    queryKey: ["sir-brief", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: (query) => {
      const s = (query.state.data as any)?.progress?.research_status;
      return s === "queued" || s === "running" ? 8_000 : false;
    },
  });

  const download = useMutation({
    mutationFn: () => pdfFn({ data: { id } }),
    onSuccess: (res) => {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Download failed"),
  });

  const data = q.data as any;
  const progress = data?.progress;
  const researchDone = progress?.research_status === "complete";
  const reviewed = progress?.review_status === "reviewed";
  const released = Boolean(progress?.released_to_client_at);
  const agents: any[] = progress?.research_audit?.agents ?? [];

  return (
    <AppShell>
      <PermivioPageHeader title={pageTitle} subtitle={data?.brief?.site_address || data?.brief?.jurisdiction || "Brief progress"} />

      <Link to={backTo} className="mt-4 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
        <ArrowLeft className="size-3" /> All briefs
      </Link>

      {q.isPending && <p className="mt-6 text-sm text-slate-400">Loading…</p>}
      {q.isError && (
        <p className="mt-6 rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-200">
          {q.error instanceof Error ? q.error.message : "Could not load this brief"}
        </p>
      )}

      {data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="grid gap-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-semibold text-white">Progress</h2>
              <ul className="mt-3 grid gap-3">
                <StageRow done label="Brief submitted" note={new Date(data.brief.created_at).toLocaleString()} />
                <StageRow
                  done={researchDone}
                  active={progress.research_status === "queued" || progress.research_status === "running"}
                  label="Jurisdiction research"
                  note={
                    progress.resolved_jurisdiction?.jurisdiction_name
                      ? `Controlling authority: ${progress.resolved_jurisdiction.jurisdiction_name}`
                      : "Resolving the controlling authority and pulling published agency material."
                  }
                />
                <StageRow
                  done={researchDone && progress.qa_status === "passed"}
                  active={researchDone && progress.qa_status !== "passed"}
                  label="Quality control gate"
                  note={progress.qa_status === "blocked" ? "Blockers found — our team is resolving them." : undefined}
                />
                <StageRow done={reviewed} active={researchDone && !reviewed} label="Professional review" />
                <StageRow done={released} active={reviewed && !released} label="Released to you" />
              </ul>

              {progress.research_status === "failed" && (
                <p className="mt-4 flex gap-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-200">
                  <AlertTriangle className="size-4 shrink-0" />
                  Our research pass hit an error and our team has been notified. Nothing you submitted was lost.
                </p>
              )}

              {agents.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Research agents</p>
                  <ul className="mt-2 grid gap-1">
                    {agents.map((a, i) => (
                      <li key={`${a.agent}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-300">{a.role}</span>
                        <span className={a.status === "complete" ? "text-green-400" : "text-red-300"}>
                          {a.status === "complete" ? "done" : "needs manual research"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-semibold text-white">Your brief</h2>
              <dl className="mt-3 grid gap-2 text-xs">
                {[
                  ["Jurisdiction", data.brief.jurisdiction],
                  ["Site address", data.brief.site_address],
                  ["Approximate size", data.brief.approx_size],
                  ["Existing building", data.brief.existing_building],
                  ["Target date", data.brief.target_date],
                  ["Intended use", data.brief.intended_use],
                  ["Notes", data.brief.notes],
                ]
                  .filter(([, v]) => Boolean(v))
                  .map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-slate-200">{value as string}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          </div>

          <div className="grid gap-4">
            {released && data.report ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-sm text-slate-300">Your reviewed report is ready.</p>
                  <button
                    onClick={() => download.mutate()}
                    disabled={download.isPending}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-200 hover:bg-blue-500/20 disabled:opacity-60"
                  >
                    {download.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Download PDF
                  </button>
                </div>
                <ClientSirReport
                  title={reportTitle}
                  research={data.report.research}
                  sources={data.report.sources ?? null}
                  findingReviews={(data.report.finding_reviews ?? null) as SirFindingReviews | null}
                  reviewer={{
                    name: progress.reviewer_name,
                    credential: progress.reviewer_credential,
                    summary: progress.reviewer_summary,
                    reviewed_at: progress.reviewed_at,
                  }}
                />
              </>
            ) : (
              <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h2 className="text-sm font-semibold text-white">Report in preparation</h2>
                <p className="mt-2 text-sm text-slate-300">
                  We publish your report here once a Permivio professional has reviewed every finding. You'll be able to read it on this page
                  and download the branded PDF.
                </p>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">{SIR_AI_RESEARCH_DISCLAIMER}</p>
              </section>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
