// PERMIVIO — shared agency contact types (client + server safe).
//
// A contact record is only ever built from text that was actually present on a
// retrieved official agency page. Nothing here is generated or guessed: when a
// phone number, email or counter address is not printed on the page, the field
// stays null and the UI says confirmation is required.

export type AgencyRole =
  | "building"
  | "planning_zoning"
  | "fire"
  | "health"
  | "public_works"
  | "utilities";

export const AGENCY_ROLE_LABEL: Record<AgencyRole, string> = {
  building: "Building / Permits",
  planning_zoning: "Planning & Zoning",
  fire: "Fire Marshal",
  health: "Health Department",
  public_works: "Public Works / Engineering",
  utilities: "Water & Sewer Utility",
};

export type AgencyContact = {
  role: AgencyRole;
  role_label: string;
  /** Jurisdiction the contact belongs to, e.g. "Rockville, MD". */
  jurisdiction: string;
  /** Department name as printed on the official page, when shown. */
  department: string | null;
  phone: string | null;
  email: string | null
  address: string | null;
  hours: string | null;
  portal_url: string | null;
  source_url: string;
  source_title: string;
  /** True only when the details were read off a retrieved official page. */
  verified: boolean;
};
