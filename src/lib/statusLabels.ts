// User-facing status labels for the intake / roadmap flow.
// Keeps raw DB enums out of UI copy.

export type IntakeStatus =
  | "draft" | "questions" | "ready" | "analyzing"
  | "report_ready" | "roadmap_created" | "human_review";

export function intakeStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "draft": return "Draft";
    case "questions": return "Answer a few questions";
    case "ready": return "Ready for analysis";
    case "analyzing": return "Analyzing project";
    case "report_ready": return "Report ready";
    case "roadmap_created": return "Roadmap created";
    case "human_review": return "Human verification requested";
    default: return "Draft";
  }
}

// Also used by the older scope.status field so existing projects show
// something friendly during the transition.
export function scopeStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "submitted": return "Ready for analysis";
    case "analyzing": return "Analyzing project";
    case "needs_followup": return "Answer a few questions";
    case "complete": return "Roadmap created";
    case "draft": return "Draft";
    default: return "";
  }
}
