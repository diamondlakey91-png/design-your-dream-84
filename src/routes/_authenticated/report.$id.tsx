import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getComplianceReport, exportComplianceReportPdf } from "@/lib/compliance.functions";
import { getAgent } from "@/lib/complianceAgents";
import { toast } from "sonner";
import { ArrowLeft, Download, ShieldCheck, Phone, Mail, Globe, AlertTriangle, Building2, DollarSign, Clock, ListChecks, BarChart3, FileText, Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/report/$id")({
  head: () => ({
    meta: [
      { title: "Compliance Report — Permivio" },
      { name: "description", content: "Multi-department permit compliance report: jurisdiction, applicable codes, verified contacts, timeline, cost, and WBS." },
      { property: "og:title", content: "Permivio Compliance Report" },
      { property: "og:description", content: "Multi-department permit compliance report from Permivio." },
    ],
  }),
  component: ReportDetailPage,
});

function ReportDetailPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getComplianceReport);
  const pdfFn = useServerFn(exportComplianceReportPdf);
  const [view, setView] = useState<"pdf" | "standard" | "wbs">("pdf");
  const [format, setFormat] = useState<"standard" | "wbs">("standard");
  const [exporting, setExporting] = useState<"standard" | "wbs" | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfData, setPdfData] = useState<{ base64: string; filename: string } | null>(null);
  const [pdfAttempt, setPdfAttempt] = useState(0);
  const lastLoadedFormat = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ["compliance-report", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 2000 : false),
  });

  const retryPdf = () => {
    lastLoadedFormat.current = null;
    setPdfError(null);
    setPdfAttempt((n) => n + 1);
  };

  // Auto-render PDF preview when report is ready or format toggles
  useEffect(() => {
    if (q.data?.status !== "completed") return;
    if (view !== "pdf") return;
    if (lastLoadedFormat.current === format && !pdfError) return;
    let cancelled = false;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      setPdfLoading(true);
      setPdfError(null);
      setPdfProgress(8);
      // Simulated progress ramp — real generation is server-side and opaque
      progressTimer = setInterval(() => {
        setPdfProgress((p) => (p >= 90 ? p : p + Math.max(1, Math.round((92 - p) / 12))));
      }, 350);
      try {
        const { pdf_base64, filename } = await pdfFn({ data: { id, format } });
        if (cancelled) return;
        const bin = atob(pdf_base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPdfData({ base64: pdf_base64, filename });
        setPdfProgress(100);
        lastLoadedFormat.current = format;
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to render PDF";
        setPdfError(msg);
        toast.error(msg);
      } finally {
        if (progressTimer) clearInterval(progressTimer);
        if (!cancelled) setPdfLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (progressTimer) clearInterval(progressTimer);
    };
  }, [q.data?.status, view, format, id, pdfFn, pdfAttempt]);


  // Cleanup on unmount
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const downloadCurrent = () => {
    if (!pdfData) return;
    const bin = atob(pdfData.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = pdfData.filename; a.click();
    URL.revokeObjectURL(url);
  };

  const doExport = async (fmt: "standard" | "wbs") => {
    try {
      setExporting(fmt);
      const { pdf_base64, filename } = await pdfFn({ data: { id, format: fmt } });
      const bin = atob(pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  if (q.isLoading) {
    return <AppShell><div className="px-4 pt-6 text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!q.data) {
    return <AppShell><div className="px-4 pt-6 text-sm text-muted-foreground">Report not found.</div></AppShell>;
  }

  const r = q.data;
  const agent = getAgent(r.agent_id);
  const report = r.report;

  if (r.status === "generating") {
    return (
      <AppShell>
        <div className="px-4 pt-6 space-y-4">
          <Link to="/report" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back</Link>
          <div className="rounded-xl border border-brand/40 bg-brand/5 p-6">
            <div className="animate-pulse text-brand font-mono text-xs uppercase tracking-widest">Generating…</div>
            <p className="mt-2 text-sm">Researching jurisdiction, departments, codes, contacts, timeline, and cost. Usually ~2 minutes.</p>
          </div>
        </div>
      </AppShell>
    );
  }
  if (r.status === "failed") {
    return (
      <AppShell>
        <div className="px-4 pt-6 space-y-4">
          <Link to="/report" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back</Link>
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-6">
            <div className="text-red-300 font-mono text-xs uppercase tracking-widest">Generation failed</div>
            <p className="mt-2 text-sm">{r.error ?? "Unknown error"}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const maxDay = (report.wbs ?? []).reduce((m, t) => Math.max(m, t.start_offset_days + t.duration_days), 1);

  return (
    <AppShell>
      <div className="px-4 pt-6 space-y-6 pb-10">
        <Link to="/report" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> All reports</Link>

        {/* Header */}
        <header className="rounded-xl border border-border bg-gradient-to-br from-brand/10 via-card to-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-brand text-[10px] font-mono uppercase tracking-widest">
            <span>{agent.emoji}</span>
            <span>{agent.label}</span>
            {typeof r.confidence === "number" && (
              <span className="ml-2 rounded-full border border-brand/40 px-2 py-0.5">Confidence {(r.confidence * 100).toFixed(0)}%</span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{r.address}</h1>
          <p className="text-sm text-muted-foreground">{r.project_type} · {report.jurisdiction}{report.jurisdiction_state ? `, ${report.jurisdiction_state}` : ""} · Authority: {report.official_department}</p>
          {report.summary && <p className="text-sm">{report.summary}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button onClick={() => setView("pdf")} className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${view === "pdf" ? "border-brand bg-brand/15 text-brand" : "border-border bg-background text-muted-foreground"}`}><FileText className="size-3.5" /> PDF Report</button>
            <button onClick={() => setView("standard")} className={`rounded-md border px-3 py-1.5 text-xs ${view === "standard" ? "border-brand bg-brand/15 text-brand" : "border-border bg-background text-muted-foreground"}`}>Detail View</button>
            <button onClick={() => setView("wbs")} className={`rounded-md border px-3 py-1.5 text-xs ${view === "wbs" ? "border-brand bg-brand/15 text-brand" : "border-border bg-background text-muted-foreground"}`}>WBS / Gantt</button>
            <div className="ml-auto flex gap-2">
              {view === "pdf" ? (
                <>
                  <div className="inline-flex rounded-md border border-border overflow-hidden">
                    <button onClick={() => setFormat("standard")} className={`px-2.5 py-1.5 text-xs ${format === "standard" ? "bg-brand/15 text-brand" : "bg-background text-muted-foreground"}`}>Standard</button>
                    <button onClick={() => setFormat("wbs")} className={`px-2.5 py-1.5 text-xs border-l border-border ${format === "wbs" ? "bg-brand/15 text-brand" : "bg-background text-muted-foreground"}`}>WBS</button>
                  </div>
                  <button disabled={!pdfData || pdfLoading} onClick={downloadCurrent} className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs text-brand hover:bg-brand/20 disabled:opacity-40">
                    <Download className="size-3.5" /> Download PDF
                  </button>
                </>
              ) : (
                <>
                  <button disabled={exporting === "standard"} onClick={() => doExport("standard")} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:border-brand disabled:opacity-40">
                    <Download className="size-3.5" /> {exporting === "standard" ? "Exporting…" : "PDF · Standard"}
                  </button>
                  <button disabled={exporting === "wbs"} onClick={() => doExport("wbs")} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:border-brand disabled:opacity-40">
                    <Download className="size-3.5" /> {exporting === "wbs" ? "Exporting…" : "PDF · WBS"}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {view === "pdf" ? (
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            {pdfLoading && !pdfUrl ? (
              <div className="flex h-[80vh] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" /> Rendering PDF…
              </div>
            ) : pdfUrl ? (
              <div className="relative">
                {pdfLoading && (
                  <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                    <Loader2 className="size-3 animate-spin" /> Updating…
                  </div>
                )}
                <iframe
                  src={pdfUrl}
                  title="Compliance Report PDF"
                  className="h-[85vh] w-full bg-white"
                />
              </div>
            ) : (
              <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">PDF unavailable.</div>
            )}
          </section>
        ) : view === "wbs" ? (
          <section className="space-y-3">
            <SectionHeader icon={<BarChart3 className="size-4" />} title="Work Breakdown · Gantt" />
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 overflow-x-auto">
              {(report.wbs ?? []).length === 0 && <div className="text-sm text-muted-foreground">No WBS tasks generated.</div>}
              {(report.wbs ?? []).map((t) => {
                const leftPct = (t.start_offset_days / maxDay) * 100;
                const widthPct = Math.max(2, (t.duration_days / maxDay) * 100);
                return (
                  <div key={t.id} className="grid grid-cols-[200px_1fr_60px] items-center gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{t.id}. {t.name}</div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground truncate">{t.phase}{t.responsible ? ` · ${t.responsible}` : ""}</div>
                    </div>
                    <div className="relative h-6 rounded bg-background border border-border">
                      <div className="absolute top-1 h-4 rounded bg-brand/80 shadow-[0_0_20px_-4px_oklch(0.66_0.19_258/0.8)]" style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
                    </div>
                    <div className="text-right text-[11px] font-mono text-muted-foreground">{t.duration_days}d</div>
                  </div>
                );
              })}
              <div className="pt-2 text-[10px] text-muted-foreground font-mono">Total span: {maxDay} business days (planning horizon)</div>
            </div>
          </section>
        ) : (
          <>
            {/* Common rejection flags */}
            {(report.common_rejection_flags ?? []).length > 0 && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 text-[10px] font-mono uppercase tracking-widest">
                  <AlertTriangle className="size-4" /> Common rejection flags — fix before submittal
                </div>
                <ul className="space-y-1.5">
                  {report.common_rejection_flags.map((f, i) => (
                    <li key={i} className="text-sm flex gap-2"><span className="text-amber-400">›</span><span>{f}</span></li>
                  ))}
                </ul>
              </section>
            )}

            {/* Departments */}
            <section className="space-y-3">
              <SectionHeader icon={<Building2 className="size-4" />} title="Applicable Departments" />
              <div className="grid gap-3">
                {(report.departments ?? []).map((d, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="font-medium">{d.name}</div>
                    </div>
                    <p className="text-sm text-muted-foreground">{d.authority_reason}</p>
                    {d.codes?.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Code references</div>
                        {d.codes.map((c, j) => (
                          <div key={j} className="text-xs"><span className="font-mono text-brand">{c.code}</span> — {c.requirement}</div>
                        ))}
                      </div>
                    )}
                    {d.required_documents?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {d.required_documents.map((doc, j) => (
                          <span key={j} className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px]">{doc}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Contacts */}
            <section className="space-y-3">
              <SectionHeader icon={<ShieldCheck className="size-4" />} title="Verified Contacts" />
              <div className="grid gap-2 sm:grid-cols-2">
                {(report.contacts ?? []).map((c, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.department}</span>
                      {c.verified && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-emerald-300">Verified</span>}
                    </div>
                    {c.name && <div className="text-xs text-muted-foreground">{c.name}</div>}
                    {c.phone && <a href={`tel:${c.phone}`} className="text-xs flex items-center gap-1.5 text-brand"><Phone className="size-3" /> {c.phone}</a>}
                    {c.email && <a href={`mailto:${c.email}`} className="text-xs flex items-center gap-1.5 text-brand"><Mail className="size-3" /> {c.email}</a>}
                    {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1.5 text-brand truncate"><Globe className="size-3 shrink-0" /> <span className="truncate">{c.website}</span></a>}
                  </div>
                ))}
              </div>
            </section>

            {/* Timeline */}
            <section className="space-y-3">
              <SectionHeader icon={<Clock className="size-4" />} title="Timeline" />
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {(report.timeline ?? []).map((t, i) => (
                  <div key={i} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t.phase}</div>
                      {t.note && <div className="text-xs text-muted-foreground">{t.note}</div>}
                      {t.responsible && <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{t.responsible}</div>}
                    </div>
                    <div className="text-xs font-mono text-brand shrink-0">{t.duration_business_days} bd</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Cost */}
            {(report.cost_estimate?.low_usd || report.cost_estimate?.high_usd || (report.cost_estimate?.breakdown ?? []).length > 0) && (
              <section className="space-y-3">
                <SectionHeader icon={<DollarSign className="size-4" />} title="Cost Estimate" />
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  {(report.cost_estimate.low_usd || report.cost_estimate.high_usd) && (
                    <div className="text-lg font-semibold">${report.cost_estimate.low_usd?.toLocaleString() ?? "?"} – ${report.cost_estimate.high_usd?.toLocaleString() ?? "?"}</div>
                  )}
                  {(report.cost_estimate.breakdown ?? []).map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
                      <span>{b.label}</span>
                      <span className="font-mono text-muted-foreground">${b.amount_usd_low?.toLocaleString() ?? "?"} – ${b.amount_usd_high?.toLocaleString() ?? "?"}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Sources */}
            {(r.sources ?? []).length > 0 && (
              <section className="space-y-2">
                <SectionHeader icon={<ListChecks className="size-4" />} title="Sources" />
                <ul className="space-y-1">
                  {r.sources.map((s, i) => (
                    <li key={i}><a href={s} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline break-all">{s}</a></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-brand">
      {icon}
      <span className="font-mono text-[10px] uppercase tracking-widest">{title}</span>
    </div>
  );
}
