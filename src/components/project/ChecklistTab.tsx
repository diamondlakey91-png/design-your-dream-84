import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Plus, Trash2, Info, Lock, ExternalLink, ChevronDown, ChevronUp, Download } from "lucide-react";
import { listPermitItems, generatePermitChecklist, addPermitItem, updatePermitItem, deletePermitItem, importRoadmapToChecklist } from "@/lib/checklist.functions";
import { supabase } from "@/integrations/supabase/client";
import { HealthAgencyDeepLinks } from "@/components/project/HealthAgencyDeepLinks";
import { useViewMode } from "@/hooks/useViewMode";
import {
  ROADMAP_STATUS_LABEL, ROADMAP_PICKABLE, CONFIDENCE_LABEL, DONE_STATUSES,
  blockers, isBlocked, orderByDependencies, roadmapSummary, wouldCreateCycle,
} from "@/lib/roadmapWorkflow";

const HEALTH_GROUNDED_CATEGORIES = new Set(["Health", "Environmental", "Stormwater"]);

const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  researching: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  ready_to_submit: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  submitted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  under_review: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  corrections_required: "bg-destructive/15 text-destructive",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  issued: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  n_a: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 line-through",
  blocked: "bg-destructive/15 text-destructive",
};
const CONF_COLOR: Record<string, string> = {
  verified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  needs_verification: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  potential: "bg-muted text-muted-foreground",
};

type Item = Awaited<ReturnType<typeof listPermitItems>>[number];

export function ChecklistTab({ projectId, jurisdiction }: { projectId: string; jurisdiction: string }) {
  const listFn = useServerFn(listPermitItems);
  const genFn = useServerFn(generatePermitChecklist);
  const addFn = useServerFn(addPermitItem);
  const updateFn = useServerFn(updatePermitItem);
  const delFn = useServerFn(deletePermitItem);
  const importFn = useServerFn(importRoadmapToChecklist);
  const qc = useQueryClient();
  const { mode } = useViewMode();
  const pro = mode === "pro";
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["permit_items", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["permit_items", projectId] });
    qc.invalidateQueries({ queryKey: ["project-foundation", projectId] });
  };

  useEffect(() => {
    const channel = supabase
      .channel(`permit_items:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "permit_items", filter: `project_id=eq.${projectId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed");
  const generate = useMutation({ mutationFn: () => genFn({ data: { project_id: projectId } }), onSuccess: () => { refresh(); toast.success("Checklist generated"); }, onError: onErr });
  const importRm = useMutation({
    mutationFn: () => importFn({ data: { project_id: projectId } }),
    onSuccess: (r) => { refresh(); toast.success(r.added ? `Added ${r.added} item(s) from your permit roadmap` : "Roadmap items are already here"); },
    onError: onErr,
  });
  const add = useMutation({
    mutationFn: (name: string) => addFn({ data: { project_id: projectId, name, category: "Building", required: true } }),
    onSuccess: () => { refresh(); setNewName(""); }, onError: onErr,
  });
  const update = useMutation({
    mutationFn: (v: Parameters<typeof updateFn>[0]["data"]) => updateFn({ data: v }),
    onSuccess: refresh, onError: onErr,
  });
  const del = useMutation({ mutationFn: (id: string) => delFn({ data: { id } }), onSuccess: refresh });

  const items = orderByDependencies((q.data ?? []) as Item[]);
  const sum = roadmapSummary(items);
  const hasHealthGroundedItem = items.some((i) => HEALTH_GROUNDED_CATEGORIES.has(i.category));
  const nameById = new Map(items.map((i) => [i.id, i.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            Permit roadmap
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {sum.done}/{sum.total} done
            {sum.blocked.length > 0 && <> · <span className="text-destructive">{sum.blocked.length} blocked</span></>}
            {sum.needsVerification.length > 0 && <> · {sum.needsVerification.length} need verification</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => importRm.mutate()} disabled={importRm.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
            title="Bring agencies, sources and prerequisites from the generated permit roadmap into this list">
            <Download className="size-3" /> {importRm.isPending ? "Importing…" : "From roadmap"}
          </button>
          <button onClick={() => generate.mutate()} disabled={generate.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50">
            {items.length > 0 ? <RefreshCw className="size-3" /> : <Sparkles className="size-3" />}
            {generate.isPending ? "Building…" : items.length > 0 ? "Regenerate" : "AI generate"}
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border">
          <Info className="size-5 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No roadmap items yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Bring them in from your permit roadmap, generate a list{jurisdiction ? ` for ${jurisdiction}` : ""}, or add one below.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((it, idx) => {
            const waiting = blockers(it, items);
            const blocked = isBlocked(it, items);
            const open = openId === it.id;
            return (
              <li key={it.id} className={`p-3 bg-card ring-1 rounded-xl ${blocked ? "ring-destructive/40" : "ring-black/5"}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="mt-0.5 text-[10px] font-mono text-muted-foreground w-5 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{it.category}</span>
                      {it.required && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-brand/15 text-brand">Required</span>}
                      <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${CONF_COLOR[it.requirement_confidence] ?? CONF_COLOR.potential}`}>
                        {CONFIDENCE_LABEL[it.requirement_confidence] ?? "Potential requirement"}
                      </span>
                      <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${STATUS_COLOR[blocked ? "blocked" : it.status]}`}>
                        {blocked ? "Blocked" : ROADMAP_STATUS_LABEL[it.status] ?? it.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-1">{it.name}</p>
                    {waiting.length > 0 && (
                      <p className="text-xs text-destructive mt-1 inline-flex items-center gap-1"><Lock className="size-3" /> Blocked by: {waiting.join(", ")}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {it.agency && <span>{it.agency}</span>}
                      {it.owner_name && <span>Assigned: {it.owner_name}</span>}
                      {it.due_date && <span>Target: {it.due_date}</span>}
                      {pro && it.fee_text && <span>Fee: {it.fee_text}</span>}
                      {pro && it.review_timing && <span>Review: {it.review_timing}</span>}
                      {it.source_url && <a href={it.source_url} target="_blank" rel="noreferrer" className="text-brand inline-flex items-center gap-0.5">Official source <ExternalLink className="size-3" /></a>}
                      {it.application_url && <a href={it.application_url} target="_blank" rel="noreferrer" className="text-brand inline-flex items-center gap-0.5">Application <ExternalLink className="size-3" /></a>}
                    </div>
                    {it.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setOpenId(open ? null : it.id)} className="text-muted-foreground hover:text-brand" aria-label={open ? "Close details" : `Edit ${it.name}`}>
                      {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                    <button onClick={() => del.mutate(it.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ROADMAP_PICKABLE.map((s) => (
                    <button key={s} onClick={() => update.mutate({ id: it.id, status: s })}
                      className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded ${
                        it.status === s || (s === "approved" && it.status === "issued") ? STATUS_COLOR[s] + " ring-1 ring-current/40" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}>
                      {ROADMAP_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                {open && <ItemEditor item={it} all={items} nameById={nameById} onSave={(patch) => update.mutate({ id: it.id, ...patch })} />}
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-[11px] text-muted-foreground">
        “Verified” is set only by Permivio against an official source. Fees and review times appear only when sourced — never estimated.
        Statuses are yours to update; approvals are never marked complete automatically.
      </p>

      {hasHealthGroundedItem && jurisdiction && <HealthAgencyDeepLinks jurisdiction={jurisdiction} />}

      <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) add.mutate(newName.trim()); }} className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add roadmap item…" aria-label="Add roadmap item"
          className="flex-1 h-10 px-3 rounded-lg bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand" />
        <button className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
          <Plus className="size-4" /> Add
        </button>
      </form>
    </div>
  );
}

function ItemEditor({ item, all, nameById, onSave }: {
  item: Item; all: Item[]; nameById: Map<string, string>;
  onSave: (p: { agency?: string | null; owner_name?: string | null; due_date?: string | null; application_url?: string | null; notes?: string; description?: string | null; depends_on?: string[]; requirement_confidence?: "needs_verification" | "potential" }) => void;
}) {
  const [agency, setAgency] = useState(item.agency ?? "");
  const [owner, setOwner] = useState(item.owner_name ?? "");
  const [due, setDue] = useState(item.due_date ?? "");
  const [appUrl, setAppUrl] = useState(item.application_url ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [deps, setDeps] = useState<string[]>(item.depends_on ?? []);
  const cls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary";
  const candidates = all.filter((o) => o.id !== item.id);
  return (
    <div className="mt-3 pt-3 border-t border-border grid gap-2 sm:grid-cols-2">
      <label className="text-xs text-muted-foreground">Responsible agency<input className={cls} value={agency} onChange={(e) => setAgency(e.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Assigned to<input className={cls} value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Target date<input type="date" className={cls} value={due} onChange={(e) => setDue(e.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Application / form link<input className={cls} value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://" /></label>
      {item.requirement_confidence !== "verified" && (
        <label className="text-xs text-muted-foreground">Requirement confidence
          <select className={cls} value={item.requirement_confidence} onChange={(e) => onSave({ requirement_confidence: e.target.value as "needs_verification" | "potential" })}>
            <option value="needs_verification">Needs verification</option>
            <option value="potential">Potential requirement</option>
          </select>
        </label>
      )}
      <label className="text-xs text-muted-foreground sm:col-span-2">Notes<textarea className={cls + " h-16 py-1"} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <fieldset className="sm:col-span-2 text-xs text-muted-foreground">
        <legend className="mb-1">Must happen first (prerequisites)</legend>
        <div className="flex flex-wrap gap-1.5">
          {candidates.length === 0 && <span>No other items yet.</span>}
          {candidates.map((c) => {
            const on = deps.includes(c.id);
            const loop = !on && wouldCreateCycle(item.id, c.id, all.map((a) => (a.id === item.id ? { ...a, depends_on: deps } : a)));
            return (
              <button type="button" key={c.id} disabled={loop} title={loop ? "Would create a loop" : undefined}
                onClick={() => setDeps(on ? deps.filter((d) => d !== c.id) : [...deps, c.id])}
                className={`px-2 py-1 rounded text-[11px] ${on ? "bg-brand/15 text-brand ring-1 ring-brand/40" : "bg-muted/50 hover:bg-muted"} disabled:opacity-40`}>
                {nameById.get(c.id)}{DONE_STATUSES.has(c.status) ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="sm:col-span-2 flex justify-end">
        <button type="button" onClick={() => onSave({
          agency: agency.trim() || null, owner_name: owner.trim() || null, due_date: due || null,
          application_url: appUrl.trim() || null, notes, depends_on: deps,
        })} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Save details</button>
      </div>
    </div>
  );
}
