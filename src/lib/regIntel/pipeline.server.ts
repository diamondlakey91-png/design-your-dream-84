// PERMIVIO — Property & Jurisdiction research pipeline (server-only).
// Orchestrated workers, each bounded and deterministic: government GIS/API → parsing → facts.
// No generative AI is used in any worker; AI never decides boundaries, zones or verification.

import { censusGeographiesByAddress, censusGeographiesByPoint, type CensusGeography } from "@/lib/govGis.server";
import { COUNTY_CONFIGS, STATE_CONFIGS, countyConfigFor, coverageFor, type ArcgisLayer } from "./coverage";
import { decideVerification, recheckAfter, resolveGoverningAuthority, type Fact, type Conflict } from "./types";
import { arcgisAll, arcgisFirst, classifyFlood, epochToDate, type ArcgisResponse } from "./providers.shared";
import { normalizeScope, effectiveScope, SCOPE_LABEL, type ScopeAttribute } from "./scope";
import { evaluatePermitCandidates } from "./rules";

export const STEP_DEFS = [
  { key: "property", label: "Locating address & parcel" },
  { key: "boundary", label: "Checking county & municipal boundaries" },
  { key: "ahj", label: "Identifying permitting authorities" },
  { key: "flood", label: "Checking FEMA flood data" },
  { key: "zoning", label: "Researching zoning & land use" },
  { key: "codes", label: "Researching applicable codes" },
  { key: "permits", label: "Determining scope-specific permits" },
  { key: "reconcile", label: "Reconciling evidence" },
] as const;
export type StepKey = (typeof STEP_DEFS)[number]["key"];
export type StepState = { key: StepKey; label: string; status: "pending" | "running" | "done" | "warning" | "failed" | "skipped"; note?: string; ms?: number };

export type PipelineState = {
  address: string;
  postalCity: string | null;
  lat: number | null;
  lng: number | null;
  state: string | null;
  county: string | null;
  countyFips: string | null;
  place: string | null;
  placeStatistical: string | null;
  censusUrl: string | null;
  parcel: Record<string, unknown> | null;
  parcelUrl: string | null;
  incorporation: "incorporated" | "unincorporated" | "undetermined";
  flood: { zone: string | null; sfha: boolean | null; verification: "verified" | "needs_verification" | "potential" } | null;
  zoningCode: string | null;
  historic: boolean | null;
  confirmedSources: string[];
  scopeText: string | null;
  workType: string | null;
  projectType: string | null;
  scopeCorrections: Record<string, boolean>;
  hasSepticDocument: boolean;
  storedJurisdiction: { label: string | null; county: string | null; municipality: string | null; incorporated: boolean | null; status: string | null } | null;
};

export type Usage = { deterministic_calls: number; paid_data_calls: number; ai_calls: number; tokens: number; estimated_cost_usd: number; duration_ms: number };
export type StepResult = { facts: Fact[]; status: StepState["status"]; note?: string; escalations?: string[] };

const UA = { "User-Agent": "Permivio/1.0 (permitting research)", Accept: "application/json,text/html" };

async function getJson(url: string, usage: Usage): Promise<ArcgisResponse> {
  usage.deterministic_calls++;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { error: { message: `${r.status}` } };
    return (await r.json()) as ArcgisResponse;
  } catch (e) {
    return { error: { message: (e as Error).message } };
  }
}

async function getText(url: string, usage: Usage): Promise<string | null> {
  usage.deterministic_calls++;
  try {
    const r = await fetch(url, { headers: { ...UA, "User-Agent": "Mozilla/5.0 (compatible; Permivio/1.0)" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!r.ok) return null;
    const t = await r.text();
    return t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  } catch {
    return null;
  }
}

function pointQuery(layer: ArcgisLayer | { url: string }, lat: number, lng: number, extra = ""): string {
  return `${layer.url}/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json${extra}`;
}

const now = () => new Date().toISOString();

function mk(p: Omit<Fact, "retrieved_at" | "recheck_after" | "conflicts" | "limitation"> & { conflicts?: Conflict[]; limitation?: string | null }): Fact {
  return { ...p, conflicts: p.conflicts ?? [], limitation: p.limitation ?? null, retrieved_at: now(), recheck_after: recheckAfter(p.fact_type) };
}

// ------------------------------------------------------------------ workers

async function propertyWorker(s: PipelineState, u: Usage): Promise<StepResult> {
  let census: CensusGeography | null = null;
  try {
    u.deterministic_calls++;
    census = await censusGeographiesByAddress(s.address);
  } catch { census = null; }
  if (!census && s.lat !== null && s.lng !== null) {
    try { u.deterministic_calls++; census = await censusGeographiesByPoint(s.lat, s.lng); } catch { census = null; }
  }
  const facts: Fact[] = [];
  if (!census || census.lat === null || census.lng === null) {
    return { facts: [mk({ fact_type: "property", fact_key: "normalized_address", label: "Normalized address", value: { entered: s.address }, display_value: null, source_org: "U.S. Census Bureau", source_title: "Census Geocoder", source_url: null, provider: "census_geocoder", source_tier: 4, origin: "research", verification: "needs_verification", limitation: "Address could not be matched by the Census geocoder." })], status: "failed", note: "Address not matched", escalations: ["Address could not be matched to a location — correct the location."] };
  }
  s.lat = census.lat; s.lng = census.lng;
  s.state = census.stateAbbr; s.county = census.county; s.countyFips = census.countyFips;
  const p = census.place;
  const statistical = !!p && (p.lsad === "57" || p.funcstat === "S");
  s.place = p && !statistical ? p.name : null;
  s.placeStatistical = p && statistical ? p.name : null;
  s.censusUrl = census.sourceUrl;
  facts.push(mk({ fact_type: "property", fact_key: "normalized_address", label: "Normalized address", value: { entered: s.address, matched: census.matchedAddress }, display_value: census.matchedAddress ?? s.address, source_org: "U.S. Census Bureau", source_title: "Census Geocoder (Public_AR_Current)", source_url: census.sourceUrl, provider: "census_geocoder", source_tier: 4, origin: "research", verification: decideVerification({ tier: 4, hasValue: !!census.matchedAddress }) }));
  facts.push(mk({ fact_type: "property", fact_key: "coordinates", label: "Coordinates", value: { lat: census.lat, lng: census.lng }, display_value: `${census.lat.toFixed(6)}, ${census.lng.toFixed(6)}`, source_org: "U.S. Census Bureau", source_title: "Census Geocoder address-range interpolation", source_url: census.sourceUrl, provider: "census_geocoder", source_tier: 4, origin: "research", verification: "verified", limitation: "Interpolated along the street segment; parcel match below confirms the lot." }));

  const cfg = countyConfigFor(s.state, s.countyFips);
  if (cfg?.layers.parcel) {
    const url = pointQuery(cfg.layers.parcel, census.lat, census.lng);
    const attrs = arcgisFirst(await getJson(url, u));
    s.parcelUrl = url;
    if (attrs) {
      s.parcel = attrs;
      const site = String(attrs["SITE_ADDRESS"] ?? "").trim();
      const num = s.address.match(/^\s*(\d+)/)?.[1];
      const matches = !!num && site.startsWith(num);
      facts.push(mk({ fact_type: "property", fact_key: "parcel", label: "Parcel / APN", value: { parcel_id: attrs["HPARCEL"] ?? attrs["PARCEL_ID"] ?? null, site_address: site, acres: attrs["SITE_ACRES"] ?? null, subdivision: attrs["SUBDIVISION_NAME"] ?? null, land_use: attrs["LAND_USE_DESC"] ?? null, appraiser_update: epochToDate(attrs["LAST_UPDATE"]) }, display_value: String(attrs["HPARCEL"] ?? attrs["PARCEL_ID"] ?? ""), source_org: cfg.gisOrg, source_title: cfg.layers.parcel.title, source_url: url, provider: "county_arcgis_parcel", source_tier: 1, origin: "research", verification: decideVerification({ tier: 1, hasValue: true, ambiguous: !matches }), source_updated_at: attrs["LAST_UPDATE"] ? new Date(attrs["LAST_UPDATE"] as number).toISOString() : null, limitation: matches ? null : `Parcel site address "${site}" does not match the entered street number — confirm the lot.` }));
    } else {
      facts.push(mk({ fact_type: "property", fact_key: "parcel", label: "Parcel / APN", value: {}, display_value: null, source_org: cfg.gisOrg, source_title: cfg.layers.parcel.title, source_url: url, provider: "county_arcgis_parcel", source_tier: 1, origin: "research", verification: "needs_verification", limitation: "County parcel service returned no parcel at this point." }));
    }
  } else {
    facts.push(mk({ fact_type: "property", fact_key: "parcel", label: "Parcel / APN", value: {}, display_value: null, source_org: null, source_title: null, source_url: null, provider: "none_configured", source_tier: 7, origin: "research", verification: "needs_verification", limitation: `No county parcel provider configured for ${s.county ?? "this county"} (${coverageFor(s.state, s.countyFips).note})` }));
  }
  return { facts, status: s.parcel || !cfg ? "done" : "warning" };
}

async function boundaryWorker(s: PipelineState, u: Usage): Promise<StepResult> {
  const facts: Fact[] = [];
  const conflicts: Conflict[] = [];
  const cfg = countyConfigFor(s.state, s.countyFips);
  let countyCityHit: boolean | null = null;
  let countyUrl: string | null = null;
  if (cfg?.layers.cityLimits && s.lat !== null && s.lng !== null) {
    countyUrl = pointQuery(cfg.layers.cityLimits, s.lat, s.lng);
    const j = await getJson(countyUrl, u);
    if (j && !j.error) countyCityHit = arcgisAll(j).length > 0;
  }
  const parcelJur = s.parcel ? String(s.parcel["JURISDICTION_NAME"] ?? "").trim() : "";
  const censusAvailable = !!s.censusUrl;
  const r = resolveGoverningAuthority({ postalCity: s.postalCity, incorporatedPlace: s.place, county: s.county, boundaryDataAvailable: censusAvailable });
  if (countyCityHit !== null && censusAvailable && countyCityHit !== (r.status === "incorporated")) conflicts.push({ source: `${cfg!.gisOrg} City Limits`, says: countyCityHit ? "inside a city limit polygon" : "outside all city limits", url: countyUrl });
  if (parcelJur && censusAvailable) {
    const parcelInc = !/unincorporated/i.test(parcelJur);
    if (parcelInc !== (r.status === "incorporated")) conflicts.push({ source: `${cfg?.gisOrg ?? "County"} parcel jurisdiction`, says: parcelJur, url: s.parcelUrl });
  }
  s.incorporation = conflicts.length ? "undetermined" : r.status;
  facts.push(mk({ fact_type: "jurisdiction", fact_key: "county", label: "County", value: { county: s.county, fips: s.countyFips, state: s.state }, display_value: s.county ? `${s.county}, ${s.state}` : null, source_org: "U.S. Census Bureau", source_title: "TIGER county boundary at the geocoded point", source_url: s.censusUrl, provider: "census_tiger", source_tier: 4, origin: "research", verification: decideVerification({ tier: 4, hasValue: !!s.county }) }));
  const evid = [
    `Census TIGER: ${s.place ? `inside ${s.place}` : "not inside any incorporated place"}${s.placeStatistical ? ` (${s.placeStatistical} is a census-designated place with no government)` : ""}`,
    countyCityHit === null ? null : `${cfg!.gisOrg} City Limits layer: ${countyCityHit ? "point inside a city polygon" : "point outside all city polygons"}`,
    parcelJur ? `${cfg?.gisOrg} parcel record jurisdiction: ${parcelJur}` : null,
  ].filter(Boolean) as string[];
  facts.push(mk({ fact_type: "jurisdiction", fact_key: "municipal_status", label: "Municipal status", value: { status: s.incorporation, place: s.place, postal_city: s.postalCity, postal_city_controls: r.postalCityControls, evidence: evid }, display_value: s.incorporation === "undetermined" ? null : s.incorporation === "incorporated" ? `Incorporated — ${s.place}` : "Unincorporated", source_org: countyCityHit !== null ? `U.S. Census Bureau + ${cfg!.gisOrg}` : "U.S. Census Bureau", source_title: "Incorporated place boundaries at the point", source_url: countyUrl ?? s.censusUrl, provider: "census_tiger+county_city_limits", source_tier: countyCityHit !== null ? 1 : 4, origin: "research", verification: decideVerification({ tier: countyCityHit !== null ? 1 : 4, hasValue: s.incorporation !== "undetermined", conflicts }), conflicts }));
  if (s.postalCity) {
    facts.push(mk({ fact_type: "jurisdiction", fact_key: "mailing_city", label: "Mailing city vs permitting authority", value: { postal_city: s.postalCity, controls: r.postalCityControls }, display_value: r.postalCityControls === false ? `${s.postalCity} is the mailing city only — it is not the permitting authority` : r.postalCityControls ? `${s.postalCity} is also the governing municipality` : null, source_org: "U.S. Census Bureau", source_title: "TIGER incorporated places", source_url: s.censusUrl, provider: "census_tiger", source_tier: 4, origin: "research", verification: decideVerification({ tier: 4, hasValue: r.postalCityControls !== null, conflicts }) }));
  }
  return { facts, status: conflicts.length ? "warning" : censusAvailable ? "done" : "failed", escalations: conflicts.length ? ["Boundary sources disagree on municipal status — human verification required."] : [] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ahjWorker(s: PipelineState, _u: Usage, db: any): Promise<StepResult> {
  const facts: Fact[] = [];
  const cfg = countyConfigFor(s.state, s.countyFips);
  if (s.incorporation === "undetermined") {
    return { facts: [mk({ fact_type: "agency", fact_key: "building", label: "Building permitting authority", value: {}, display_value: null, source_org: null, source_title: null, source_url: null, provider: "ahj_resolver", source_tier: 7, origin: "research", verification: "needs_verification", limitation: "Municipal status is unresolved, so the building AHJ cannot be determined." })], status: "warning", escalations: ["Building AHJ unresolved because municipal status is unresolved."] };
  }
  if (s.incorporation === "incorporated") {
    facts.push(mk({ fact_type: "agency", fact_key: "building", label: "Building permitting authority", value: { municipality: s.place }, display_value: `${s.place} building department (or its designated provider)`, source_org: "U.S. Census Bureau", source_title: "Governing municipality from TIGER boundaries", source_url: s.censusUrl, provider: "ahj_resolver", source_tier: 4, origin: "research", verification: "needs_verification", limitation: "Municipality resolved from boundaries; its building department/contact is not configured — some cities contract building services to the county." }));
    return { facts, status: "warning" };
  }
  if (!cfg) {
    facts.push(mk({ fact_type: "agency", fact_key: "building", label: "Building permitting authority", value: { county: s.county }, display_value: `${s.county} building department (unincorporated)`, source_org: "U.S. Census Bureau", source_title: "Unincorporated territory from TIGER boundaries", source_url: s.censusUrl, provider: "ahj_resolver", source_tier: 4, origin: "research", verification: "needs_verification", limitation: "County agency directory not configured for this county." }));
    return { facts, status: "warning" };
  }
  for (const a of cfg.unincorporatedAgencies) {
    let stored: { official_name: string; verification: string; last_verified_at: string | null } | null = null;
    if (a.stored) {
      const { data } = await db.from("authorities").select("official_name,verification,last_verified_at,jurisdictions!inner(county,state,incorporated)").eq("role", a.role).eq("jurisdictions.state", cfg.state).ilike("jurisdictions.county", `${cfg.name.replace(/ County$/i, "")}%`).eq("jurisdictions.incorporated", false).limit(1);
      stored = (data ?? [])[0] ?? null;
    }
    const agrees = !!stored && stored.official_name.toLowerCase().includes(a.name.toLowerCase().split(" ").slice(0, 2).join(" "));
    const conflicts: Conflict[] = stored && !agrees ? [{ source: "Permivio verified authorities", says: stored.official_name }] : [];
    // Role assignment rests on boundary evidence (tier 1/4) + configured official source; verified only when a current human-verified record agrees.
    const verified = a.role === "building" && agrees && stored!.verification === "verified";
    facts.push(mk({ fact_type: "agency", fact_key: a.role, label: { building: "Building permitting authority", planning_zoning: "Planning / zoning authority", fire: "Fire authority", health: "Health / onsite sewage authority" }[a.role] ?? a.role, value: { name: a.name, basis: "Unincorporated territory → county agency", stored_record: stored?.official_name ?? null }, display_value: a.name, source_org: a.source.org, source_title: a.source.title, source_url: a.source.url, provider: stored ? "ahj_resolver+permivio_verified" : "ahj_resolver", source_tier: verified ? 5 : a.source.tier, origin: stored ? "stored" : "research", verification: verified ? "verified" : "needs_verification", conflicts, limitation: verified ? "Agency assignment follows from unincorporated status; matches Permivio's human-verified authority record." : "Agency assignment follows from unincorporated status; official agency responsibility not independently confirmed by an automated source." }));
  }
  if (s.parcel) {
    const w = String(s.parcel["WATERSERVICEAREAS"] ?? "").trim();
    const ww = String(s.parcel["WASTEWATERSERVICEAREAS"] ?? "").trim();
    if (w || ww) facts.push(mk({ fact_type: "agency", fact_key: "utility", label: "Water / wastewater service area", value: { water: w || null, wastewater: ww || null }, display_value: `Water: ${w || "—"} · Wastewater: ${ww || "—"}`, source_org: cfg.gisOrg, source_title: cfg.layers.parcel!.title, source_url: s.parcelUrl, provider: "county_arcgis_parcel", source_tier: 1, origin: "research", verification: "verified", limitation: "Service area does not prove a line is available at the lot." }));
  }
  return { facts, status: "done" };
}

const NFHL = ["https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer", "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer"];
const FEMA_COPY = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0";

async function floodWorker(s: PipelineState, u: Usage): Promise<StepResult> {
  if (s.lat === null || s.lng === null) return { facts: [], status: "skipped", note: "No coordinates" };
  let official: { attrs: Array<Record<string, unknown>>; nearby: Array<Record<string, unknown>>; url: string; panel: Record<string, unknown> | null } | null = null;
  for (const base of NFHL) {
    const url = pointQuery({ url: `${base}/28` }, s.lat, s.lng);
    const j = await getJson(url, u);
    if (j && !j.error) {
      const near = await getJson(pointQuery({ url: `${base}/28` }, s.lat, s.lng, "&distance=25&units=esriSRUnit_Meter"), u);
      const panel = arcgisFirst(await getJson(pointQuery({ url: `${base}/3` }, s.lat, s.lng), u));
      official = { attrs: arcgisAll(j), nearby: arcgisAll(near), url, panel };
      break;
    }
  }
  const facts: Fact[] = [];
  const conflicts: Conflict[] = [];
  const countyFema = s.parcel ? String(s.parcel["FEMA"] ?? "").trim() : "";
  const countyZones = countyFema ? countyFema.split(",").map((z) => z.trim().split("-")[0]!.trim()).filter(Boolean) : [];
  let cls, url: string, tier: number, org: string, title: string, panel: Record<string, unknown> | null = null;
  if (official) {
    cls = classifyFlood({ features: official.attrs, nearby: official.nearby, official: true });
    url = official.url; tier = 1; org = "FEMA"; title = "National Flood Hazard Layer — Flood Hazard Zones (layer 28)"; panel = official.panel;
  } else {
    const copyUrl = pointQuery({ url: FEMA_COPY }, s.lat, s.lng);
    const j = await getJson(copyUrl, u);
    const near = await getJson(pointQuery({ url: FEMA_COPY }, s.lat, s.lng, "&distance=25&units=esriSRUnit_Meter"), u);
    cls = classifyFlood({ features: j && !j.error ? arcgisAll(j) : null, nearby: arcgisAll(near), official: false });
    url = copyUrl; tier = 6; org = "FEMA NFHL via Esri Living Atlas (hosted copy)"; title = "USA Flood Hazard Areas (FEMA NFHL reduced set)";
  }
  if (cls.zone && countyZones.length && !countyZones.includes(cls.zone)) conflicts.push({ source: "County parcel FEMA attribute", says: countyFema, url: s.parcelUrl });
  if (countyZones.length > 1) conflicts.push({ source: "County parcel FEMA attribute", says: `Parcel spans multiple zones: ${countyFema}`, url: s.parcelUrl });
  const verification = decideVerification({ tier, hasValue: !!cls.zone, conflicts, ambiguous: cls.ambiguous });
  s.flood = { zone: cls.zone, sfha: cls.sfha, verification };
  const corroboration = countyFema ? `County parcel record FEMA attribute: ${countyFema}` : null;
  facts.push(mk({ fact_type: "flood", fact_key: "zone", label: "FEMA flood zone", value: { zone: cls.zone, subtype: cls.subtype, sfha: cls.sfha, floodway: cls.floodway, nearby_zones: cls.nearbyZones, ambiguous: cls.ambiguous, official_nfhl_reached: !!official, corroboration, dfirm_id: official?.attrs[0]?.["DFIRM_ID"] ?? null }, display_value: cls.zone ? `Zone ${cls.zone}` : null, source_org: org, source_title: title, source_url: url, provider: official ? "fema_nfhl" : "fema_nfhl_hosted_copy", source_tier: tier, origin: "research", verification, conflicts, limitation: `${cls.summary}${official ? "" : " The official FEMA NFHL service could not be reached from Permivio's research runtime; result read from a hosted copy of FEMA data and must be confirmed on FEMA's Map Service Center."}${corroboration ? ` ${corroboration}.` : ""} Mapping data does not replace a formal flood determination or elevation certificate.` }));
  facts.push(mk({ fact_type: "flood", fact_key: "sfha", label: "Special Flood Hazard Area", value: { sfha: cls.sfha }, display_value: cls.sfha === null ? null : cls.sfha ? "Yes — inside SFHA" : "No — not in a mapped SFHA (flood risk not zero)", source_org: org, source_title: title, source_url: url, provider: official ? "fema_nfhl" : "fema_nfhl_hosted_copy", source_tier: tier, origin: "research", verification, conflicts }));
  facts.push(mk({ fact_type: "flood", fact_key: "floodway", label: "Regulatory floodway", value: { floodway: cls.floodway }, display_value: cls.floodway === null ? (cls.zone ? "Not designated at this point" : null) : cls.floodway ? "Yes" : "No", source_org: org, source_title: title, source_url: url, provider: official ? "fema_nfhl" : "fema_nfhl_hosted_copy", source_tier: tier, origin: "research", verification: cls.zone ? verification : "needs_verification" }));
  facts.push(mk({ fact_type: "flood", fact_key: "bfe", label: "Base flood elevation", value: { bfe: cls.staticBfe }, display_value: cls.staticBfe !== null ? `${cls.staticBfe} ft` : cls.zone === "A" ? "None published (Zone A — approximate study)" : null, source_org: org, source_title: title, source_url: url, provider: official ? "fema_nfhl" : "fema_nfhl_hosted_copy", source_tier: tier, origin: "research", verification: cls.staticBfe !== null ? verification : "needs_verification", limitation: cls.zone === "A" ? "Zone A has no FEMA-published BFE; a BFE may need to be established by the floodplain administrator or an engineer." : null }));
  const panelId = panel ? String(panel["FIRM_PAN"] ?? "") : "";
  facts.push(mk({ fact_type: "flood", fact_key: "panel", label: "FIRM panel / effective date", value: { panel: panelId || null, effective: panel ? epochToDate(panel["EFF_DATE"]) : null }, display_value: panelId ? `${panelId}${panel?.["EFF_DATE"] ? ` · effective ${epochToDate(panel["EFF_DATE"])}` : ""}` : null, source_org: "FEMA", source_title: "NFHL FIRM Panels (layer 3)", source_url: official ? `${NFHL[0]}/3` : "https://msc.fema.gov/portal/search", provider: "fema_nfhl", source_tier: official ? 1 : 4, origin: "research", verification: panelId ? "verified" : "needs_verification", effective_date: panel ? epochToDate(panel["EFF_DATE"]) : null, limitation: panelId ? null : "Panel number and effective date need the official FEMA NFHL / Map Service Center (not reachable from the research runtime)." }));
  return { facts, status: verification === "verified" ? "done" : "warning", escalations: verification === "verified" ? [] : ["Flood result needs confirmation against the official FEMA Map Service Center."] };
}

async function zoningWorker(s: PipelineState, u: Usage): Promise<StepResult> {
  const cfg = countyConfigFor(s.state, s.countyFips);
  const facts: Fact[] = [];
  if (!cfg || s.lat === null || s.lng === null || s.incorporation !== "unincorporated") {
    const why = !cfg ? `No zoning GIS configured for ${s.county ?? "this county"}` : s.incorporation === "incorporated" ? `Zoning is controlled by ${s.place}; its zoning GIS is not configured` : "Zoning jurisdiction unresolved";
    facts.push(mk({ fact_type: "zoning", fact_key: "district", label: "Zoning district", value: {}, display_value: null, source_org: null, source_title: null, source_url: null, provider: "none_configured", source_tier: 7, origin: "research", verification: "needs_verification", limitation: `${why} — research official jurisdiction sources.` }));
    return { facts, status: "warning" };
  }
  const zUrl = pointQuery(cfg.layers.zoning!, s.lat, s.lng);
  const zAll = arcgisAll(await getJson(zUrl, u));
  const codes = [...new Set(zAll.map((a) => String(a[cfg.layers.zoning!.fields["code"]!] ?? "").trim()).filter(Boolean))];
  const parcelZ = s.parcel ? String(s.parcel["ZONING"] ?? "").trim() : "";
  const conflicts: Conflict[] = [];
  if (parcelZ && codes[0] && !parcelZ.toUpperCase().startsWith(codes[0].toUpperCase())) conflicts.push({ source: "County parcel zoning attribute", says: parcelZ, url: s.parcelUrl });
  if (codes.length > 1) conflicts.push({ source: cfg.layers.zoning!.title, says: `Point intersects multiple districts: ${codes.join(", ")}` });
  s.zoningCode = codes[0] ?? null;
  facts.push(mk({ fact_type: "zoning", fact_key: "district", label: "Zoning district", value: { code: s.zoningCode, zoning_jurisdiction: `${cfg.name} (unincorporated)`, parcel_attribute: parcelZ || null, last_edited: epochToDate(zAll[0]?.["last_edited_date"]) }, display_value: s.zoningCode, source_org: cfg.gisOrg, source_title: cfg.layers.zoning!.title, source_url: zUrl, provider: "county_arcgis_zoning", source_tier: 1, origin: "research", verification: decideVerification({ tier: 1, hasValue: !!s.zoningCode, conflicts }), conflicts, source_updated_at: zAll[0]?.["last_edited_date"] ? new Date(zAll[0]["last_edited_date"] as number).toISOString() : null, limitation: cfg.gisDisclaimer }));
  facts.push(mk({ fact_type: "zoning", fact_key: "district_name", label: "Zoning district name", value: { code: s.zoningCode }, display_value: null, source_org: cfg.zoningCode.org, source_title: cfg.zoningCode.title, source_url: cfg.zoningCode.url, provider: "county_zoning_code", source_tier: 3, origin: "research", verification: "needs_verification", limitation: `The GIS layer publishes only the code "${s.zoningCode ?? "?"}". The district's full name and permitted uses must be read from the Land Development Code.` }));
  const fUrl = pointQuery(cfg.layers.futureLandUse!, s.lat, s.lng);
  const f = arcgisFirst(await getJson(fUrl, u));
  facts.push(mk({ fact_type: "future_land_use", fact_key: "designation", label: "Future land use", value: { code: f?.["FLU_CODE"] ?? null, name: f?.["DESCRIPTION"] ?? null }, display_value: f ? `${f["FLU_CODE"]} — ${f["DESCRIPTION"]}` : null, source_org: cfg.gisOrg, source_title: cfg.layers.futureLandUse!.title, source_url: fUrl, provider: "county_arcgis_flu", source_tier: 1, origin: "research", verification: decideVerification({ tier: 1, hasValue: !!f }), source_updated_at: f?.["last_edited_date"] ? new Date(f["last_edited_date"] as number).toISOString() : null, limitation: "Future land use is the comprehensive-plan designation — distinct from zoning." }));
  const hits: string[] = [];
  for (const o of cfg.layers.overlays ?? []) {
    const url = pointQuery(o, s.lat, s.lng);
    const j = await getJson(url, u);
    const hit = j && !j.error ? arcgisAll(j).length > 0 : null;
    if (o.key === "historic_register") s.historic = hit;
    if (hit) hits.push(o.title);
    facts.push(mk({ fact_type: "overlay", fact_key: o.key, label: o.title, value: { intersects: hit }, display_value: hit === null ? null : hit ? "Intersects" : "Not mapped at this point", source_org: cfg.gisOrg, source_title: o.title, source_url: url, provider: "county_arcgis_overlay", source_tier: 1, origin: "research", verification: hit === null ? "needs_verification" : "verified" }));
  }
  if (s.parcel) {
    const wind = String(s.parcel["WINDCODE"] ?? "").trim();
    if (wind) facts.push(mk({ fact_type: "special_condition", fact_key: "wind", label: "Design wind speed (county map)", value: { raw: wind }, display_value: wind.replace(/-100/g, "").replace(/RC/g, "Risk Cat. ").replace(/-/g, ": ") + " mph", source_org: cfg.gisOrg, source_title: "Wind Code risk-category layers / parcel attribute", source_url: s.parcelUrl, provider: "county_arcgis_parcel", source_tier: 1, origin: "research", verification: "verified", limitation: "Designer must confirm ultimate design wind speed per FBC Figure 1609.3." }));
    const mob = String(s.parcel["MOBILITYFeeArea"] ?? "").trim();
    if (mob) facts.push(mk({ fact_type: "special_condition", fact_key: "mobility_fee", label: "Mobility fee area", value: { area: mob, assessment: s.parcel["MOBILITYAssessmentAreaName"] ?? null }, display_value: mob, source_org: cfg.gisOrg, source_title: cfg.layers.parcel!.title, source_url: s.parcelUrl, provider: "county_arcgis_parcel", source_tier: 1, origin: "research", verification: "verified", limitation: "Fee amounts are not researched here." }));
    const insp = String(s.parcel["BLDGINSP"] ?? "").trim();
    if (insp) facts.push(mk({ fact_type: "special_condition", fact_key: "inspection_zone", label: "Building inspection zone", value: { zone: insp }, display_value: insp, source_org: cfg.gisOrg, source_title: cfg.layers.parcel!.title, source_url: s.parcelUrl, provider: "county_arcgis_parcel", source_tier: 1, origin: "research", verification: "verified" }));
  }
  return { facts, status: conflicts.length ? "warning" : "done", escalations: conflicts.length ? ["Zoning sources disagree — human verification required."] : [] };
}

async function codesWorker(s: PipelineState, u: Usage): Promise<StepResult> {
  const st = s.state ? STATE_CONFIGS[s.state] : undefined;
  const facts: Fact[] = [];
  if (!st) {
    facts.push(mk({ fact_type: "code", fact_key: "building", label: "Applicable building code", value: {}, display_value: null, source_org: null, source_title: null, source_url: null, provider: "none_configured", source_tier: 7, origin: "research", verification: "needs_verification", limitation: `No code-adoption source configured for ${s.state ?? "this state"}. Do not assume the newest model code.` }));
    return { facts, status: "warning" };
  }
  const pages = new Map<string, string | null>();
  for (const v of st.codes) if (!pages.has(v.source.url)) pages.set(v.source.url, await getText(v.source.url, u));
  for (const v of st.codes) {
    const text = pages.get(v.source.url) ?? null;
    const confirmed = !!(v.confirmPattern && text && v.confirmPattern.test(text));
    const excerpt = confirmed && text ? text.slice(Math.max(0, text.search(v.confirmPattern!) - 20), text.search(v.confirmPattern!) + 110).trim() : null;
    facts.push(mk({ fact_type: "code", fact_key: v.key, label: v.family, value: { family: v.family, discipline: v.discipline, edition: v.edition, effective: v.effective, excerpt, note: v.note ?? null }, display_value: v.edition, source_org: v.source.org, source_title: v.source.title, source_url: v.source.url, provider: "state_code_adoption", source_tier: v.source.tier, origin: "research", verification: confirmed ? "verified" : "needs_verification", effective_date: v.effective, limitation: confirmed ? (v.note ?? null) : `${v.note ? v.note + " " : ""}Adoption text was not confirmed from the official page during this run.` }));
  }
  if (st.pendingEditionPattern) {
    const text = [...pages.values()].join(" ");
    if (st.pendingEditionPattern.re.test(text)) facts.push(mk({ fact_type: "special_condition", fact_key: "pending_code_edition", label: "Upcoming code edition", value: {}, display_value: "9th Edition (2026) FBC listed as upcoming", source_org: "Florida Building Commission", source_title: "Florida Building Code menu", source_url: st.codes[0]!.source.url, provider: "state_code_adoption", source_tier: 2, origin: "research", verification: "needs_verification", limitation: st.pendingEditionPattern.note }));
  }
  const cfg = countyConfigFor(s.state, s.countyFips);
  facts.push(mk({ fact_type: "local_amendment", fact_key: "building", label: "Local technical amendments", value: { status: cfg?.localAmendments.status ?? "unknown" }, display_value: cfg ? (cfg.localAmendments.status === "none_found" ? "None found" : "Not established") : null, source_org: cfg?.localAmendments.source?.org ?? null, source_title: cfg?.localAmendments.source?.title ?? null, source_url: cfg?.localAmendments.source?.url ?? null, provider: "local_amendment_research", source_tier: cfg?.localAmendments.source?.tier ?? 7, origin: "research", verification: "needs_verification", limitation: cfg?.localAmendments.note ?? "No local amendment source configured for this jurisdiction." }));
  return { facts, status: facts.some((f) => f.fact_type === "code" && f.verification !== "verified") ? "warning" : "done" };
}

async function permitsWorker(s: PipelineState, u: Usage): Promise<StepResult> {
  const facts: Fact[] = [];
  const st = s.state ? STATE_CONFIGS[s.state] ?? null : null;
  const confirmed = new Set(s.confirmedSources);
  if (st?.buildingPermitStatute) {
    const t = await getText(st.buildingPermitStatute.url, u);
    if (t && /553\.79/.test(t) && st.buildingPermitStatute.confirmPattern.test(t)) confirmed.add("building_permit_statute");
  }
  s.confirmedSources = [...confirmed];
  const scope = normalizeScope({ scopeText: s.scopeText, workType: s.workType, projectType: s.projectType });
  const eff = effectiveScope(scope.attributes, s.scopeCorrections);
  facts.push(mk({ fact_type: "scope_attribute", fact_key: "_original", label: "Original scope text", value: { text: scope.original, work_type: s.workType, project_type: s.projectType }, display_value: scope.original || null, source_org: "Project record", source_title: "Customer-entered scope", source_url: null, provider: "project_record", source_tier: 5, origin: "stored", verification: "needs_verification" }));
  for (const a of scope.attributes) {
    facts.push(mk({ fact_type: "scope_attribute", fact_key: `derived:${a.key}`, label: SCOPE_LABEL[a.key], value: { key: a.key, value: a.value, origin: a.origin, evidence: a.evidence, effective: eff.has(a.key) }, display_value: eff.has(a.key) ? "Yes" : "No (corrected)", source_org: "Permivio scope rules", source_title: "Deterministic scope normalization", source_url: null, provider: "scope_rules", source_tier: 7, origin: "research", verification: "potential", limitation: "Derived from the scope text — confirm or correct." }));
  }
  const cands = evaluatePermitCandidates({
    state: s.state, county: countyConfigFor(s.state, s.countyFips), stateCfg: st, incorporation: s.incorporation,
    scope: eff as Set<ScopeAttribute>, flood: s.flood, zoning: { code: s.zoningCode }, historic: s.historic,
    waterProvider: s.parcel ? String(s.parcel["WATERSERVICEAREAS"] ?? "") || null : null,
    wastewaterProvider: s.parcel ? String(s.parcel["WASTEWATERSERVICEAREAS"] ?? "") || null : null,
    hasSepticDocument: s.hasSepticDocument, confirmedSources: confirmed,
  });
  for (const c of cands) {
    facts.push(mk({ fact_type: "permit_candidate", fact_key: c.key, label: c.name, value: { ...c }, display_value: c.agency, source_org: c.source?.org ?? null, source_title: c.source?.title ?? null, source_url: c.source?.url ?? null, provider: "permit_rules_engine", source_tier: c.source?.tier ?? 7, origin: "research", verification: c.verification, limitation: c.note ?? null }));
  }
  return { facts, status: cands.length ? "done" : "warning" };
}

function reconcileWorker(s: PipelineState): StepResult {
  const facts: Fact[] = [];
  if (s.storedJurisdiction) {
    const sj = s.storedJurisdiction;
    const researched = s.incorporation === "unincorporated" ? `${s.county?.replace(/ County$/i, "")} County (Unincorporated)` : s.place;
    const storedLabel = sj.label ?? null;
    const agrees = !!storedLabel && !!researched && storedLabel.toLowerCase().includes((s.county ?? "").replace(/ County$/i, "").toLowerCase()) && (s.incorporation !== "unincorporated" || /unincorporated/i.test(storedLabel));
    facts.push(mk({ fact_type: "jurisdiction", fact_key: "stored_record_comparison", label: "Existing project record vs research", value: { stored: sj, researched }, display_value: agrees ? "Research independently agrees with the existing record" : "Research differs from the existing record", source_org: "Project record", source_title: "Previously stored jurisdiction confirmation", source_url: null, provider: "reconciler", source_tier: 5, origin: "stored", verification: agrees ? "verified" : "needs_verification", conflicts: agrees ? [] : [{ source: "Existing project record", says: storedLabel ?? "(none)" }] }));
  }
  return { facts, status: "done" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runWorker(key: StepKey, s: PipelineState, u: Usage, db: any): Promise<StepResult> {
  switch (key) {
    case "property": return propertyWorker(s, u);
    case "boundary": return boundaryWorker(s, u);
    case "ahj": return ahjWorker(s, u, db);
    case "flood": return floodWorker(s, u);
    case "zoning": return zoningWorker(s, u);
    case "codes": return codesWorker(s, u);
    case "permits": return permitsWorker(s, u);
    case "reconcile": return reconcileWorker(s);
  }
}

export { COUNTY_CONFIGS };
