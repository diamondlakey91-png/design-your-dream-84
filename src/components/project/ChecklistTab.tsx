import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Plus, Trash2, Info } from "lucide-react";
import { listPermitItems, generatePermitChecklist, addPermitItem, updatePermitItem, deletePermitItem } from "@/lib/checklist.functions";
import { supabase } from "@/integrations/supabase/client";
import { HealthAgencyDeepLinks } from "@/components/project/HealthAgencyDeepLinks";

const HEALTH_GROUNDED_CATEGORIES = new Set(["Health", "Environmental", "Stormwater"]);

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  issued: "Issued",
  n_a: "N/A",
};
const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  under_review: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  issued: "bg-brand/20 text-brand",
  n_a: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 line-through",
};

export function ChecklistTab({ projectId, jurisdiction }: { projectId: string; jurisdiction: string }) {
  const listFn = useServerFn(listPermitItems);
  const genFn = useServerFn(generatePermitChecklist);
  const addFn = useServerFn(addPermitItem);
  const updateFn = useServerFn(updatePermitItem);
  const delFn = useServerFn(deletePermitItem);
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");

  const q = useQuery({ queryKey: ["permit_items", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });

  useEffect(() => {
    const channel = supabase
      .channel(`permit_items:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "permit_items", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["permit_items", projectId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, qc]);

  const generate = useMutation({
    mutationFn: () => genFn({ data: { project_id: projectId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permit_items", projectId] }); toast.success("Checklist generated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const add = useMutation({
    mutationFn: (name: string) => addFn({ data: { project_id: projectId, name, category: "Building", required: true } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permit_items", projectId] }); setNewName(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permit_items", projectId] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permit_items", projectId] }),
  });

  const items = q.data ?? [];
  const total = items.length;
  const done = items.filter((i) => i.status === "issued" || i.status === "approved" || i.status === "n_a").length;
  const hasHealthGroundedItem = items.some((i) => HEALTH_GROUNDED_CATEGORIES.has(i.category));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            Permit checklist
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{done}/{total} approved or issued</p>
        </div>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
        >
          {items.length > 0 ? <RefreshCw className="size-3" /> : <Sparkles className="size-3" />}
          {generate.isPending ? "Building…" : items.length > 0 ? "Regenerate" : "AI generate"}
        </button>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border">
          <Info className="size-5 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No permit items yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Generate a jurisdiction-specific checklist{jurisdiction ? ` for ${jurisdiction}` : ""} with AI, or add one below.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="p-3 bg-card ring-1 ring-black/5 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{it.category}</span>
                    {it.required && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-brand/15 text-brand">Required</span>}
                  </div>
                  <p className="text-sm font-medium mt-1">{it.name}</p>
                  {it.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.notes}</p>}
                </div>
                <button onClick={() => del.mutate(it.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(["not_started", "submitted", "under_review", "approved", "issued", "n_a"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus.mutate({ id: it.id, status: s })}
                    className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded ${
                      it.status === s ? STATUS_COLOR[s] + " ring-1 ring-current/40" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasHealthGroundedItem && jurisdiction && (
        <HealthAgencyDeepLinks jurisdiction={jurisdiction} />
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (newName.trim()) add.mutate(newName.trim()); }}
        className="flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add permit item…"
          className="flex-1 h-10 px-3 rounded-lg bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
        />
        <button className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
          <Plus className="size-4" /> Add
        </button>
      </form>
    </div>
  );
}
