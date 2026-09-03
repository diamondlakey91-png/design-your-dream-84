import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ExternalLink,
  FileDown,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import {
  buildSirReport,
  buildSirRiskMatrix,
  buildSirSnapshot,
  effectiveFindingText,
  rollupSirReview,
  SIR_PROFESSIONAL_REVIEW_NOTE,
  SIR_REPORT_DISCLAIMER,
  type ReviewDecision,
  type SirFinding,
  type SirFindingReview,
  type SirFindingReviews,
} from "@/lib/sirReport";
import { finalizeSirReview, generateSirReportPdf, reviewSirFinding } from "@/lib/sir.functions";
import { SirQaGatePanel } from "@/components/sir/SirQaGatePanel";

/* eslint-disable @typescript-eslint/no-explicit-any */

function VerificationBadge({ level }: { level: string | null | undefined }) {
  const map: Record<string, { label: string; cls: string }> = {
    verified: { label: "Verified requirement", cls: "border-green-500/30 bg-green-500/10 text-green-300" },
    ai_assisted: { label: "AI-identified", cls: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
    needs_confirmation: { label: "Agency confirmation required", cls: "border-slate-500/30 bg-white/5 text-slate-300" },
  };
  const v = map[level ?? "needs_confirmation"] ?? map['needs_confirmation']!;
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${v.cls}`}>{v.label}</span>;
}

function DecisionBadge({ decision }: { decision: ReviewDecision }) {
  const map: Record<ReviewDecision, string> = {
    approved: "border-green-500/30 bg-green-500/10 text-green-300",
    modified: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    rejected: "border-red-500/30 bg-red-500/10 text-red-300",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[decision]}`}>Reviewer {decision}</span>;
}

function FindingRow({
  finding,
  review,
  onDecide,
  pending,
}: {
  finding: SirFinding;
  review?: SirFindingReview;
  onDecide: (v: { decision: ReviewDecision; note?: string; revised_text?: string }) => void;
  pending: boolean;
}) {
  const [mode, setMode] = useState<null | "modify" | "reject">(null);
  const [revised, setRevised] = useState(review?.revised_text ?? finding.detail);
  const [note, setNote] = useState(review?.note ?? "");

  const detail = effectiveFindingText(finding, review);

  return (
    <li
      className={`rounded-lg border p-3 text-sm ${
        review?.decision === "rejected" ? "border-red-500/20 bg-red-500/[0.04]" : "border-white/5 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-medium ${review?.decision === "rejected" ? "text-slate-400 line-through" : "text-white"}`}>{finding.title}</span>
        {finding.meta.map((m, i) => (
          <span key={i} className="text-xs text-slate-500">{m}</span>
        ))}
        <VerificationBadge level={finding.verification} />
        {review && <DecisionBadge decision={review.decision} />}
      </div>
      {detail && <p className="mt-1 whitespace-pre-line text-xs text-slate-400">{detail}</p>}
      {review?.note && <p className="mt-1 text-xs text-slate-500">Reviewer note: {review.note}</p>}
      {finding.source && (
        <a href={finding.source} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-300 hover:underline">
          <ExternalLink className="size-3" /> Source
        </a>
      )}

      {mode === "modify" && (
        <div className="mt-2 grid gap-2">
          <textarea
            value={revised}
            onChange={(e) => setRevised(e.target.value)}
            rows={3}
            aria-label="Revised finding wording"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-white focus:border-blue-500/50 focus:outline-none"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reviewer note (optional)"
            aria-label="Reviewer note"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
      )}
      {mode === "reject" && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Written reason for rejecting this finding (required)"
          aria-label="Rejection reason"
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-white placeholder:text-slate-500 focus:border-red-500/50 focus:outline-none"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {mode === null ? (
          <>
            <button
              onClick={() => onDecide({ decision: "approved" })}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs text-green-300 hover:bg-green-500/20 disabled:opacity-60"
            >
              <Check className="size-3" /> Approve
            </button>
            <button
              onClick={() => setMode("modify")}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs text-blue-200 hover:bg-blue-500/20"
            >
              <Pencil className="size-3" /> Modify
            </button>
            <button
              onClick={() => setMode("reject")}
              className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
            >
              <X className="size-3" /> Reject
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                if (mode === "modify" && !revised.trim()) return toast.error("Enter the revised wording.");
                if (mode === "reject" && !note.trim()) return toast.error("A rejection needs a written reason.");
                onDecide(
                  mode === "modify"
                    ? { decision: "modified", revised_text: revised.trim(), note: note.trim() }
                    : { decision: "rejected", note: note.trim() },
                );
                setMode(null);
              }}
              disabled={pending}
              className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-xs text-blue-200 hover:bg-blue-500/20 disabled:opacity-60"
            >
              Save decision
            </button>
            <button onClick={() => setMode(null)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300">
              Cancel
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function SirReportView({ row }: { row: any }) {
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewSirFinding);
  const finalizeFn = useServerFn(finalizeSirReview);
  const pdfFn = useServerFn(generateSirReportPdf);

  const [reviewerName, setReviewerName] = useState(row.reviewer_name ?? "");
  const [credential, setCredential] = useState(row.reviewer_credential ?? "");
  const [summary, setSummary] = useState(row.reviewer_summary ?? "");

  const research = row.research;
  const resolved = row.resolved_jurisdiction;
  const sections = useMemo(() => buildSirReport(research), [research]);
  const snapshot = useMemo(() => buildSirSnapshot(research), [research]);
  const matrix = useMemo(() => buildSirRiskMatrix(research), [research]);
  const reviews = (row.finding_reviews ?? {}) as SirFindingReviews;
  const rollup = useMemo(() => rollupSirReview(sections, reviews), [sections, reviews]);
  const professionallyReviewed = row.review_status === "reviewed" && rollup.allDecided;

  const decide = useMutation({
    mutationFn: (v: { finding_id: string; decision: ReviewDecision; note?: string; revised_text?: string }) =>
      reviewFn({ data: { id: row.id, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sir-requests"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record the decision"),
  });

  const finalize = useMutation({
    mutationFn: () => finalizeFn({ data: { id: row.id, reviewer_name: reviewerName, reviewer_credential: credential, reviewer_summary: summary } }),
    onSuccess: () => {
      toast.success("Report signed off as professionally reviewed");
      qc.invalidateQueries({ queryKey: ["sir-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sign-off failed"),
  });

  const exportPdf = useMutation({
    mutationFn: () => pdfFn({ data: { id: row.id } }),
    onSuccess: (res) => {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "PDF export failed"),
  });

  if (row.research_status === "failed") {
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-200">
        <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Research failed</div>
        <p className="mt-1 text-red-200/80">{row.research_error ?? "Unknown error"}</p>
      </div>
    );
  }
  if (row.research_status === "running") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-200">
        <Loader2 className="size-4 animate-spin" /> Researching jurisdiction, zoning, permits, utilities and timeline…
      </div>
    );
  }
  if (!research) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
        No research on file yet. Run research to confirm the AHJ and build the report.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Report header + review state */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-white">Site Investigation Report</h4>
            {professionallyReviewed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-green-300">
                <BadgeCheck className="size-3" /> PROFESSIONALLY REVIEWED
              </span>
            ) : (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-200">
                AI-assisted research · review {rollup.allDecided ? "ready for sign-off" : "in progress"}
              </span>
            )}
          </div>
          <button
            onClick={() => exportPdf.mutate()}
            disabled={exportPdf.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-200 hover:bg-blue-500/20 disabled:opacity-60"
          >
            <FileDown className="size-4" /> {exportPdf.isPending ? "Building PDF…" : "Report PDF"}
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-300">{research.scope_summary}</p>
        {resolved && (
          <p className="mt-2 text-xs text-slate-400">
            {resolved.formatted_address ?? "Address not resolved"} · {resolved.city ?? "—"}, {resolved.county ?? "—"} County, {resolved.state ?? "—"}
            {resolved.note ? ` — ${resolved.note}` : ""}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Findings: {rollup.total} · approved {rollup.approved} · modified {rollup.modified} · rejected {rollup.rejected} · awaiting decision {rollup.undecided}
        </p>
        {professionallyReviewed && (
          <p className="mt-1 text-xs text-green-300/80">
            Reviewed by {row.reviewer_name}
            {row.reviewer_credential ? ` · ${row.reviewer_credential}` : ""}
            {row.reviewed_at ? ` · ${new Date(row.reviewed_at).toLocaleString()}` : ""}
          </p>
        )}
      </div>

      {/* Lead SIR Agent compile + QA/QC gate */}
      <SirQaGatePanel row={row} />

      {/* Executive snapshot */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h4 className="text-sm font-semibold text-white">Executive feasibility snapshot</h4>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.map((s) => (
            <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</dt>
              <dd className="mt-1 text-sm text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Four coverage sections, dynamic modules */}
      {sections.map((section) => (
        <div key={section.key} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">{section.no}. {section.title}</h4>
          <p className="mt-1 text-xs text-slate-500">{section.intro}</p>
          <div className="mt-3 grid gap-4">
            {section.modules.map((m) => (
              <div key={m.key}>
                <div className="flex flex-wrap items-center gap-2">
                  <h5 className="text-sm font-medium text-slate-200">{m.label}</h5>
                  {m.verification && <VerificationBadge level={m.verification} />}
                </div>
                {m.summary && <p className="mt-1 text-xs text-slate-400">{m.summary}</p>}
                <ul className="mt-2 grid gap-2">
                  {m.findings.map((f) => (
                    <FindingRow
                      key={f.id}
                      finding={f}
                      review={reviews[f.id]}
                      pending={decide.isPending}
                      onDecide={(v) => decide.mutate({ finding_id: f.id, ...v })}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Risk matrix */}
      {matrix.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Risk matrix</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {matrix.map((g) => (
              <div key={g.level} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${g.level === "high" ? "text-red-300" : g.level === "medium" ? "text-blue-200" : "text-slate-300"}`}>
                    {g.level} severity
                  </span>
                  <span className="text-xs text-slate-500">{g.items.length}</span>
                </div>
                <ul className="mt-2 grid gap-2 text-xs text-slate-400">
                  {g.items.map((it) => (
                    <li key={it.id} className={reviews[it.id]?.decision === "rejected" ? "line-through opacity-60" : ""}>
                      <span className="text-white">{it.title}</span>{it.why ? ` — ${it.why}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {((row.research_sources ?? []) as Array<{ url: string; title: string }>).length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Official sources</h4>
          <ul className="mt-2 grid gap-1 text-xs">
            {((row.research_sources ?? []) as Array<{ url: string; title: string }>).map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">{s.title || s.url}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Professional review sign-off */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h4 className="text-sm font-semibold text-white">Professional review sign-off</h4>
        <p className="mt-1 text-xs text-slate-400">
          Every finding must carry an approve, modify or reject decision before the report can be badged PROFESSIONALLY REVIEWED.
          {rollup.undecided > 0 ? ` ${rollup.undecided} finding(s) still awaiting a decision.` : ""}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Reviewer name"
            aria-label="Reviewer name"
            className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none"
          />
          <input
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            placeholder="Credential / title (optional)"
            aria-label="Reviewer credential"
            className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          placeholder="Reviewer summary for the client (optional)"
          aria-label="Reviewer summary"
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none"
        />
        <button
          onClick={() => {
            if (!reviewerName.trim()) return toast.error("Enter the reviewer name.");
            finalize.mutate();
          }}
          disabled={finalize.isPending || !rollup.allDecided}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-300 hover:bg-green-500/20 disabled:opacity-50"
        >
          <BadgeCheck className="size-4" /> {professionallyReviewed ? "Re-sign report" : "Sign off as professionally reviewed"}
        </button>
        <p className="mt-2 text-xs text-slate-500">{SIR_PROFESSIONAL_REVIEW_NOTE}</p>
      </div>

      <p className="text-xs text-slate-500">{SIR_REPORT_DISCLAIMER}</p>
    </div>
  );
}
