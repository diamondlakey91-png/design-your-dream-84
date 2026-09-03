/**
 * Client-safe helpers for the Tools & Reports experience: plain-language order
 * statuses, project-specific recommendations and price formatting.
 * No jurisdiction, fee or timeline claims are invented here — everything comes
 * from the configured product records and the project's own data.
 */

export type DeliveryTier = "ai_assisted" | "professional_review";

export type ServiceProduct = {
  id: string;
  product_key: string;
  name: string;
  client_title: string;
  client_question: string | null;
  description: string;
  category: string;
  base_price_cents: number;
  currency: string;
  professional_review_price_cents: number | null;
  rush_price_cents: number | null;
  turnaround_estimate: string | null;
  supports_professional_review: boolean;
  deliverables: unknown;
  display_order: number;
};

export type ServiceOrder = {
  id: string;
  project_id: string | null;
  product_id: string;
  delivery_tier: DeliveryTier;
  status: string;
  amount_cents: number;
  currency: string;
  delivered_at: string | null;
  created_at: string;
};

export type ProjectLite = {
  id: string;
  name: string;
  location: string | null;
  project_type: string | null;
  status: string | null;
  current_stage: number | null;
  updated_at?: string | null;
};

export const DISCLAIMER =
  "Permivio provides permitting research, pre-submission quality control, and project intelligence. Requirements may change and final determinations remain with the authority having jurisdiction and, where applicable, licensed design professionals.";

export const TIER_COPY: Record<DeliveryTier, { label: string; blurb: string }> = {
  ai_assisted: {
    label: "AI-Assisted",
    blurb: "Fast project analysis using Permivio's permitting intelligence and available verified sources.",
  },
  professional_review: {
    label: "Professionally Reviewed",
    blurb: "A Permivio permitting professional reviews the findings before final delivery.",
  },
};

/** Client-friendly order status labels. Internal payment states never leak. */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  payment_required: "Payment Required",
  paid: "Paid",
  processing: "Processing",
  waiting_client: "Waiting for Your Information",
  ai_in_progress: "AI Analysis In Progress",
  professional_review: "Professional Review In Progress",
  ready: "Ready to View",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function statusTone(status: string): "blue" | "green" | "gray" | "red" {
  if (status === "ready" || status === "delivered") return "green";
  if (status === "cancelled" || status === "refunded") return "red";
  if (status === "payment_required") return "gray";
  return "blue";
}

export function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export type Recommendation = "recommended" | "available" | "completed" | "later";

/**
 * Recommends services from what the project actually shows: its phase,
 * whether documents exist and whether the agency has issued comments.
 */
export function recommendFor(
  product: ServiceProduct,
  project: ProjectLite | null,
  signals: { documentCount: number; hasComments: boolean; purchasedKeys: Set<string> },
): Recommendation {
  if (signals.purchasedKeys.has(product.product_key)) return "completed";
  if (!project) return product.product_key === "project_feasibility" ? "recommended" : "available";

  const stage = project.current_stage ?? 0;
  const s = (project.status ?? "").toLowerCase();
  const approved = s.includes("approved") || s.includes("issued") || s.includes("occupancy");

  switch (product.product_key) {
    case "site_investigation":
    case "property_snapshot":
    case "project_feasibility":
    case "development_due_diligence":
    case "major_development_study":
    case "jurisdiction_research":
    case "utility_due_diligence":
      return stage <= 1 ? "recommended" : "available";
    case "permit_requirements":
    case "permit_roadmap":
      return stage <= 2 ? "recommended" : "available";
    case "plan_qaqc":
      return signals.documentCount > 0 && stage <= 2 ? "recommended" : "available";
    case "correction_analysis":
      return signals.hasComments ? "recommended" : "later";
    case "co_readiness":
      return approved || stage >= 3 ? "recommended" : "later";
    default:
      return "available";
  }
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  recommended: "Recommended",
  available: "Available",
  completed: "Purchased",
  later: "Available later",
};
