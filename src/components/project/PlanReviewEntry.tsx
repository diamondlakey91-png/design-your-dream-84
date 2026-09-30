import { useState } from "react";
import { Layers, Sparkles, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { disciplineLabel } from "@/lib/qaqcConfig";

export type OverviewSet = {
  id: string; title: string; version_number: number | null; is_current: boolean | null; issue_date: string | null;
  revision_label: string | null; known_sheets: number; file_count: number; disciplines: string[]; created_at: string;
};
export type OverviewReview = {
  id: string; plan_set_id: string | null; revision_label: string; status: string; created_at: string; completed_at: string | null;
  error: string | null; counts: { total: number; open: number; high: number };
};
export type Overview = {
  project: { name: string; location: string | null; jurisdiction: string | null; project_type: string | null; work_type: string | null; scope_description: string | null; occupancy_class: string | null };
  jurisdiction: { status: string; city: string | null; state: string | null; formatted_address: string | null } | null;
  planSets: OverviewSet[];
  reviews: OverviewReview[];
  balance: number;
  internalAccess: boolean;
  staff: boolean;
};

export const setLabel = (s: { title: string; version_number: number | null }) =>
  s.version_number && !new RegExp(`\\bV${s.version_number}\\b`, "i").test(s.title) ? `${s.title} (V${s.version_number})` : s.title;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export function PlanReviewEntry({
  o, activeReviewId, onSelectReview, onRun, running,
}: {
  o: Overview;
  activeReviewId: string | null;
  onSelectReview: (id: string) => void;
  onRun: (planSetId: string, requestId: string) => void;
  running: boolean;
}) {
  const [target, setTarget] = useState<OverviewSet | null>(null);
  const [requestId, setRequestId] = useState<string>("");
  const reviewsFor = (id: string) => o.reviews.filter((r) => r.plan_set_id === id);
  const lastDone = (id: string) => reviewsFor(id).find((r) => r.status === "complete") ?? null;
  const current = o.planSets.find((s) => s.is_current) ?? null;
  const prevReviewed = current && !lastDone(current.id) ? o.planSets.find((s) => s.id !== current.id && lastDone(s.id)) : null;
  const legacy = o.reviews.filter((r) => !r.plan_set_id);

  const open = (s: OverviewSet) => { setTarget(s); setRequestId(crypto.randomUUID()); };

  const j = o.jurisdiction;
  const jStatus = j?.status ?? "none";
  const warnings = target ? [
    !j || jStatus === "unconfirmed" || jStatus === "none" ? "Jurisdiction is not verified — local code context may be incomplete." : null,
    !(o.project.scope_description ?? "").trim() && !o.project.work_type ? "Scope of work is missing." : null,
    target.known_sheets === 0 ? "No sheet list has been extracted yet; the review will build one." : null,
    !(o.project.location ?? j?.formatted_address) ? "Project address is missing." : null,
  ].filter(Boolean) as string[] : [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Plan Review</p>
        <h3 className="mt-1 text-lg font-semibold">Pre-submittal plan review</h3>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          Identifies potential issues on your current plan set before submittal. It does not guarantee code compliance or permit approval,
          and does not replace licensed professional or AHJ review.
        </p>

        {o.planSets.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No plan sets yet. Create one in Documents → Plans, then return here to review it.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {prevReviewed && (
              <p className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-sky-300">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {setLabel(current!)} has not been reviewed yet. Previous findings belong to {setLabel(prevReviewed)}.
              </p>
            )}
            {o.planSets.map((s) => {
              const done = lastDone(s.id);
              const runningNow = reviewsFor(s.id).find((r) => r.status === "running");
              return (
                <div key={s.id} className={`rounded-xl border p-3 ${s.is_current ? "border-brand/50" : "border-border"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <Layers className="size-4 text-brand" /> {setLabel(s)}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${s.is_current ? "bg-emerald-500/10 text-emerald-400" : "bg-muted/40 text-muted-foreground"}`}>{s.is_current ? "Current" : "Previous"}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Revision {s.issue_date ? fmt(s.issue_date) : s.revision_label ?? "date unknown"} · {s.file_count} file(s) · {s.known_sheets || "unknown"} sheet(s)
                        {s.disciplines.length ? ` · ${s.disciplines.map(disciplineLabel).join(", ")}` : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {runningNow ? "Review in progress…" : done ? `Reviewed ${fmt(done.completed_at ?? done.created_at)} · ${done.counts.total} findings · ${done.counts.open} open` : "Not reviewed"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reviewsFor(s.id).filter((r) => r.status === "complete").map((r) => (
                        <button key={r.id} onClick={() => onSelectReview(r.id)}
                          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider ${activeReviewId === r.id ? "border-brand text-brand" : "border-border text-muted-foreground hover:border-brand/60"}`}>
                          Review {fmt(r.created_at)}
                        </button>
                      ))}
                      {s.is_current && (
                        <button onClick={() => open(s)} disabled={running || !!runningNow || s.file_count === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50">
                          <Sparkles className="size-3.5" /> {done ? "Review again" : "Review this plan set"}
                        </button>
                      )}
                    </div>
                  </div>
                  {reviewsFor(s.id).filter((r) => r.status === "error").slice(0, 1).map((r) => (
                    <p key={r.id} className="mt-1 text-[11px] text-destructive">Last attempt failed{r.error ? `: ${r.error}` : ""}. Any credit used was restored.</p>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {legacy.filter((r) => r.status === "complete").length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Earlier reviews (before plan sets):</span>
            {legacy.filter((r) => r.status === "complete").map((r) => (
              <button key={r.id} onClick={() => onSelectReview(r.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider ${activeReviewId === r.id ? "border-brand text-brand" : "border-border text-muted-foreground"}`}>
                {r.revision_label} · {fmt(r.created_at)}
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review {target ? setLabel(target) : ""}</DialogTitle>
            <DialogDescription>Check what will be reviewed before you start.</DialogDescription>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Plan set</dt><dd>{setLabel(target)}</dd>
                <dt className="text-muted-foreground">Files</dt><dd>{target.file_count}</dd>
                <dt className="text-muted-foreground">Known sheets</dt><dd>{target.known_sheets || "Not yet extracted"}</dd>
                <dt className="text-muted-foreground">Disciplines</dt><dd>{target.disciplines.map(disciplineLabel).join(", ") || "Detected during review"}</dd>
                <dt className="text-muted-foreground">Address</dt><dd>{j?.formatted_address ?? o.project.location ?? "—"}</dd>
                <dt className="text-muted-foreground">Jurisdiction</dt><dd>{[j?.city, j?.state].filter(Boolean).join(", ") || o.project.jurisdiction || "—"} <span className="text-muted-foreground">({jStatus.replace(/_/g, " ")})</span></dd>
                <dt className="text-muted-foreground">Scope</dt><dd className="line-clamp-3">{o.project.scope_description || "—"}</dd>
                <dt className="text-muted-foreground">Project / work type</dt><dd>{[o.project.project_type, o.project.work_type].filter(Boolean).join(" · ") || "—"}</dd>
              </dl>
              {warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2 text-xs text-sky-300">
                  {warnings.map((w) => <li key={w}>• {w}</li>)}
                  <li className="text-muted-foreground">You can still run the review, or fix these first in Property / Scope.</li>
                </ul>
              )}
              <p className="rounded-lg border border-border px-3 py-2 text-xs">
                {o.internalAccess
                  ? "Internal access — logged as internal use; no customer credit is charged."
                  : o.balance > 0
                    ? `Uses 1 Plan Review credit. You have ${o.balance}. If the review fails, the credit is restored.`
                    : "You have no Plan Review credits. The review cannot start until a credit is available."}
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setTarget(null)} className="rounded-lg border border-border px-3 py-2 text-[11px] font-mono uppercase tracking-wider">Cancel</button>
                <button
                  onClick={() => { onRun(target.id, requestId); setTarget(null); }}
                  disabled={running || (!o.internalAccess && o.balance <= 0)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50"
                >
                  <Sparkles className="size-3.5" /> Start Plan Review
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
