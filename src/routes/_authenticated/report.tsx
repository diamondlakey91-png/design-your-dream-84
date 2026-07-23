import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { COMPLIANCE_AGENTS } from "@/lib/complianceAgents";
import { generateComplianceReport, listComplianceReports, deleteComplianceReport, exportComplianceReportPdf } from "@/lib/compliance.functions";
import { JurisdictionAutocomplete } from "@/components/JurisdictionAutocomplete";
import { toast } from "sonner";
import { FileCheck2, Zap, MapPin, ChevronRight, Trash2, Sparkles, Timer, ShieldCheck, Download, Loader2 } from "lucide-react";
import { ProjectTypeSelector } from "@/components/project-type/ProjectTypeSelector";
import { useProjectTypes } from "@/hooks/useProjectTypes";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({
    meta: [
      { title: "Compliance Reports — Permivio" },
      { name: "description", content: "Generate multi-department permit compliance reports in minutes. Jurisdiction, codes, verified contacts, timeline, and cost — for any US address." },
      { property: "og:title", content: "Permivio Compliance Reports" },
      { property: "og:description", content: "AI compliance research across Building, Health, Fire, ADA, Planning and Utilities — for any US address." },
    ],
  }),
  component: ReportHubPage,
});

function ReportHubPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listComplianceReports);
  const genFn = useServerFn(generateComplianceReport);
  const delFn = useServerFn(deleteComplianceReport);
  const pdfFn = useServerFn(exportComplianceReportPdf);

  const listQ = useQuery({ queryKey: ["compliance-reports"], queryFn: () => listFn() });

  const [address, setAddress] = useState("");
  const [projectType, setProjectType] = useState("");
  const [agentId, setAgentId] = useState(COMPLIANCE_AGENTS[0].id);
  const [jurisdiction, setJurisdiction] = useState("");
  const [notes, setNotes] = useState("");
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const downloadPdf = async (id: string, format: "standard" | "wbs") => {
    try {
      setPdfBusy(`${id}:${format}`);
      const { pdf_base64, filename } = await pdfFn({ data: { id, format } });
      const bin = atob(pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setPdfBusy(null);
    }
  };

  const gen = useMutation({
    mutationFn: () => genFn({
      data: {
        address: address.trim(),
        project_type: projectType.trim() || "General scope",
        agent_id: agentId,
        jurisdiction_hint: jurisdiction.trim() || undefined,
        scope_notes: notes.trim() || undefined,
      },
    }),
    onSuccess: (res) => {
      toast.success("Report generated");
      qc.invalidateQueries({ queryKey: ["compliance-reports"] });
      navigate({ to: "/report/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to generate report"),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-reports"] }),
  });

  const activeAgent = COMPLIANCE_AGENTS.find((a) => a.id === agentId) ?? COMPLIANCE_AGENTS[0];

  return (
    <AppShell>
      <div className="px-4 pt-6 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-brand">
            <FileCheck2 className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Compliance Report</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">One-shot permit compliance research</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Address + project type → jurisdiction identification, applicable departments, code citations, verified contacts,
            timeline, cost estimate, and a work-breakdown Gantt. Ready in a couple of minutes.
          </p>
        </header>

        {/* Stat pills */}
        <div className="grid grid-cols-3 gap-2">
          <StatPill icon={<Timer className="size-3.5" />} label="Time" value="~2 min" />
          <StatPill icon={<Sparkles className="size-3.5" />} label="Depts" value="Bldg · Health · Fire · ADA" />
          <StatPill icon={<ShieldCheck className="size-3.5" />} label="Contacts" value="Verified when possible" />
        </div>

        {/* Intake */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Project address</span>
              <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
                <MapPin className="size-4 text-muted-foreground" />
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="1603 Whetstone Way, Baltimore, MD 21230"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Project type / scope</span>
              <ProjectTypeSelectorForReport value={projectType} onChange={setProjectType} />
            </label>
          </div>


          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Jurisdiction (optional)</span>
              <JurisdictionAutocomplete value={jurisdiction} onChange={setJurisdiction} placeholder="Auto-detected from address if blank" />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Additional scope notes</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. adding Type I hood, 60 occupants"
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
          </div>

          {/* Agent presets */}
          <div className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Specialized agent</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {COMPLIANCE_AGENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAgentId(a.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    agentId === a.id ? "border-brand bg-brand/10" : "border-border bg-background hover:border-brand/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{a.emoji}</span>
                    <span className="text-sm font-medium">{a.label}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{a.scope}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Focus: {activeAgent.focus.slice(0, 2).join(" · ")}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              disabled={!address.trim() || gen.isPending}
              onClick={() => gen.mutate()}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-[0_10px_40px_-8px_oklch(0.66_0.19_258/0.6)] hover:bg-brand/90 disabled:opacity-40"
            >
              <Zap className="size-4" />
              {gen.isPending ? "Generating…" : "Generate compliance report"}
            </button>
          </div>
        </section>

        {/* History */}
        <section className="space-y-2 pb-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Recent reports</h2>
            <span className="text-[11px] text-muted-foreground">{listQ.data?.length ?? 0}</span>
          </div>
          {listQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (listQ.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No reports yet. Generate your first above.
            </div>
          ) : (
            <ul className="space-y-2">
              {listQ.data!.map((r) => (
                <li key={r.id} className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 p-3">
                    <Link to="/report/$id" params={{ id: r.id }} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{r.address}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${
                          r.status === "ready" ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" :
                          r.status === "failed" ? "border-red-500/40 text-red-300 bg-red-500/10" :
                          "border-brand/40 text-brand bg-brand/10"
                        }`}>{r.status}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                        <span>{r.project_type}</span>
                        {r.jurisdiction && <span>· {r.jurisdiction}{r.state ? `, ${r.state}` : ""}</span>}
                        <span>· {new Date(r.created_at).toLocaleString()}</span>
                      </div>
                    </Link>
                    {r.status === "ready" && (
                      <div className="hidden sm:flex items-center gap-1">
                        <button
                          onClick={() => downloadPdf(r.id, "standard")}
                          disabled={pdfBusy === `${r.id}:standard`}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:border-brand hover:text-brand disabled:opacity-40"
                          aria-label="Download standard PDF"
                          title="Download PDF (Standard)"
                        >
                          {pdfBusy === `${r.id}:standard` ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                          PDF
                        </button>
                        <button
                          onClick={() => downloadPdf(r.id, "wbs")}
                          disabled={pdfBusy === `${r.id}:wbs`}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:border-brand hover:text-brand disabled:opacity-40"
                          aria-label="Download WBS PDF"
                          title="Download PDF (WBS / Gantt)"
                        >
                          {pdfBusy === `${r.id}:wbs` ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                          WBS
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (confirm("Delete this report?")) del.mutate(r.id);
                      }}
                      className="text-muted-foreground hover:text-red-400 p-1"
                      aria-label="Delete report"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <Link to="/report/$id" params={{ id: r.id }} className="text-muted-foreground hover:text-foreground">
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-brand">{icon}<span className="text-[10px] font-mono uppercase tracking-widest">{label}</span></div>
      <div className="mt-0.5 text-xs font-medium truncate">{value}</div>
    </div>
  );
}
