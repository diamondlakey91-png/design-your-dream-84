import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw } from "lucide-react";
import { linkPermitToProject, refreshLinkedPermit, unlinkPermit, listPermitSyncHistory } from "@/lib/permitLookup.functions";
import { PortalDeepLinks } from "@/components/project/PortalDeepLinks";

type LivePermitData = {
  permit_number?: string;
  permit_type?: string;
  status?: string;
  address?: string;
  applicant?: string;
  filed_date?: string;
  updated_date?: string;
  issued_date?: string;
  expiration_date?: string;
  next_inspection?: string;
  description?: string;
  fees_due?: string;
  reviewers?: Array<{ discipline: string; status: string; name?: string }>;
  timeline?: Array<{ date: string; event: string }>;
  source_url?: string;
  portal_name?: string;
  jurisdiction?: string;
  found?: boolean;
  no_match_reason?: string;
};

export function LivePermitCard({
  project,
  onChange,
}: {
  project: { id: string; jurisdiction: string; linked_permit_number?: string | null; linked_permit_url?: string | null; linked_permit_data?: unknown; linked_permit_synced_at?: string | null };
  onChange: () => void;
}) {
  const linkFn = useServerFn(linkPermitToProject);
  const refreshFn = useServerFn(refreshLinkedPermit);
  const unlinkFnCall = useServerFn(unlinkPermit);
  const historyFn = useServerFn(listPermitSyncHistory);
  const [permitNumber, setPermitNumber] = useState("");
  const [jurisdictionOverride, setJurisdictionOverride] = useState(project.jurisdiction || "");
  const [showHistory, setShowHistory] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const historyQ = useQuery({
    queryKey: ["permit_sync_history", project.id, project.linked_permit_synced_at ?? ""],
    queryFn: () => historyFn({ data: { project_id: project.id, limit: 25 } }),
    enabled: showHistory && Boolean(project.linked_permit_number),
  });

  const link = useMutation({
    mutationFn: () => linkFn({ data: { project_id: project.id, permit_number: permitNumber.trim(), jurisdiction: jurisdictionOverride.trim() || undefined } }),
    onSuccess: (r) => {
      onChange();
      setPermitNumber("");
      toast.success(r.linked.found ? `Linked ${r.linked.permit_number} — ${r.linked.status}` : "Linked. No live record found yet.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to link permit"),
  });
  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { project_id: project.id } }),
    onSuccess: (r) => { onChange(); toast.success(`Refreshed — ${r.linked.status}`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Refresh failed"),
  });
  const unlink = useMutation({
    mutationFn: () => unlinkFnCall({ data: { project_id: project.id } }),
    onSuccess: () => { onChange(); toast.success("Unlinked"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unlink failed"),
  });

  const d = (project.linked_permit_data ?? null) as LivePermitData | null;
  const linked = Boolean(project.linked_permit_number);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">LIVE_PERMIT_TRACKING</p>
        {linked && (
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Syncing…" : "Refresh"}
          </button>
        )}
      </div>

      {!linked ? (
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter an official permit / record number to pull live status directly from the jurisdiction portal.
          </p>
          <div className="grid gap-2">
            <input
              value={permitNumber}
              onChange={(e) => setPermitNumber(e.target.value)}
              placeholder="Permit # (e.g. B2024-01234)"
              className="h-10 px-3 rounded-lg bg-background ring-1 ring-border text-sm"
            />
            <input
              value={jurisdictionOverride}
              onChange={(e) => setJurisdictionOverride(e.target.value)}
              placeholder="Jurisdiction (City, ST or County, ST)"
              className="h-10 px-3 rounded-lg bg-background ring-1 ring-border text-sm"
            />
            <button
              onClick={() => link.mutate()}
              disabled={link.isPending || permitNumber.trim().length < 2}
              className="h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {link.isPending ? "Fetching live status…" : "Link & fetch live status"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">PERMIT_NUMBER</p>
              <p className="text-base font-semibold truncate">{project.linked_permit_number}</p>
              {d?.portal_name && <p className="text-[11px] text-muted-foreground mt-0.5">{d.portal_name}</p>}
            </div>
            <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded ${
              d?.status && /issued|approved|finaled|ready/i.test(d.status) ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
              d?.status && /review|submitted|pending|plan/i.test(d.status) ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
              d?.status && /expired|withdrawn|rejected/i.test(d.status) ? "bg-red-500/15 text-red-600 dark:text-red-400" :
              "bg-muted text-muted-foreground"
            }`}>
              {d?.status || "Unknown"}
            </span>
          </div>

          {d && !d.found && d.no_match_reason && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{d.no_match_reason}</p>
          )}

          {d && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {d.permit_type && <div><span className="text-muted-foreground">Type: </span><span className="font-medium">{d.permit_type}</span></div>}
              {d.address && <div className="col-span-2"><span className="text-muted-foreground">Address: </span><span className="font-medium">{d.address}</span></div>}
              {d.applicant && <div className="col-span-2"><span className="text-muted-foreground">Applicant: </span><span className="font-medium">{d.applicant}</span></div>}
              {d.filed_date && <div><span className="text-muted-foreground">Filed: </span><span className="font-medium">{d.filed_date}</span></div>}
              {d.issued_date && <div><span className="text-muted-foreground">Issued: </span><span className="font-medium">{d.issued_date}</span></div>}
              {d.updated_date && <div><span className="text-muted-foreground">Updated: </span><span className="font-medium">{d.updated_date}</span></div>}
              {d.expiration_date && <div><span className="text-muted-foreground">Expires: </span><span className="font-medium">{d.expiration_date}</span></div>}
              {d.next_inspection && <div className="col-span-2"><span className="text-muted-foreground">Next inspection: </span><span className="font-medium">{d.next_inspection}</span></div>}
              {d.fees_due && <div className="col-span-2"><span className="text-muted-foreground">Fees due: </span><span className="font-medium">{d.fees_due}</span></div>}
            </div>
          )}

          {d?.description && <p className="text-xs text-muted-foreground">{d.description}</p>}

          {d?.reviewers && d.reviewers.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">REVIEWERS</p>
              <div className="grid gap-1">
                {d.reviewers.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span>{r.discipline}{r.name ? ` — ${r.name}` : ""}</span>
                    <span className={`font-mono uppercase text-[10px] px-1.5 py-0.5 rounded ${
                      /approv/i.test(r.status) ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                      /reject/i.test(r.status) ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                      "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d?.timeline && d.timeline.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">TIMELINE</p>
              <ul className="space-y-1 text-xs">
                {d.timeline.slice(0, 8).map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-muted-foreground w-24 shrink-0">{t.date}</span>
                    <span>{t.event}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-[10px] font-mono uppercase text-muted-foreground">
              {project.linked_permit_synced_at ? `Synced ${formatDistanceToNow(new Date(project.linked_permit_synced_at), { addSuffix: true })}` : ""}
            </div>
            <div className="flex items-center gap-3">
              {(project.linked_permit_url || d?.source_url) && (
                <a href={project.linked_permit_url || d?.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80">
                  Open portal ↗
                </a>
              )}
              <button
                onClick={() => unlink.mutate()}
                disabled={unlink.isPending}
                className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-red-500 disabled:opacity-50"
              >
                Unlink
              </button>
            </div>
          </div>

          <PortalDeepLinks
            jurisdiction={project.jurisdiction}
            permitNumber={project.linked_permit_number ?? ""}
            address={d?.address ?? ""}
          />



          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setShowHistory((s) => !s)}
              className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {showHistory ? "▾ Hide sync history" : "▸ Sync history"}
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1.5">
                {historyQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                {historyQ.data && historyQ.data.history.length === 0 && (
                  <p className="text-xs text-muted-foreground">No syncs recorded yet.</p>
                )}
                {historyQ.data?.history.map((h) => {
                  const isOpen = expandedRow === h.id;
                  const snap = h.snapshot as LivePermitData | null;
                  const fields = snap
                    ? [
                        snap.permit_type && ["Type", snap.permit_type],
                        snap.address && ["Address", snap.address],
                        snap.applicant && ["Applicant", snap.applicant],
                        snap.filed_date && ["Filed", snap.filed_date],
                        snap.issued_date && ["Issued", snap.issued_date],
                        snap.updated_date && ["Updated", snap.updated_date],
                        snap.expiration_date && ["Expires", snap.expiration_date],
                        snap.next_inspection && ["Next inspection", snap.next_inspection],
                        snap.fees_due && ["Fees due", snap.fees_due],
                      ].filter(Boolean) as [string, string][]
                    : [];
                  return (
                    <div key={h.id} className="rounded-lg bg-background ring-1 ring-border overflow-hidden">
                      <button
                        onClick={() => setExpandedRow(isOpen ? null : h.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase text-muted-foreground w-4 shrink-0">{isOpen ? "▾" : "▸"}</span>
                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-muted-foreground shrink-0">· {h.trigger}</span>
                          <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ml-1 truncate ${
                            /issued|approved|finaled|ready/i.test(h.status) ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                            /review|submitted|pending|plan/i.test(h.status) ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                            /expired|withdrawn|rejected/i.test(h.status) ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                            "bg-muted text-muted-foreground"
                          }`}>{h.status || (h.found ? "Found" : "No match")}</span>
                        </div>
                        {h.source_url && (
                          <a href={h.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] font-mono uppercase text-brand hover:opacity-80 shrink-0">Portal ↗</a>
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">
                          {h.portal_name && <p className="text-[11px] text-muted-foreground">{h.portal_name} · {h.jurisdiction}</p>}
                          {fields.length > 0 && (
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              {fields.map(([k, v]) => (
                                <div key={k} className={k === "Address" || k === "Applicant" || k === "Next inspection" || k === "Fees due" ? "col-span-2" : ""}>
                                  <span className="text-muted-foreground">{k}: </span>
                                  <span className="font-medium">{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {snap?.description && <p className="text-xs text-muted-foreground">{snap.description}</p>}
                          <details className="text-[11px]">
                            <summary className="cursor-pointer font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">Raw portal response</summary>
                            <pre className="mt-1.5 p-2 rounded bg-muted text-[10px] overflow-x-auto max-h-64">{JSON.stringify(snap, null, 2)}</pre>
                          </details>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
