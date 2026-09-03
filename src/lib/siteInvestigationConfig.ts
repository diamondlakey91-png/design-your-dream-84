// Reusable configuration for the Site Investigation / Feasibility module.

export type FeasibilityRating = "green" | "yellow" | "orange" | "red" | "gray";

export const FEASIBILITY_RATINGS: Array<{
  id: FeasibilityRating;
  label: string;
  definition: string;
  klass: string;
}> = [
  { id: "green", label: "Green", definition: "Project appears generally feasible based on currently available information.", klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30" },
  { id: "yellow", label: "Yellow", definition: "Project appears feasible but meaningful issues or approvals require resolution.", klass: "text-sky-400 bg-sky-500/10 ring-sky-500/30" },
  { id: "orange", label: "Orange", definition: "Major constraints or discretionary approvals appear likely.", klass: "text-sky-400 bg-sky-500/10 ring-sky-500/30" },
  { id: "red", label: "Red", definition: "Current information identifies significant feasibility concerns.", klass: "text-red-400 bg-red-500/10 ring-red-500/30" },
  { id: "gray", label: "Gray", definition: "Insufficient verified information.", klass: "text-muted-foreground bg-muted/40 ring-border" },
];

export function ratingMeta(id: string) {
  return FEASIBILITY_RATINGS.find((r) => r.id === id) ?? FEASIBILITY_RATINGS[4];
}

export const ZONING_CLASSIFICATIONS = [
  { id: "likely_permitted", label: "Likely permitted", klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30" },
  { id: "conditional", label: "Conditional / special approval may be required", klass: "text-sky-400 bg-sky-500/10 ring-sky-500/30" },
  { id: "potentially_not_permitted", label: "Potentially not permitted", klass: "text-red-400 bg-red-500/10 ring-red-500/30" },
  { id: "needs_confirmation", label: "Needs jurisdiction confirmation", klass: "text-muted-foreground bg-muted/40 ring-border" },
] as const;

export function classificationMeta(id: string) {
  return ZONING_CLASSIFICATIONS.find((c) => c.id === id) ?? ZONING_CLASSIFICATIONS[3];
}

export const SI_FINDING_CATEGORIES = [
  { id: "property", label: "Property Information" },
  { id: "zoning", label: "Zoning" },
  { id: "land_use", label: "Existing / Future Land Use" },
  { id: "site_development", label: "Site Development" },
  { id: "building_permits", label: "Building / Permit Requirements" },
  { id: "fire_life_safety", label: "Fire & Life Safety" },
  { id: "health", label: "Health Department" },
  { id: "utilities", label: "Utility Feasibility" },
  { id: "environmental", label: "Environmental / Flood / Wetland" },
  { id: "transportation", label: "Transportation / Access / ROW" },
  { id: "parking", label: "Parking" },
  { id: "signage", label: "Signage" },
  { id: "risks", label: "Major Risks" },
  { id: "questions", label: "Outstanding Questions" },
  { id: "next_steps", label: "Recommended Next Steps" },
] as const;

export function siCategoryLabel(id: string) {
  return SI_FINDING_CATEGORIES.find((c) => c.id === id)?.label ?? id.replace(/_/g, " ");
}

/** Sections of the PERMIVIO Site Investigation & Feasibility Report, in order.
 *  Sections only appear when their investigation module is active. */
export const SI_REPORT_SECTIONS: Array<{ key: string; no: number; title: string }> = [
  { key: "executive_summary", no: 1, title: "Executive Feasibility Snapshot" },
  { key: "project_description", no: 2, title: "Project Description" },
  { key: "property_information", no: 3, title: "Property Information" },
  { key: "parcel_summary", no: 4, title: "Parcel Summary" },
  { key: "jurisdiction", no: 5, title: "Jurisdiction" },
  { key: "existing_land_use", no: 6, title: "Existing Land Use" },
  { key: "zoning", no: 7, title: "Zoning" },
  { key: "proposed_use_analysis", no: 8, title: "Proposed Use Analysis" },
  { key: "development_standards", no: 9, title: "Development Standards" },
  { key: "site_constraints", no: 10, title: "Site Constraints" },
  { key: "site_development_requirements", no: 11, title: "Civil / Site Development" },
  { key: "environmental_review", no: 12, title: "Environmental / Flood / Wetland Review" },
  { key: "transportation_access", no: 13, title: "Transportation / Access / ROW" },
  { key: "parking_analysis", no: 14, title: "Parking Analysis" },
  { key: "utility_feasibility", no: 15, title: "Utility Feasibility" },
  { key: "fire_life_safety", no: 16, title: "Fire and Life-Safety Considerations" },
  { key: "health_department", no: 17, title: "Health Requirements" },
  { key: "entitlements", no: 18, title: "Entitlements" },
  { key: "building_permit_requirements", no: 19, title: "Building / Permit Requirements" },
  { key: "agency_matrix", no: 20, title: "Agency Matrix" },
  { key: "required_permits", no: 21, title: "Permit Matrix" },
  { key: "development_sequence", no: 22, title: "Development Sequence" },
  { key: "permitting_sequence", no: 23, title: "Estimated Permitting Sequence" },
  { key: "estimated_timeline", no: 24, title: "Estimated Timeline" },
  { key: "risk_matrix", no: 25, title: "Risk Matrix" },
  { key: "deal_killers", no: 26, title: "Potential Deal Killers" },
  { key: "outstanding_due_diligence", no: 27, title: "Items to Confirm Before Moving Forward" },
  { key: "signage", no: 28, title: "Signage" },
  { key: "recommended_next_steps", no: 29, title: "Recommended Next Steps" },
  { key: "official_sources", no: 30, title: "Official Sources" },
  { key: "assumptions_limitations", no: 31, title: "Assumptions and Limitations" },
  { key: "feasibility_rating", no: 32, title: "Overall Feasibility Rating" },
];

export const SI_TIMELINE_PHASES = [
  "Site due diligence",
  "Zoning confirmation",
  "Entitlement",
  "Design",
  "Utility coordination",
  "Site-development approval",
  "Building review",
  "Health review",
  "Fire review",
  "Permit issuance",
  "Construction",
  "Inspections",
  "Certificate of Occupancy",
] as const;

export const SITE_INVESTIGATION_DISCLAIMER =
  "Permivio provides AI-assisted permitting research, project intelligence, due-diligence screening, document analysis, and workflow support using available public sources and client-provided information. Findings may require confirmation by the applicable Authority Having Jurisdiction, utility provider, property professional, attorney, architect, engineer, surveyor, environmental professional, or other qualified party. Permivio does not guarantee entitlement, permit issuance, utility capacity, code compliance, cost, or schedule. Professional-review status applies only when an authorized human reviewer has completed and recorded that review.";

export const UTILITY_CAPACITY_CAVEAT = "Utility capacity requires provider confirmation.";
