import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Layers, Check, Pencil } from "lucide-react";
import { listProjectPlanSets, createPlanVersion, setCurrentPlanSet, updatePlanSheet } from "@/lib/planVersions.functions";

type Doc = { id: string; name: string; category: string };

export function PlanSetVersions({ projectId, docs }: { projectId: string; docs: Doc[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectPlanSets);
  const createFn = useServerFn(createPlanVersion);
  const currentFn = useServerFn(setCurrentPlanSet);
  const q = useQuery({ queryKey: ["plan-sets", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [revDate, setRevDate] = useState("");
  const [openSet, setOpenSet] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["plan-sets", projectId] }); qc.invalidateQueries({ queryKey: ["project-foundation", projectId] }); qc.invalidateQueries({ queryKey: ["plan-review-overview", projectId] }); };
  const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed");
  const create = useMutation({
    mutationFn: () => createFn({ data: { project_id: projectId, document_ids: sel, revision_date: revDate || null, make_current: true } }),
    onSuccess: (r) => { refresh(); setPicking(false); setSel([]); setRevDate(""); toast.success(`Plan Set V${r.version} is now current`); },
    onError: onErr,
  });
  const makeCurrent = useMutation({ mutationFn: (id: string) => currentFn({ data: { project_id: projectId, plan_set_id: id } }), onSuccess: refresh, onError: onErr });

  const sets = q.data ?? [];
  const current = sets.find((s) => s.is_current);
  const drawings = docs.filter((d) => ["drawings", "specifications", "survey", "engineering"].includes(d.category));
  const pickable = drawings.length ? drawings : docs;

  return (
    <div className="p-3 bg-card ring-1 ring-black/5 rounded-xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold inline-flex items-center gap-1.5"><Layers className="size-4 text-brand" /> Plan sets</p>
        <button onClick={() => setPicking(!picking)} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80">
          {picking ? "Cancel" : sets.length ? "New version" : "Create plan set"}
        </button>
      </div>
      {picking && (
        <div className="space-y-2 rounded-lg border border-border p-2">
          <p className="text-xs text-muted-foreground">Choose the files in this version. Previous versions and their reviews stay as history.</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {pickable.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={sel.includes(d.id)} onChange={(e) => setSel(e.target.checked ? [...sel, d.id] : sel.filter((x) => x !== d.id))} />
                {d.name}
              </label>
            ))}
            {pickable.length === 0 && <p className="text-xs text-muted-foreground">Upload plan files first.</p>}
          </div>
          <label className="text-xs text-muted-foreground block">Revision date (if known)
            <input type="date" value={revDate} onChange={(e) => setRevDate(e.target.value)} className="ml-2 h-8 rounded border border-input bg-background px-2 text-xs" />
          </label>
          <button disabled={!sel.length || create.isPending} onClick={() => create.mutate()} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
            {create.isPending ? "Saving…" : `Save as V${(sets[0]?.version_number ?? 0) + 1} and make current`}
          </button>
        </div>
      )}
      {sets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No plan sets yet. Group your drawings into a set to track versions.</p>
      ) : (
        <ul className="space-y-1.5">
          {sets.map((s) => (
            <li key={s.id} className="rounded-lg border border-border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{s.title}</span>
                  {s.version_number != null && <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">V{s.version_number}</span>}
                  <span className={`ml-2 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${s.is_current ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {s.is_current ? "Current" : current ? "Previous" : "Not current"}
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Uploaded {new Date(s.created_at).toLocaleDateString()}{s.issue_date ? ` · Revised ${s.issue_date}` : ""} · {(s.document_ids ?? []).length} file(s) · {s.sheet_count} sheet(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setOpenSet(openSet === s.id ? null : s.id)} className="text-[10px] font-mono uppercase text-muted-foreground hover:text-brand">Sheets</button>
                  {!s.is_current && (
                    <button onClick={() => makeCurrent.mutate(s.id)} className="text-[10px] font-mono uppercase text-brand inline-flex items-center gap-1"><Check className="size-3" /> Make current</button>
                  )}
                </div>
              </div>
              {openSet === s.id && <SheetList sheets={(s.plan_set_sheets ?? []) as Sheet[]} onSaved={refresh} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Sheet = { id: string; sheet_number: string | null; sheet_title: string | null; discipline: string | null; page_index: number | null };

function SheetList({ sheets, onSaved }: { sheets: Sheet[]; onSaved: () => void }) {
  const fn = useServerFn(updatePlanSheet);
  const [edit, setEdit] = useState<Sheet | null>(null);
  const save = useMutation({ mutationFn: (s: Sheet) => fn({ data: { id: s.id, sheet_number: s.sheet_number, sheet_title: s.sheet_title, discipline: s.discipline } }), onSuccess: () => { setEdit(null); onSaved(); } });
  if (!sheets.length) return <p className="mt-2 text-[11px] text-muted-foreground">No sheet list yet — sheets appear after Plan QA/QC reads the drawings.</p>;
  const cls = "h-7 rounded border border-input bg-background px-1.5 text-[11px]";
  return (
    <ul className="mt-2 space-y-1">
      {[...sheets].sort((a, b) => (a.page_index ?? 0) - (b.page_index ?? 0)).map((sh) => edit?.id === sh.id ? (
        <li key={sh.id} className="flex flex-wrap gap-1">
          <input aria-label="Sheet number" className={cls + " w-20"} value={edit.sheet_number ?? ""} onChange={(e) => setEdit({ ...edit, sheet_number: e.target.value })} />
          <input aria-label="Sheet title" className={cls + " flex-1"} value={edit.sheet_title ?? ""} onChange={(e) => setEdit({ ...edit, sheet_title: e.target.value })} />
          <input aria-label="Discipline" className={cls + " w-28"} value={edit.discipline ?? ""} onChange={(e) => setEdit({ ...edit, discipline: e.target.value })} />
          <button onClick={() => save.mutate(edit)} className="text-[10px] font-mono uppercase text-brand">Save</button>
        </li>
      ) : (
        <li key={sh.id} className="flex items-center gap-2 text-[11px]">
          <span className="font-mono w-16">{sh.sheet_number ?? "—"}</span>
          <span className="flex-1 truncate">{sh.sheet_title ?? "Untitled"}</span>
          <span className="text-muted-foreground">{sh.discipline ?? ""}</span>
          <button onClick={() => setEdit(sh)} aria-label="Correct sheet details" className="text-muted-foreground hover:text-brand"><Pencil className="size-3" /></button>
        </li>
      ))}
    </ul>
  );
}
