import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Radio, Sparkles } from "lucide-react";
import { syncJurisdiction, listJurisdictionSyncs, applySyncToChecklist } from "@/lib/jurisdictionSync.functions";
import { supabase } from "@/integrations/supabase/client";

type SyncRow = {
  id: string;
  status: string;
  portal_name: string;
  portal_url: string;
  source_url: string;
  summary: string;
  error: string;
  findings: Array<{ permit_or_record: string; status: string; applicant_or_address?: string; filed_or_updated?: string; notes?: string }>;
  updated_at: string;
  created_at: string;
};

export function LiveJurisdictionSync({ projectId, jurisdiction }: { projectId: string; jurisdiction: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listJurisdictionSyncs);
  const syncFn = useServerFn(syncJurisdiction);

  const q = useQuery({
    queryKey: ["jurisdiction_syncs", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }) as unknown as Promise<SyncRow[]>,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`jsync-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jurisdiction_syncs", filter: `project_id=eq.${projectId}` }, () => {
        qc.invalidateQueries({ queryKey: ["jurisdiction_syncs", projectId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, qc]);

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { project_id: projectId } }),
    onSuccess: () => toast.success("Live sync complete"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const applyFn = useServerFn(applySyncToChecklist);
  const [applyReport, setApplyReport] = useState<{
    applied: Array<{ item_name: string; from_status: string; to_status: string | null; new_due_date: string | null; confidence: string; explanation: string; finding: string }>;
    skipped: Array<{ reason: string; explanation: string }>;
    total_findings: number;
  } | null>(null);
  const apply = useMutation({
    mutationFn: (syncId: string) => applyFn({ data: { sync_id: syncId } }) as unknown as Promise<NonNullable<typeof applyReport>>,
    onSuccess: (res) => {
      setApplyReport(res);
      qc.invalidateQueries({ queryKey: ["permit_items", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      toast.success(res.applied.length ? `Applied ${res.applied.length} update${res.applied.length === 1 ? "" : "s"} to checklist` : "No confident matches to apply");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Apply failed"),
  });

  const latest = q.data?.[0];
  const inflight = sync.isPending || (latest && (latest.status === "searching" || latest.status === "scraping"));

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">LIVE_JURISDICTION_SYNC</p>
          {inflight && <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>}
        </div>
        <button
          onClick={() => sync.mutate()}
          disabled={!!inflight || !jurisdiction}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
          title={!jurisdiction ? "Add a jurisdiction first" : ""}
        >
          {inflight ? <RefreshCw className="size-3 animate-spin" /> : <Radio className="size-3" />}
          {inflight ? "Syncing…" : latest ? "Re-sync" : "Sync now"}
        </button>
      </div>

      {!jurisdiction ? (
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl text-sm text-muted-foreground">
          Add a jurisdiction to this project (e.g. "Los Angeles, CA") to enable live portal sync.
        </div>
      ) : !latest ? (
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
          <p className="text-sm text-muted-foreground">
            No sync yet. Tap <span className="font-mono text-brand">Sync now</span> to scan {jurisdiction}'s official permit portal and pull matching records for this project.
          </p>
        </div>
      ) : (
        <div className={`p-4 bg-card ring-1 rounded-xl ${latest.status === "error" ? "ring-red-500/40" : "ring-black/5"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {latest.portal_name || (latest.status === "error" ? "Sync failed" : "Working…")}
              </p>
              {latest.portal_url && (
                <a href={latest.portal_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[11px] font-mono text-brand hover:underline break-all">
                  {latest.portal_url}
                </a>
              )}
            </div>
            <span className="shrink-0 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {latest.status}
            </span>
          </div>

          {latest.summary && (
            <p className="mt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{latest.summary}</p>
          )}

          {latest.error && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{latest.error}</p>
          )}

          {latest.findings?.length > 0 && (
            <ul className="mt-4 space-y-2">
              {latest.findings.map((f, i) => (
                <li key={i} className="p-3 rounded-lg bg-background ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{f.permit_or_record}</p>
                    <span className="shrink-0 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-brand/15 text-brand">{f.status}</span>
                  </div>
                  {(f.applicant_or_address || f.filed_or_updated) && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[f.applicant_or_address, f.filed_or_updated].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {f.notes && <p className="mt-1 text-xs text-muted-foreground">{f.notes}</p>}
                </li>
              ))}
            </ul>
          )}

          {latest.status === "complete" && latest.findings?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-black/5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Auto-match to checklist
                </p>
                <button
                  onClick={() => apply.mutate(latest.id)}
                  disabled={apply.isPending}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
                >
                  {apply.isPending ? <RefreshCw className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  {apply.isPending ? "Matching…" : "Apply to checklist"}
                </button>
              </div>
              {applyReport && (
                <div className="mt-3 space-y-2">
                  {applyReport.applied.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No confident matches to apply. {applyReport.skipped.length > 0 ? `${applyReport.skipped.length} finding${applyReport.skipped.length === 1 ? "" : "s"} skipped (low confidence or no change).` : ""}
                    </p>
                  )}
                  {applyReport.applied.map((a, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-emerald-500/5 ring-1 ring-emerald-500/20">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{a.item_name}</p>
                        <span className="shrink-0 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{a.confidence}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                        {a.from_status.replace(/_/g, " ")}
                        {a.to_status ? ` → ${a.to_status.replace(/_/g, " ")}` : " (status kept)"}
                        {a.new_due_date ? ` · due ${a.new_due_date}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-foreground/80">{a.explanation}</p>
                      <p className="mt-1 text-[10px] font-mono text-muted-foreground">source: {a.finding}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="mt-3 text-[10px] font-mono uppercase text-muted-foreground">
            Updated {formatDistanceToNow(new Date(latest.updated_at), { addSuffix: true })}
          </p>
        </div>
      )}
    </section>
  );
}
