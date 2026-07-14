import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createBatchReportShare, listBatchReportShares, revokeBatchReportShare } from "@/lib/reportShares.functions";
import type { batchReviewPlans } from "@/lib/planReview.functions";

export function ShareReportDialog({ projectId, report, onClose }: { projectId: string; report: Awaited<ReturnType<typeof batchReviewPlans>>; onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createBatchReportShare);
  const listFn = useServerFn(listBatchReportShares);
  const revokeFn = useServerFn(revokeBatchReportShare);
  const [password, setPassword] = useState("");
  const [expiresDays, setExpiresDays] = useState<string>("30");

  const list = useQuery({
    queryKey: ["report-shares", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: {
      project_id: projectId,
      report: report as unknown as Record<string, unknown>,
      password: password.trim() ? password.trim() : undefined,
      expires_in_days: expiresDays ? Number(expiresDays) : undefined,
    }}),
    onSuccess: async (r: unknown) => {
      const path = (r as { path: string }).path;
      const url = `${window.location.origin}${path}`;
      try { await navigator.clipboard.writeText(url); toast.success("Share link copied to clipboard"); }
      catch { toast.success("Share link created"); }
      setPassword("");
      qc.invalidateQueries({ queryKey: ["report-shares", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create share link"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => { toast.success("Link revoked"); qc.invalidateQueries({ queryKey: ["report-shares", projectId] }); },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-background border border-border p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-brand">Share PermitHealth Report</p>
            <p className="text-xs text-muted-foreground mt-0.5">Send reviewers a read-only link. Optional password and expiration.</p>
          </div>
          <button onClick={onClose} className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">Close</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs space-y-1">
            <span className="text-[10px] font-mono uppercase text-muted-foreground">Password (optional)</span>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank for open link" className="w-full h-9 px-2 rounded-md bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand" />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-[10px] font-mono uppercase text-muted-foreground">Expires in (days)</span>
            <select value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} className="w-full h-9 px-2 rounded-md bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand">
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="">Never</option>
            </select>
          </label>
        </div>

        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create share link"}
        </button>

        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Existing links</p>
          {list.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No share links yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {((list.data ?? []) as Array<{ id: string; path: string; token: string; expires_at: string | null; revoked_at: string | null; password_protected: boolean; view_count: number }>).map((s) => {
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}${s.path}`;
                const revoked = !!s.revoked_at;
                const expired = s.expires_at && new Date(s.expires_at).getTime() < Date.now();
                return (
                  <li key={s.id} className="rounded-md border border-border bg-card p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <code className="truncate text-[10px]">{url}</code>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}
                          className="text-[10px] font-mono uppercase text-brand hover:opacity-80"
                        >Copy</button>
                        {!revoked && (
                          <button
                            onClick={() => revoke.mutate(s.id)}
                            className="text-[10px] font-mono uppercase text-destructive hover:opacity-80"
                          >Revoke</button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {s.view_count} view{s.view_count === 1 ? "" : "s"}
                      {s.password_protected ? " · password" : ""}
                      {s.expires_at ? ` · expires ${new Date(s.expires_at).toLocaleDateString()}` : " · never expires"}
                      {revoked ? " · revoked" : expired ? " · expired" : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
