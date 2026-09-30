// Client-safe, deterministic project lifecycle rules (Phase 2A).
// No AI decides workflow state — phase, progress and Next Actions come from data.

export type ProjectTabKey =
  | "overview" | "intelligence" | "property" | "scope" | "site" | "checklist" | "docs"
  | "planqaqc" | "qaqc" | "responses" | "deadlines" | "inspections" | "timeline";

export type FoundationState = {
  hasAddress: boolean;
  hasJurisdiction: boolean;
  jurisdictionStatus: "none" | "unconfirmed" | "user_confirmed" | "pending_review" | "human_verified";
  hasScope: boolean;
  hasRoadmap: boolean;
  permitsRequired: number;
  permitsSubmitted: number; // submitted / under review
  permitsApproved: number; // approved / issued
  planDocs: number;
  planDocsReviewed: number;
  openPlanFindings: number;
  openCorrections: number;
  inspectionsTotal: number;
  inspectionsPassed: number;
  inspectionsFailed: number;
  inspectionsUpcoming: number;
  // Phase 2B roadmap signals (optional so older callers stay valid)
  roadmapBlocked?: { name: string; waitingOn: string[] }[];
  roadmapNeedsVerification?: number;
  roadmapReadyToSubmit?: string[];
  roadmapCorrectionsRequired?: string[];
  // Phase 2C plan-review signals, scoped to the CURRENT plan set.
  currentPlanSet?: { label: string; reviewed: boolean; previousReviewedLabel: string | null } | null;
  planFindingsHighOpen?: number;
  planFindingsNeedsReview?: number;
};

export type NextAction = {
  key: string;
  title: string;
  why: string;
  tab: ProjectTabKey;
  tone: "urgent" | "attention";
};

export const PHASES = [
  { key: "intake", label: "Intake" },
  { key: "jurisdiction", label: "Property & jurisdiction" },
  { key: "roadmap", label: "Permit roadmap" },
  { key: "documents", label: "Documents & plans" },
  { key: "plan_review", label: "Plan review" },
  { key: "corrections", label: "Corrections" },
  { key: "permits", label: "Permits" },
  { key: "inspections", label: "Inspections" },
  { key: "closeout", label: "Closeout" },
] as const;
export type PhaseKey = (typeof PHASES)[number]["key"];

const jurisdictionSettled = (s: FoundationState) =>
  s.jurisdictionStatus === "user_confirmed" || s.jurisdictionStatus === "human_verified";

export function derivePhase(s: FoundationState): PhaseKey {
  if (!s.hasAddress) return "intake";
  if (!s.hasJurisdiction || !jurisdictionSettled(s)) return "jurisdiction";
  if (!s.hasRoadmap) return "roadmap";
  if (s.planDocs === 0) return "documents";
  if (s.planDocsReviewed < s.planDocs) return "plan_review";
  if (s.openCorrections > 0) return "corrections";
  if (s.permitsRequired === 0 || s.permitsApproved < s.permitsRequired) return "permits";
  if (s.inspectionsTotal === 0 || s.inspectionsPassed < s.inspectionsTotal) return "inspections";
  return "closeout";
}

export function permitProgress(s: FoundationState): { done: number; total: number; pct: number } {
  const total = s.permitsRequired;
  const done = Math.min(s.permitsApproved, total);
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function nextActions(s: FoundationState): NextAction[] {
  const out: NextAction[] = [];
  if (!s.hasAddress)
    out.push({ key: "add_address", title: "Add the property address", why: "Permivio needs the address to identify the controlling jurisdiction.", tab: "property", tone: "attention" });
  else if (!s.hasJurisdiction || s.jurisdictionStatus === "none" || s.jurisdictionStatus === "unconfirmed")
    out.push({ key: "verify_jurisdiction", title: "Verify the jurisdiction", why: "No confirmed authority having jurisdiction yet — requirements depend on it.", tab: "property", tone: "attention" });
  if (!s.hasScope)
    out.push({ key: "describe_scope", title: "Describe the scope of work", why: "The permit roadmap is built from property, scope and jurisdiction.", tab: "scope", tone: "attention" });
  if (!s.hasRoadmap && s.hasJurisdiction)
    out.push({ key: "build_roadmap", title: "Build the permit roadmap", why: "No roadmap exists for this project yet.", tab: "scope", tone: "attention" });
  if ((s.roadmapNeedsVerification ?? 0) > 0)
    out.push({ key: "verify_requirements", title: "Verify requirements", why: `${s.roadmapNeedsVerification} required roadmap item(s) are not yet verified against an official source.`, tab: "checklist", tone: "attention" });
  for (const b of (s.roadmapBlocked ?? []).slice(0, 2))
    out.push({ key: `blocked_${b.name}`, title: `Resolve prerequisite for ${b.name}`, why: b.waitingOn.length ? `Blocked by: ${b.waitingOn.join(", ")}` : "Marked blocked.", tab: "checklist", tone: "attention" });
  if ((s.roadmapReadyToSubmit ?? []).length > 0)
    out.push({ key: "prepare_submit", title: "Prepare / submit permit", why: `Ready to submit: ${s.roadmapReadyToSubmit!.join(", ")}`, tab: "checklist", tone: "attention" });
  if ((s.roadmapCorrectionsRequired ?? []).length > 0)
    out.push({ key: "roadmap_corrections", title: "Review corrections", why: `Corrections required: ${s.roadmapCorrectionsRequired!.join(", ")}`, tab: "responses", tone: "urgent" });
  if (s.hasRoadmap && s.planDocs === 0)
    out.push({ key: "upload_plans", title: "Upload plans", why: "The roadmap needs drawings, but none are uploaded.", tab: "docs", tone: "attention" });
  if (s.currentPlanSet) {
    if (!s.currentPlanSet.reviewed)
      out.push({
        key: "run_plan_review", title: "Run Plan Review",
        why: `${s.currentPlanSet.label} has not been reviewed yet.${s.currentPlanSet.previousReviewedLabel ? ` Previous findings belong to ${s.currentPlanSet.previousReviewedLabel}.` : ""}`,
        tab: "planqaqc", tone: "attention",
      });
  } else if (s.planDocs > s.planDocsReviewed)
    out.push({ key: "run_plan_review", title: "Run plan review", why: `${s.planDocs - s.planDocsReviewed} uploaded plan file(s) have never been reviewed.`, tab: "docs", tone: "attention" });
  if (s.openPlanFindings > 0) {
    const high = s.planFindingsHighOpen ?? 0;
    out.push({
      key: "review_findings", title: "Review plan findings",
      why: `${s.openPlanFindings} open finding(s)${high ? `, ${high} high priority` : ""} need a decision. AI findings are potential issues, not confirmed violations.`,
      tab: "planqaqc", tone: high > 0 ? "urgent" : "attention",
    });
  }
  if ((s.planFindingsNeedsReview ?? 0) > 0)
    out.push({ key: "review_flagged_findings", title: "Review flagged findings", why: `${s.planFindingsNeedsReview} finding(s) are marked Needs Review.`, tab: "planqaqc", tone: "attention" });
  if (s.openCorrections > 0)
    out.push({ key: "review_corrections", title: "Review corrections", why: `${s.openCorrections} reviewer comment(s) are still open.`, tab: "responses", tone: "urgent" });
  if (s.inspectionsFailed > 0)
    out.push({ key: "failed_inspection", title: "Resolve failed inspection", why: `${s.inspectionsFailed} inspection(s) failed and need re-inspection.`, tab: "inspections", tone: "urgent" });
  if (s.permitsRequired > 0 && s.permitsApproved >= s.permitsRequired && (s.inspectionsTotal === 0 || s.inspectionsPassed < s.inspectionsTotal))
    out.push({ key: "track_final_inspections", title: "Schedule / track final inspections", why: "Permits are approved but inspections are not complete.", tab: "inspections", tone: "attention" });
  return out;
}

const setLabel = (ps: { title: string; version_number: number | null }) =>
  ps.version_number && !new RegExp(`\\bV${ps.version_number}\\b`, "i").test(ps.title) ? `${ps.title} (V${ps.version_number})` : ps.title;

/**
 * Plan-review signals for Next Actions. Findings count only from the latest
 * completed review of the CURRENT plan set, so an older version's findings never
 * masquerade as the current set's. Accepted / Not applicable / Resolved never prompt.
 */
export function planReviewSignals(
  sets: Array<{ id: string; title: string; version_number: number | null; is_current: boolean | null }>,
  completedReviews: Array<{ id: string; plan_set_id: string | null; created_at: string }>,
  openFindings: Array<{ review_id: string; status: string; severity: string }>,
) {
  const current = sets.find((x) => x.is_current) ?? null;
  const latestFor = (setId: string) =>
    completedReviews.filter((r) => r.plan_set_id === setId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  let scoped = openFindings;
  let cur: FoundationState["currentPlanSet"] = null;
  if (current) {
    const rev = latestFor(current.id);
    const prevSet = !rev ? sets.find((x) => x.id !== current.id && latestFor(x.id)) ?? null : null;
    cur = { label: setLabel(current), reviewed: !!rev, previousReviewedLabel: prevSet ? setLabel(prevSet) : null };
    scoped = rev ? openFindings.filter((f) => f.review_id === rev.id) : [];
  }
  const live = scoped.filter((f) => f.status === "open" || f.status === "needs_review");
  return {
    current: cur,
    open: live.length,
    high: live.filter((f) => f.severity === "critical" || f.severity === "high").length,
    needsReview: live.filter((f) => f.status === "needs_review").length,
  };
}
