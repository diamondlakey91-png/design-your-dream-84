/**
 * Maryland + Virginia authority coverage.
 *
 * Goal: a jurisdiction confirmation card NEVER comes up empty for any MD or VA
 * address. Every locality in both states is enumerated here. Where PERMIVIO has
 * a known official site it is used; otherwise a .gov-scoped official search link
 * is supplied so the link always resolves to a live government page.
 *
 * Nothing here is presented as verified. Generated entries carry
 * verification: "needs_confirmation" per PERMIVIO verification rules.
 */

import { govSearchUrl } from "@/lib/portalRegistry";

export type AuthorityRole =
  | "building" | "planning_zoning" | "fire" | "health" | "public_works"
  | "site_development" | "environmental" | "transportation_row"
  | "utility_water" | "utility_sewer" | "utility_electric" | "utility_gas"
  | "stormwater" | "historic" | "floodplain" | "other";

export type GeneratedAuthority = {
  role: AuthorityRole;
  official_name: string;
  department?: string;
  responsibility: string;
  website?: string | null;
  portal_url?: string | null;
  verification: "verified" | "ai_assisted" | "needs_confirmation";
  source?: { url: string; title: string; publisher: string } | null;
};

/* ------------------------------------------------------------------ */
/* Locality lists                                                      */
/* ------------------------------------------------------------------ */

/** All 23 Maryland counties plus Baltimore City (independent). */
export const MD_COUNTIES = [
  "Allegany", "Anne Arundel", "Baltimore", "Baltimore City", "Calvert", "Caroline",
  "Carroll", "Cecil", "Charles", "Dorchester", "Frederick", "Garrett", "Harford",
  "Howard", "Kent", "Montgomery", "Prince George's", "Queen Anne's", "St. Mary's",
  "Somerset", "Talbot", "Washington", "Wicomico", "Worcester",
] as const;

/** All 95 Virginia counties. */
export const VA_COUNTIES = [
  "Accomack", "Albemarle", "Alleghany", "Amelia", "Amherst", "Appomattox", "Arlington",
  "Augusta", "Bath", "Bedford", "Bland", "Botetourt", "Brunswick", "Buchanan",
  "Buckingham", "Campbell", "Caroline", "Carroll", "Charles City", "Charlotte",
  "Chesterfield", "Clarke", "Craig", "Culpeper", "Cumberland", "Dickenson",
  "Dinwiddie", "Essex", "Fairfax", "Fauquier", "Floyd", "Fluvanna", "Franklin",
  "Frederick", "Giles", "Gloucester", "Goochland", "Grayson", "Greene",
  "Greensville", "Halifax", "Hanover", "Henrico", "Henry", "Highland", "Isle of Wight",
  "James City", "King and Queen", "King George", "King William", "Lancaster", "Lee",
  "Loudoun", "Louisa", "Lunenburg", "Madison", "Mathews", "Mecklenburg", "Middlesex",
  "Montgomery", "Nelson", "New Kent", "Northampton", "Northumberland", "Nottoway",
  "Orange", "Page", "Patrick", "Pittsylvania", "Powhatan", "Prince Edward",
  "Prince George", "Prince William", "Pulaski", "Rappahannock", "Richmond",
  "Roanoke", "Rockbridge", "Rockingham", "Russell", "Scott", "Shenandoah", "Smyth",
  "Southampton", "Spotsylvania", "Stafford", "Surry", "Sussex", "Tazewell", "Warren",
  "Washington", "Westmoreland", "Wise", "Wythe", "York",
] as const;

/** All 38 Virginia independent cities — each is its own AHJ, not part of a county. */
export const VA_INDEPENDENT_CITIES = [
  "Alexandria", "Bristol", "Buena Vista", "Charlottesville", "Chesapeake",
  "Colonial Heights", "Covington", "Danville", "Emporia", "Fairfax", "Falls Church",
  "Franklin", "Fredericksburg", "Galax", "Hampton", "Harrisonburg", "Hopewell",
  "Lexington", "Lynchburg", "Manassas", "Manassas Park", "Martinsville",
  "Newport News", "Norfolk", "Norton", "Petersburg", "Poquoson", "Portsmouth",
  "Radford", "Richmond", "Roanoke", "Salem", "Staunton", "Suffolk", "Virginia Beach",
  "Waynesboro", "Williamsburg", "Winchester",
] as const;

/* ------------------------------------------------------------------ */
/* Known official sites (permit / gov landing pages)                   */
/* ------------------------------------------------------------------ */

/** Keyed by `${state}|${locality}` (county name, or VA independent city name). */
const KNOWN_SITES: Record<string, string> = {
  // ---- Maryland counties ----
  "MD|Allegany": "https://www.alleganygov.org/183/Permits",
  "MD|Anne Arundel": "https://www.aacounty.org/inspections-and-permits/permits",
  "MD|Baltimore": "https://www.baltimorecountymd.gov/departments/permits",
  "MD|Baltimore City": "https://dhcd.baltimorecity.gov/permits",
  "MD|Calvert": "https://www.calvertcountymd.gov/151/Inspections-Permits",
  "MD|Caroline": "https://www.carolinemd.org/151/Planning-Codes",
  "MD|Carroll": "https://www.carrollcountymd.gov/government/directory/permits-inspections/",
  "MD|Cecil": "https://www.ccgov.org/government/permits-inspections",
  "MD|Charles": "https://www.charlescountymd.gov/services/planning-growth-management",
  "MD|Dorchester": "https://docogonet.com/departments/planning_and_zoning/index.php",
  "MD|Frederick": "https://permits.frederickcountymd.gov/",
  "MD|Garrett": "https://www.garrettcounty.org/permits-inspections",
  "MD|Harford": "https://www.harfordcountymd.gov/222/Inspections-Licenses-Permits",
  "MD|Howard": "https://www.howardcountymd.gov/inspections-licenses-permits",
  "MD|Kent": "https://www.kentcounty.com/government/planning-zoning",
  "MD|Montgomery": "https://permittingservices.montgomerycountymd.gov/",
  "MD|Prince George's": "https://www.princegeorgescountymd.gov/departments-offices/permitting-inspections-enforcement",
  "MD|Queen Anne's": "https://www.qac.org/151/Permits-Inspections",
  "MD|St. Mary's": "https://www.stmarysmd.com/lug/",
  "MD|Somerset": "https://somersetmd.us/departments/technical-community-services/",
  "MD|Talbot": "https://talbotcountymd.gov/departments/permits-inspections/",
  "MD|Washington": "https://www.washco-md.net/permits-inspections/",
  "MD|Wicomico": "https://www.wicomicocounty.org/151/Permits-Inspections",
  "MD|Worcester": "https://www.co.worcester.md.us/departments/drp/permits",

  // ---- Virginia counties ----
  "VA|Albemarle": "https://www.albemarle.org/government/community-development",
  "VA|Arlington": "https://www.arlingtonva.us/Government/Programs/Building/Permits",
  "VA|Augusta": "https://www.co.augusta.va.us/government/community-development",
  "VA|Bedford": "https://www.bedfordcountyva.gov/departments/community-development",
  "VA|Botetourt": "https://www.botetourtva.gov/departments/community-development/",
  "VA|Campbell": "https://www.campbellcountyva.gov/152/Community-Development",
  "VA|Caroline": "https://www.co.caroline.va.us/166/Planning-Community-Development",
  "VA|Chesterfield": "https://www.chesterfield.gov/389/Building-Inspection",
  "VA|Culpeper": "https://www.culpepercounty.gov/departments/building_department/index.php",
  "VA|Fairfax": "https://plus.fairfaxcounty.gov/CitizenAccess/Default.aspx",
  "VA|Fauquier": "https://www.fauquiercounty.gov/government/departments-a-g/community-development",
  "VA|Frederick": "https://www.fcva.us/departments/inspections",
  "VA|Gloucester": "https://www.gloucesterva.gov/158/Building-Inspections",
  "VA|Goochland": "https://www.goochlandva.us/163/Building-Inspections",
  "VA|Hanover": "https://www.hanovercounty.gov/188/Building-Inspections",
  "VA|Henrico": "https://henrico.gov/services/building-permits/",
  "VA|Isle of Wight": "https://www.isleofwightus.net/departments/inspections",
  "VA|James City": "https://jamescitycountyva.gov/151/Building-Safety-Permits",
  "VA|Loudoun": "https://www.loudoun.gov/building",
  "VA|Louisa": "https://www.louisacounty.com/166/Building-Inspections",
  "VA|Montgomery": "https://www.montgomerycountyva.gov/content/16820/16932/default.aspx",
  "VA|New Kent": "https://www.co.new-kent.va.us/168/Building-Inspections",
  "VA|Orange": "https://orangecountyva.gov/165/Building-Inspections",
  "VA|Page": "https://www.pagecounty.virginia.gov/151/Building-Inspections",
  "VA|Powhatan": "https://www.powhatanva.gov/165/Building-Inspections",
  "VA|Prince George": "https://www.princegeorgecountyva.gov/departments/community_development/index.php",
  "VA|Prince William": "https://www.pwcva.gov/department/development-services",
  "VA|Pulaski": "https://www.pulaskicounty.org/building-inspections",
  "VA|Roanoke": "https://www.roanokecountyva.gov/165/Development-Services",
  "VA|Rockingham": "https://www.rockinghamcountyva.gov/151/Building-Inspections",
  "VA|Shenandoah": "https://www.shenandoahcountyva.us/building-inspections/",
  "VA|Spotsylvania": "https://www.spotsylvania.va.us/172/Building-Inspections",
  "VA|Stafford": "https://staffordcountyva.gov/departments/public_works/building_official/index.php",
  "VA|Warren": "https://www.warrencountyva.gov/building-inspections",
  "VA|Washington": "https://www.washcova.com/departments/building-inspections",
  "VA|York": "https://www.yorkcounty.gov/154/Building-Regulation",

  // ---- Virginia independent cities ----
  "VA|city:Alexandria": "https://www.alexandriava.gov/Permits",
  "VA|city:Charlottesville": "https://www.charlottesville.gov/468/Building-Permits",
  "VA|city:Chesapeake": "https://www.cityofchesapeake.net/153/Development-Permits",
  "VA|city:Danville": "https://www.danvilleva.gov/152/Building-Inspections",
  "VA|city:Fairfax": "https://www.fairfaxva.gov/government/public-works/permits-inspections",
  "VA|city:Falls Church": "https://www.fallschurchva.gov/151/Permits",
  "VA|city:Fredericksburg": "https://www.fredericksburgva.gov/151/Building-Development-Services",
  "VA|city:Hampton": "https://hampton.gov/151/Codes-Compliance",
  "VA|city:Harrisonburg": "https://www.harrisonburgva.gov/building-inspections",
  "VA|city:Lynchburg": "https://www.lynchburgva.gov/building-safety",
  "VA|city:Manassas": "https://www.manassasva.gov/government/departments/community-development",
  "VA|city:Manassas Park": "https://www.cityofmanassaspark.us/151/Community-Development",
  "VA|city:Newport News": "https://www.nnva.gov/151/Codes-Compliance",
  "VA|city:Norfolk": "https://www.norfolk.gov/1157/Permits-Inspections",
  "VA|city:Petersburg": "https://www.petersburgva.gov/151/Building-Inspections",
  "VA|city:Portsmouth": "https://www.portsmouthva.gov/151/Permits-Inspections",
  "VA|city:Richmond": "https://www.rva.gov/planning-development-review",
  "VA|city:Roanoke": "https://www.roanokeva.gov/1013/Permits",
  "VA|city:Salem": "https://www.salemva.gov/Departments/Community-Development",
  "VA|city:Staunton": "https://www.staunton.va.us/departments/building-inspections",
  "VA|city:Suffolk": "https://www.suffolkva.us/151/Planning-Community-Development",
  "VA|city:Virginia Beach": "https://permits.virginiabeach.gov/",
  "VA|city:Waynesboro": "https://www.waynesboro.va.us/151/Building-Inspections",
  "VA|city:Williamsburg": "https://www.williamsburgva.gov/151/Codes-Compliance",
  "VA|city:Winchester": "https://www.winchesterva.gov/zoning-inspections",
};

/** Health authority per state — Maryland is county-based, Virginia uses VDH districts. */
function healthAuthority(state: string, locality: string): GeneratedAuthority {
  if (state === "MD") {
    return {
      role: "health",
      official_name: `${countyLabel(state, locality)} Health Department`,
      department: "Environmental Health",
      responsibility: "Food service plan review, well & septic, pools, and environmental health approvals.",
      website: govSearchUrl(locality, state, "health department environmental health food service plan review"),
      verification: "needs_confirmation",
      source: null,
    };
  }
  return {
    role: "health",
    official_name: "Virginia Department of Health — Local Health District",
    department: "Environmental Health",
    responsibility: "Food establishment plan review, onsite sewage and well permits for this locality.",
    website: "https://www.vdh.virginia.gov/local-health-districts/",
    verification: "needs_confirmation",
    source: null,
  };
}

function countyLabel(state: string, locality: string): string {
  if (state === "MD") return locality === "Baltimore City" ? "Baltimore City" : `${locality} County`;
  if (VA_INDEPENDENT_CITIES.includes(locality as (typeof VA_INDEPENDENT_CITIES)[number])) {
    return `City of ${locality}`;
  }
  return `${locality} County`;
}

/**
 * Build the authority stack for any MD or VA locality.
 * `municipality` is used only to note that an incorporated town may have its own
 * permit office; the county/city AHJ is always listed.
 */
export function buildMdVaAuthorities(
  state: string,
  locality: string,
  municipality?: string | null,
): GeneratedAuthority[] {
  const st = state.toUpperCase();
  if (st !== "MD" && st !== "VA") return [];

  const label = countyLabel(st, locality);
  const isCity = st === "VA" && VA_INDEPENDENT_CITIES.includes(locality as (typeof VA_INDEPENDENT_CITIES)[number]);
  const known = KNOWN_SITES[`${st}|${isCity ? "city:" : ""}${locality}`] ?? null;
  const buildingSite = known ?? govSearchUrl(locality, st, "building permits department online portal");

  const out: GeneratedAuthority[] = [
    {
      role: "building",
      official_name: `${label} Building / Permits Office`,
      department: "Permits & Inspections",
      responsibility: `Primary AHJ for building and trade permits, plan review, and inspections in ${label}.`,
      website: buildingSite,
      portal_url: known,
      verification: "needs_confirmation",
      source: known
        ? { url: known, title: `${label} — Permits`, publisher: `${label}, ${st}` }
        : null,
    },
    {
      role: "planning_zoning",
      official_name: `${label} Planning & Zoning`,
      responsibility: "Zoning verification, use approvals, site plan and subdivision review.",
      website: govSearchUrl(locality, st, "planning and zoning department site plan review"),
      verification: "needs_confirmation",
      source: null,
    },
    {
      role: "fire",
      official_name: `${label} Fire Marshal's Office`,
      responsibility: "Fire and life-safety plan review, alarm and suppression permits, fire inspections.",
      website: govSearchUrl(locality, st, "fire marshal plan review permits"),
      verification: "needs_confirmation",
      source: null,
    },
    healthAuthority(st, locality),
    {
      role: "public_works",
      official_name: `${label} Public Works / Engineering`,
      responsibility: "Grading, stormwater management, site development, and utility engineering review.",
      website: govSearchUrl(locality, st, "public works engineering site development stormwater"),
      verification: "needs_confirmation",
      source: null,
    },
    st === "VA"
      ? {
          role: "transportation_row",
          official_name: "Virginia Department of Transportation (VDOT)",
          responsibility: "State-maintained roads: entrance, land use, and right-of-way permits.",
          website: "https://www.virginiadot.org/business/bu-landUsePermits.asp",
          verification: "needs_confirmation",
          source: null,
        }
      : {
          role: "transportation_row",
          official_name: "Maryland Department of Transportation — State Highway Administration",
          responsibility: "State-maintained roads: access, utility, and right-of-way permits.",
          website: "https://roads.maryland.gov/mdotsha/pages/index.aspx?PageId=280",
          verification: "needs_confirmation",
          source: null,
        },
    st === "VA"
      ? {
          role: "other",
          official_name: "Virginia 811",
          responsibility: "Required utility locate/ticket before any excavation.",
          website: "https://www.va811.com/",
          verification: "needs_confirmation",
          source: null,
        }
      : {
          role: "other",
          official_name: "Miss Utility of Maryland (811)",
          responsibility: "Required utility locate/ticket before any excavation.",
          website: "https://www.missutility.net/maryland/",
          verification: "needs_confirmation",
          source: null,
        },
  ];

  if (municipality && municipality.toLowerCase() !== locality.toLowerCase()) {
    out.push({
      role: "other",
      official_name: `Town/City of ${municipality}`,
      responsibility:
        "Incorporated municipality — may issue its own zoning, sign, or building permits separately from the county. Confirm which office has jurisdiction at this address.",
      website: govSearchUrl(municipality, st, "town building permits zoning"),
      verification: "needs_confirmation",
      source: null,
    });
  }

  return out;
}

/** True when PERMIVIO can generate a full MD/VA authority stack for this locality. */
export function isMdVaLocality(state: string | null, locality: string | null): boolean {
  if (!state || !locality) return false;
  const st = state.toUpperCase();
  const clean = locality.replace(/\s+(County|City)$/i, "").trim();
  if (st === "MD") {
    return MD_COUNTIES.some((c) => c.toLowerCase() === locality.toLowerCase() || c.toLowerCase() === clean.toLowerCase());
  }
  if (st === "VA") {
    return (
      VA_COUNTIES.some((c) => c.toLowerCase() === clean.toLowerCase()) ||
      VA_INDEPENDENT_CITIES.some((c) => c.toLowerCase() === clean.toLowerCase())
    );
  }
  return false;
}

/** Normalize a geocoded MD/VA locality name onto a registry key. */
export function canonicalMdVaLocality(state: string, raw: string): string | null {
  const st = state.toUpperCase();
  const clean = raw.replace(/\s+County$/i, "").trim();
  if (st === "MD") {
    const hit = MD_COUNTIES.find(
      (c) => c.toLowerCase() === raw.toLowerCase() || c.toLowerCase() === clean.toLowerCase(),
    );
    return hit ?? null;
  }
  if (st === "VA") {
    const city = VA_INDEPENDENT_CITIES.find((c) => c.toLowerCase() === clean.replace(/\s+City$/i, "").trim().toLowerCase());
    const county = VA_COUNTIES.find((c) => c.toLowerCase() === clean.toLowerCase());
    return county ?? city ?? null;
  }
  return null;
}
