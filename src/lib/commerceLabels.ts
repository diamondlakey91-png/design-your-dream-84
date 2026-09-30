// Client-safe labels for membership entitlements and credit ledger entries.
export type EntitlementKey =
  | "active_projects"
  | "team_seats"
  | "ai_queries"
  | "ai_messages"
  | "report_credits"
  | "plan_review_credits"
  | "correction_review_credits"
  | "document_storage_mb"
  | "subscriber_discount_percent";

export const ENTITLEMENT_ORDER: EntitlementKey[] = [
  "active_projects",
  "team_seats",
  "ai_queries",
  "ai_messages",
  "report_credits",
  "plan_review_credits",
  "correction_review_credits",
  "document_storage_mb",
  "subscriber_discount_percent",
];

export const ENTITLEMENT_LABEL: Record<EntitlementKey, string> = {
  active_projects: "Active projects",
  team_seats: "Team seats",
  ai_queries: "AI tool runs",
  ai_messages: "AI Assistant messages",
  report_credits: "Report credits",
  plan_review_credits: "Plan Review credits",
  correction_review_credits: "Correction Review credits",
  document_storage_mb: "Document storage (MB)",
  subscriber_discount_percent: "Member discount (%)",
};

export const TRANSACTION_LABEL: Record<string, string> = {
  subscription_grant: "Monthly allowance",
  purchase: "Purchased",
  usage: "Used",
  refund: "Restored",
  adjustment: "Adjustment",
  expiration: "Expired",
  promotional_grant: "Beta / promotional grant",
};
