/**
 * Derivation helpers for the Intake Pipeline card.
 *
 * Every stage status is derived from real PERMIVIO records only. No stage ever
 * reports a live jurisdiction-portal integration — the portal stage reports the
 * source of its own data (manual sync vs. never synced).
 */

export type PipelineState = "idle" | "waiting" | "pending" | "running" | "complete";

export type PipelineStage = {
  key: string;
  name: string;
  description: string;
  state: PipelineState;
  detail: string;
  /** Where the status came from, per PERMIVIO source-attribution rules. */
  source: string;
  action?: { label: string; to: string };
};

type ProjectRow = {
  id: string;
  name: string;
  jurisdiction: string;
  location: string;
  linked_permit_number: string | null;
  linked_permit_synced_at: string | null;
};

type DocRow = {
  ai_summary: string | null;
  analyzed_at: string | null;
  plan_review: unknown;
  plan_reviewed_at: string | null;
};

type ItemRow = { status: string; required: boolean };

type SyncRow = { status: string; portal_name: string; created_at: string } | null;

export function buildPipelineStages(args: {
  project: ProjectRow;
  documents: DocRow[];
  items: ItemRow[];
  latestSync: SyncRow;
}): PipelineStage[] {
  const { project, documents, items, latestSync } = args;
  const projectHref = `/projects/${project.id}`;

  const analyzed = documents.filter((d) => !!d.analyzed_at);
  const reviewed = documents.filter((d) => !!d.plan_reviewed_at && !!d.plan_review);
  const openItems = items.filter((i) => i.status !== "approved" && i.status !== "n_a");

  // 1. Portal monitor — manual sync only, never a live integration.
  const portal: PipelineStage = latestSync
    ? {
        key: "portal",
        name: "Portal Monitor",
        description: "Last manual portal check against the jurisdiction's public record",
        state: latestSync.status === "error" ? "waiting" : "complete",
        detail:
          latestSync.status === "error"
            ? `Last check on ${latestSync.portal_name || "the portal"} failed — run it again`
            : `Checked ${latestSync.portal_name || "portal"} on ${fmt(latestSync.created_at)}`,
        source: `Manual portal check · ${latestSync.portal_name || "jurisdiction portal"}`,
        action: { label: "Run portal check", to: projectHref },
      }
    : {
        key: "portal",
        name: "Portal Monitor",
        description: "Pull the public permit record for this address or permit number",
        state: "idle",
        detail: project.linked_permit_number
          ? `Permit ${project.linked_permit_number} linked — no check run yet`
          : "No permit number linked yet",
        source: "PERMIVIO record — no portal data pulled",
        action: { label: "Open Permit Lookup", to: "/lookup" },
      };

  // 2. Document intake
  const intake: PipelineStage = {
    key: "intake",
    name: "Document Intake",
    description: "Plans, surveys, correction letters and inspection reports on file",
    state: documents.length === 0 ? "waiting" : "complete",
    detail:
      documents.length === 0
        ? "Waiting for the first upload"
        : `${documents.length} document${documents.length === 1 ? "" : "s"} on file`,
    source: "PERMIVIO document vault",
    action: { label: "Open documents", to: projectHref },
  };

  // 3. Comment reader
  const comments: PipelineStage = {
    key: "comments",
    name: "Comment Reader",
    description: "Reads reviewer comments and explains them in plain language",
    state: documents.length === 0 ? "pending" : analyzed.length === 0 ? "waiting" : "complete",
    detail:
      documents.length === 0
        ? "Pending — needs a document"
        : analyzed.length === 0
          ? "Waiting for doc read"
          : `${analyzed.length} of ${documents.length} read`,
    source: analyzed.length > 0 ? "AI Suggested — verify against the reviewer letter" : "Not yet run",
    action: documents.length > 0 ? { label: "Review comments", to: projectHref } : undefined,
  };

  // 4. Plan review
  const planReview: PipelineStage = {
    key: "plan-review",
    name: "Plan Review",
    description: "Flags possible code issues, missing info and conflicts across disciplines",
    state: documents.length === 0 ? "pending" : reviewed.length === 0 ? "waiting" : "complete",
    detail:
      documents.length === 0
        ? "Pending — needs plans"
        : reviewed.length === 0
          ? "No plan sheets reviewed yet"
          : `${reviewed.length} sheet${reviewed.length === 1 ? "" : "s"} reviewed`,
    source: reviewed.length > 0 ? "AI Suggested Issue — needs human review" : "Not yet run",
    action: documents.length > 0 ? { label: "Run plan review", to: projectHref } : undefined,
  };

  // 5. Correction matrix / checklist
  const matrix: PipelineStage = {
    key: "matrix",
    name: "Correction Matrix",
    description: "Builds the correction matrix and resubmission checklist",
    state: items.length === 0 ? "pending" : openItems.length === 0 ? "complete" : "running",
    detail:
      items.length === 0
        ? "Pending — generate the permit roadmap first"
        : openItems.length === 0
          ? `All ${items.length} items cleared`
          : `${openItems.length} open of ${items.length} items`,
    source: items.length > 0 ? "PERMIVIO checklist · statuses set by you" : "Not yet built",
    action: { label: "Open checklist", to: projectHref },
  };

  return [portal, intake, comments, planReview, matrix];
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}
