import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { listInspections, addInspection, deleteInspection } from "@/lib/inspections.functions";
import { supabase } from "@/integrations/supabase/client";

type InspectionRow = {
  id: string;
  inspection_type: string;
  status: string;
  scheduled_date: string | null;
  inspector: string | null;
  result: string | null;
};

export function InspectionsTab({ projectId, userId }: { projectId: string; userId: string }) {
  void userId;
  const listFn = useServerFn(listInspections);
  const addFn = useServerFn(addInspection);
  const delFn = useServerFn(deleteInspection);
  const qc = useQueryClient();
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [inspector, setInspector] = useState("");

  const q = useQuery({ queryKey: ["inspections", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });

  useEffect(() => {
    const ch = supabase
      .channel(`insp:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inspections", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["inspections", projectId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, qc]);

  const add = useMutation({
    mutationFn: () => addFn({ data: { project_id: projectId, inspection_type: type.trim(), scheduled_date: date || null, inspector } }),
    onSuccess: () => { setType(""); setDate(""); setInspector(""); toast.success("Inspection scheduled"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspections", projectId] }),
  });

  const rows = (q.data ?? []) as InspectionRow[];
  const statusColor: Record<string, string> = {
    scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    passed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    failed: "bg-destructive/15 text-destructive",
    rescheduled: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    canceled: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">On-site inspections</p>
        <p className="text-xs text-muted-foreground">Tap any inspection to enter mobile Inspection Mode.</p>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No inspections yet.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((i) => (
            <li key={i.id} className="p-3 bg-card ring-1 ring-black/5 rounded-xl flex items-center gap-3">
              <Link to="/inspections/$id" params={{ id: i.id }} className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{i.inspection_type}</p>
                <p className="text-[11px] font-mono uppercase text-muted-foreground">
                  {i.scheduled_date ? format(new Date(i.scheduled_date), "MMM d, yyyy") : "unscheduled"}
                  {i.inspector ? ` · ${i.inspector}` : ""}
                </p>
              </Link>
              <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${statusColor[i.status] ?? "bg-muted"}`}>{i.status}</span>
              <button onClick={() => del.mutate(i.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (type.trim()) add.mutate(); }}
        className="space-y-2 p-3 bg-card ring-1 ring-black/5 rounded-xl"
      >
        <input
          value={type} onChange={(e) => setType(e.target.value)}
          placeholder="Inspection type (e.g. Rough Electrical)"
          className="w-full h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
        />
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="flex-1 h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand" />
          <input value={inspector} onChange={(e) => setInspector(e.target.value)}
            placeholder="Inspector"
            className="flex-1 h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand" />
        </div>
        <button disabled={add.isPending || !type.trim()}
          className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
          Schedule inspection
        </button>
      </form>
    </div>
  );
}
