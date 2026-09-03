/**
 * Permit Requirement Finder — shared category master list and types.
 *
 * The "never miss anything" guarantee is structural, not prompt-based: the AI is
 * asked to return a determination for EVERY category in PERMIT_CATEGORIES, and the
 * server function back-fills any category the model omits with a
 * "verification_needed" row so no category can silently disappear from the report.
 */

export type PermitDetermination =
  | "required"
  | "likely_required"
  | "conditional"
  | "likely_not_required"
  | "verification_needed";

export type PermitVerification = "confirmed_by_source" | "ai_assisted" | "needs_confirmation";

export type PermitCategory = {
  key: string;
  label: string;
  /** Typical authority family — used only as prompt guidance, never presented as fact. */
  authority: string;
  group: PermitGroup;
};

export type PermitGroup =
  | "Land use & entitlement"
  | "Building & trades"
  | "Life safety"
  | "Health & environmental"
  | "Site, utility & right-of-way"
  | "Occupancy & licensing";

export const PERMIT_CATEGORIES: PermitCategory[] = [
  // Land use & entitlement
  { key: "zoning_use", label: "Zoning / use approval", authority: "Planning & Zoning", group: "Land use & entitlement" },
  { key: "special_exception", label: "Special exception / conditional use / variance", authority: "Planning Commission or Board of Appeals", group: "Land use & entitlement" },
  { key: "site_plan", label: "Site plan / development plan review", authority: "Planning & Zoning", group: "Land use & entitlement" },
  { key: "historic_design", label: "Historic / architectural design review", authority: "Historic Preservation Commission", group: "Land use & entitlement" },
  { key: "subdivision", label: "Subdivision / lot consolidation / plat", authority: "Planning", group: "Land use & entitlement" },

  // Building & trades
  { key: "building", label: "Building permit", authority: "Building Department", group: "Building & trades" },
  { key: "demolition", label: "Demolition permit", authority: "Building Department", group: "Building & trades" },
  { key: "structural", label: "Structural / foundation permit or deferred submittal", authority: "Building Department", group: "Building & trades" },
  { key: "mechanical", label: "Mechanical / HVAC permit", authority: "Building Department — Mechanical", group: "Building & trades" },
  { key: "electrical", label: "Electrical permit", authority: "Building Department — Electrical", group: "Building & trades" },
  { key: "plumbing", label: "Plumbing permit", authority: "Building Department — Plumbing", group: "Building & trades" },
  { key: "gas", label: "Fuel gas / gas piping permit", authority: "Building Department", group: "Building & trades" },
  { key: "elevator", label: "Elevator / lift permit", authority: "State or local elevator authority", group: "Building & trades" },
  { key: "energy", label: "Energy code compliance submittal", authority: "Building Department", group: "Building & trades" },

  // Life safety
  { key: "fire_construction", label: "Fire construction / operational permit", authority: "Fire Marshal", group: "Life safety" },
  { key: "fire_alarm", label: "Fire alarm permit", authority: "Fire Marshal", group: "Life safety" },
  { key: "fire_sprinkler", label: "Fire sprinkler / suppression permit", authority: "Fire Marshal", group: "Life safety" },
  { key: "hood_suppression", label: "Commercial hood & suppression permit", authority: "Fire Marshal", group: "Life safety" },
  { key: "hazmat", label: "Hazardous materials / storage tank permit", authority: "Fire Marshal / Environmental", group: "Life safety" },

  // Health & environmental
  { key: "health_food", label: "Health / food service plan review & license", authority: "Health Department", group: "Health & environmental" },
  { key: "grease", label: "Grease interceptor approval", authority: "Water & Sewer Authority", group: "Health & environmental" },
  { key: "well_septic", label: "Well / septic (on-site utilities) permit", authority: "Health Department", group: "Health & environmental" },
  { key: "environmental", label: "Environmental / critical area / wetlands review", authority: "Environmental agency", group: "Health & environmental" },
  { key: "stormwater", label: "Stormwater management / sediment & erosion control", authority: "Public Works or Soil Conservation District", group: "Health & environmental" },

  // Site, utility & right-of-way
  { key: "grading", label: "Grading / earth disturbance permit", authority: "Public Works", group: "Site, utility & right-of-way" },
  { key: "row", label: "Right-of-way / sidewalk / street cut permit", authority: "Transportation or Public Works", group: "Site, utility & right-of-way" },
  { key: "access", label: "Driveway / entrance / access permit", authority: "Transportation (local or state DOT)", group: "Site, utility & right-of-way" },
  { key: "traffic", label: "Traffic impact study / transportation review", authority: "Transportation", group: "Site, utility & right-of-way" },
  { key: "water_sewer", label: "Water & sewer connection / capacity allocation", authority: "Water & Sewer Authority", group: "Site, utility & right-of-way" },
  { key: "utility_service", label: "Electric / gas / telecom service coordination", authority: "Serving utility providers", group: "Site, utility & right-of-way" },
  { key: "sign", label: "Sign permit (each sign)", authority: "Zoning / Building", group: "Site, utility & right-of-way" },

  // Occupancy & licensing
  { key: "change_of_use", label: "Change of occupancy / use group change", authority: "Building Department", group: "Occupancy & licensing" },
  { key: "co", label: "Certificate of Occupancy / TCO", authority: "Building Department", group: "Occupancy & licensing" },
  { key: "business_license", label: "Business license / use & occupancy license", authority: "Licensing Department", group: "Occupancy & licensing" },
  { key: "alcohol", label: "Alcohol / specialty operating license", authority: "Liquor Board or licensing agency", group: "Occupancy & licensing" },
  { key: "contractor", label: "Contractor / trade licensing & registration", authority: "State or local licensing", group: "Occupancy & licensing" },
];

export const PERMIT_GROUPS: PermitGroup[] = [
  "Land use & entitlement",
  "Building & trades",
  "Life safety",
  "Health & environmental",
  "Site, utility & right-of-way",
  "Occupancy & licensing",
];

export type PermitFinding = {
  category_key: string;
  category_label: string;
  group: PermitGroup;
  determination: PermitDetermination;
  verification: PermitVerification;
  agency: string;
  why: string;
  triggers: string;
  typical_documents: string[];
  sequence_note: string;
  open_questions: string;
};

export type PermitFinderReport = {
  jurisdiction: string;
  project_type: string;
  scope: string;
  assumptions: string[];
  findings: PermitFinding[];
  sequence: Array<{ step: number; stage: string; depends_on: string; note: string }>;
  missing_info: string[];
  confirm_with_agency: string[];
  sources: Array<{ title: string; url: string; official: boolean }>;
  jurisdiction_data_on_file: boolean;
  generated_at: string;
};

export const DETERMINATION_LABEL: Record<PermitDetermination, string> = {
  required: "Required",
  likely_required: "Likely required",
  conditional: "Conditional",
  likely_not_required: "Likely not required",
  verification_needed: "Verification needed",
};

export const VERIFICATION_LABEL: Record<PermitVerification, string> = {
  confirmed_by_source: "Verified jurisdiction requirement",
  ai_assisted: "AI-identified — confirm with agency",
  needs_confirmation: "Agency confirmation required",
};

/** Blue-family styling only (Permivio palette). Red is reserved for real blockers. */
export function determinationClasses(d: PermitDetermination) {
  switch (d) {
    case "required":
      return "bg-brand/15 text-brand ring-brand/30";
    case "likely_required":
      return "bg-sky-500/10 text-sky-300 ring-sky-400/25";
    case "conditional":
      return "bg-white/5 text-zinc-300 ring-white/10";
    case "likely_not_required":
      return "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20";
    default:
      return "bg-white/5 text-zinc-400 ring-white/10";
  }
}

export const DETERMINATION_ORDER: PermitDetermination[] = [
  "required",
  "likely_required",
  "conditional",
  "verification_needed",
  "likely_not_required",
];
