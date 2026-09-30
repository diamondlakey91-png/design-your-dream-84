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
  if (s.hasRoadmap && s.planDocs === 0)
    out.push({ key: "upload_plans", title: "Upload plans", why: "The roadmap needs drawings, but none are uploaded.", tab: "docs", tone: "attention" });
  if (s.planDocs > s.planDocsReviewed)
    out.push({ key: "run_plan_review", title: "Run plan review", why: `${s.planDocs - s.planDocsReviewed} uploaded plan file(s) have never been reviewed.`, tab: "docs", tone: "attention" });
  if (s.openPlanFindings > 0)
    out.push({ key: "review_findings", title: "Review plan findings", why: `${s.openPlanFindings} open finding(s) need a decision. AI findings are suggestions, not confirmed violations.`, tab: "planqaqc", tone: "attention" });
  if (s.openCorrections > 0)
    out.push({ key: "review_corrections", title: "Review corrections", why: `${s.openCorrections} reviewer comment(s) are still open.`, tab: "responses", tone: "urgent" });
  if (s.inspectionsFailed > 0)
    out.push({ key: "failed_inspection", title: "Resolve failed inspection", why: `${s.inspectionsFailed} inspection(s) failed and need re-inspection.`, tab: "inspections", tone: "urgent" });
  if (s.permitsRequired > 0 && s.permitsApproved >= s.permitsRequired && (s.inspectionsTotal === 0 || s.inspectionsPassed < s.inspectionsTotal))
    out.push({ key: "track_final_inspections", title: "Schedule / track final inspections", why: "Permits are approved but inspections are not complete.", tab: "inspections", tone: "attention" });
  return out;
}
