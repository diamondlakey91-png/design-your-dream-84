import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { CalendarClock, Trash2 } from "lucide-react";
import { listDeadlines, addDeadline, deleteDeadline } from "@/lib/projects.functions";
import { supabase } from "@/integrations/supabase/client";

export function DeadlinesTab({ projectId }: { projectId: string }) {
  const listFn = useServerFn(listDeadlines);
  const addFn = useServerFn(addDeadline);
  const delFn = useServerFn(deleteDeadline);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  const q = useQuery({ queryKey: ["deadlines"], queryFn: () => listFn() });
  const ours = (q.data ?? []).filter((d) => d.project_id === projectId);

  useEffect(() => {
    const channel = supabase
      .channel(`deadlines:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deadlines", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["deadlines"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, qc]);

  const add = useMutation({
    mutationFn: () => addFn({ data: { project_id: projectId, title: title.trim(), due_date: date } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deadlines"] }); setTitle(""); setDate(""); toast.success("Deadline added"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deadlines"] }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold flex items-center gap-2">
        Deadlines & reminders
        <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
      </p>

      {ours.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No deadlines yet.</div>
      ) : (
        <ul className="space-y-2">
          {ours.map((d) => {
            const due = new Date(d.due_date);
            const overdue = due.getTime() < Date.now();
            return (
              <li key={d.id} className="p-3 bg-card ring-1 ring-black/5 rounded-xl flex items-center gap-3">
                <CalendarClock className={`size-5 shrink-0 ${overdue ? "text-destructive" : "text-brand"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className={`text-[11px] font-mono uppercase ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                    {format(due, "MMM d, yyyy")} · {formatDistanceToNow(due, { addSuffix: true })}
                  </p>
                </div>
                <button onClick={() => del.mutate(d.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (title.trim() && date) add.mutate(); }}
        className="space-y-2 p-3 bg-card ring-1 ring-black/5 rounded-xl"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Deadline title (e.g. Plans resubmittal)"
          className="w-full h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
          />
          <button
            disabled={add.isPending || !title.trim() || !date}
            className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
