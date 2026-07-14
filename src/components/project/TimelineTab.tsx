import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { listActivity } from "@/lib/projects.functions";
import { supabase } from "@/integrations/supabase/client";

export function TimelineTab({ projectId }: { projectId: string }) {
  const listFn = useServerFn(listActivity);
  const qc = useQueryClient();
  const [flashId, setFlashId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["activity", projectId],
    queryFn: () => listFn({ data: { project_id: projectId, limit: 100 } }),
  });

  useEffect(() => {
    const channel = supabase
      .channel(`activity:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const id = (payload.new as { id?: string })?.id;
          if (id) {
            setFlashId(id);
            setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 2000);
          }
          qc.invalidateQueries({ queryKey: ["activity", projectId] });
          qc.invalidateQueries({ queryKey: ["project", projectId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, qc]);

  const items = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            Audit timeline
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Every checklist, deadline, and stage change on this project.</p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{items.length} events</span>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No activity yet.</div>
      ) : (
        <ol className="relative border-l border-border ml-2 space-y-4 pl-5">
          {items.map((a) => {
            const isNew = a.id === flashId;
            return (
              <li key={a.id} className="relative">
                <span className={`absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-2 ring-background ${isNew ? "bg-emerald-500 animate-ping" : "bg-brand"}`} />
                <span className={`absolute -left-[26px] top-1.5 size-2.5 rounded-full ${isNew ? "bg-emerald-500" : "bg-brand"}`} />
                <div className={`p-3 bg-card ring-1 ring-black/5 rounded-xl transition-colors ${isNew ? "ring-emerald-500/50 bg-emerald-500/5" : ""}`}>
                  <p className="text-sm text-foreground">{a.description}</p>
                  <p className="text-[11px] font-mono uppercase text-muted-foreground mt-0.5">
                    {format(new Date(a.created_at), "MMM d, yyyy · h:mm a")} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
