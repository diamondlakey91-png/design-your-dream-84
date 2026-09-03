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

/** The 25 sections of the PERMIVIO Site Investigation & Feasibility Report, in order. */
export const SI_REPORT_SECTIONS: Array<{ key: string; no: number; title: string }> = [
  { key: "executive_summary", no: 1, title: "Executive Summary" },
  { key: "project_description", no: 2, title: "Project Description" },
  { key: "property_information", no: 3, title: "Property Information" },
  { key: "jurisdiction", no: 4, title: "Jurisdiction" },
  { key: "existing_land_use", no: 5, title: "Existing Land Use" },
  { key: "zoning", no: 6, title: "Zoning" },
  { key: "proposed_use_analysis", no: 7, title: "Proposed Use Analysis" },
  { key: "site_development_requirements", no: 8, title: "Site Development Requirements" },
  { key: "building_permit_requirements", no: 9, title: "Building / Permit Requirements" },
  { key: "fire_life_safety", no: 10, title: "Fire and Life-Safety Considerations" },
  { key: "health_department", no: 11, title: "Health Department Considerations" },
  { key: "utility_feasibility", no: 12, title: "Utility Feasibility" },
  { key: "environmental_review", no: 13, title: "Environmental / Flood / Wetland Review" },
  { key: "transportation_access", no: 14, title: "Transportation / Access / ROW" },
  { key: "parking_analysis", no: 15, title: "Parking Analysis" },
  { key: "signage", no: 16, title: "Signage" },
  { key: "required_permits", no: 17, title: "Required Permits and Approvals" },
  { key: "permitting_sequence", no: 18, title: "Estimated Permitting Sequence" },
  { key: "estimated_timeline", no: 19, title: "Estimated Timeline" },
  { key: "major_risks", no: 20, title: "Major Risks" },
  { key: "outstanding_questions", no: 21, title: "Outstanding Questions" },
  { key: "recommended_next_steps", no: 22, title: "Recommended Next Steps" },
  { key: "official_sources", no: 23, title: "Official Sources" },
  { key: "assumptions_limitations", no: 24, title: "Assumptions and Limitations" },
  { key: "feasibility_rating", no: 25, title: "Overall Feasibility Rating" },
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
  "PERMIVIO provides permitting intelligence and pre-development due diligence. This report is not a survey, zoning determination, engineering opinion, environmental assessment, or legal advice. Findings should be confirmed with the authority having jurisdiction and the appropriate licensed professionals.";

export const UTILITY_CAPACITY_CAVEAT = "Utility capacity requires provider confirmation.";
