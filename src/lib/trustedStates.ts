// Client-safe rules for authoritative states customers cannot assert directly.
// The database enforces the same rules with triggers; these mirror them for
// the trusted server workflow and tests.

export const FILING_AUTHORITATIVE = ["submitted", "monitoring", "issued"] as const;
export const FILING_CUSTOMER = ["draft", "preflight", "awaiting_approval", "ready_to_submit", "withdrawn"] as const;

export type FilingSnapshot = {
  status: string;
  approved_at: string | null;
  confirmation_number: string | null;
  status_source: string | null;
};

/**
 * Validate a status transition that records an external (portal/AHJ) status.
 * Returns an error message, or null when the transition is allowed.
 */
export function checkFilingTransition(
  current: FilingSnapshot,
  next: { status?: string; confirmation_number?: string | null; status_source?: string | null },
): string | null {
  const target = next.status ?? current.status;
  const conf = (next.confirmation_number ?? current.confirmation_number ?? "").trim();
  const source = (next.status_source ?? current.status_source ?? "").trim();
  if (!(FILING_AUTHORITATIVE as readonly string[]).includes(target)) return null;
  if (target === "submitted" || target === "monitoring") {
    if (!current.approved_at) return "A filing must be approved by a person before you record a submission.";
    if (!conf) return "Record the portal confirmation / application number.";
    if (!source) return "Record where this status came from (the status source).";
    return null;
  }
  // issued
  if (!["submitted", "monitoring", "issued"].includes(current.status))
    return "Record the submission before marking the permit issued.";
  if (!source) return "Record where the issued status came from (the status source).";
  return null;
}

export const JURISDICTION_CUSTOMER_STATES = ["unconfirmed", "user_confirmed", "pending_review"] as const;

export function customerMaySetJurisdictionStatus(status: string): boolean {
  return (JURISDICTION_CUSTOMER_STATES as readonly string[]).includes(status);
}

export const REVIEW_REVIEWER_FIELDS = ["status", "reviewer_name", "reviewer_notes", "reviewed_at"] as const;
