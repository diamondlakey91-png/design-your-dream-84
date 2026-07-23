import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { generateRoadmapFromRules, getRoadmap } from "@/lib/roadmap.functions";
import {
  enrichRoadmapWithAI,
  sendRoadmapToChecklist,
  exportRoadmapPdf,
  getRoadmapSources,
  answerRoadmapFollowup,
} from "@/lib/roadmapEnrich.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles, RefreshCw, ShieldCheck, AlertTriangle, HelpCircle, Building2, FileText, Users, Wand2, ListChecks, Download, Link as LinkIcon, ExternalLink } from "lucide-react";

type Verification = "verified" | "ai_assisted" | "needs_agency_confirmation";

function VerifBadge({ v }: { v: Verification }) {
  const label = v === "verified" ? "Verified" : v === "ai_assisted" ? "AI-Assisted" : "Needs Confirmation";
  const cls =
    v === "verified"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : v === "ai_assisted"
      ? "bg-brand/10 text-brand border-brand/30"
      : "bg-amber-500/10 text-amber-400 border-amber-500/30";
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function LikelihoodChip({ v }: { v: string }) {
  const cls =
    v === "required"
      ? "bg-red-500/10 text-red-400 border-red-500/30"
      : v === "likely"
      ? "bg-brand/10 text-brand border-brand/30"
      : v === "conditional"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
      : "bg-muted text-muted-foreground border-border";
  return <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>{v}</span>;
}

export function RoadmapView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getRoadmap);
  const genFn = useServerFn(generateRoadmapFromRules);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["roadmap", projectId],
    queryFn: () => getFn({ data: { project_id: projectId } }),
  });

  const generate = async () => {
    setBusy(true);
    try {
      await genFn({ data: { project_id: projectId } });
      toast.success("Permit roadmap generated");
      qc.invalidateQueries({ queryKey: ["roadmap", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate roadmap");
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Loading roadmap…</div>;

  const r = q.data;
  const hasRoadmap = !!r?.roadmap;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-widest text-brand">Permit Roadmap</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Deterministic baseline from Permivio's rule engine. Every item is labeled with its verification level. AI enrichment adds jurisdiction-specific sources in the next phase.
          </p>
          {hasRoadmap && r?.roadmap && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Health {r.roadmap.health_score ?? "—"} · Confidence {Math.round((r.roadmap.confidence ?? 0) * 100)}% · {r.roadmap.prompt_version}
            </p>
          )}
        </div>
        <Button onClick={generate} disabled={busy}>
          {hasRoadmap ? <RefreshCw className="size-4 mr-1.5" /> : <Sparkles className="size-4 mr-1.5" />}
          {hasRoadmap ? "Regenerate" : "Generate roadmap"}
        </Button>
      </div>

      {!hasRoadmap && (
        <div className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-6 text-center">
          No roadmap yet. Save your scope of work, then generate the roadmap.
        </div>
      )}

      {hasRoadmap && r && (
        <>
          {r.roadmap?.summary && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-foreground">{r.roadmap.summary}</p>
            </div>
          )}

          {/* Permits */}
          <Section icon={<Building2 className="size-3.5" />} title={`Permits (${r.permits.length})`}>
            <div className="space-y-2">
              {r.permits.map((p) => (
                <div key={p.id} className="rounded-md border border-border bg-card px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{p.agency}</div>
                      {p.notes && <div className="text-[11px] text-muted-foreground mt-1">{p.notes}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <LikelihoodChip v={p.likelihood} />
                      <VerifBadge v={p.verification as Verification} />
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {p.review_days_min ?? "—"}–{p.review_days_max ?? "—"}d
                      </div>
                    </div>
                  </div>
                  {(p.critical_path || (p.concurrent_with?.length ?? 0) > 0) && (
                    <div className="flex gap-2 mt-2 text-[10px] font-mono uppercase tracking-wider">
                      {p.critical_path && <span className="text-red-400">critical path</span>}
                      {p.concurrent_with?.length > 0 && <span className="text-brand">runs concurrent</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Documents */}
          {r.documents.length > 0 && (
            <Section icon={<FileText className="size-3.5" />} title={`Required Documents (${r.documents.length})`}>
              <ul className="space-y-1.5">
                {r.documents.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0"><span className={d.required ? "text-foreground" : "text-muted-foreground"}>{d.name}</span></span>
                    <VerifBadge v={d.verification as Verification} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Agencies */}
          {r.agencies.length > 0 && (
            <Section icon={<Users className="size-3.5" />} title={`Reviewing Agencies (${r.agencies.length})`}>
              <ul className="space-y-1.5">
                {r.agencies.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <div className="truncate">{a.name}</div>
                      {a.role && <div className="text-[11px] text-muted-foreground">{a.role}</div>}
                    </span>
                    <VerifBadge v={a.verification as Verification} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Risks */}
          {r.risks.length > 0 && (
            <Section icon={<AlertTriangle className="size-3.5" />} title={`Risks (${r.risks.length})`}>
              <ul className="space-y-2">
                {r.risks.map((rk) => (
                  <li key={rk.id} className="rounded-md border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                          rk.severity === "high"
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : rk.severity === "medium"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {rk.severity}
                      </span>
                      {rk.category && <span className="text-[11px] text-muted-foreground">{rk.category}</span>}
                    </div>
                    <div className="text-sm mt-1">{rk.message}</div>
                    {rk.mitigation && <div className="text-[11px] text-muted-foreground mt-1">Mitigation: {rk.mitigation}</div>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Follow-ups */}
          {r.followups.length > 0 && (
            <Section icon={<HelpCircle className="size-3.5" />} title={`Follow-up Questions (${r.followups.length})`}>
              <ul className="space-y-1.5">
                {r.followups.map((f) => (
                  <li key={f.id} className="text-sm">
                    <div>{f.question}</div>
                    {f.field_hint && <div className="text-[11px] text-muted-foreground font-mono">{f.field_hint}</div>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="rounded-md border border-border bg-muted/30 p-3 flex items-start gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 mt-0.5 shrink-0" />
            <span>
              Baseline generated from model codes (IBC/IRC/NFPA/IECC) and Permivio's rule matrix. Items marked "Needs Confirmation" must be verified with the jurisdiction. AI enrichment with live source citations lands in Phase 3.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        {icon} {title}
      </h3>
      <div className="rounded-lg border border-border bg-card p-3">{children}</div>
    </section>
  );
}
