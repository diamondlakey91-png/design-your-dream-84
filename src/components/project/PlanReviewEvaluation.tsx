import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addMissedIssue, getPlanReviewMetrics, saveFindingEvaluation } from "@/lib/planReviewWorkspace.functions";

const chip = (on: boolean) =>
  `rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${on ? "border-brand text-brand" : "border-border text-muted-foreground hover:border-brand/60"}`;

/** Internal-only evaluation of one finding. Never changes the customer's finding. */
export function FindingEvaluation({
  reviewId, findingId, existing,
}: {
  reviewId: string; findingId: string;
  existing: { accuracy: string | null; usefulness: string | null; notes: string | null } | null;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(saveFindingEvaluation);
  const [acc, setAcc] = useState(existing?.accuracy ?? null);
  const [use, setUse] = useState(existing?.usefulness ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const save = useMutation({
    mutationFn: () => fn({ data: { review_id: reviewId, finding_id: findingId, accuracy: acc as never, usefulness: use as never, notes: notes || null } }),
    onSuccess: () => { toast.success("Internal evaluation saved"); qc.invalidateQueries({ queryKey: ["qaqc-evals", reviewId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  return (
    <div key={findingId} className="space-y-2 rounded-lg border border-dashed border-brand/40 p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-brand">Internal beta evaluation · staff only</p>
      <div className="flex flex-wrap gap-1">
        {[["accurate", "Accurate"], ["partially_accurate", "Partially accurate"], ["false_positive", "False positive"]].map(([v, l]) => (
          <button key={v} className={chip(acc === v)} onClick={() => setAcc(acc === v ? null : v)}>{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {[["useful", "Useful"], ["not_useful", "Not useful"]].map(([v, l]) => (
          <button key={v} className={chip(use === v)} onClick={() => setUse(use === v ? null : v)}>{l}</button>
        ))}
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs" />
      <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-brand px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50">Save evaluation</button>
    </div>
  );
}

/** Review-level internal panel: missed issues + beta metrics from the AI usage ledger. */
export function ReviewEvaluationPanel({
  reviewId, missed,
}: {
  reviewId: string;
  missed: Array<{ id: string; sheet_number: string | null; notes: string | null }>;
}) {
  const qc = useQueryClient();
  const addFn = useServerFn(addMissedIssue);
  const metricsFn = useServerFn(getPlanReviewMetrics);
  const metrics = useQuery({ queryKey: ["qaqc-metrics", reviewId], queryFn: () => metricsFn({ data: { review_id: reviewId } }) });
  const [sheet, setSheet] = useState("");
  const [notes, setNotes] = useState("");
  const add = useMutation({
    mutationFn: () => addFn({ data: { review_id: reviewId, sheet_number: sheet || null, notes } }),
    onSuccess: () => { setSheet(""); setNotes(""); toast.success("Missed issue recorded"); qc.invalidateQueries({ queryKey: ["qaqc-evals", reviewId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const m = metrics.data;
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-brand/40 bg-card/40 p-4">
      <p className="text-[11px] font-mono uppercase tracking-wider text-brand">Internal beta evaluation · staff only — not visible to customers</p>
      {m && (
        <div className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <span>Sheets: {m.sheet_count}</span>
          <span>Disciplines: {m.disciplines.join(", ") || "—"}</span>
          <span>Duration: {m.duration_seconds != null ? `${m.duration_seconds}s` : "—"}</span>
          <span>Findings: {m.findings}</span>
          <span>By severity: {Object.entries(m.by_severity).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}</span>
          <span>Citations: {m.citations} ({m.citations_with_source} with source, {m.citations_verified} verified)</span>
          <span>Low confidence: {m.low_confidence}</span>
          <span>Model: {m.models.join(", ") || "—"}</span>
          <span>Tokens: {m.input_tokens.toLocaleString()} in / {m.output_tokens.toLocaleString()} out</span>
          <span>Est. AI cost: ${m.estimated_cost_usd.toFixed(4)}</span>
          <span>Credits: {m.credits_charged} charged · {m.credits_restored} restored{m.internal_use ? " · internal use" : ""}</span>
          <span>Attempts: {m.attempts} · failures {m.failures}</span>
        </div>
      )}
      {metrics.isError && <p className="text-xs text-muted-foreground">Metrics unavailable.</p>}
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Missed issues (false negatives)</p>
        {missed.map((x) => <p key={x.id} className="text-xs">• {x.sheet_number ? `${x.sheet_number}: ` : ""}{x.notes}</p>)}
        {missed.length === 0 && <p className="text-xs text-muted-foreground">None recorded.</p>}
        <div className="flex flex-wrap gap-2">
          <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="Sheet (optional)" className="w-32 rounded-lg border border-border bg-card px-2 py-1.5 text-xs" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did the review miss?" className="min-w-[200px] flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs" />
          <button onClick={() => add.mutate()} disabled={notes.trim().length < 3 || add.isPending} className="rounded-lg border border-brand px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-brand disabled:opacity-50">Record</button>
        </div>
      </div>
    </div>
  );
}
