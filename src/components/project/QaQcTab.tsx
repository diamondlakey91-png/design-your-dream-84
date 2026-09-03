import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { getQaQcStatus, createQaSignoff, deleteQaSignoff } from "@/lib/qaqc.functions";
import { batchReviewPlans, addPlanReviewFixesToChecklist } from "@/lib/planReview.functions";
import { importCommentsFromDocuments } from "@/lib/responseMatrix.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const statusIcon = {
  pass: <CheckCircle2 className="size-4 text-emerald-500" />,
  warn: <AlertTriangle className="size-4 text-amber-500" />,
  fail: <XCircle className="size-4 text-destructive" />,
  unknown: <HelpCircle className="size-4 text-muted-foreground" />,
} as const;

export function QaQcTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getQaQcStatus);
  const batchFn = useServerFn(batchReviewPlans);
  const importFn = useServerFn(importCommentsFromDocuments);
  const fixesFn = useServerFn(addPlanReviewFixesToChecklist);
  const signFn = useServerFn(createQaSignoff);
  const delSignFn = useServerFn(deleteQaSignoff);

  const q = useQuery({
    queryKey: ["qaqc", projectId],
    queryFn: () => statusFn({ data: { project_id: projectId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["qaqc", projectId] });
    qc.invalidateQueries({ queryKey: ["docs", projectId] });
    qc.invalidateQueries({ queryKey: ["comment-responses", projectId] });
    qc.invalidateQueries({ queryKey: ["checklist", projectId] });
  };

  const runReview = useMutation({
    mutationFn: () => batchFn({ data: { project_id: projectId, force: false } }),
    onSuccess: () => {
      toast.success("Plan review complete");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Plan review failed"),
  });

  const runImport = useMutation({
    mutationFn: () => importFn({ data: { project_id: projectId } }),
    onSuccess: () => {
      toast.success("Reviewer comments imported");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Comment import failed"),
  });

  const addFixes = useMutation({
    mutationFn: () => fixesFn({ data: { project_id: projectId } }),
    onSuccess: () => {
      toast.success("Fix list added to checklist");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add fixes"),
  });

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [scope, setScope] = useState<"pre_submittal" | "resubmittal">("pre_submittal");

  const sign = useMutation({
    mutationFn: () =>
      signFn({
        data: {
          project_id: projectId,
          scope,
          signed_by_name: name,
          signed_by_role: role || undefined,
          notes: notes || undefined,
          gate_passed: !!q.data?.gate_passed,
          overridden: !q.data?.gate_passed,
          override_reason: overrideReason || undefined,
          snapshot: {
            plans_total: q.data?.counts.plans_total ?? 0,
            plans_reviewed: q.data?.counts.plans_reviewed ?? 0,
            findings_by_severity: q.data?.counts.findings_by_severity ?? {},
            comments_open: q.data?.counts.comments_open ?? 0,
            blockers: q.data?.blockers ?? [],
            warnings: q.data?.warnings ?? [],
          },
        },
      }),
    onSuccess: () => {
      toast.success("QA/QC sign-off recorded");
      setNotes("");
      setOverrideReason("");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sign-off failed"),
  });

  const removeSign = useMutation({
    mutationFn: (id: string) => delSignFn({ data: { id } }),
    onSuccess: () => refresh(),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Running QA/QC gate…</p>;
  if (q.error) return <p className="text-sm text-destructive">{q.error instanceof Error ? q.error.message : "Failed to load QA/QC"}</p>;
  const d = q.data;
  if (!d) return null;

  return (
    <div className="space-y-6">
      {/* Gate header */}
      <div
        className={`rounded-xl border p-4 ${
          d.gate_passed ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Pre-submittal QA/QC gate</p>
            <p className={`mt-1 text-lg font-semibold ${d.gate_passed ? "text-emerald-500" : "text-destructive"}`}>
              {d.gate_passed ? "Ready for sign-off" : `${d.blockers.length} blocking item${d.blockers.length === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {d.counts.plans_reviewed}/{d.counts.plans_total} plans reviewed · {d.counts.findings_total} findings (
              {d.counts.findings_by_severity.high} high) · {d.counts.comments_open}/{d.counts.comments_total} comments open
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runReview.mutate()}
              disabled={runReview.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50"
            >
              <Sparkles className="size-3.5" /> {runReview.isPending ? "Reviewing…" : "Run plan review"}
            </button>
            <button
              onClick={() => runImport.mutate()}
              disabled={runImport.isPending}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {runImport.isPending ? "Importing…" : "Import comments"}
            </button>
            <button
              onClick={() => addFixes.mutate()}
              disabled={addFixes.isPending}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {addFixes.isPending ? "Adding…" : "Add fixes to checklist"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Findings are AI Suggested or Needs Human Review unless separately verified — they are not confirmed code
          violations. Confirm against the adopted code and the jurisdiction's requirements before submitting.
        </p>
      </div>

      {/* Checks */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Checks</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {d.checks.map((c) => (
            <div key={c.key} className="rounded-xl border border-border bg-card/40 p-3">
              <div className="flex items-start gap-2">
                {statusIcon[c.status]}
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {c.label}
                    {c.blocking && c.status === "fail" && (
                      <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-mono uppercase text-destructive">
                        blocking
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Findings */}
      {d.findings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Plan review findings ({d.findings.length})
          </h3>
          <div className="space-y-2">
            {d.findings.slice(0, 20).map((f, i) => (
              <div key={`${f.document_id}-${i}`} className="rounded-xl border border-border bg-card/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                      f.severity === "high"
                        ? "bg-destructive/15 text-destructive"
                        : f.severity === "medium"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {f.severity}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{f.category}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    · {f.verification.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium">{f.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {f.document_name}
                  {f.code_reference ? ` · ${f.code_reference}` : ""}
                </p>
                {f.recommendation && <p className="mt-1 text-xs text-brand">Fix: {f.recommendation}</p>}
              </div>
            ))}
            {d.findings.length > 20 && (
              <p className="text-xs text-muted-foreground">+{d.findings.length - 20} more in the Docs tab report.</p>
            )}
          </div>
        </section>
      )}

      {/* Open corrections */}
      {d.open_comments.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Open corrections ({d.open_comments.length})
          </h3>
          <div className="space-y-2">
            {d.open_comments.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card/40 p-3">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <span className="text-foreground">#{c.comment_no}</span>
                  <span>{c.discipline}</span>
                  <span>· {(c.status ?? "open").replace(/_/g, " ")}</span>
                  <span>· {c.has_response ? "response drafted" : "no response yet"}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{c.comment_text}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Draft and close these in the Response Matrix tab.</p>
        </section>
      )}

      {/* Sign-off */}
      <section className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand" />
          <h3 className="text-sm font-semibold">Sign-off before submission</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Signed by</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Expeditor / PM / Architect of Record" maxLength={200} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Scope</Label>
          <div className="flex gap-2">
            {(["pre_submittal", "resubmittal"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider ${
                  scope === s ? "border-brand text-brand" : "border-border text-muted-foreground"
                }`}
              >
                {s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>QA/QC notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} placeholder="What was checked, what was verified with the jurisdiction, remaining assumptions." />
        </div>
        {!d.gate_passed && (
          <div className="space-y-1.5">
            <Label className="text-destructive">Override reason (required — gate has blocking items)</Label>
            <Textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={`Blocking: ${d.blockers.join("; ")}`}
            />
          </div>
        )}
        <Button
          disabled={sign.isPending || !name.trim() || (!d.gate_passed && !overrideReason.trim())}
          onClick={() => sign.mutate()}
        >
          {sign.isPending ? "Recording…" : d.gate_passed ? "Sign off as submittal-ready" : "Record override sign-off"}
        </Button>
        {d.latest_signoff_stale && (
          <p className="text-[11px] text-amber-600">
            Plans changed since the last sign-off — re-run the gate and sign off again before submitting.
          </p>
        )}

        {d.signoffs.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Sign-off history</p>
            {d.signoffs.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    {s.signed_by_name}
                    {s.signed_by_role ? ` — ${s.signed_by_role}` : ""}{" "}
                    <span
                      className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                        s.overridden ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"
                      }`}
                    >
                      {s.overridden ? "override" : "passed"}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {String(s.scope).replace(/_/g, " ")} · {new Date(s.created_at).toLocaleString()}
                  </p>
                  {s.notes && <p className="mt-1 text-xs text-muted-foreground">{s.notes}</p>}
                  {s.override_reason && <p className="mt-1 text-xs text-amber-600">Override: {s.override_reason}</p>}
                </div>
                <button
                  onClick={() => removeSign.mutate(s.id)}
                  aria-label="Delete sign-off"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
