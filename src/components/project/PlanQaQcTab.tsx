import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, Trash2, ListPlus, ShieldAlert } from "lucide-react";
import {
  getQaQcReview,
  runQaQcReview,
  deleteQaQcReview,
  addQaQcGapsToChecklist,
  generateQaQcReportPdf,
} from "@/lib/qaqcReview.functions";
import { getPlanReviewOverview, listReviewEvaluations, setQaQcFindingStatus } from "@/lib/planReviewWorkspace.functions";
import { PERMIVIO_PROFESSIONAL_DISCLAIMER } from "@/lib/qaqcConfig";
import { reviewSummary, type WorkspaceFinding } from "@/lib/planReviewUx";
import { disciplineLabel } from "@/lib/qaqcConfig";
import { useViewMode } from "@/hooks/useViewMode";
import { QaQcInventoryTable, type QaQcSheetRow } from "@/components/project/QaQcInventoryTable";
import { ProfessionalReviewButton } from "@/components/project/ProfessionalReviewButton";
import { PlanReviewEntry, setLabel, type Overview } from "@/components/project/PlanReviewEntry";
import { PlanReviewWorkspace } from "@/components/project/PlanReviewWorkspace";
import { ReviewEvaluationPanel } from "@/components/project/PlanReviewEvaluation";
import { AgencyContactList } from "@/components/research/AgencyContactList";
import type { AgencyContact } from "@/lib/agencyContacts";

// Project → Plan Review. The CURRENT plan set is the review target; every review stays
// tied to the exact plan set it reviewed. Viewing is free; running is an explicit paid action.
export function PlanQaQcTab({ projectId }: { projectId: string; userId: string }) {
  const qc = useQueryClient();
  const { mode } = useViewMode();
  const professional = mode === "professional";
  const overviewFn = useServerFn(getPlanReviewOverview);
  const getFn = useServerFn(getQaQcReview);
  const runFn = useServerFn(runQaQcReview);
  const statusFn = useServerFn(setQaQcFindingStatus);
  const delFn = useServerFn(deleteQaQcReview);
  const gapsFn = useServerFn(addQaQcGapsToChecklist);
  const pdfFn = useServerFn(generateQaQcReportPdf);
  const evalsFn = useServerFn(listReviewEvaluations);
  const [activeReview, setActiveReview] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ["plan-review-overview", projectId], queryFn: () => overviewFn({ data: { project_id: projectId } }) });
  const o = overview.data as Overview | undefined;
  const current = o?.planSets.find((s) => s.is_current) ?? null;
  // Default: latest completed review of the CURRENT set only — never an older version's.
  const defaultId = current ? o?.reviews.find((r) => r.plan_set_id === current.id && r.status === "complete")?.id ?? null
    : o?.reviews.find((r) => r.status === "complete")?.id ?? null;
  const currentId = activeReview ?? defaultId;

  const review = useQuery({ queryKey: ["qaqc-review", currentId], queryFn: () => getFn({ data: { review_id: currentId as string } }), enabled: !!currentId });
  const evals = useQuery({ queryKey: ["qaqc-evals", currentId], queryFn: () => evalsFn({ data: { review_id: currentId as string } }), enabled: !!currentId && !!o?.staff });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["plan-review-overview", projectId] });
    qc.invalidateQueries({ queryKey: ["project-foundation", projectId] });
  };

  const run = useMutation({
    mutationFn: (v: { planSetId: string; requestId: string }) =>
      runFn({ data: { project_id: projectId, plan_set_id: v.planSetId, request_id: v.requestId } }),
    onMutate: () => { setTimeout(refresh, 1500); },
    onSuccess: (res) => { toast.success(`Plan Review complete — ${res.findings} findings`); setActiveReview(res.review_id); refresh(); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Plan Review failed"); refresh(); },
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => statusFn({ data: { finding_id: v.id, status: v.status as never } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qaqc-review", currentId] }); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { review_id: id } }),
    onSuccess: () => { setActiveReview(null); refresh(); },
  });

  const addGaps = useMutation({
    mutationFn: () => gapsFn({ data: { review_id: currentId as string } }),
    onSuccess: (r) => {
      toast.success(r.added ? `${r.added} item(s) added to the roadmap` : "No new roadmap items");
      qc.invalidateQueries({ queryKey: ["checklist", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update roadmap"),
  });

  const exportPdf = useMutation({
    mutationFn: () => pdfFn({ data: { review_id: currentId as string } }),
    onSuccess: (res) => {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "PDF export failed"),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = review.data as any;
  const findings = (d?.findings ?? []) as WorkspaceFinding[];
  const sheets = (d?.sheets ?? []) as QaQcSheetRow[];
  const summary = reviewSummary(findings);
  const reviewedSet = o?.planSets.find((s) => s.id === d?.review?.plan_set_id) ?? null;
  const missingSheets = sheets.filter((s) => s.index_state === "missing_from_upload");
  const gaps = (d?.review?.inventory_gaps ?? {}) as Record<string, string[] | undefined>;
  const gapBlocks = [
    { label: "On the drawing index but not uploaded", items: gaps['index_sheets_not_uploaded'] ?? [] },
    { label: "Uploaded but not listed on the index", items: gaps['uploaded_sheets_not_indexed'] ?? [] },
    { label: "Duplicate sheet numbers", items: gaps['duplicate_sheet_numbers'] ?? [] },
    { label: "Gaps in sheet numbering", items: gaps['missing_number_sequences'] ?? [] },
    { label: "Disciplines with no sheets in this set", items: gaps['missing_disciplines'] ?? [] },
    { label: "Conflicting dates across the set", items: gaps['conflicting_dates'] ?? [] },
  ];
  const evaluations = (evals.data?.evaluations ?? []) as Array<{ id: string; kind: string; finding_id: string | null; accuracy: string | null; usefulness: string | null; notes: string | null; sheet_number: string | null }>;
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50";

  return (
    <div className="space-y-6">
      {overview.isLoading && <p className="text-sm text-muted-foreground">Loading plan review…</p>}
      {o && (
        <PlanReviewEntry o={o} activeReviewId={currentId} onSelectReview={setActiveReview}
          onRun={(planSetId, requestId) => run.mutate({ planSetId, requestId })} running={run.isPending} />
      )}
      {run.isPending && <p className="text-sm text-muted-foreground">Plan Review running — this can take several minutes for a large set. You can keep working.</p>}

      {review.isLoading && currentId && <p className="text-sm text-muted-foreground">Loading review…</p>}

      {d?.review && (
        <>
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Findings for {reviewedSet ? setLabel(reviewedSet) : d.review.revision_label} · reviewed {new Date(d.review.completed_at ?? d.review.created_at).toLocaleDateString()}
                  {reviewedSet && !reviewedSet.is_current ? " · previous plan set" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {[
                    ["Total", summary.total], ["High priority", summary.highPriority], ["Open", summary.open],
                    ["Resolved", summary.resolved], ["Verification required", summary.needsVerification],
                  ].map(([l, v]) => (
                    <span key={l as string} className="rounded-lg border border-border px-2.5 py-1.5"><span className="font-semibold">{v}</span> <span className="text-muted-foreground">{l}</span></span>
                  ))}
                </div>
                {Object.keys(summary.byDiscipline).length > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {Object.entries(summary.byDiscipline).map(([k, v]) => `${disciplineLabel(k)} ${v}`).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => addGaps.mutate()} disabled={addGaps.isPending} className={btn}><ListPlus className="size-3.5" /> Add gaps to roadmap</button>
                <button onClick={() => exportPdf.mutate()} disabled={exportPdf.isPending} className={btn}><FileDown className="size-3.5" /> {exportPdf.isPending ? "Building…" : "Report PDF"}</button>
                <button onClick={() => remove.mutate(d.review.id)} className={`${btn} text-muted-foreground hover:border-destructive hover:text-destructive`}><Trash2 className="size-3.5" /> Delete</button>
              </div>
            </div>
          </div>

          <PlanReviewWorkspace
            reviewId={d.review.id}
            findings={findings}
            sheets={sheets as never}
            documentIds={(d.review.document_ids ?? []) as string[]}
            codes={(d.review.codes_researched ?? []) as never}
            jurisdiction={(d.review.jurisdiction_snapshot?.jurisdiction as string | null) ?? null}
            professional={professional}
            staff={!!o?.staff}
            evaluations={evaluations.filter((e) => e.kind === "finding")}
            onStatus={(id, status) => setStatus.mutate({ id, status })}
          />

          {d.review.executive_summary && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Executive summary</p>
              <p className="mt-1.5 text-sm">{d.review.executive_summary}</p>
            </div>
          )}

          {/* Reviewing authorities — real contacts retrieved from agency pages */}
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Reviewing authorities — who to contact</p>
            <AgencyContactList
              contacts={((d.review.project_context ?? {}) as { agency_contacts?: AgencyContact[] }).agency_contacts ?? []}
              className="mt-2"
            />
          </div>

          {professional && (<>
          {/* Codes researched */}
          <div className="rounded-xl border border-border bg-card/60 p-4">

            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Jurisdiction codes used for this review</p>
            {((d.review.codes_researched ?? []) as Array<Record<string, string>>).length === 0 ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                No verified adopted-code records were available. Jurisdiction-specific items in this review are marked “Agency confirmation
                required.”
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-xs">
                {((d.review.codes_researched ?? []) as Array<Record<string, string>>).map((c, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="text-foreground capitalize">{c['discipline']}</span>: {c['code_family']} {c['edition']}
                    {c['effective_date'] ? ` (effective ${c['effective_date']})` : ""} · {String(c['verification'] ?? "").replace(/_/g, " ")}
                    {c['source_url'] && (
                      <a href={c['source_url']} target="_blank" rel="noreferrer" className="ml-2 text-brand hover:underline">
                        source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Inventory */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Drawing set inventory</p>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-wider">
              <span className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground">{sheets.length} sheets detected</span>
              <span
                className={`rounded-lg border px-2.5 py-1.5 ${
                  missingSheets.length ? "border-red-500/40 text-red-400" : "border-border text-muted-foreground"
                }`}
              >
                {missingSheets.length} missing sheet{missingSheets.length === 1 ? "" : "s"}
              </span>
            </div>
            {gapBlocks.some((b) => b.items.length > 0) && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
                <p className="text-[11px] font-mono uppercase tracking-wider text-sky-400">Set completeness gaps (AI-identified — verify against your issued set)</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {gapBlocks
                    .filter((b) => b.items.length > 0)
                    .map((b) => (
                      <li key={b.label}>
                        <span className="text-foreground">{b.label}:</span>{" "}
                        <span className="text-muted-foreground">{b.items.join(", ")}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <QaQcInventoryTable sheets={sheets} />
          </div>

          </>)}

          {/* Missing docs / submission issues */}
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { label: "Missing documents", items: ((d.review.missing_documents ?? []) as Array<{ name: string; reason?: string }>).map((m) => `${m.name}${m.reason ? ` — ${m.reason}` : ""}`) },
              { label: "Likely submission issues", items: (d.review.submission_issues ?? []) as string[] },
              { label: "Needs professional confirmation", items: (d.review.needs_professional_confirmation ?? []) as string[] },
            ].map((block) => (
              <div key={block.label} className="rounded-xl border border-border bg-card/60 p-4">
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{block.label}</p>
                {block.items.length === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">None identified.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {block.items.map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {((d.review.recommended_actions ?? []) as string[]).length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Recommended actions before submission</p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {((d.review.recommended_actions ?? []) as string[]).map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card/40 p-4">
            <p className="flex max-w-2xl items-start gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-sky-400" />
              Plan Review assists with pre-submittal QA/QC and identifies potential issues. It does not guarantee code compliance or permit approval and does not replace licensed professional or AHJ review. {PERMIVIO_PROFESSIONAL_DISCLAIMER}
            </p>
            <ProfessionalReviewButton
              projectId={projectId}
              targetType="qaqc_review"
              targetId={d.review.id}
              existing={d.professional_review}
              onDone={() => qc.invalidateQueries({ queryKey: ["qaqc-review", currentId] })}
            />
          </div>
          {o?.staff && (
            <ReviewEvaluationPanel reviewId={d.review.id} missed={evaluations.filter((e) => e.kind === "missed_issue")} />
          )}
        </>
      )}

      {d?.review?.status === "error" && <p className="text-sm text-destructive">{d.review.error}</p>}
    </div>
  );
}
