import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, AlertTriangle, XCircle, MinusCircle, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Plus } from "lucide-react";
import { getRegulatoryProfile, startRegulatoryResearch, advanceRegulatoryResearch, setScopeAttribute, addCandidatesToRoadmap } from "@/lib/regIntel.functions";

/**
 * Phase 2C.1 — Regulatory Profile. Research runs automatically as a persisted job;
 * every conclusion shows its source ("Why this result?"). Unknown facts stay unknown.
 */

type FactRow = {
  id: string; fact_type: string; fact_key: string; label: string; value: Record<string, unknown>; display_value: string | null;
  source_org: string | null; source_title: string | null; source_url: string | null; provider: string; source_tier: number;
  origin: string; verification: string; limitation: string | null; conflicts: Array<{ source: string; says: string; url?: string | null }>;
  retrieved_at: string; effective_date: string | null; recheck_after: string | null;
};
type Step = { key: string; label: string; status: string; note?: string };

const JOB_LABEL: Record<string, string> = {
  queued: "Queued", researching: "Researching", completed: "Completed", completed_with_warnings: "Completed with warnings",
  needs_human_verification: "Needs human verification (some items)", failed: "Failed — retry available",
};
const TIER: Record<number, string> = { 1: "Government GIS / database", 2: "Government code adoption record", 3: "Official AHJ website", 4: "Official state / federal source", 5: "Permivio verified record", 6: "Secondary source (discovery only)", 7: "Rule / inference" };

function VBadge({ v }: { v: string }) {
  const cls = v === "verified" ? "text-signal border-signal/40" : v === "potential" ? "text-muted-foreground border-border" : "text-primary border-primary/40";
  const txt = v === "verified" ? "Verified" : v === "potential" ? "Potential" : "Needs Verification";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{txt}</span>;
}

function StepIcon({ s }: { s: string }) {
  if (s === "done") return <CheckCircle2 className="h-4 w-4 text-signal" />;
  if (s === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (s === "warning") return <AlertTriangle className="h-4 w-4 text-primary" />;
  if (s === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  if (s === "skipped") return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function FactItem({ f, pro, researching }: { f: FactRow; pro: boolean; researching: boolean }) {
  const [open, setOpen] = useState(false);
  const stale = f.recheck_after && new Date(f.recheck_after) < new Date();
  const value = f.display_value ?? (researching ? "Researching…" : "Not established");
  return (
    <li className="rounded-lg border border-border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{f.label}</p>
          <p className="text-sm font-medium break-words">{value}</p>
        </div>
        <VBadge v={f.verification} />
      </div>
      {f.conflicts?.length > 0 && (
        <p className="mt-1 text-xs text-primary">Conflicting evidence: {f.conflicts.map((c) => `${c.source} says "${c.says}"`).join("; ")}</p>
      )}
      {stale && <p className="mt-1 text-xs text-primary">Past its re-check date — refresh research.</p>}
      <button onClick={() => setOpen(!open)} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Why this result?
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
          <p><span className="text-muted-foreground">Source:</span> {f.source_org ?? "—"}{f.source_title ? ` — ${f.source_title}` : ""}</p>
          {f.source_url && (
            <a href={f.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary break-all">View source <ExternalLink className="h-3 w-3" /></a>
          )}
          <p><span className="text-muted-foreground">Source type:</span> {TIER[f.source_tier] ?? "—"} · {f.origin === "stored" ? "Previously stored Permivio data" : f.origin === "user" ? "Your correction" : "New research"}</p>
          <p><span className="text-muted-foreground">Last checked:</span> {new Date(f.retrieved_at).toLocaleString()}{f.effective_date ? ` · Effective ${f.effective_date}` : ""}</p>
          {f.limitation && <p className="text-muted-foreground">{f.limitation}</p>}
          {pro && <pre className="whitespace-pre-wrap break-all text-[10px] text-muted-foreground">{JSON.stringify(f.value, null, 1)}</pre>}
        </div>
      )}
    </li>
  );
}

const SECTIONS: Array<{ title: string; types: string[]; keys?: string[] }> = [
  { title: "Property", types: ["property"] },
  { title: "Jurisdiction", types: ["jurisdiction", "agency"] },
  { title: "Flood (FEMA)", types: ["flood"] },
  { title: "Zoning & land use", types: ["zoning", "future_land_use", "overlay", "special_condition"] },
  { title: "Codes", types: ["code", "local_amendment"] },
];

export function RegulatoryProfilePanel({ projectId, canEdit = true }: { projectId: string; canEdit?: boolean }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getRegulatoryProfile);
  const startFn = useServerFn(startRegulatoryResearch);
  const advFn = useServerFn(advanceRegulatoryResearch);
  const scopeFn = useServerFn(setScopeAttribute);
  const addFn = useServerFn(addCandidatesToRoadmap);
  const [pro, setPro] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const driving = useRef(false);

  const q = useQuery({ queryKey: ["reg-profile", projectId], queryFn: () => getFn({ data: { project_id: projectId } }) });
  const job = q.data?.job as { id: string; status: string; steps: Step[]; escalations: string[]; usage: Record<string, number>; finished_at: string | null } | null | undefined;
  const facts = (q.data?.facts ?? []) as FactRow[];
  const researching = !!job && ["queued", "researching"].includes(job.status);

  const drive = async (jobId: string) => {
    if (driving.current) return;
    driving.current = true;
    try {
      for (let i = 0; i < 20; i++) {
        const r = await advFn({ data: { job_id: jobId } });
        await qc.invalidateQueries({ queryKey: ["reg-profile", projectId] });
        if (r.done) break;
        if ((r as { busy?: boolean }).busy) await new Promise((res) => setTimeout(res, 2500));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      driving.current = false;
      qc.invalidateQueries({ queryKey: ["reg-profile", projectId] });
    }
  };

  // Auto-start on first view / address or scope change; resume a persisted job after reload.
  useEffect(() => {
    if (!q.isSuccess) return;
    if (job && researching) { drive(job.id); return; }
    startFn({ data: { project_id: projectId, refresh: false } }).then((r) => { if (r.job_id && r.started) drive(r.job_id); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isSuccess, job?.id, job?.status]);

  const refresh = async () => {
    const r = await startFn({ data: { project_id: projectId, refresh: true } });
    if (r.job_id) drive(r.job_id);
  };

  const byType = (types: string[]) => facts.filter((f) => types.includes(f.fact_type));
  const scopeDerived = facts.filter((f) => f.fact_type === "scope_attribute" && f.fact_key.startsWith("derived:"));
  const scopeOriginal = facts.find((f) => f.fact_key === "_original");
  const candidates = facts.filter((f) => f.fact_type === "permit_candidate");
  const linked = new Set((q.data?.roadmapItems ?? []).map((i) => i.regulatory_fact_id).filter(Boolean));

  const toggleScope = async (key: string, value: boolean) => {
    try {
      await scopeFn({ data: { project_id: projectId, key, value } });
      const r = await startFn({ data: { project_id: projectId, refresh: false } });
      if (r.job_id && r.started) drive(r.job_id);
    } catch (e) { toast.error((e as Error).message); }
  };

  const addSelected = async () => {
    try {
      const r = await addFn({ data: { project_id: projectId, fact_ids: sel } });
      toast.success(`${r.added} added to the Permit Roadmap${r.linked ? `, ${r.linked} linked to existing items` : ""}`);
      setSel([]);
      qc.invalidateQueries({ queryKey: ["reg-profile", projectId] });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Regulatory Profile</h3>
          <p className="text-xs text-muted-foreground">
            Researched automatically from government sources. {job ? JOB_LABEL[job.status] ?? job.status : "Not started"}
            {job?.finished_at ? ` · Last checked ${new Date(job.finished_at).toLocaleString()}` : ""}
            {q.data?.coverage ? ` · ${q.data.coverage.note}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            <button onClick={() => setPro(false)} className={`rounded-md px-2 py-1 ${!pro ? "bg-secondary" : ""}`}>Simple</button>
            <button onClick={() => setPro(true)} className={`rounded-md px-2 py-1 ${pro ? "bg-secondary" : ""}`}>Professional</button>
          </div>
          {canEdit && (
            <button onClick={refresh} disabled={researching} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${researching ? "animate-spin" : ""}`} /> Refresh research
            </button>
          )}
        </div>
      </div>

      {job && (researching || pro) && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {job.steps.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-xs"><StepIcon s={s.status} /> <span>{s.label}</span>{s.note && <span className="text-muted-foreground">— {s.note}</span>}</li>
          ))}
        </ul>
      )}

      {job && job.escalations?.length > 0 && (
        <div className="rounded-lg border border-primary/40 p-2.5 text-xs">
          <p className="font-semibold text-primary">Needs human verification</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">{job.escalations.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      {!job && !q.isLoading && <p className="text-sm text-muted-foreground">Add a project address to start research.</p>}

      {SECTIONS.map((sec) => {
        const rows = byType(sec.types).filter((f) => pro || f.fact_type !== "overlay" || f.display_value === "Intersects");
        if (!rows.length && !researching) return null;
        return (
          <div key={sec.title} className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec.title}</h4>
            {rows.length ? <ul className="grid gap-2 md:grid-cols-2">{rows.map((f) => <FactItem key={f.id} f={f} pro={pro} researching={researching} />)}</ul> : <p className="text-xs text-muted-foreground">Researching…</p>}
          </div>
        );
      })}

      {scopeOriginal && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope interpretation</h4>
          <p className="text-xs text-muted-foreground">Original: “{scopeOriginal.display_value}”</p>
          <div className="flex flex-wrap gap-1.5">
            {scopeDerived.map((f) => {
              const on = !!(f.value as { effective?: boolean }).effective;
              const key = String((f.value as { key?: string }).key);
              return (
                <button key={f.id} disabled={!canEdit} onClick={() => toggleScope(key, !on)} title={String((f.value as { evidence?: string }).evidence ?? "")}
                  className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary/50 text-foreground" : "border-border text-muted-foreground line-through"}`}>
                  {f.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">Derived from your scope text by rules — tap to correct. Corrections re-run only the permit analysis.</p>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permits & approvals (candidates)</h4>
            {canEdit && (
              <button onClick={addSelected} disabled={!sel.length} className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" /> Add to Permit Roadmap
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {candidates.map((f) => {
              const v = f.value as { trigger?: string; why?: string; prerequisites?: string[]; agency?: string };
              const onRoadmap = linked.has(f.id);
              return (
                <li key={f.id} className="flex gap-2">
                  {canEdit && <input type="checkbox" className="mt-3" disabled={onRoadmap} checked={sel.includes(f.id)} onChange={(e) => setSel(e.target.checked ? [...sel, f.id] : sel.filter((x) => x !== f.id))} />}
                  <div className="flex-1">
                    <FactItem f={{ ...f, display_value: `${v.agency ?? ""}${onRoadmap ? " · on roadmap" : ""}` }} pro={pro} researching={false} />
                    <p className="mt-1 px-1 text-xs text-muted-foreground">{v.trigger}. {v.why}{v.prerequisites?.length ? ` Prerequisites: ${v.prerequisites.join(", ")}.` : ""}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground">Candidates are never added as approved or verified. Potential items may not apply — confirm with the agency.</p>
        </div>
      )}

      {pro && job?.usage && (
        <p className="text-[11px] text-muted-foreground">
          Research usage: {job.usage["deterministic_calls"] ?? 0} government data lookups · {job.usage["ai_calls"] ?? 0} AI calls · ${Number(job.usage["estimated_cost_usd"] ?? 0).toFixed(2)} estimated cost · {Math.round((job.usage["duration_ms"] ?? 0) / 1000)}s
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">Map data does not replace a formal flood determination, elevation certificate or zoning verification letter where one is required.</p>
    </section>
  );
}
