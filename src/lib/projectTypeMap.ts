// Plain-language "friendly" project types shown in the intake wizard,
// plus a map to the internal `project_type` / `residential_or_commercial`
// values consumed by the deterministic rule engine.

export type FriendlyProjectType =
  | "open_restaurant" | "remodel_restaurant"
  | "open_retail" | "remodel_retail"
  | "office_renovation" | "medical_dental"
  | "commercial_ti" | "new_commercial"
  | "new_residential" | "home_addition"
  | "kitchen_bath_reno" | "deck_patio"
  | "change_of_use" | "exterior_site_work"
  | "sign_installation" | "other";

export const FRIENDLY_PROJECT_TYPES: Array<{
  v: FriendlyProjectType;
  label: string;
  description: string;
}> = [
  { v: "open_restaurant", label: "Open a restaurant", description: "Turn a space into a restaurant." },
  { v: "remodel_restaurant", label: "Remodel an existing restaurant", description: "Update or expand a working restaurant." },
  { v: "open_retail", label: "Open a retail store", description: "Fit out a space as a shop or store." },
  { v: "remodel_retail", label: "Remodel a retail space", description: "Update an existing retail store." },
  { v: "office_renovation", label: "Office renovation", description: "Renovate offices or workspace." },
  { v: "medical_dental", label: "Medical or dental office", description: "Fit out or renovate a clinical space." },
  { v: "commercial_ti", label: "Commercial tenant improvement", description: "General TI for any commercial space." },
  { v: "new_commercial", label: "New commercial building", description: "Ground-up commercial construction." },
  { v: "new_residential", label: "New residential building", description: "Ground-up house or small multifamily." },
  { v: "home_addition", label: "Home addition", description: "Add square footage to an existing home." },
  { v: "kitchen_bath_reno", label: "Kitchen or bathroom renovation", description: "Interior remodel of kitchen or bath." },
  { v: "deck_patio", label: "Deck or patio", description: "Exterior deck, patio, or hardscape." },
  { v: "change_of_use", label: "Change how a space will be used", description: "Convert use — e.g. office to restaurant." },
  { v: "exterior_site_work", label: "Exterior site work", description: "Grading, paving, drainage, or utility work." },
  { v: "sign_installation", label: "Sign installation", description: "New or altered exterior signage." },
  { v: "other", label: "Other", description: "Something else — describe below." },
];

export type InternalProjectType =
  | "new_construction" | "tenant_improvement" | "change_of_occupancy"
  | "addition" | "alteration" | "repair" | "demolition"
  | "shell" | "core_and_shell" | "other";

export type ResidentialOrCommercial = "residential" | "commercial" | "mixed_use";

export function mapFriendlyToInternal(f: FriendlyProjectType): {
  project_type: InternalProjectType;
  residential_or_commercial: ResidentialOrCommercial;
} {
  switch (f) {
    case "new_commercial": return { project_type: "new_construction", residential_or_commercial: "commercial" };
    case "new_residential": return { project_type: "new_construction", residential_or_commercial: "residential" };
    case "home_addition": return { project_type: "addition", residential_or_commercial: "residential" };
    case "kitchen_bath_reno": return { project_type: "alteration", residential_or_commercial: "residential" };
    case "deck_patio": return { project_type: "alteration", residential_or_commercial: "residential" };
    case "change_of_use": return { project_type: "change_of_occupancy", residential_or_commercial: "commercial" };
    case "exterior_site_work": return { project_type: "alteration", residential_or_commercial: "commercial" };
    case "sign_installation": return { project_type: "alteration", residential_or_commercial: "commercial" };
    case "open_restaurant":
    case "remodel_restaurant":
    case "open_retail":
    case "remodel_retail":
    case "office_renovation":
    case "medical_dental":
    case "commercial_ti":
      return { project_type: "tenant_improvement", residential_or_commercial: "commercial" };
    case "other":
    default:
      return { project_type: "other", residential_or_commercial: "commercial" };
  }
}

// Restaurant-type projects always imply food service.
export function isRestaurant(f: FriendlyProjectType | null | undefined): boolean {
  return f === "open_restaurant" || f === "remodel_restaurant";
}
