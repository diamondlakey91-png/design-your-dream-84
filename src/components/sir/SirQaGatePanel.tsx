import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { compileSirForReview } from "@/lib/sir.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

type QaCheck = { id: string; label: string; status: "pass" | "fail"; severity: "blocker" | "warning" | "info"; detail: string };

const STAGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft — not yet compiled", cls: "border-slate-500/30 bg-white/5 text-slate-300" },
  qa_blocked: { label: "QA/QC blocked", cls: "border-red-500/30 bg-red-500/10 text-red-300" },
  professional_review_pending: { label: "Submitted for internal professional review", cls: "border-blue-500/30 bg-blue-500/10 text-blue-200" },
  professionally_reviewed: { label: "Professionally reviewed", cls: "border-green-500/30 bg-green-500/10 text-green-300" },
};

/**
 * Lead SIR Agent QA/QC gate: what the agent checked on the compiled draft
 * before handing it to internal professional review.
 */
export function SirQaGatePanel({ row }: { row: any }) {
  const qc = useQueryClient();
  const compileFn = useServerFn(compileSirForReview);

  const qa = row.qa_report as { status?: string; blockers?: number; warnings?: number; checks?: QaCheck[]; checked_at?: string } | null;
  const compiled = row.compiled_report as { totals?: Record<string, any> } | null;
  const stage = STAGE[row.review_stage ?? "draft"] ?? STAGE['draft']!;

  const recompile = useMutation({
    mutationFn: () => compileFn({ data: { id: row.id } }),
    onSuccess: (res: any) => {
      toast.success(res.qa?.status === "blocked" ? "QA/QC gate is blocking this draft" : "Draft compiled and submitted for professional review");
      qc.invalidateQueries({ queryKey: ["sir-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Compile failed"),
  });

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="size-4 text-blue-300" /> Lead SIR Agent — compile &amp; QA/QC gate
          </h4>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${stage.cls}`}>{stage.label}</span>
        </div>
        <button
          onClick={() => recompile.mutate()}
          disabled={recompile.isPending}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.06] disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${recompile.isPending ? "animate-spin" : ""}`} /> Re-run compile &amp; QA/QC
        </button>
      </div>

      {compiled?.totals && (
        <p className="mt-2 text-xs text-slate-400">
          {compiled.totals['modules']} modules · {compiled.totals['findings']} findings · {compiled.totals['verified']} verified ·{" "}
          {compiled.totals['ai_assisted']} AI-identified · {compiled.totals['needs_confirmation']} need agency confirmation ·{" "}
          {compiled.totals['cited_findings']} cited
        </p>
      )}

      {!qa ? (
        <p className="mt-3 text-sm text-slate-400">
          This draft has not been through the QA/QC gate yet. Run compile &amp; QA/QC to check it and queue it for internal professional review.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-slate-400">
            {qa.blockers ?? 0} blocker(s) · {qa.warnings ?? 0} warning(s)
            {qa.checked_at ? ` · checked ${new Date(qa.checked_at).toLocaleString()}` : ""}
          </p>
          <ul className="mt-3 grid gap-2">
            {(qa.checks ?? []).map((c) => {
              const failed = c.status === "fail";
              const blocker = failed && c.severity === "blocker";
              return (
                <li
                  key={c.id}
                  className={`rounded-lg border p-3 text-sm ${
                    blocker ? "border-red-500/25 bg-red-500/[0.05]" : failed ? "border-blue-500/25 bg-blue-500/[0.04]" : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {failed ? (
                      blocker ? <X className="size-4 shrink-0 text-red-300" /> : <AlertTriangle className="size-4 shrink-0 text-blue-300" />
                    ) : (
                      <Check className="size-4 shrink-0 text-green-300" />
                    )}
                    <span className="font-medium text-white">{c.label}</span>
                    {failed && (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${blocker ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>
                        {blocker ? "Blocker" : "Warning"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{c.detail}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Clearing the QA/QC gate means the compiled draft is complete and internally consistent enough for internal professional review. It is
            not a jurisdiction determination, a code-compliance certification or an engineering approval.
          </p>
        </>
      )}
    </div>
  );
}
