// PERMIVIO — deterministic permit roadmap workflow rules (no AI).
// Status and blocked state are computed from user/trusted-controlled data only;
// government approvals are never marked complete automatically.

export const ROADMAP_STATUSES = [
  "not_started",
  "researching",
  "ready_to_submit",
  "submitted",
  "under_review",
  "corrections_required",
  "approved",
  "issued",
  "n_a",
  "blocked",
] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const ROADMAP_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  researching: "Researching",
  ready_to_submit: "Ready to submit",
  submitted: "Submitted",
  under_review: "Under review",
  corrections_required: "Corrections required",
  approved: "Approved",
  issued: "Issued",
  n_a: "Not required",
  blocked: "Blocked",
};

/** Statuses the customer picks from (issued kept for existing records). */
export const ROADMAP_PICKABLE: RoadmapStatus[] = [
  "not_started", "researching", "ready_to_submit", "submitted", "under_review",
  "corrections_required", "approved", "n_a", "blocked",
];

export const CONFIDENCE_LABEL: Record<string, string> = {
  verified: "Verified",
  needs_verification: "Needs verification",
  potential: "Potential requirement",
};

export const DONE_STATUSES = new Set(["approved", "issued", "n_a"]);
/** Statuses where an unfinished prerequisite holds the item back. */
const PRE_SUBMISSION = new Set(["not_started", "researching", "ready_to_submit", "blocked"]);

export type RoadmapItemLike = {
  id: string;
  name: string;
  status: string;
  required?: boolean | null;
  depends_on?: string[] | null;
  requirement_confidence?: string | null;
};

/** Names of unfinished prerequisites holding this item back ([] = not blocked by dependencies). */
export function blockers(item: RoadmapItemLike, all: RoadmapItemLike[]): string[] {
  if (!PRE_SUBMISSION.has(item.status)) return [];
  const byId = new Map(all.map((i) => [i.id, i]));
  return (item.depends_on ?? [])
    .map((id) => byId.get(id))
    .filter((d): d is RoadmapItemLike => !!d && !DONE_STATUSES.has(d.status))
    .map((d) => d.name);
}

export function isBlocked(item: RoadmapItemLike, all: RoadmapItemLike[]): boolean {
  return item.status === "blocked" || blockers(item, all).length > 0;
}

/** True when adding `depId` as a prerequisite of `itemId` would create a loop. */
export function wouldCreateCycle(itemId: string, depId: string, all: RoadmapItemLike[]): boolean {
  if (itemId === depId) return true;
  const byId = new Map(all.map((i) => [i.id, i]));
  const stack = [depId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === itemId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of byId.get(cur)?.depends_on ?? []) stack.push(d);
  }
  return false;
}

/** Stable order: prerequisites first, otherwise keep input order. */
export function orderByDependencies<T extends RoadmapItemLike>(items: T[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: T[] = [];
  const done = new Set<string>();
  const visit = (i: T, trail: Set<string>) => {
    if (done.has(i.id) || trail.has(i.id)) return;
    trail.add(i.id);
    for (const d of i.depends_on ?? []) { const dep = byId.get(d); if (dep) visit(dep, trail); }
    done.add(i.id);
    out.push(i);
  };
  for (const i of items) visit(i, new Set());
  return out;
}

export function roadmapSummary(items: RoadmapItemLike[]) {
  const active = items.filter((i) => i.status !== "n_a");
  return {
    total: active.length,
    done: active.filter((i) => DONE_STATUSES.has(i.status)).length,
    blocked: items.filter((i) => i.required !== false && !DONE_STATUSES.has(i.status) && isBlocked(i, items)),
    needsVerification: items.filter((i) => i.required !== false && !DONE_STATUSES.has(i.status) && i.requirement_confidence !== "verified"),
    readyToSubmit: items.filter((i) => i.status === "ready_to_submit" && !isBlocked(i, items)),
    correctionsRequired: items.filter((i) => i.status === "corrections_required"),
  };
}

export const DOCUMENT_CATEGORIES = [
  "drawings", "specifications", "application", "survey", "engineering", "correction",
  "correspondence", "inspection", "approval", "certificate", "supporting", "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABEL: Record<string, string> = {
  drawings: "Drawings", specifications: "Specifications", application: "Permit application",
  survey: "Survey", engineering: "Engineering", correction: "Correction notice",
  correspondence: "Agency correspondence", inspection: "Inspection document", approval: "Approval",
  certificate: "Certificate", supporting: "Supporting document", other: "Other",
};
/** Document Center groups. */
export const DOCUMENT_GROUPS: { key: string; label: string; cats: string[] | null }[] = [
  { key: "all", label: "All documents", cats: null },
  { key: "plans", label: "Plans", cats: ["drawings", "specifications", "survey", "engineering"] },
  { key: "applications", label: "Applications", cats: ["application"] },
  { key: "corrections", label: "Corrections", cats: ["correction", "correspondence", "inspection"] },
  { key: "approvals", label: "Approvals", cats: ["approval", "certificate"] },
  { key: "other", label: "Other", cats: ["supporting", "other"] },
];

/** Quick filename-based suggestion — upload stays one click; users can reclassify. */
export function guessCategory(name: string, mime = ""): DocumentCategory {
  const n = name.toLowerCase();
  if (/correction|comment|review letter|rfi/.test(n)) return "correction";
  if (/certificate|\bco\b|occupancy/.test(n)) return "certificate";
  if (/approv|issued|permit card/.test(n)) return "approval";
  if (/application|\bapp\b|form/.test(n)) return "application";
  if (/survey|plat/.test(n)) return "survey";
  if (/inspection/.test(n)) return "inspection";
  if (/spec/.test(n)) return "specifications";
  if (/calc|structural|geotech|report/.test(n)) return "engineering";
  if (/plan|sheet|dwg|drawing|set/.test(n) || mime === "application/pdf") return "drawings";
  return "other";
}
