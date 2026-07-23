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
import { JurisdictionConfirmCard } from "./JurisdictionConfirmCard";
import { getJurisdictionConfirmation } from "@/lib/jurisdiction.functions";


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
  const enrichFn = useServerFn(enrichRoadmapWithAI);
  const sendChecklistFn = useServerFn(sendRoadmapToChecklist);
  const exportPdfFn = useServerFn(exportRoadmapPdf);
  const answerFn = useServerFn(answerRoadmapFollowup);
  const getSourcesFn = useServerFn(getRoadmapSources);
  const [busy, setBusy] = useState<null | "gen" | "enrich" | "checklist" | "pdf">(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["roadmap", projectId],
    queryFn: () => getFn({ data: { project_id: projectId } }),
  });
  const sourcesQ = useQuery({
    queryKey: ["roadmap-sources", projectId],
    queryFn: () => getSourcesFn({ data: { project_id: projectId } }),
    enabled: sourcesOpen,
  });

  const generate = async () => {
    setBusy("gen");
    try {
      await genFn({ data: { project_id: projectId } });
      toast.success("Permit roadmap generated");
      qc.invalidateQueries({ queryKey: ["roadmap", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate roadmap");
    } finally { setBusy(null); }
  };

  const enrich = async () => {
    setBusy("enrich");
    try {
      const res = await enrichFn({ data: { project_id: projectId } });
      toast.success(`AI enrichment complete — ${res.sources_added} sources, ${res.new_permits} new permits`);
      qc.invalidateQueries({ queryKey: ["roadmap", projectId] });
      qc.invalidateQueries({ queryKey: ["roadmap-sources", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI enrichment failed");
    } finally { setBusy(null); }
  };

  const sendToChecklist = async () => {
    setBusy("checklist");
    try {
      const res = await sendChecklistFn({ data: { project_id: projectId } });
      toast.success(res.inserted ? `Added ${res.inserted} permits to checklist` : "Checklist already up to date");
      qc.invalidateQueries({ queryKey: ["checklist", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update checklist");
    } finally { setBusy(null); }
  };

  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const res = await exportPdfFn({ data: { project_id: projectId } });
      const bin = atob(res.pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    } finally { setBusy(null); }
  };

  const submitAnswer = async (id: string) => {
    const answer = (answers[id] ?? "").trim();
    if (!answer) return;
    try {
      await answerFn({ data: { followup_id: id, answer } });
      toast.success("Answer recorded — re-run AI to refine roadmap");
      setAnswers((a) => ({ ...a, [id]: "" }));
      qc.invalidateQueries({ queryKey: ["roadmap", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save answer");
    }
  };

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Loading roadmap…</div>;

  const r = q.data;
  const hasRoadmap = !!r?.roadmap;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-mono uppercase tracking-widest text-brand">Permit Roadmap</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Deterministic baseline from Permivio's rule engine, enriched with live jurisdiction sources. Each item is labeled with its verification level.
          </p>
          {hasRoadmap && r?.roadmap && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Health {r.roadmap.health_score ?? "—"} · Confidence {Math.round((r.roadmap.confidence ?? 0) * 100)}% · {r.roadmap.prompt_version}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={generate} disabled={!!busy}>
            {hasRoadmap ? <RefreshCw className="size-4 mr-1.5" /> : <Sparkles className="size-4 mr-1.5" />}
            {hasRoadmap ? "Regenerate" : "Generate"}
          </Button>
          {hasRoadmap && (
            <>
              <Button size="sm" onClick={enrich} disabled={!!busy}>
                <Wand2 className="size-4 mr-1.5" />
                {busy === "enrich" ? "Enriching…" : "AI enrich"}
              </Button>
              <Button variant="outline" size="sm" onClick={sendToChecklist} disabled={!!busy}>
                <ListChecks className="size-4 mr-1.5" />
                {busy === "checklist" ? "Sending…" : "Send to checklist"}
              </Button>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={!!busy}>
                <Download className="size-4 mr-1.5" />
                {busy === "pdf" ? "Building…" : "PDF"}
              </Button>
              <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <LinkIcon className="size-4 mr-1.5" /> Sources
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Roadmap Sources</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 space-y-3">
                    {sourcesQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                    {!sourcesQ.isLoading && (sourcesQ.data?.sources.length ?? 0) === 0 && (
                      <div className="text-sm text-muted-foreground">
                        No sources yet. Run "AI enrich" to fetch live jurisdiction citations.
                      </div>
                    )}
                    {sourcesQ.data?.sources.map((s) => (
                      <div key={s.id} className="rounded-md border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{s.title ?? s.url}</div>
                            {s.publisher && <div className="text-[11px] text-muted-foreground">{s.publisher}</div>}
                          </div>
                          {s.url && (
                            <a href={s.url} target="_blank" rel="noreferrer" className="text-brand text-xs inline-flex items-center gap-1">
                              Open <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                        {s.quote && <p className="text-[12px] text-muted-foreground mt-2 italic">"{s.quote}"</p>}
                      </div>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </>
          )}
        </div>
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
              <ul className="space-y-3">
                {r.followups.map((f) => (
                  <li key={f.id} className="text-sm space-y-1.5">
                    <div>{f.question}</div>
                    {f.field_hint && <div className="text-[11px] text-muted-foreground font-mono">{f.field_hint}</div>}
                    <div className="flex gap-2">
                      <Input
                        value={answers[f.id] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))}
                        placeholder="Your answer…"
                        className="h-8 text-sm"
                      />
                      <Button size="sm" variant="outline" onClick={() => submitAnswer(f.id)} disabled={!answers[f.id]?.trim()}>
                        Save
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="rounded-md border border-border bg-muted/30 p-3 flex items-start gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 mt-0.5 shrink-0" />
            <span>
              Baseline generated from model codes (IBC/IRC/NFPA/IECC) and Permivio's rule matrix. Items marked "Needs Confirmation" must be verified with the jurisdiction. "AI enrich" adds live source citations from official portals.
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
