// Client-safe Plan Review presentation rules (Phase 2C). Deterministic — no AI.
// Severity = review priority; confidence = how sure the observation is. Never merged.

export const FINDING_STATUSES = ["open", "needs_review", "accepted", "not_applicable", "resolved"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  needs_review: "Needs review",
  accepted: "Accepted",
  not_applicable: "Not applicable",
  resolved: "Resolved",
};

export type Bbox = { x: number; y: number; w: number; h: number };

export type WorkspaceFinding = {
  id: string;
  finding_no: number;
  severity: string;
  category: string;
  discipline: string;
  sheet_number: string | null;
  sheet_title: string | null;
  location: string | null;
  summary: string;
  plain_language: string | null;
  why_it_matters: string | null;
  code_basis: string | null;
  jurisdiction_source_url: string | null;
  recommended_action: string | null;
  responsible_discipline: string | null;
  verification: string;
  status: string;
  confidence: string | null;
  page: number | null;
  bbox: unknown;
  document_id: string | null;
  related_sheets: string[] | null;
};

export const isHighPriority = (sev: string) => sev === "critical" || sev === "high";

/** Headline wording scaled to the evidence — never states a confirmed violation. */
export function findingLanguage(f: Pick<WorkspaceFinding, "verification" | "confidence" | "code_basis" | "jurisdiction_source_url">): string {
  if (f.verification === "agency_confirmation_required" || f.confidence === "low") return "Verification required";
  if (f.verification === "verified_requirement" && (f.jurisdiction_source_url ?? "").trim()) return "Sourced requirement — confirm with AHJ";
  if (f.verification === "coordination_issue") return "Coordination issue";
  if (f.verification === "missing_information") return "Missing information";
  if (f.verification === "human_review_recommended") return "Review recommended";
  return "Potential issue";
}

export function confidenceLabel(c: string | null): string {
  if (c === "high") return "High confidence";
  if (c === "medium") return "Medium confidence";
  if (c === "low") return "Low confidence · verification required";
  return "Confidence not rated";
}

/** A usable approximate box or null — never a fake marker. */
export function validBbox(b: unknown): Bbox | null {
  if (!b || typeof b !== "object") return null;
  const { x, y, w, h } = b as Record<string, unknown>;
  if (![x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const bx = { x: x as number, y: y as number, w: w as number, h: h as number };
  if (bx.x < 0 || bx.y < 0 || bx.w <= 0 || bx.h <= 0 || bx.x + bx.w > 1.001 || bx.y + bx.h > 1.001) return null;
  return bx;
}

export type FindingFilters = { discipline: string; severity: string; confidence: string; status: string; sheet: string };
export const EMPTY_FILTERS: FindingFilters = { discipline: "all", severity: "all", confidence: "all", status: "all", sheet: "all" };

export function filterFindings<T extends WorkspaceFinding>(list: T[], f: FindingFilters): T[] {
  return list.filter((x) =>
    (f.discipline === "all" || x.discipline === f.discipline) &&
    (f.severity === "all" || (f.severity === "high_priority" ? isHighPriority(x.severity) : x.severity === f.severity)) &&
    (f.confidence === "all" || (x.confidence ?? "unrated") === f.confidence) &&
    (f.status === "all" || (f.status === "active" ? x.status === "open" || x.status === "needs_review" : x.status === f.status)) &&
    (f.sheet === "all" || (x.sheet_number ?? "") === f.sheet || (x.related_sheets ?? []).includes(f.sheet)),
  );
}

export function reviewSummary(list: WorkspaceFinding[]) {
  const byDiscipline: Record<string, number> = {};
  for (const f of list) byDiscipline[f.discipline] = (byDiscipline[f.discipline] ?? 0) + 1;
  return {
    total: list.length,
    highPriority: list.filter((f) => isHighPriority(f.severity) && f.status !== "resolved" && f.status !== "not_applicable").length,
    open: list.filter((f) => f.status === "open" || f.status === "needs_review").length,
    resolved: list.filter((f) => f.status === "resolved").length,
    needsVerification: list.filter((f) => findingLanguage(f) === "Verification required").length,
    byDiscipline,
  };
}

/** Markers for one drawing page: only findings with a real page + valid box. */
export function markersForPage(list: WorkspaceFinding[], documentId: string, page: number) {
  return list
    .filter((f) => f.document_id === documentId && f.page === page)
    .map((f) => ({ id: f.id, no: f.finding_no, severity: f.severity, box: validBbox(f.bbox) }))
    .filter((m): m is { id: string; no: number; severity: string; box: Bbox } => m.box !== null);
}
