// PERMIVIO — provider coverage + jurisdiction source configuration (pure data).
// Architecture is nationwide (providers are generic); jurisdiction-specific sources live here as data.

export type CoverageLevel = "full_structured" | "partial_structured" | "official_source_research" | "human_verification";
export const COVERAGE_LABEL: Record<CoverageLevel, string> = {
  full_structured: "Full structured coverage",
  partial_structured: "Partial structured coverage",
  official_source_research: "Official-source research required",
  human_verification: "Human verification required",
};

/** Launch geography. Nationwide federal layers (Census, FEMA) apply everywhere; local layers only where configured. */
export const STATE_COVERAGE: Record<string, { name: string; level: CoverageLevel; note: string }> = {
  FL: { name: "Florida", level: "partial_structured", note: "Statewide code adoption source configured; county GIS configured for Pasco only." },
  TX: { name: "Texas", level: "official_source_research", note: "Federal layers only; no county/city GIS or code adoption source configured." },
  MD: { name: "Maryland", level: "official_source_research", note: "Federal layers only." },
  DC: { name: "Washington DC", level: "official_source_research", note: "Federal layers only." },
  MA: { name: "Massachusetts", level: "official_source_research", note: "Federal layers only." },
  NH: { name: "New Hampshire", level: "official_source_research", note: "Federal layers only." },
  ME: { name: "Maine", level: "official_source_research", note: "Federal layers only." },
  VT: { name: "Vermont", level: "official_source_research", note: "Federal layers only." },
  VA: { name: "Virginia", level: "official_source_research", note: "Federal layers only." },
  NC: { name: "North Carolina", level: "official_source_research", note: "Federal layers only." },
};

export type SourceRef = { org: string; title: string; url: string; tier: number };

export type ArcgisLayer = { url: string; title: string; fields: Record<string, string> };

export type CountyConfig = {
  key: string; // STATE:countyFIPS
  name: string;
  state: string;
  coverage: CoverageLevel;
  gisOrg: string;
  gisDisclaimer: string;
  layers: {
    parcel?: ArcgisLayer;
    cityLimits?: ArcgisLayer;
    zoning?: ArcgisLayer;
    futureLandUse?: ArcgisLayer;
    overlays?: Array<ArcgisLayer & { key: string }>;
  };
  /** Agencies for unincorporated territory. `stored` = cross-check against Permivio's verified authorities table. */
  unincorporatedAgencies: Array<{ role: string; name: string; source: SourceRef; stored?: boolean }>;
  localAmendments: { status: "none_found" | "unknown"; note: string; source: SourceRef | null };
  zoningCode: SourceRef;
  floodplain: SourceRef;
  rightOfWay?: SourceRef;
};

const PASCO_GIS = "https://pascogis.pascocountyfl.net/giswebmm/rest/services";

export const COUNTY_CONFIGS: Record<string, CountyConfig> = {
  "FL:12101": {
    key: "FL:12101",
    name: "Pasco County",
    state: "FL",
    coverage: "partial_structured",
    gisOrg: "Pasco County GIS",
    gisDisclaimer: "County GIS is maintained for reference; formal zoning/flood determinations may still be required for legal or entitlement reliance.",
    layers: {
      parcel: { url: `${PASCO_GIS}/PascoMapper/Parcels/MapServer/7`, title: "Pasco County Parcels (Property Appraiser)", fields: {} },
      cityLimits: { url: `${PASCO_GIS}/FeatureDatasets/Boundaries/MapServer/3`, title: "Pasco County City Limits", fields: {} },
      zoning: { url: `${PASCO_GIS}/FeatureDatasets/Landuse_Planning/MapServer/4`, title: "Pasco County Zoning", fields: { code: "ZN_TYPE" } },
      futureLandUse: { url: `${PASCO_GIS}/FeatureDatasets/Landuse_Planning/MapServer/1`, title: "Pasco County Future Land Use", fields: { code: "FLU_CODE", name: "DESCRIPTION" } },
      overlays: [
        { key: "mpud", url: `${PASCO_GIS}/FeatureDatasets/Landuse_Planning/MapServer/3`, title: "Master Planned Unit Development (MPUD)", fields: {} },
        { key: "transit_overlay", url: `${PASCO_GIS}/FeatureDatasets/Landuse_Planning/MapServer/5`, title: "Transit Centers Overlay", fields: {} },
        { key: "urban_concentration", url: `${PASCO_GIS}/FeatureDatasets/Landuse_Planning/MapServer/6`, title: "Urban Concentration Areas", fields: {} },
        { key: "historic_register", url: `${PASCO_GIS}/FeatureDatasets/Cultural/MapServer/9`, title: "Local Historical Register Sites", fields: {} },
        { key: "wetlands", url: `${PASCO_GIS}/FeatureDatasets/Natural_Features/MapServer/4`, title: "Wetlands", fields: {} },
        { key: "subsidence", url: `${PASCO_GIS}/FeatureDatasets/Natural_Features/MapServer/0`, title: "Subsidence Parcels", fields: {} },
      ],
    },
    unincorporatedAgencies: [
      { role: "building", name: "Pasco County Building Construction Services", stored: true, source: { org: "Pasco County", title: "Building Construction Services", url: "https://www.pascocountyfl.gov/services/building_construction/", tier: 3 } },
      { role: "planning_zoning", name: "Pasco County Planning & Development", source: { org: "Pasco County", title: "Land Development Code", url: "https://library.municode.com/fl/pasco_county/codes/land_development_code", tier: 3 } },
      { role: "fire", name: "Pasco County Fire Rescue (Fire Marshal)", source: { org: "Pasco County", title: "Pasco County Fire Rescue", url: "https://www.pascocountyfl.gov/", tier: 3 } },
      { role: "health", name: "Florida Department of Health in Pasco County (onsite sewage)", source: { org: "Florida Department of Health", title: "Onsite Sewage Programs", url: "https://www.floridahealth.gov/environmental-health/onsite-sewage/index.html", tier: 4 } },
    ],
    localAmendments: {
      status: "unknown",
      note: "No Pasco County technical amendment to the Florida Building Code was located by an automated source. Florida limits local technical amendments (s. 553.73, F.S.); confirm with Pasco County Building Construction Services.",
      source: { org: "Florida Building Commission", title: "Find an Amendment", url: "https://floridabuilding.org/bc/bc_default.aspx", tier: 2 },
    },
    zoningCode: { org: "Pasco County", title: "Land Development Code (Municode)", url: "https://library.municode.com/fl/pasco_county/codes/land_development_code", tier: 3 },
    floodplain: { org: "Pasco County", title: "Land Development Code — Floodplain Management", url: "https://library.municode.com/fl/pasco_county/codes/land_development_code", tier: 3 },
    rightOfWay: { org: "Pasco County", title: "Land Development Code — Access / Right-of-Way Use", url: "https://library.municode.com/fl/pasco_county/codes/land_development_code", tier: 3 },
  },
};

export type CodeVolume = { key: string; family: string; discipline: string; edition: string; effective: string | null; source: SourceRef; confirmPattern: RegExp | null; note?: string };

export type StateConfig = {
  state: string;
  codes: CodeVolume[];
  pendingEditionPattern?: { re: RegExp; note: string };
  buildingPermitStatute?: SourceRef & { confirmPattern: RegExp };
  productApproval?: SourceRef;
};

const FBC: SourceRef = { org: "Florida Building Commission", title: "Florida Building Commission — home page (effective edition notice)", url: "https://www.floridabuilding.org/c/default.aspx", tier: 2 };
const FBC_RE = /Florida Building Code, 8th Edition \(2023\), is December 31, 2023/i;

export const STATE_CONFIGS: Record<string, StateConfig> = {
  FL: {
    state: "FL",
    codes: [
      { key: "fbc_building", family: "Florida Building Code — Building", discipline: "building", edition: "8th Edition (2023)", effective: "2023-12-31", source: FBC, confirmPattern: FBC_RE },
      { key: "fbc_residential", family: "Florida Building Code — Residential", discipline: "residential", edition: "8th Edition (2023)", effective: "2023-12-31", source: FBC, confirmPattern: FBC_RE },
      { key: "fbc_existing", family: "Florida Building Code — Existing Building", discipline: "existing_building", edition: "8th Edition (2023)", effective: "2023-12-31", source: FBC, confirmPattern: FBC_RE },
      { key: "fbc_mechanical", family: "Florida Building Code — Mechanical", discipline: "mechanical", edition: "8th Edition (2023)", effective: "2023-12-31", source: FBC, confirmPattern: FBC_RE },
      { key: "fbc_plumbing", family: "Florida Building Code — Plumbing", discipline: "plumbing", edition: "8th Edition (2023)", effective: "2023-12-31", source: FBC, confirmPattern: FBC_RE },
      { key: "fbc_fuel_gas", family: "Florida Building Code — Fuel Gas", discipline: "fuel_gas", edition: "8th Edition (2023)", effective: "2023-12-31", source: FBC, confirmPattern: FBC_RE },
      { key: "fbc_energy", family: "Florida Building Code — Energy Conservation", discipline: "energy", edition: "8th Edition (2023)", effective: "2023-12-31", source: FBC, confirmPattern: FBC_RE },
      { key: "fbc_accessibility", family: "Florida Building Code — Accessibility", discipline: "accessibility", edition: "8th Edition (2023)", effective: "2023-12-31", source: FBC, confirmPattern: FBC_RE, note: "Applies to one- and two-family dwellings only where required by the code." },
      { key: "nec", family: "National Electrical Code (NFPA 70) as referenced by FBC 8th Edition", discipline: "electrical", edition: "Edition referenced by FBC 8th Edition — not confirmed from an automated source", effective: null, source: FBC, confirmPattern: null, note: "Confirm the NFPA 70 edition referenced in FBC–Building Chapter 27 / FBC–Residential Part VIII." },
      { key: "ffpc", family: "Florida Fire Prevention Code", discipline: "fire", edition: "Current edition not confirmed from an automated source", effective: null, source: { org: "Florida Division of State Fire Marshal", title: "Florida Fire Prevention Code", url: "https://www.myfloridacfo.com/division/sfm/", tier: 4 }, confirmPattern: null, note: "Generally not applied to one- and two-family dwelling plan review; confirm applicability." },
    ],
    pendingEditionPattern: { re: /9th Edition \(2026\)/i, note: "The Florida Building Commission lists a 9th Edition (2026) FBC as a draft/upcoming edition. The applicable edition depends on the permit application date — re-check before submission if applying on or after its effective date." },
    buildingPermitStatute: { org: "Florida Legislature", title: "Section 553.79, Florida Statutes — Permits; applications; issuance", url: "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0553/Sections/0553.79.html", tier: 4, confirmPattern: /permit/i },
    productApproval: { org: "Florida Building Commission", title: "Florida Product Approval (Rule 61G20-3, F.A.C.)", url: "https://www.floridabuilding.org/pr/pr_app_srch.aspx", tier: 2 },
  },
};

export function countyConfigFor(state: string | null, countyFips: string | null): CountyConfig | null {
  if (!state || !countyFips) return null;
  return COUNTY_CONFIGS[`${state.toUpperCase()}:${countyFips}`] ?? null;
}

export function coverageFor(state: string | null, countyFips: string | null): { level: CoverageLevel; note: string } {
  const county = countyConfigFor(state, countyFips);
  if (county) return { level: county.coverage, note: `${county.name}: county GIS parcel/zoning/land-use configured; FEMA + Census nationwide.` };
  const st = state ? STATE_COVERAGE[state.toUpperCase()] : undefined;
  if (st) return { level: st.level, note: st.note };
  return { level: "human_verification", note: "Outside launch geography — federal layers only; human verification required." };
}
