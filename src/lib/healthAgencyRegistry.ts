// Health department / environmental agency directory.
// Mirrors the shape and matching logic of portalRegistry.ts, but for the
// agencies that handle septic/OSSF, well permitting, food-service plan
// review, and wetlands/stormwater/NPDES — none of which are covered by the
// building-permit portal registry.
//
// Every seed entry below has a hand-verified URL (checked at authoring time,
// same bar as portalRegistry.ts). Unlike building-permit portals, these
// agencies generally don't expose an address- or permit-number-searchable
// public database — addressSearch/permitSearch are left undefined rather
// than guessing at a URL pattern that doesn't exist. Jurisdictions not
// covered here fall back to the AI+Firecrawl research path in
// jurisdictionProfiles.functions.ts.

import { normalize, parseJurisdiction, STATE_NAME_TO_CODE } from "@/lib/portalRegistry";

export type HealthAgencyType =
  | "county_health_department"
  | "state_health_department"
  | "state_environmental_agency"
  | "municipal_health_department";

export type HealthAgencyServiceType =
  | "septic_ossf"
  | "well_permitting"
  | "food_service"
  | "wetlands_stormwater_npdes";

export type HealthAgencyEntry = {
  jurisdiction: string;
  state: string;
  agencyType: HealthAgencyType;
  serviceTypes: HealthAgencyServiceType[];
  url: string;
  addressSearch?: (address: string) => string;
  permitSearch?: (permitNumber: string) => string;
  planReviewUrl?: string;
  notes?: string;
  /** Only present for DB-backed entries (admin-added rows) — static seed entries below have
   * no row to verify against and are hand-checked at authoring time instead. */
  id?: string;
  verificationStatus?: string;
  lastVerifiedDate?: string | null;
  verifiedBy?: string | null;
};

export const HEALTH_AGENCY_TYPES: HealthAgencyType[] = [
  "county_health_department",
  "state_health_department",
  "state_environmental_agency",
  "municipal_health_department",
];

export const HEALTH_AGENCY_SERVICE_TYPES: HealthAgencyServiceType[] = [
  "septic_ossf",
  "well_permitting",
  "food_service",
  "wetlands_stormwater_npdes",
];

export const HEALTH_AGENCY_REGISTRY: HealthAgencyEntry[] = [
  // ================= County health departments =================
  {
    jurisdiction: "Arlington County", state: "VA", agencyType: "county_health_department",
    serviceTypes: ["septic_ossf", "well_permitting"],
    url: "https://www.arlingtonva.us/Government/Programs/Health/Environmental-Health/Septic",
    notes: "Arlington County Environmental Health — septic system program.",
  },
  {
    jurisdiction: "Montgomery County", state: "MD", agencyType: "county_health_department",
    serviceTypes: ["septic_ossf", "well_permitting"],
    url: "https://www.montgomerycountymd.gov/department-permitting-services/all-permits/well-septic-permits/environmental-health-survey-permit-process",
    notes: "DPS administers well/septic permitting on behalf of MDE; application reviewed by Montgomery County Health Department.",
  },
  {
    jurisdiction: "Prince George's County", state: "MD", agencyType: "county_health_department",
    serviceTypes: ["septic_ossf", "well_permitting"],
    url: "https://www.princegeorgescountymd.gov/departments-offices/health/environmental-health/wells-sewage-disposal-systems",
    notes: "Health Dept. Division of Environmental Health, Environmental Engineering Program.",
  },
  {
    jurisdiction: "Washington", state: "DC", agencyType: "municipal_health_department",
    serviceTypes: ["food_service"],
    url: "https://dchealth.dc.gov/service/food-establishments",
    notes: "DC Health Division of Food — food establishment plan review & permitting. DC has no septic/well program (fully sewered/municipal water).",
  },
  {
    jurisdiction: "Hillsborough County", state: "FL", agencyType: "county_health_department",
    serviceTypes: ["septic_ossf", "well_permitting"],
    url: "https://hillsborough.floridahealth.gov/programs-and-services/environmental-public-health/septic-systems/",
    notes: "FL DOH Hillsborough — one of the counties still handling septic locally (not transferred to state FDEP).",
  },
  {
    jurisdiction: "Miami-Dade County", state: "FL", agencyType: "county_health_department",
    serviceTypes: ["septic_ossf"],
    url: "https://miamidade.floridahealth.gov/programs-and-services/environmental-public-health/onsite-sewage-tanks-and-disposal-systens/",
    notes: "Grease-trap/food-service discharge permits are handled separately by Miami-Dade DERM (miamidade.gov/permits/environmental-operating.asp), not DOH.",
  },
  {
    jurisdiction: "Harris County", state: "TX", agencyType: "county_health_department",
    serviceTypes: ["septic_ossf"],
    url: "https://oce.harriscountytx.gov/Services/Permits/Permits-A-to-Z/Residential-Construction-On-site-Sewage-System-Septic",
    notes: "Harris County Engineering Dept administers OSSF permitting as a TCEQ-authorized agent.",
  },
  {
    jurisdiction: "Los Angeles County", state: "CA", agencyType: "county_health_department",
    serviceTypes: ["septic_ossf", "well_permitting"],
    url: "http://www.publichealth.lacounty.gov/eh/about/onsite-wastewater-treatment-program.htm",
    notes: "LA County DPH Environmental Health — Onsite Wastewater Treatment Program; Drinking Water Program handles well permits.",
  },
  {
    jurisdiction: "Cook County", state: "IL", agencyType: "county_health_department",
    serviceTypes: ["septic_ossf"],
    url: "https://cookcountypublichealth.org/environmental-health/water-and-sewage/septic/",
    notes: "CCDPH approval required before Cook County Building & Zoning will process a related building permit. A few home-rule municipalities (Barrington Hills, Inverness, Palos Park, South Barrington) run their own IDPH-approved programs instead.",
  },

  // ================= State agencies =================
  {
    jurisdiction: "Texas", state: "TX", agencyType: "state_environmental_agency",
    serviceTypes: ["septic_ossf"],
    url: "https://www.tceq.texas.gov/permitting/ossf",
    notes: "TCEQ OSSF Program. Most counties are TCEQ-authorized agents administering permitting locally — check the county first.",
  },
  {
    jurisdiction: "Florida", state: "FL", agencyType: "state_environmental_agency",
    serviceTypes: ["septic_ossf", "wetlands_stormwater_npdes"],
    url: "https://floridadep.gov/water/onsite-sewage",
    notes: "FDEP took over OSTDS/septic regulation statewide effective 2021-07-01 (a handful of counties, incl. Hillsborough, still process applications locally). NPDES stormwater program: floridadep.gov/water/stormwater.",
  },
  {
    jurisdiction: "Virginia", state: "VA", agencyType: "state_health_department",
    serviceTypes: ["septic_ossf", "well_permitting"],
    url: "https://www.vdh.virginia.gov/environmental-health/onsite-sewage-water-services-updated/",
    notes: "VDH Division of Onsite Water and Wastewater Services sets statewide policy; local health districts (e.g. Arlington) issue permits.",
  },
  {
    jurisdiction: "Illinois", state: "IL", agencyType: "state_health_department",
    serviceTypes: ["septic_ossf"],
    url: "https://dph.illinois.gov/topics-services/environmental-health-protection/private-sewage-disposal.html",
    notes: "IDPH Private Sewage Disposal Code (77 IAC 905). Cook County administers its own program directly (see Cook County entry above).",
  },
];

function buildDeepLinkKey(jurisdiction: string, state: string, agencyType: string): string {
  return `${normalize(jurisdiction)}|${state}|${agencyType}`;
}

/** Convert a DB-backed health/environmental portal mapping row into a runtime HealthAgencyEntry. */
export function buildHealthAgencyEntryFromMapping(m: {
  id?: string;
  jurisdiction: string;
  state: string;
  agency_type: string;
  service_types?: string[] | null;
  url: string;
  address_search_template?: string | null;
  permit_search_template?: string | null;
  plan_review_url?: string | null;
  notes?: string | null;
  verification_status?: string;
  last_verified_date?: string | null;
  verified_by?: string | null;
}): HealthAgencyEntry {
  const agencyType: HealthAgencyType = (HEALTH_AGENCY_TYPES as string[]).includes(m.agency_type)
    ? (m.agency_type as HealthAgencyType)
    : "county_health_department";
  const serviceTypes = (m.service_types ?? []).filter((s): s is HealthAgencyServiceType =>
    (HEALTH_AGENCY_SERVICE_TYPES as string[]).includes(s),
  );
  const fill = (tpl: string | null | undefined, q: string) =>
    tpl ? tpl.replace(/\{q\}/g, encodeURIComponent(q.trim())) : undefined;
  return {
    jurisdiction: m.jurisdiction,
    state: m.state,
    agencyType,
    serviceTypes,
    url: m.url,
    addressSearch: m.address_search_template
      ? (a: string) => fill(m.address_search_template, a) as string
      : undefined,
    permitSearch: m.permit_search_template
      ? (n: string) => fill(m.permit_search_template, n) as string
      : undefined,
    planReviewUrl: m.plan_review_url ?? undefined,
    notes: m.notes ?? undefined,
    id: m.id,
    verificationStatus: m.verification_status,
    lastVerifiedDate: m.last_verified_date,
    verifiedBy: m.verified_by,
  };
}

export type HealthAgencyMatch = {
  entry: HealthAgencyEntry;
  score: number;
  deepLink: string;
  linkKind: "permit" | "address" | "home";
};

/** Rank the registry against a jurisdiction + optional service type/address/permit,
 * and return the top-N matches with their best available deep link. */
export function findHealthAgencyDeepLinks(
  jurisdiction: string,
  opts: {
    serviceType?: HealthAgencyServiceType;
    permitNumber?: string;
    address?: string;
    limit?: number;
    extra?: HealthAgencyEntry[];
  } = {},
): HealthAgencyMatch[] {
  const { serviceType, permitNumber, address } = opts;
  const limit = opts.limit ?? 6;
  const { name, state } = parseJurisdiction(jurisdiction);
  if (!name && !state) return [];

  const nameTokens = name.split(" ").filter((t) => t.length >= 3);

  // Merge: DB entries override seed entries on (jurisdiction+state+agencyType).
  const byKey = new Map<string, HealthAgencyEntry>();
  for (const e of HEALTH_AGENCY_REGISTRY) byKey.set(buildDeepLinkKey(e.jurisdiction, e.state, e.agencyType), e);
  for (const e of opts.extra ?? []) byKey.set(buildDeepLinkKey(e.jurisdiction, e.state, e.agencyType), e);

  const scored: HealthAgencyMatch[] = [];
  for (const entry of byKey.values()) {
    const entryName = normalize(entry.jurisdiction);
    let score = 0;
    if (state && entry.state === state) score += 3;
    if (name && (entryName === name || entryName.includes(name) || name.includes(entryName))) {
      score += 6;
    } else {
      const overlap = nameTokens.filter((t) => entryName.includes(t)).length;
      if (overlap > 0) score += overlap * 2;
    }
    if (score <= 0) continue;
    if (serviceType && entry.serviceTypes.includes(serviceType)) score += 4;

    const permitUrl = permitNumber && entry.permitSearch ? entry.permitSearch(permitNumber) : null;
    const addrUrl = address && entry.addressSearch ? entry.addressSearch(address) : null;
    const deepLink = permitUrl ?? addrUrl ?? entry.url;
    const linkKind: HealthAgencyMatch["linkKind"] = permitUrl ? "permit" : addrUrl ? "address" : "home";
    scored.push({ entry, score, deepLink, linkKind });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export { STATE_NAME_TO_CODE };
