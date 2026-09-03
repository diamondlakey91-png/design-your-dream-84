// PERMIVIO Project Intelligence Core — shared types + deterministic derivation logic.
// Pure functions only (browser-safe). Data is aggregated server-side in
// projectIntelligence.functions.ts from the existing project tables so every
// surface reads from one intelligence layer instead of re-asking the client.

export const RESPONSIBLE_PARTIES = [
  "client",
  "permivio",
  "architect",
  "civil",
  "structural",
  "mep",
  "gc",
  "subcontractor",
  "utility",
  "jurisdiction",
  "landlord",
  "owner",
  "other",
] as const;

export type ResponsibleParty = (typeof RESPONSIBLE_PARTIES)[number];

export const PARTY_LABEL: Record<ResponsibleParty, string> = {
  client: "You",
  permivio: "Permivio",
  architect: "Architect",
  civil: "Civil engineer",
  structural: "Structural engineer",
  mep: "MEP engineer",
  gc: "General contractor",
  subcontractor: "Subcontractor",
  utility: "Utility provider",
  jurisdiction: "Jurisdiction",
  landlord: "Landlord",
  owner: "Owner",
  other: "Other consultant",
};

export type ActionSource = "permit" | "comment" | "document" | "inspection" | "deadline" | "qaqc" | "readiness";

export type ActionItem = {
  id: string;
  title: string;
  detail?: string | null;
  party: ResponsibleParty;
  source: ActionSource;
  due_date?: string | null;
  blocking: boolean;
};

export type VerificationLabel = "verified" | "ai_suggested" | "needs_confirmation";

/** Canonical permitting lifecycle used when a jurisdiction-specific roadmap has
 * not been generated yet. Jurisdiction roadmaps override this ordering. */
export const LIFECYCLE_STAGES = [
  { key: "zoning", label: "Zoning / planning approval", categories: ["zoning"] },
  { key: "site", label: "Site development approval", categories: ["site", "environmental", "row", "stormwater"] },
  { key: "building", label: "Building permit review", categories: ["building"] },
  { key: "agency", label: "Fire / health review", categories: ["fire", "health"] },
  { key: "trades", label: "Trade permits", categories: ["electrical", "mechanical", "plumbing"] },
  { key: "utility", label: "Utility coordination", categories: ["utility"] },
  { key: "inspections", label: "Inspections", categories: [] },
  { key: "co", label: "Certificate of Occupancy", categories: ["co", "tco"] },
] as const;

export type LifecycleKey = (typeof LIFECYCLE_STAGES)[number]["key"];

const DISCIPLINE_PARTY: Array<[RegExp, ResponsibleParty]> = [
  [/arch/i, "architect"],
  [/civil|site|grading|drainage/i, "civil"],
  [/struct/i, "structural"],
  [/mech|elec|plumb|mep|hvac|fire\s*alarm|sprinkler/i, "mep"],
  [/contractor|gc|general/i, "gc"],
  [/utility|power|water|sewer|gas/i, "utility"],
  [/landlord/i, "landlord"],
  [/owner/i, "owner"],
  [/health|fire marshal|zoning|building department|reviewer|examiner/i, "jurisdiction"],
];

/** Map a free-text discipline / assignee onto a responsibility-matrix party. */
export function partyFromText(text: string | null | undefined, fallback: ResponsibleParty = "permivio"): ResponsibleParty {
  if (!text) return fallback;
  const direct = RESPONSIBLE_PARTIES.find((p) => p === text.toLowerCase().trim());
  if (direct) return direct;
  for (const [re, party] of DISCIPLINE_PARTY) if (re.test(text)) return party;
  return fallback;
}

/** Party that owns a permit item based on its category + status. */
export function partyForPermitItem(category: string, status: string): ResponsibleParty {
  if (status === "submitted" || status === "in_review") return "jurisdiction";
  if (category === "utility") return "utility";
  if (category === "co" || category === "tco") return "jurisdiction";
  return "permivio";
}

// ---------------- Critical path ----------------

export type RoadmapEdge = {
  id: string;
  name: string;
  category: string | null;
  depends_on: string[];
  concurrent_with: string[];
  critical_path: boolean;
  review_days_min: number | null;
  review_days_max: number | null;
  sequence_order: number | null;
  status?: string | null;
};

export type CriticalPathResult = {
  controlling: { label: string; why: string; party: ResponsibleParty; source: string } | null;
  chain: Array<{ label: string; state: "complete" | "active" | "pending" | "not_applicable"; detail?: string }>;
  slip_note: string;
};

type PermitItemLike = { id: string; name: string; category: string; status: string; due_date: string | null; required: boolean };

const DONE = new Set(["approved", "issued", "complete", "completed", "closed", "passed"]);
const NA = new Set(["n_a", "na", "not_required"]);

export function stageState(items: PermitItemLike[]): "complete" | "active" | "pending" | "not_applicable" {
  const live = items.filter((i) => !NA.has(i.status));
  if (items.length === 0) return "pending";
  if (live.length === 0) return "not_applicable";
  if (live.every((i) => DONE.has(i.status))) return "complete";
  if (live.some((i) => i.status !== "not_started" && i.status !== "pending")) return "active";
  return "pending";
}

export function computeCriticalPath(args: {
  permitItems: PermitItemLike[];
  openComments: number;
  unresolvedFindings: number;
  utilityOpen: boolean;
  pendingInspections: number;
}): CriticalPathResult {
  const chain: CriticalPathResult["chain"] = [];
  let controlling: CriticalPathResult["controlling"] = null;

  for (const stage of LIFECYCLE_STAGES) {
    let items: PermitItemLike[] = [];
    if (stage.key === "inspections") {
      items = args.pendingInspections > 0
        ? [{ id: "insp", name: "Inspections", category: "inspection", status: "in_review", due_date: null, required: true }]
        : [];
    } else {
      items = args.permitItems.filter((i) => (stage.categories as readonly string[]).includes(i.category));
    }
    const state = stageState(items);
    const activeNames = items.filter((i) => !DONE.has(i.status) && !NA.has(i.status)).map((i) => i.name);
    chain.push({ label: stage.label, state, detail: activeNames.slice(0, 3).join(", ") || undefined });

    if (!controlling && (state === "active" || state === "pending")) {
      const first = items.find((i) => !DONE.has(i.status) && !NA.has(i.status));
      controlling = {
        label: first?.name ?? stage.label,
        why: `${stage.label} has not been cleared yet, so nothing downstream can be issued.`,
        party: first ? partyForPermitItem(first.category, first.status) : "permivio",
        source: "Derived from this project's permit matrix",
      };
    }
  }

  // Open corrections and unresolved design findings outrank a waiting queue.
  if (args.openComments > 0) {
    controlling = {
      label: `Correction responses (${args.openComments} open)`,
      why: "Plan review cannot advance while reviewer comments are unresolved.",
      party: "architect",
      source: "Derived from the project response matrix",
    };
  } else if (args.utilityOpen) {
    controlling = controlling ?? {
      label: "Utility coordination",
      why: "Utility approvals are long-lead and typically gate the projected opening date.",
      party: "utility",
      source: "Derived from the project permit matrix",
    };
  } else if (!controlling && args.unresolvedFindings > 0) {
    controlling = {
      label: `Plan QA/QC findings (${args.unresolvedFindings} unresolved)`,
      why: "Unresolved QA/QC findings raise the likelihood of another review cycle.",
      party: "architect",
      source: "Derived from Plan QA/QC",
    };
  }

  return {
    controlling,
    chain,
    slip_note: controlling
      ? `A 10-day delay on ${controlling.label.toLowerCase()} may move the projected opening date by roughly 10 days.`
      : "No controlling item detected from the data on file.",
  };
}

// ---------------- Submission readiness gate ----------------

export type ReadinessCheck = { key: string; label: string; passed: boolean; blocking: boolean; note?: string };

export function readinessScore(checks: ReadinessCheck[]): number {
  if (checks.length === 0) return 0;
  return Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
}

// ---------------- Project health ----------------

export type HealthLevel = "on_track" | "at_risk" | "critical";

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  on_track: "On track",
  at_risk: "At risk",
  critical: "Critical",
};

export function computeHealth(signals: {
  missingBlockingDocs: number;
  overdueDeadlines: number;
  dueSoonDeadlines: number;
  openComments: number;
  failedInspections: number;
  utilityOpen: boolean;
  clientActions: number;
  expiringPermits: number;
}): { level: HealthLevel; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const add = (weight: number, reason: string) => {
    score += weight;
    reasons.push(reason);
  };

  if (signals.overdueDeadlines > 0) add(3, `${signals.overdueDeadlines} deadline(s) past due`);
  if (signals.failedInspections > 0) add(3, `${signals.failedInspections} failed inspection(s) need reinspection`);
  if (signals.expiringPermits > 0) add(3, `${signals.expiringPermits} permit/approval expiring within 45 days`);
  if (signals.missingBlockingDocs > 0) add(2, `${signals.missingBlockingDocs} required document(s) missing`);
  if (signals.openComments > 0) add(2, `${signals.openComments} reviewer comment(s) unresolved`);
  if (signals.utilityOpen) add(1, "Utility coordination still open");
  if (signals.dueSoonDeadlines > 0) add(1, `${signals.dueSoonDeadlines} deadline(s) inside 7 days`);
  if (signals.clientActions > 0) add(1, `${signals.clientActions} item(s) waiting on you`);

  const level: HealthLevel = score >= 5 ? "critical" : score >= 2 ? "at_risk" : "on_track";
  if (reasons.length === 0) reasons.push("No blockers detected from the data on file.");
  return { level, reasons };
}

// ---------------- Revision control ----------------

const REV_RE = /\b(?:rev|revision)[\s._-]*(\d{1,2})\b/i;

export function parseRevision(name: string): number | null {
  const m = name.match(REV_RE);
  return m ? Number(m[1]) : null;
}

export function detectMixedRevisions(docs: Array<{ name: string }>): { current: number | null; mixed: Array<{ name: string; rev: number }> } {
  const withRev = docs
    .map((d) => ({ name: d.name, rev: parseRevision(d.name) }))
    .filter((d): d is { name: string; rev: number } => d.rev !== null);
  if (withRev.length === 0) return { current: null, mixed: [] };
  const current = Math.max(...withRev.map((d) => d.rev));
  return { current, mixed: withRev.filter((d) => d.rev < current) };
}
