// PERMIVIO — Property & Jurisdiction research pipeline (server-only).
// Orchestrated workers, each bounded and deterministic: government GIS/API → parsing → facts.
// No generative AI is used in any worker; AI never decides boundaries, zones or verification.

import { censusGeographiesByAddress, censusGeographiesByPoint, type CensusGeography } from "@/lib/govGis.server";
import { COUNTY_CONFIGS, STATE_CONFIGS, countyConfigFor, coverageFor, type ArcgisLayer, type StateConfig } from "./coverage";
import { decideVerification, recheckAfter, resolveGoverningAuthority, type Fact, type Conflict } from "./types";
import { arcgisAll, arcgisFirst, classifyFlood, epochToDate, floodPosition, pickPanel, reconcileEditions, parseBcisRows, withRetry, PROVENANCE_LABEL, type ArcgisResponse, type HealthEvent, type SourceProvenance, type EditionEvidence } from "./providers.shared";
import { codeApplicability, APPLICABILITY_LABEL } from "./codeStack";
import { normalizeScope, effectiveScope, SCOPE_LABEL, type ScopeAttribute } from "./scope";
import { seedFor, amendmentPolicyFor, LOCAL_ADOPTION_STATES } from "./stateAdoptions";
import { resolveFamily, reconcileLocal, applicableCodeDate, TEMPORAL_LABEL, SOURCE_TYPE_LABEL, type CodeEvidence, type CodeFamily, type SourceType } from "./codeTemporal";
import { resolveGoverningUnit, matchDotGov, classifyLink, govNameTokens, type GoverningUnit, type DotGovRow, type GeoUnit } from "./nationalAhj";
import { evaluatePermitCandidates, REQUIREMENT_TYPE_LABEL } from "./rules";
import { adoptionLinkScore, extractAdoptionStatements, classifySourceType, toEvidence, htmlToText, statePreemptionCue } from "./evidenceFollower";
import { extractAuthorityRelations, resolveAuthorityGraph, authorityLinkScore, FUNCTION_LABEL, type AuthorityEdge, type AuthorityFunction, type GraphNode } from "./authorityGraph";
import { classifyDocKind, documentDates, documentAuthority, type DocEvidence, type DocKind } from "./officialDocs";

export const STEP_DEFS = [
  { key: "property", label: "Locating address & parcel" },
  { key: "boundary", label: "Checking county & municipal boundaries" },
  { key: "ahj", label: "Identifying permitting authorities" },
  { key: "flood", label: "Checking FEMA flood data" },
  { key: "zoning", label: "Researching zoning & land use" },
  { key: "codes", label: "Researching applicable codes" },
  { key: "local", label: "Researching local code adoption & amendments" },
  { key: "permits", label: "Determining scope-specific permits" },
  { key: "reconcile", label: "Reconciling evidence" },
] as const;
export type StepKey = (typeof STEP_DEFS)[number]["key"];
export type StepState = { key: StepKey; label: string; status: "pending" | "running" | "done" | "warning" | "failed" | "skipped"; note?: string; ms?: number };

export type PipelineState = {
  /** Earliest permit application date — drives the Applicable Code Date. */
  applicationDate?: string | null;
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
  geo?: { place: GeoUnit; countySub: GeoUnit } | null;
  unit?: GoverningUnit | null;
  jurisdictionKey?: string | null;
  discovered?: Array<{ category: string; url: string; title: string; trust: string; host: string; meta?: Record<string, unknown> | object }> | null;
  requestedBy?: string | null;
  projectId?: string | null;
  /** Agency the authority graph found administering building / zoning (may differ from the governing unit). */
  buildingAgency?: string | null;
  zoningAgency?: string | null;
  storedJurisdiction: { label: string | null; county: string | null; municipality: string | null; incorporated: boolean | null; status: string | null } | null;
};

export type Usage = { deterministic_calls: number; gis_calls: number; paid_data_calls: number; ai_calls: number; tokens: number; estimated_cost_usd: number; duration_ms: number; retries: number; cache_hits: number; pages_read?: number; documents_read?: number; duplicates_skipped?: number; conflicts_resolved?: number };
export type StepResult = {
  facts: Fact[]; status: StepState["status"]; note?: string; escalations?: string[];
  /** Provider health observed in this step (tracked separately from facts). */
  health?: HealthEvent[];
  /** fact keys ("type:key") whose authoritative source was unavailable — keep a prior verified value if one exists. */
  sourceUnavailable?: string[];
};

const UA = { "User-Agent": "Permivio/1.0 (permitting research)", Accept: "application/json,text/html" };

type Net = { u: Usage; health: HealthEvent[]; unreadableDocs?: Array<{ url: string; title: string; reason: string }> };
const net = (u: Usage): Net => ({ u, health: [] });

function track(n: Net, provider: string, label: string, endpoint: string, ok: boolean, attempts: number, ms: number, error?: string | null) {
  const prev = n.health.find((h) => h.provider === provider);
  if (prev) { prev.ok = prev.ok || ok; prev.attempts += attempts; prev.ms += ms; if (!ok && !prev.ok) prev.error = error ?? prev.error; return; }
  n.health.push({ provider, label, endpoint, ok, attempts, ms, error: ok ? null : error ?? "failed" });
}

/** ArcGIS JSON with bounded retry; a non-JSON / 5xx / network failure is transient, an ArcGIS error body is not. */
async function getJson(n: Net, url: string, provider = "gis", label = "GIS service", retries = 2): Promise<ArcgisResponse> {
  const t0 = Date.now();
  const r = await withRetry<ArcgisResponse>(async () => {
    n.u.deterministic_calls++; n.u.gis_calls++;
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { ok: false, retryable: res.status === 429 || res.status >= 500, value: { error: { message: `HTTP ${res.status}` } }, error: `HTTP ${res.status}` };
      const txt = await res.text();
      try {
        const j = JSON.parse(txt) as ArcgisResponse;
        if (j && j.error) return { ok: false, retryable: true, value: j, error: j.error.message ?? "service error" };
        return { ok: true, retryable: false, value: j };
      } catch { return { ok: false, retryable: true, value: { error: { message: "non-JSON response" } }, error: "non-JSON response" }; }
    } catch (e) { return { ok: false, retryable: true, value: { error: { message: (e as Error).message } }, error: (e as Error).message }; }
  }, { max: retries + 1, baseMs: 500 });
  n.u.retries += r.attempts - 1;
  track(n, provider, label, url.split("?")[0]!, r.ok, r.attempts, Date.now() - t0, r.error);
  return r.value;
}

async function getText(n: Net, url: string, provider = "web", label = "Official web page"): Promise<string | null> {
  const t0 = Date.now();
  const r = await withRetry<string | null>(async () => {
    n.u.deterministic_calls++;
    try {
      const res = await fetch(url, { headers: { ...UA, "User-Agent": "Mozilla/5.0 (compatible; Permivio/1.0)" }, signal: AbortSignal.timeout(20000), redirect: "follow" });
      if (!res.ok) return { ok: false, retryable: res.status === 429 || res.status >= 500, value: null, error: `HTTP ${res.status}` };
      const t = await res.text();
      return { ok: true, retryable: false, value: t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&rdquo;|&ldquo;/g, '"').replace(/\s+/g, " ") };
    } catch (e) { return { ok: false, retryable: true, value: null, error: (e as Error).message }; }
  }, { max: 2, baseMs: 600 });
  n.u.retries += r.attempts - 1;
  track(n, provider, label, url.split("?")[0]!, r.ok, r.attempts, Date.now() - t0, r.error);
  return r.value;
}

async function getRaw(n: Net, url: string, init: RequestInit, provider: string, label: string): Promise<{ html: string | null; cookie: string | null }> {
  const t0 = Date.now();
  n.u.deterministic_calls++;
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": "Mozilla/5.0 (compatible; Permivio/1.0)", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000), redirect: "follow" });
    const ok = res.ok;
    track(n, provider, label, url.split("?")[0]!, ok, 1, Date.now() - t0, ok ? null : `HTTP ${res.status}`);
    const setCookie = res.headers.get("set-cookie");
    return { html: ok ? await res.text() : null, cookie: setCookie ? setCookie.split(/,(?=[^;]+=)/).map((c) => c.split(";")[0]).join("; ") : null };
  } catch (e) {
    track(n, provider, label, url.split("?")[0]!, false, 1, Date.now() - t0, (e as Error).message);
    return { html: null, cookie: null };
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

async function propertyWorker(s: PipelineState, n: Net): Promise<StepResult> {
  let census: CensusGeography | null = null;
  const t0 = Date.now();
  for (let i = 0; i < 2 && !census; i++) {
    try { n.u.deterministic_calls++; census = await censusGeographiesByAddress(s.address); } catch { census = null; }
    if (!census && i === 0) n.u.retries++;
  }
  if (!census && s.lat !== null && s.lng !== null) {
    try { n.u.deterministic_calls++; census = await censusGeographiesByPoint(s.lat, s.lng); } catch { census = null; }
  }
  track(n, "census_geocoder", "U.S. Census Geocoder", "https://geocoding.geo.census.gov", !!census, 1, Date.now() - t0, census ? null : "no match or unavailable");
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
  s.geo = { place: p ? { name: p.name, lsad: p.lsad, funcstat: p.funcstat, geoid: p.geoid } : null, countySub: census.countySubdivision ? { name: census.countySubdivision.name, lsad: census.countySubdivision.lsad, funcstat: census.countySubdivision.funcstat, geoid: census.countySubdivision.geoid } : null };
  facts.push(mk({ fact_type: "property", fact_key: "normalized_address", label: "Normalized address", value: { entered: s.address, matched: census.matchedAddress }, display_value: census.matchedAddress ?? s.address, source_org: "U.S. Census Bureau", source_title: "Census Geocoder (Public_AR_Current)", source_url: census.sourceUrl, provider: "census_geocoder", source_tier: 4, origin: "research", verification: decideVerification({ tier: 4, hasValue: !!census.matchedAddress }) }));
  facts.push(mk({ fact_type: "property", fact_key: "coordinates", label: "Coordinates", value: { lat: census.lat, lng: census.lng }, display_value: `${census.lat.toFixed(6)}, ${census.lng.toFixed(6)}`, source_org: "U.S. Census Bureau", source_title: "Census Geocoder address-range interpolation", source_url: census.sourceUrl, provider: "census_geocoder", source_tier: 4, origin: "research", verification: "verified", limitation: "Interpolated along the street segment; parcel match below confirms the lot." }));

  const cfg = countyConfigFor(s.state, s.countyFips);
  if (cfg?.layers.parcel) {
    const url = pointQuery(cfg.layers.parcel, census.lat, census.lng);
    const attrs = arcgisFirst(await getJson(n, url, "county_gis", "County GIS"));
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

async function boundaryWorker(s: PipelineState, n: Net): Promise<StepResult> {
  const facts: Fact[] = [];
  const conflicts: Conflict[] = [];
  const cfg = countyConfigFor(s.state, s.countyFips);
  const censusAvailable = !!s.censusUrl;
  const unit = resolveGoverningUnit({ state: s.state, county: s.county, countyFips: s.countyFips, place: s.geo?.place ?? null, countySubdivision: s.geo?.countySub ?? null });
  const govIsLocal = unit.level !== "county" && unit.level !== "undetermined";
  // Optional local corroboration from a discovered/known county GIS provider (one provider among many).
  let countyCityHit: boolean | null = null;
  let countyUrl: string | null = null;
  if (cfg?.layers.cityLimits && s.lat !== null && s.lng !== null) {
    countyUrl = pointQuery(cfg.layers.cityLimits, s.lat, s.lng);
    const j = await getJson(n, countyUrl, "county_gis", "County GIS");
    if (j && !j.error) countyCityHit = arcgisAll(j).length > 0;
  }
  const parcelJur = s.parcel ? String(s.parcel["JURISDICTION_NAME"] ?? "").trim() : "";
  if (countyCityHit !== null && censusAvailable && countyCityHit !== (unit.level === "municipality")) conflicts.push({ source: `${cfg!.gisOrg} City Limits`, says: countyCityHit ? "inside a city limit polygon" : "outside all city limits", url: countyUrl });
  if (parcelJur && censusAvailable && (!/unincorporated/i.test(parcelJur)) !== (unit.level === "municipality")) conflicts.push({ source: `${cfg?.gisOrg ?? "County"} parcel jurisdiction`, says: parcelJur, url: s.parcelUrl });
  s.unit = conflicts.length ? { ...unit, level: "undetermined", name: null } : unit;
  s.incorporation = !censusAvailable || conflicts.length || unit.level === "undetermined" ? "undetermined" : govIsLocal ? "incorporated" : "unincorporated";
  s.place = govIsLocal && !conflicts.length ? unit.name : null;
  s.jurisdictionKey = s.unit.name && s.state ? `${s.state}:${s.unit.level}:${s.unit.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : null;
  facts.push(mk({ fact_type: "jurisdiction", fact_key: "state", label: "State", value: { state: s.state }, display_value: s.state, source_org: "U.S. Census Bureau", source_title: "TIGER states", source_url: s.censusUrl, provider: "census_tiger", source_tier: 4, origin: "research", verification: decideVerification({ tier: 4, hasValue: !!s.state }) }));
  facts.push(mk({ fact_type: "jurisdiction", fact_key: "county", label: "County", value: { county: s.county, fips: s.countyFips, state: s.state }, display_value: s.county ? `${s.county}, ${s.state}` : null, source_org: "U.S. Census Bureau", source_title: "TIGER county boundary at the geocoded point", source_url: s.censusUrl, provider: "census_tiger", source_tier: 4, origin: "research", verification: decideVerification({ tier: 4, hasValue: !!s.county }) }));
  const evid = [
    `Census TIGER incorporated place: ${s.geo?.place ? `${s.geo.place.name}${s.geo.place.lsad === "57" ? " (census-designated place — no government)" : ""}` : "none"}`,
    `Census TIGER county subdivision: ${s.geo?.countySub ? `${s.geo.countySub.name}${s.geo.countySub.funcstat === "A" ? " (active government)" : " (not a functioning government)"}` : "none"}`,
    countyCityHit === null ? null : `${cfg!.gisOrg} City Limits layer: ${countyCityHit ? "inside a city polygon" : "outside all city polygons"}`,
    parcelJur ? `${cfg?.gisOrg} parcel record jurisdiction: ${parcelJur}` : null,
  ].filter(Boolean) as string[];
  const tier = countyCityHit !== null ? 1 : 4;
  facts.push(mk({ fact_type: "jurisdiction", fact_key: "municipal_status", label: "Governing jurisdiction", value: { level: s.unit.level, name: s.unit.name, kind: s.unit.kind, basis: unit.basis, evidence: evid, state_note: unit.stateNote }, display_value: s.unit.level === "undetermined" ? null : s.unit.level === "county" ? `Unincorporated ${s.county}` : `${s.unit.name} (${s.unit.kind})`, source_org: countyCityHit !== null ? `U.S. Census Bureau + ${cfg!.gisOrg}` : "U.S. Census Bureau", source_title: "Incorporated places, county subdivisions and counties at the point", source_url: countyUrl ?? s.censusUrl, provider: "census_tiger", source_tier: tier, origin: "research", verification: decideVerification({ tier, hasValue: s.unit.level !== "undetermined", conflicts, ambiguous: unit.certainty === "confirm" }), conflicts, limitation: `${unit.basis}${unit.stateNote ? ` ${unit.stateNote}` : ""}` }));
  if (s.postalCity) {
    const pc = s.postalCity.toLowerCase();
    const controls = s.unit.name ? s.unit.name.toLowerCase().includes(pc) : null;
    facts.push(mk({ fact_type: "jurisdiction", fact_key: "mailing_city", label: "Mailing city vs permitting authority", value: { postal_city: s.postalCity, controls }, display_value: controls === false ? `${s.postalCity} is the mailing city only — it is not the governing jurisdiction` : controls ? `${s.postalCity} is also the governing jurisdiction` : null, source_org: "U.S. Census Bureau", source_title: "TIGER boundaries", source_url: s.censusUrl, provider: "census_tiger", source_tier: 4, origin: "research", verification: decideVerification({ tier: 4, hasValue: controls !== null, conflicts }) }));
  }
  return { facts, health: n.health, status: conflicts.length ? "warning" : censusAvailable ? "done" : "failed", escalations: conflicts.length ? ["Jurisdiction: boundary sources disagree on municipal status."] : unit.certainty === "confirm" && unit.level !== "undetermined" ? [`Jurisdiction: ${unit.stateNote ?? unit.basis}`] : [] };
}

// ------------------------------------------------------------------ official source discovery (nationwide)

let DOTGOV_CACHE: { at: number; rows: DotGovRow[] } | null = null;
const DOTGOV_URL = "https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-full.csv";

async function dotgovRows(n: Net): Promise<DotGovRow[]> {
  if (DOTGOV_CACHE && Date.now() - DOTGOV_CACHE.at < 86400000) { n.u.cache_hits++; return DOTGOV_CACHE.rows; }
  const t0 = Date.now();
  n.u.deterministic_calls++;
  try {
    const r = await fetch(DOTGOV_URL, { signal: AbortSignal.timeout(20000) });
    const txt = r.ok ? await r.text() : "";
    const rows: DotGovRow[] = [];
    for (const line of txt.split("\n").slice(1)) {
      const c = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((_, i) => i % 2 === 0).map((x) => x.replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
      if (c.length >= 6 && /^(City|County|State|Federal)/.test(c[1] ?? "")) rows.push({ domain: c[0]!.toLowerCase(), type: c[1]!, org: c[2]!, city: c[4]!, state: c[5]! });
    }
    track(n, "cisa_dotgov", "CISA .gov domain registry", DOTGOV_URL, rows.length > 0, 1, Date.now() - t0, rows.length ? null : "registry unavailable");
    if (rows.length) DOTGOV_CACHE = { at: Date.now(), rows };
    return rows;
  } catch (e) {
    track(n, "cisa_dotgov", "CISA .gov domain registry", DOTGOV_URL, false, 1, Date.now() - t0, (e as Error).message);
    return [];
  }
}

type Discovered = { category: string; url: string; title: string; trust: string; host: string; meta?: Record<string, unknown> | DocEvidence };
const VENDOR_HOST = /(accela|energov|tylerhost|tylertech|citizenserve|opengov|viewpointcloud|mygov|municode|ecode360|amlegal|codelibrary|generalcode|codepublishing|arcgis\.com|etrakit|cityview|selectron)/i;

function extractLinks(html: string, base: string): Array<{ text: string; href: string }> {
  const out: Array<{ text: string; href: string }> = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 800) {
    try {
      const href = new URL(m[1]!, base).toString();
      const text = m[2]!.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 120);
      if (/^https?:/.test(href)) out.push({ text, href });
    } catch { /* ignore malformed */ }
  }
  return out;
}

/** Discover where this government publishes permitting information: .gov registry → official site → links. */
async function discoverOfficialSources(n: Net, unitName: string, level: GoverningUnit["level"], state: string): Promise<{ domain: DotGovRow | null; sources: Discovered[] }> {
  const rows = await dotgovRows(n);
  const domain = matchDotGov(rows, { name: unitName, level }, state);
  if (!domain) return { domain: null, sources: [] };
  const home = `https://www.${domain.domain}/`;
  let page = await getRaw(n, home, {}, "official_site", "Official government website");
  let base = home;
  if (!page.html) { base = `https://${domain.domain}/`; page = await getRaw(n, base, {}, "official_site", "Official government website"); }
  const sources: Discovered[] = [{ category: "official_website", url: base, title: `${domain.org} — official website (.gov)`, trust: page.html ? "official_informational" : "official_unreachable", host: domain.domain }];
  if (!page.html) return { domain, sources };
  const seen = new Set<string>();
  const add = (cat: string, href: string, text: string) => {
    const host = new URL(href).hostname.toLowerCase();
    const onGov = host.endsWith(domain.domain) || host.endsWith(".gov") || host.endsWith(".us");
    if (!onGov && !VENDOR_HOST.test(host)) return;
    const key = `${cat}|${href}`;
    if (seen.has(key) || sources.filter((x) => x.category === cat).length >= 3) return;
    seen.add(key);
    sources.push({ category: cat, url: href, title: text || cat, trust: onGov ? "official_informational" : "official_linked_vendor", host });
  };
  const links = extractLinks(page.html, base);
  for (const l of links) { const c = classifyLink(l.text, l.href); if (c) add(c, l.href, l.text); }
  // One hop deeper from the building/permits page to find portals and codes.
  const next = sources.find((x) => x.category === "building") ?? sources.find((x) => x.category === "permits");
  if (next && sources.length < 14) {
    const p2 = await getRaw(n, next.url, {}, "official_site", "Official government website");
    if (p2.html) for (const l of extractLinks(p2.html, next.url)) { const c = classifyLink(l.text, l.href); if (c && c !== "official_website") add(c, l.href, l.text); }
  }
  return { domain, sources };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadKnowledge(db: any, key: string): Promise<Discovered[] | null> {
  if (!db) return null;
  const { data } = await db.from("official_sources").select("url,title,category,trust,meta,recheck_after").eq("jurisdiction_key", key).gt("recheck_after", new Date().toISOString());
  if (!data?.length) return null;
  return data.map((r: { url: string; title: string; category: string; trust: string; meta: { host?: string; data?: Record<string, unknown> } }) => ({ url: r.url, title: r.title, category: r.category, trust: r.trust, host: r.meta?.host ?? "", meta: r.meta?.data }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveKnowledge(db: any, key: string, publisher: string, list: Discovered[]) {
  if (!db || !list.length) return;
  const recheck = new Date(Date.now() + 180 * 86400000).toISOString();
  const { data: existing } = await db.from("official_sources").select("id,url,category").eq("jurisdiction_key", key);
  for (const d of list) {
    const hit = (existing ?? []).find((e: { url: string; category: string }) => e.url === d.url && e.category === d.category);
    const row = { url: d.url, title: d.title.slice(0, 200), publisher, kind: d.category === "municipal_code" ? "code" : d.category === "permit_portal" ? "portal" : d.category === "official_document" ? "ordinance" : d.category === "authority_edge" || d.category === "gis_zoning" ? "other" : "agency_site", jurisdiction_key: key, category: d.category, trust: d.trust, discovered_by: "official_source_discovery", verification: "needs_verification", recheck_after: recheck, fetched_at: new Date().toISOString(), meta: { host: d.host, ...(d.meta ? { data: d.meta } : {}) } };
    if (hit) await db.from("official_sources").update(row).eq("id", hit.id);
    else await db.from("official_sources").insert(row);
  }
}

/** Layered AHJ research: read the unit's and county's official building/permit/zoning pages (and linked
 *  documents) for explicit statements of who administers each function. AI is used only as a last resort
 *  on official text, and only sentences that literally exist there are kept. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function researchAuthorities(s: PipelineState, n: Net, db: any, sources: Discovered[], reused: boolean): Promise<{ nodes: GraphNode[]; locatedIn: Array<{ type: string; name: string }>; pages: number; ai: { calls: number; tokens: number; cost: number; model: string | null } | null }> {
  const unit = s.unit!;
  const locatedIn = [
    ...(unit.level !== "county" ? [{ type: unit.kind ?? unit.level, name: unit.name! }] : []),
    ...(s.county ? [{ type: "county", name: s.county }] : []),
    ...(s.state ? [{ type: "state", name: STATE_NAMES[s.state] ?? s.state }] : []),
  ];
  const fns: AuthorityFunction[] = ["building", "zoning", "electrical", "plumbing_mechanical", "fire", ...(s.hasSepticDocument || /septic/i.test(s.scopeText ?? "") ? (["health"] as AuthorityFunction[]) : [])];
  const presumption = unit.level === "municipality" || unit.level === "independent_city" || unit.level === "federal_district" || unit.level === "county" || unit.certainty === "structural"
    ? { agency: unit.name, basis: `${unit.basis} General-purpose government presumed to administer its own permits.` }
    : { agency: null, basis: unit.basis };
  // Stored edges are re-derived from their stored official quote so parser improvements apply to reused knowledge.
  let edges: AuthorityEdge[] = sources.filter((x) => x.category === "authority_edge" && x.meta).map((x) => x.meta as unknown as AuthorityEdge)
    .flatMap((e) => e.origin !== "official_text" ? [e] : extractAuthorityRelations(e.quote, { self: e.agency, url: e.url, page: e.page, state: s.state }).filter((r) => r.fn === e.fn).map((r) => ({ ...r, applies_to: e.applies_to === "all" ? r.applies_to : e.applies_to })).slice(0, 1));
  let pagesRead = 0;
  let ai: { calls: number; tokens: number; cost: number; model: string | null } | null = null;
  if (!reused || !edges.length) {
    const countyHosts = new Set(sources.filter((x) => x.category.startsWith("county_")).map((x) => x.host));
    const seeds = [
      ...sources.filter((x) => /(^|_)(building|permits)$/.test(x.category)).map((x) => x.url),
      ...sources.filter((x) => /(^|_)(zoning|planning)$/.test(x.category)).map((x) => x.url),
      ...sources.filter((x) => x.category === "official_website" || x.category === "county_website").map((x) => x.url),
    ];
    const stName = STATE_NAMES[s.state ?? ""] ?? s.state ?? "";
    const hits = await searchOfficial(n, `who issues building permits ${unit.name} ${s.county ?? ""} ${stName}`, (h) => /\.(gov|us)$/.test(h));
    for (const h of hits.slice(0, 3)) if (!seeds.includes(h.url)) seeds.unshift(h.url);
    const pages = await followEvidence(n, [...new Set(seeds)].slice(0, 8), { maxPages: 10, maxDepth: 1, provider: "authority_research", label: "Official permitting pages", readPdf: true, maxPdfs: 1, score: authorityLinkScore, minScore: 4 });
    pagesRead = pages.length;
    for (const p of pages) {
      const h = new URL(p.url).hostname.toLowerCase();
      const self = countyHosts.has(h) ? s.county ?? unit.name! : unit.name!;
      (p.pages ?? [p.text]).forEach((t, i) => edges.push(...extractAuthorityRelations(t, { self, url: p.url, page: p.pages ? i + 1 : null, state: s.state })));
    }
    // Keep only edges that name the unit, the county, the state or an agency (not random other towns).
    const core = govNameTokens(unit.name!).core, cc = govNameTokens(s.county ?? "").core;
    // A city/town must not inherit statements made on another government's pages about that government's own territory
    // (e.g. a county page describing unincorporated areas) unless the statement names the city/town.
    const cityLike = unit.level === "municipality" || unit.level === "independent_city" || unit.level === "town_or_township";
    const tok = (x: string) => x.replace(/[^a-z]/g, "");
    edges = edges.filter((e) => {
      if (!cityLike || !e.url) return true;
      const host = tok(new URL(e.url).hostname.toLowerCase());
      return host.includes(tok(core)) || e.quote.toLowerCase().includes(core);
    });
    edges = edges.filter((e) => { const a = e.agency.toLowerCase(); return a.includes(core) || (!!cc && a.includes(cc)) || /\bstate\b|division|department of|fire marshal|fire district/.test(a) || e.relationship === "not_administered"; });
    const hasBuilding = edges.some((e) => e.fn === "building" && e.relationship !== "not_administered");
    if (!hasBuilding && presumption.agency === null && pages.length) {
      // Ambiguous structure, official text read, no deterministic answer: escalate to grounded AI extraction.
      const rel = pages.filter((p) => /permit/i.test(p.text)).slice(0, 3).map((p) => ({ url: p.url, text: p.text }));
      const { aiExtractAuthority } = await import("./aiEscalation.server");
      const r = await aiExtractAuthority({ unit: unit.name!, county: s.county, state: stName, pages: rel, userId: s.requestedBy ?? null, projectId: s.projectId ?? null, key: `regintel-ai:${s.jurisdictionKey}:${Date.now()}` });
      ai = r.usage;
      n.u.ai_calls += r.usage.calls; n.u.tokens += r.usage.tokens; n.u.estimated_cost_usd += r.usage.cost;
      edges.push(...r.edges);
    }
    if (db && s.jurisdictionKey && edges.length) await saveKnowledge(db, s.jurisdictionKey, unit.name!, edges.slice(0, 20).map((e, i) => ({ category: "authority_edge", url: e.url ? `${e.url}#edge-${e.fn}-${i}` : `edge:${e.fn}:${i}`, title: `${FUNCTION_LABEL[e.fn]} → ${e.agency}`, trust: e.origin, host: e.url ? new URL(e.url).hostname : "", meta: e as unknown as Record<string, unknown> }))).catch(() => {});
  } else n.u.cache_hits++;
  const nodes = resolveAuthorityGraph(edges, presumption, fns);
  return { nodes, locatedIn, pages: pagesRead, ai };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ahjWorker(s: PipelineState, n: Net, db: any): Promise<StepResult> {
  const facts: Fact[] = [];
  const unit = s.unit;
  if (!unit || unit.level === "undetermined" || !unit.name || !s.state) {
    return { facts: [mk({ fact_type: "agency", fact_key: "building", label: "Building permitting authority", value: {}, display_value: null, source_org: null, source_title: null, source_url: null, provider: "ahj_resolver", source_tier: 7, origin: "research", verification: "needs_verification", limitation: "The governing jurisdiction is unresolved, so the building authority cannot be determined." })], health: n.health, status: "warning", escalations: ["Permitting authority: governing jurisdiction unresolved."] };
  }
  // Knowledge compounds: reuse sources discovered for this jurisdiction on earlier projects.
  const key = s.jurisdictionKey!;
  let sources = await loadKnowledge(db, key);
  let domainOrg: string | null = null;
  const reused = !!sources;
  if (sources) n.u.cache_hits++;
  else {
    const d = await discoverOfficialSources(n, unit.name, unit.level, s.state);
    sources = d.sources;
    domainOrg = d.domain?.org ?? null;
    // Townships / minor civil divisions often rely on the county (or state) for building services:
    // when the unit has no .gov, also discover the county's official sources, labelled as county sources.
    if (sources.length <= 1) {
      const stName = STATE_NAMES[s.state] ?? s.state;
      const { core } = govNameTokens(unit.name);
      const tie = (h: string) => /\.(gov|us)$/.test(h) || (!!core && h.replace(/[^a-z]/g, "").includes(core.replace(/[^a-z]/g, "")));
      const hits = await searchOfficial(n, `${unit.name} ${stName} building permits zoning official`, (h) => tie(h) || VENDOR_HOST.test(h));
      // A city/town must not inherit a county page (e.g. City of Los Angeles ≠ Los Angeles County).
      const wrongLevel = (h: { host: string; title: string }) => unit.level !== "county" && /count(y|ies)/i.test(`${h.host} ${h.title}`) && !/city and county|consolidated/i.test(h.title);
      for (const h of hits.filter((x) => !wrongLevel(x)).slice(0, 5)) {
        const onGov = /\.(gov|us)$/.test(h.host);
        if (!onGov && !VENDOR_HOST.test(h.host)) VERIFIED_EXTRA_HOSTS.add(h.host);
        const cat = classifyLink(h.title, h.url) ?? (sources.some((x) => x.category === "official_website") ? "permits" : "official_website");
        if (!sources.some((x) => x.url === h.url)) sources.push({ category: cat, url: h.url, title: h.title.slice(0, 120), trust: onGov ? "official_informational" : VENDOR_HOST.test(h.host) ? "official_linked_vendor" : "unverified_domain", host: h.host });
      }
    }
    // Layered governments: towns/townships/villages (and uncertain structures) also get the county's sources,
    // because building/electrical/health are often county- or state-administered there.
    if (unit.level !== "county" && s.county && (unit.certainty !== "structural" || unit.level === "town_or_township" || sources.length <= 1)) {
      const c = await discoverOfficialSources(n, s.county, "county", s.state);
      sources = [...sources, ...c.sources.map((x) => ({ ...x, title: `${s.county}: ${x.title}`, category: x.category === "official_website" ? "county_website" : `county_${x.category}` }))];
    }
    await saveKnowledge(db, key, domainOrg ?? unit.name, sources).catch(() => {});
  }
  s.discovered = sources;
  const site = sources.find((x) => x.category === "official_website") ?? sources.find((x) => x.category === "county_website");
  const pick = (cat: string) => sources!.find((x) => x.category === cat) ?? null;
  const bldPage = pick("building") ?? pick("permits");
  const portal = pick("permit_portal");
  const code = pick("municipal_code");
  const zon = pick("zoning") ?? pick("planning");
  const how = reused ? "Reused from Permivio's jurisdiction knowledge (discovered on an earlier project)." : "Discovered from the CISA .gov registry and the government's official website.";
  facts.push(mk({ fact_type: "jurisdiction", fact_key: "official_website", label: "Official government website", value: { url: site?.url ?? null, org: domainOrg, reused }, display_value: site ? site.url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null, source_org: "CISA .gov registry", source_title: "Official .gov domain for this government", source_url: site?.url ?? DOTGOV_URL, provider: "official_source_discovery", source_tier: site ? 3 : 7, origin: reused ? "stored" : "research", verification: site ? "verified" : "needs_verification", limitation: site ? how : `No .gov domain matched ${unit.name}, ${s.state} — the government may use a non-.gov domain. Official-source research required.` }));

  // Known local provider (e.g. a county already configured) is one input among many.
  const cfg = countyConfigFor(s.state, s.countyFips);
  if (cfg && unit.level === "county") {
    for (const a of cfg.unincorporatedAgencies) {
      let stored: { official_name: string; verification: string } | null = null;
      if (a.stored && db) {
        const { data } = await db.from("authorities").select("official_name,verification,jurisdictions!inner(county,state,incorporated)").eq("role", a.role).eq("jurisdictions.state", cfg.state).ilike("jurisdictions.county", `${cfg.name.replace(/ County$/i, "")}%`).eq("jurisdictions.incorporated", false).limit(1);
        stored = (data ?? [])[0] ?? null;
      }
      const agrees = !!stored && stored.official_name.toLowerCase().includes(a.name.toLowerCase().split(" ").slice(0, 2).join(" "));
      const verified = a.role === "building" && agrees && stored!.verification === "verified";
      facts.push(mk({ fact_type: "agency", fact_key: a.role, label: { building: "Building permitting authority", planning_zoning: "Planning / zoning authority", fire: "Fire authority", health: "Health / onsite sewage authority" }[a.role] ?? a.role, value: { name: a.name, basis: "Unincorporated territory → county agency", stored_record: stored?.official_name ?? null }, display_value: a.name, source_org: a.source.org, source_title: a.source.title, source_url: a.source.url, provider: stored ? "ahj_resolver+permivio_verified" : "ahj_resolver", source_tier: verified ? 5 : a.source.tier, origin: stored ? "stored" : "research", verification: verified ? "verified" : "needs_verification", limitation: verified ? "Matches Permivio's human-verified authority record." : "Agency responsibility not independently confirmed by an automated source." }));
    }
  } else {
    const gov = unit.name;
    const graph = await researchAuthorities(s, n, db, sources, reused);
    const node = (fn: AuthorityFunction) => graph.nodes.find((x) => x.fn === fn)!;
    const bNode = node("building"), zNode = node("zoning");
    const noCountyCodes = s.state === "TX" && unit.level === "county";
    const official = (e: AuthorityEdge | undefined) => !!e?.url && /\.(gov|us)$/.test(new URL(e.url).hostname) && e.origin === "official_text";
    // Verified only when the evidenced statement covers this project's class (a commercial-only statement never verifies a residential project).
    const projClass: "residential" | "commercial" | null = /resid|single-family|dwelling/i.test(`${s.projectType ?? ""} ${s.scopeText ?? ""}`) ? "residential" : /commercial|tenant|office|retail/i.test(`${s.projectType ?? ""} ${s.scopeText ?? ""}`) ? "commercial" : null;
    const covers = (e: AuthorityEdge | undefined) => !!e && (e.applies_to === "all" || e.applies_to === projClass);
    const edgeVerified = (nd: GraphNode) => nd.status === "evidenced" && official(nd.edges[0]) && covers(nd.edges[0]);
    if (bNode.status === "evidenced" || bNode.status === "split") s.buildingAgency = bNode.edges[0]!.agency;
    if (zNode.status === "evidenced") s.zoningAgency = zNode.edges[0]!.agency;
    facts.push(mk({ fact_type: "agency", fact_key: "building", label: "Building permitting authority", value: { government: gov, level: unit.level, page: bldPage?.url ?? null, graph_status: bNode.status, edges: bNode.edges }, display_value: bNode.status === "presumed" || bNode.status === "unresolved" ? (noCountyCodes ? `${gov} (county building-code authority is limited in Texas)` : bNode.status === "presumed" ? `${gov} — presumed${bldPage ? ` (${bldPage.title})` : ""}` : null) : bNode.summary, source_org: bNode.edges[0]?.url ? bNode.edges[0].agency : "U.S. Census Bureau", source_title: bNode.edges[0]?.origin === "official_text" ? "Official statement of who administers permits" : bNode.edges[0]?.origin === "ai_extraction" ? "Official text (AI-located sentence)" : "Governing jurisdiction from TIGER boundaries", source_url: bNode.edges[0]?.url ?? bldPage?.url ?? s.censusUrl, provider: "authority_graph", source_tier: edgeVerified(bNode) ? 3 : 4, origin: reused ? "stored" : "research", verification: edgeVerified(bNode) ? "verified" : "needs_verification", conflicts: bNode.status === "conflict" ? bNode.edges.map((e) => ({ source: e.url ?? "official page", says: e.agency, url: e.url })) : [], limitation: `${bNode.edges[0]?.quote ? `“${bNode.edges[0].quote.slice(0, 240)}” ` : ""}${bNode.status === "presumed" ? "No official statement of the administering agency was found; this is a structural presumption. " : ""}${unit.basis}${unit.stateNote ? ` ${unit.stateNote}` : ""}` }));
    facts.push(mk({ fact_type: "agency", fact_key: "planning_zoning", label: "Planning / zoning authority", value: { government: gov, page: zon?.url ?? null, graph_status: zNode.status, edges: zNode.edges }, display_value: zNode.status === "evidenced" ? zNode.summary : `${gov}${zon ? ` — ${zon.title}` : ""} (presumed)`, source_org: zNode.edges[0]?.agency ?? gov, source_title: zon?.title ?? "Governing jurisdiction", source_url: zNode.edges[0]?.url ?? zon?.url ?? s.censusUrl, provider: "authority_graph", source_tier: edgeVerified(zNode) ? 3 : 4, origin: reused ? "stored" : "research", verification: edgeVerified(zNode) ? "verified" : "needs_verification", limitation: zNode.status === "evidenced" ? `“${zNode.edges[0]!.quote.slice(0, 240)}”` : "Zoning is normally administered by the governing jurisdiction; not confirmed by an official statement (some towns have no zoning)." }));
    for (const nd of graph.nodes.filter((x) => !["building", "zoning"].includes(x.fn))) {
      facts.push(mk({ fact_type: "agency", fact_key: `authority:${nd.fn}`, label: `${FUNCTION_LABEL[nd.fn]} — administered by`, value: { graph_status: nd.status, edges: nd.edges }, display_value: nd.status === "unresolved" ? null : nd.summary, source_org: nd.edges[0]?.agency ?? null, source_title: nd.edges[0]?.origin === "official_text" ? "Official statement" : "Structural presumption", source_url: nd.edges[0]?.url ?? null, provider: "authority_graph", source_tier: edgeVerified(nd) ? 3 : 7, origin: "research", verification: edgeVerified(nd) ? "verified" : "needs_verification", limitation: nd.edges[0]?.quote && nd.edges[0].origin !== "structure" ? `“${nd.edges[0].quote.slice(0, 240)}”` : "Not stated on the official pages read; typically administered with building permits — confirm." }));
    }
    facts.push(mk({ fact_type: "jurisdiction", fact_key: "authority_graph", label: "Authority graph", value: { located_in: graph.locatedIn, nodes: graph.nodes, pages_read: graph.pages, ai: graph.ai }, display_value: graph.nodes.map((x) => `${FUNCTION_LABEL[x.fn]}: ${x.status}`).join(" · "), source_org: null, source_title: "Located-in vs administered-by relationships", source_url: null, provider: "authority_graph", source_tier: 7, origin: "research", verification: "needs_verification", limitation: "Each administered-by relationship carries its own evidence and verification state." }));
  }
  if (portal) facts.push(mk({ fact_type: "agency", fact_key: "permit_portal", label: "Online permit portal", value: { url: portal.url, trust: portal.trust }, display_value: portal.url.replace(/^https?:\/\//, "").slice(0, 80), source_org: domainOrg ?? unit.name, source_title: `Linked from the official website: ${portal.title}`, source_url: portal.url, provider: "official_source_discovery", source_tier: 3, origin: reused ? "stored" : "research", verification: "needs_verification", limitation: "Linked from the official government site; confirm it is the current portal for this permit type." }));
  if (code) facts.push(mk({ fact_type: "local_amendment", fact_key: "municipal_code_source", label: "Local code of ordinances", value: { url: code.url }, display_value: code.url.replace(/^https?:\/\//, "").slice(0, 80), source_org: domainOrg ?? unit.name, source_title: `Linked from the official website: ${code.title}`, source_url: code.url, provider: "official_source_discovery", source_tier: 3, origin: reused ? "stored" : "research", verification: "needs_verification", limitation: "Source for local amendments and zoning text; content not yet extracted." }));
  if (s.parcel && cfg) {
    const w = String(s.parcel["WATERSERVICEAREAS"] ?? "").trim();
    const ww = String(s.parcel["WASTEWATERSERVICEAREAS"] ?? "").trim();
    if (w || ww) facts.push(mk({ fact_type: "agency", fact_key: "utility", label: "Water / wastewater service area", value: { water: w || null, wastewater: ww || null }, display_value: `Water: ${w || "—"} · Wastewater: ${ww || "—"}`, source_org: cfg.gisOrg, source_title: cfg.layers.parcel!.title, source_url: s.parcelUrl, provider: "county_arcgis_parcel", source_tier: 1, origin: "research", verification: "verified", limitation: "Service area does not prove a line is available at the lot." }));
  }
  const esc = site || sources.some((x) => ["building", "permits", "zoning"].includes(x.category)) ? [] : [`Permitting authority: official website for ${unit.name} not discovered automatically.`];
  return { facts, health: n.health, status: site ? "done" : "warning", escalations: esc, note: reused ? "Reused jurisdiction knowledge" : `${sources.length} official source(s) discovered` };
}

// FEMA strategy: primary official NFHL (hazards.fema.gov) → bounded retry → alternate official FEMA
// endpoint (msc.fema.gov NFHL query service) → third-party mirror (never Verified) → prior verified
// official result kept by the job runner ("source temporarily unavailable — last verified …").
const FEMA_ENDPOINTS: Array<{ base: string; provenance: SourceProvenance; provider: string; label: string; zones: number; panels: number; pol: number; lomr: number; loma: number }> = [
  { base: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer", provenance: "official", provider: "fema_nfhl", label: "FEMA NFHL (hazards.fema.gov)", zones: 28, panels: 3, pol: 22, lomr: 1, loma: 34 },
  { base: "https://msc.fema.gov/arcgis/rest/services/NFHL_Print/NFHLQuery/MapServer", provenance: "official_alternate", provider: "fema_msc_nfhl", label: "FEMA Map Service Center NFHL query (msc.fema.gov)", zones: 28, panels: 3, pol: 22, lomr: 1, loma: 2 },
];
const FEMA_COPY = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0";
const RING_M = 30;

async function floodWorker(s: PipelineState, n: Net): Promise<StepResult> {
  if (s.lat === null || s.lng === null) return { facts: [], status: "skipped", note: "No coordinates" };
  const lat = s.lat, lng = s.lng;
  type Official = { ep: (typeof FEMA_ENDPOINTS)[number]; attrs: Array<Record<string, unknown>>; ring: Array<Record<string, unknown>>; url: string; panels: Array<Record<string, unknown>>; pol: Record<string, unknown> | null; lomrs: Array<Record<string, unknown>>; lomas: number | null };
  let official: Official | null = null;
  const tried: string[] = [];
  for (const ep of FEMA_ENDPOINTS) {
    const url = pointQuery({ url: `${ep.base}/${ep.zones}` }, lat, lng);
    const j = await getJson(n, url, ep.provider, ep.label, 2);
    tried.push(`${ep.label}: ${j && !j.error ? "reached" : `unavailable (${j?.error?.message ?? "no response"})`}`);
    if (!j || j.error) continue;
    const ring = await getJson(n, pointQuery({ url: `${ep.base}/${ep.zones}` }, lat, lng, `&distance=${RING_M}&units=esriSRUnit_Meter`), ep.provider, ep.label, 1);
    const panels = arcgisAll(await getJson(n, pointQuery({ url: `${ep.base}/${ep.panels}` }, lat, lng), ep.provider, ep.label, 1));
    const pol = arcgisFirst(await getJson(n, pointQuery({ url: `${ep.base}/${ep.pol}` }, lat, lng), ep.provider, ep.label, 1));
    const lomrJ = await getJson(n, pointQuery({ url: `${ep.base}/${ep.lomr}` }, lat, lng), ep.provider, ep.label, 1);
    const lomaJ = await getJson(n, pointQuery({ url: `${ep.base}/${ep.loma}` }, lat, lng, `&distance=${RING_M}&units=esriSRUnit_Meter&returnCountOnly=true`), ep.provider, ep.label, 1);
    official = { ep, attrs: arcgisAll(j), ring: ring && !ring.error ? arcgisAll(ring) : [], url, panels, pol, lomrs: arcgisAll(lomrJ), lomas: lomaJ && !lomaJ.error ? Number((lomaJ as { count?: number }).count ?? 0) : null };
    break;
  }
  const facts: Fact[] = [];
  const conflicts: Conflict[] = [];
  const countyFema = s.parcel ? String(s.parcel["FEMA"] ?? "").trim() : "";
  const countyZones = countyFema ? countyFema.split(",").map((z) => z.trim().split("-")[0]!.trim()).filter(Boolean) : [];
  let cls, url: string, tier: number, org: string, title: string, provenance: SourceProvenance, provider: string;
  let ring: Array<Record<string, unknown>> | null = null;
  if (official) {
    cls = classifyFlood({ features: official.attrs, nearby: official.ring, official: true });
    ring = official.ring;
    url = official.url; tier = 1; org = "FEMA"; title = `National Flood Hazard Layer — Flood Hazard Zones (${official.ep.label})`; provenance = official.ep.provenance; provider = official.ep.provider;
  } else {
    const copyUrl = pointQuery({ url: FEMA_COPY }, lat, lng);
    const j = await getJson(n, copyUrl, "esri_fema_copy", "Esri Living Atlas copy of FEMA NFHL", 1);
    const near = await getJson(n, pointQuery({ url: FEMA_COPY }, lat, lng, `&distance=${RING_M}&units=esriSRUnit_Meter`), "esri_fema_copy", "Esri Living Atlas copy of FEMA NFHL", 1);
    cls = classifyFlood({ features: j && !j.error ? arcgisAll(j) : null, nearby: near && !near.error ? arcgisAll(near) : null, official: false });
    ring = near && !near.error ? arcgisAll(near) : null;
    url = copyUrl; tier = 6; org = "FEMA NFHL via Esri Living Atlas (third-party hosted copy)"; title = "USA Flood Hazard Areas (FEMA NFHL reduced set)"; provenance = "third_party_mirror"; provider = "fema_nfhl_hosted_copy";
  }
  const position = floodPosition({ zone: cls.zone, sfha: cls.sfha }, ring);
  if (cls.zone && countyZones.length && !countyZones.includes(cls.zone)) conflicts.push({ source: "County parcel FEMA attribute", says: countyFema, url: s.parcelUrl });
  if (countyZones.length > 1) conflicts.push({ source: "County parcel FEMA attribute", says: `Parcel spans multiple zones: ${countyFema}`, url: s.parcelUrl });
  const nearBoundary = position === "near_boundary";
  const verification = decideVerification({ tier, hasValue: !!cls.zone, conflicts, ambiguous: cls.ambiguous || nearBoundary || position === "unknown" });
  s.flood = { zone: cls.zone, sfha: cls.sfha, verification };
  const posLabel = { clearly_inside: `Clearly inside the mapped zone (no other zone within ${RING_M} m)`, clearly_outside: `Clearly outside a mapped SFHA (no SFHA within ${RING_M} m)`, near_boundary: `Near a flood-zone boundary (another zone within ${RING_M} m)`, unknown: "Position relative to zone boundaries not established" }[position];
  const common = { source_org: org, source_title: title, source_url: url, provider, source_tier: tier, origin: "research" as const };
  const provNote = official ? `${PROVENANCE_LABEL[provenance]}.` : `Official FEMA endpoints could not be reached (${tried.join("; ")}). Read from a third-party copy of FEMA data — not authoritative until confirmed on FEMA's Map Service Center.`;
  facts.push(mk({ fact_type: "flood", fact_key: "zone", label: "FEMA flood zone", value: { zone: cls.zone, subtype: cls.subtype, sfha: cls.sfha, floodway: cls.floodway, nearby_zones: cls.nearbyZones, position, ring_m: RING_M, provenance, endpoints_tried: tried, county_corroboration: countyFema || null, dfirm_id: official?.attrs[0]?.["DFIRM_ID"] ?? null, study_type: official?.attrs[0]?.["STUDY_TYP"] ?? null }, display_value: cls.zone ? `Zone ${cls.zone}` : null, ...common, verification, conflicts, limitation: `${cls.summary} ${posLabel}. ${provNote}${countyFema ? ` County parcel record FEMA attribute: ${countyFema}.` : ""} Mapping data does not replace a formal flood determination or elevation certificate.` }));
  facts.push(mk({ fact_type: "flood", fact_key: "boundary_position", label: "Position vs flood-zone boundary", value: { position, ring_m: RING_M, nearby_zones: cls.nearbyZones }, display_value: cls.zone ? posLabel : null, ...common, verification: position === "clearly_inside" || position === "clearly_outside" ? verification : "needs_verification", limitation: "Checked with a buffer around the geocoded point; the point is interpolated along the street, so a lot close to a boundary still needs confirmation." }));
  facts.push(mk({ fact_type: "flood", fact_key: "sfha", label: "Special Flood Hazard Area", value: { sfha: cls.sfha }, display_value: cls.sfha === null ? null : cls.sfha ? "Yes — inside a mapped SFHA" : "Not in a mapped SFHA (this does not mean no flood risk)", ...common, verification, conflicts }));
  facts.push(mk({ fact_type: "flood", fact_key: "floodway", label: "Regulatory floodway", value: { floodway: cls.floodway }, display_value: !cls.zone ? null : cls.floodway ? "Yes — regulatory floodway" : "Not designated at this point", ...common, verification: cls.zone ? verification : "needs_verification" }));
  facts.push(mk({ fact_type: "flood", fact_key: "bfe", label: "Base flood elevation", value: { bfe: cls.staticBfe }, display_value: cls.staticBfe !== null ? `${cls.staticBfe} ft (static BFE)` : cls.zone === "A" ? "None published (Zone A — approximate study)" : cls.zone ? "No static BFE in the NFHL at this point" : null, ...common, verification: cls.staticBfe !== null ? verification : cls.zone === "A" ? verification : "needs_verification", limitation: cls.zone === "A" ? "Zone A has no FEMA-published BFE; one may need to be established by the floodplain administrator or an engineer." : cls.staticBfe === null && cls.zone ? "BFE may vary along cross-sections; read it from the FIRM / flood profile." : null }));
  // Panel, community, LOMC — official endpoints only; never from the mirror.
  const pick = official ? pickPanel(official.panels, (official.attrs[0]?.["DFIRM_ID"] as string) ?? null) : { panel: null, ambiguous: false, candidates: [] as string[] };
  const panelId = pick.panel ? String(pick.panel["FIRM_PAN"] ?? "") : "";
  const eff = pick.panel ? epochToDate(pick.panel["EFF_DATE"]) : null;
  facts.push(mk({ fact_type: "flood", fact_key: "panel", label: "FIRM panel / effective date", value: { panel: panelId || null, effective: eff, candidates: pick.candidates, panel_type: pick.panel?.["PANEL_TYP"] ?? null }, display_value: panelId ? `${panelId}${eff ? ` · effective ${eff}` : ""}` : null, source_org: "FEMA", source_title: "NFHL FIRM Panels", source_url: official ? `${official.ep.base}/${official.ep.panels}` : "https://msc.fema.gov/portal/search", provider: official?.ep.provider ?? "fema_nfhl", source_tier: official ? 1 : 4, origin: "research", verification: panelId && eff && !pick.ambiguous ? "verified" : "needs_verification", effective_date: eff, limitation: panelId ? (pick.candidates.length > 1 ? `Other panels touching this point (${pick.candidates.filter((c) => c !== panelId).join(", ")}) belong to a different flood study and were excluded.` : null) : pick.ambiguous ? `Several panels match (${pick.candidates.join(", ")}) — confirm on the Map Service Center.` : "Panel not established — official FEMA endpoints were not reached." }));
  const pol = official?.pol;
  facts.push(mk({ fact_type: "flood", fact_key: "nfip_community", label: "NFIP community", value: { cid: pol?.["CID"] ?? null, name1: pol?.["POL_NAME1"] ?? null, name2: pol?.["POL_NAME2"] ?? null }, display_value: pol ? `${pol["POL_NAME1"]}${pol["POL_NAME2"] ? `, ${pol["POL_NAME2"]}` : ""} — CID ${pol["CID"]}` : null, source_org: "FEMA", source_title: "NFHL Political Jurisdictions", source_url: official ? `${official.ep.base}/${official.ep.pol}` : null, provider: official?.ep.provider ?? "fema_nfhl", source_tier: official ? 1 : 7, origin: "research", verification: pol?.["CID"] ? "verified" : "needs_verification", limitation: pol ? "The NFIP community administers floodplain development permits for this area." : "Community not established — official FEMA endpoints were not reached." }));
  const lomrCount = official ? official.lomrs.length : null;
  facts.push(mk({ fact_type: "flood", fact_key: "lomc", label: "Map revisions / amendments (LOMR / LOMA)", value: { lomrs: official?.lomrs.map((l) => ({ case: l["CASE_NO"] ?? null, effective: epochToDate(l["EFF_DATE"]) })) ?? null, lomas_within_ring: official?.lomas ?? null }, display_value: official ? `${lomrCount ? `${lomrCount} LOMR at this point` : "No LOMR at this point"}${official.lomas ? ` · ${official.lomas} LOMA(s) within ${RING_M} m` : official.lomas === 0 ? ` · no LOMA within ${RING_M} m` : ""}` : null, source_org: "FEMA", source_title: "NFHL LOMRs / LOMAs", source_url: official ? `${official.ep.base}/${official.ep.lomr}` : null, provider: official?.ep.provider ?? "fema_nfhl", source_tier: official ? 1 : 7, origin: "research", verification: "needs_verification", limitation: "LOMAs are issued for individual structures/lots and may not all appear in the NFHL; check the Map Service Center for letters affecting this lot." }));
  const escalations: string[] = [];
  if (!official) escalations.push("Flood: official FEMA sources unavailable — confirm zone and panel on the FEMA Map Service Center.");
  if (nearBoundary) escalations.push(`Flood: the property is within ${RING_M} m of a flood-zone boundary — confirm with a flood determination or survey.`);
  if (conflicts.length) escalations.push("Flood: county parcel flood attribute disagrees with FEMA — confirm.");
  return {
    facts, health: n.health, escalations,
    status: verification === "verified" ? "done" : "warning",
    note: official ? PROVENANCE_LABEL[provenance] : "Official FEMA unavailable — third-party copy used",
    sourceUnavailable: official ? [] : ["flood:zone", "flood:sfha", "flood:floodway", "flood:bfe", "flood:panel", "flood:nfip_community", "flood:lomc", "flood:boundary_position"],
  };
}

const ZONING_FIELD = /^(zon(e|ing)?(_?(class|code|dist(rict)?|type|desc|cmplt))?|zn_?type|zoning_?code|zone_?cd|zonecode|zonedist|zoning1|base_?zone|zone_?name|zone_?class|zone_?smry)$/i;
const ZONING_BAD = /(opportunity|flood|school|time|plane|climate|weather|hurricane|fire|evac|storm|parking zone|enterprise|census|utility|police|trash|snow|wind|seismic|future land use|general plan|comprehensive plan|land use plan|overlay|historic|council|ward|precinct)/i;
const ZONE_NAME_FIELD = /^(zone_?desc|zoning_?desc|zone_?name|district_?name|zonedesc|description|zdesc|zone_?label|long_?name)$/i;

type ZoningHit = { code: string | null; name: string | null; field: string | null; layerUrl: string | null; title: string | null; owner: string | null; onGov: boolean; linkedFrom: string | null; tried: number; method: string | null; ordinance: { url: string; title: string } | null; retrieved: string };

/** Nationwide zoning discovery, in order:
 *  1 stored layer (knowledge reuse) → 2 ArcGIS catalogue near the point matched by jurisdiction name →
 *  3 GIS services / open-data links found on the government's own planning/zoning/GIS pages →
 *  4 official-host search for the zoning map service → 5 official zoning ordinance (document only).
 *  Every layer must answer AT the property point. Nearby parcels are never used; FLU layers are excluded. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function discoverZoning(s: PipelineState, n: Net, db: any): Promise<ZoningHit> {
  const none: ZoningHit = { code: null, name: null, field: null, layerUrl: null, title: null, owner: null, onGov: false, linkedFrom: null, tried: 0, method: null, ordinance: null, retrieved: now() };
  if (!s.unit?.name || s.lat === null || s.lng === null) return none;
  const lat = s.lat, lng = s.lng;
  const zoningGov = s.zoningAgency ?? s.unit.name;
  const cores = [...new Set([govNameTokens(s.unit.name).core, govNameTokens(zoningGov).core].filter(Boolean))];
  const govHosts = [...new Set((s.discovered ?? []).filter((d) => /website|planning|zoning|gis|building|permits/.test(d.category) && /\.(gov|us)$/.test(d.host)).map((d) => d.host.replace(/^www\./, "")))];
  const onGovHost = (h: string) => govHosts.some((g) => h === g || h.endsWith(`.${g}`)) || (/\.gov$/.test(h) && cores.some((c) => h.replace(/[^a-z]/g, "").includes(c.replace(/[^a-z]/g, ""))));
  let tried = 0;
  const testedLayers = new Set<string>();

  const testLayer = async (lu: string, meta: { title: string; owner: string; linkedFrom: string | null; method: string }): Promise<ZoningHit | null> => {
    if (testedLayers.has(lu) || tried >= 14) return null;
    testedLayers.add(lu);
    tried++;
    const attrs = arcgisFirst(await getJson(n, pointQuery({ url: lu }, lat, lng), "discovered_gis", "Discovered local GIS", 0));
    if (!attrs) return null;
    const field = Object.keys(attrs).find((k) => ZONING_FIELD.test(k)) ?? Object.keys(attrs).find((k) => /zon/i.test(k) && !/(overlay|flood|fire)/i.test(k) && typeof attrs[k] === "string");
    const code = field ? String(attrs[field] ?? "").trim() : "";
    if (!code) return null;
    const nf = Object.keys(attrs).find((k) => k !== field && ZONE_NAME_FIELD.test(k));
    const host = new URL(lu).hostname.toLowerCase();
    const onGov = onGovHost(host) || (!!meta.linkedFrom && onGovHost(new URL(meta.linkedFrom).hostname.toLowerCase()));
    return { code, name: nf ? String(attrs[nf] ?? "").trim() || null : null, field: field ?? null, layerUrl: lu, title: meta.title, owner: meta.owner, onGov, linkedFrom: meta.linkedFrom, tried, method: meta.method, ordinance: null, retrieved: now() };
  };
  /** Expand a service / server root into candidate zoning layers (bounded). */
  const expand = async (url: string): Promise<string[]> => {
    const u = url.split("?")[0]!.replace(/\/$/, "");
    if (/\/(MapServer|FeatureServer)\/\d+$/i.test(u)) return [u];
    if (/\/(MapServer|FeatureServer)$/i.test(u)) {
      const meta = (await getJson(n, `${u}?f=json`, "discovered_gis", "Discovered local GIS", 0)) as unknown as { layers?: Array<{ id: number; name: string }> } | null;
      const ls = (meta?.layers ?? []).filter((l) => /zon/i.test(l.name) && !ZONING_BAD.test(l.name)).slice(0, 2).map((l) => `${u}/${l.id}`);
      return ls.length ? ls : (meta?.layers ?? []).length === 1 ? [`${u}/${meta!.layers![0]!.id}`] : [];
    }
    // REST catalogue root or folder: list services whose names mention zoning.
    const m = u.match(/^(.*\/rest\/services)(\/.*)?$/i);
    if (!m) return [];
    const root = u;
    const cat = (await getJson(n, `${root}?f=json`, "discovered_gis", "Discovered local GIS", 0)) as unknown as { folders?: string[]; services?: Array<{ name: string; type: string }> } | null;
    const svc = (cat?.services ?? []).filter((x) => /zon/i.test(x.name) && !ZONING_BAD.test(x.name) && /MapServer|FeatureServer/.test(x.type)).slice(0, 2).map((x) => `${m[1]}/${x.name}/${x.type}`);
    if (!svc.length) for (const f of (cat?.folders ?? []).filter((f) => /(zon|plan|land|property|parcel|public)/i.test(f)).slice(0, 2)) {
      const sub = (await getJson(n, `${m[1]}/${f}?f=json`, "discovered_gis", "Discovered local GIS", 0)) as unknown as { services?: Array<{ name: string; type: string }> } | null;
      svc.push(...(sub?.services ?? []).filter((x) => /zon/i.test(x.name) && !ZONING_BAD.test(x.name) && /MapServer|FeatureServer/.test(x.type)).slice(0, 2).map((x) => `${m[1]}/${x.name}/${x.type}`));
    }
    const out: string[] = [];
    for (const sv of svc.slice(0, 3)) out.push(...(await expand(sv)));
    return out;
  };
  const tryAll = async (list: Array<{ url: string; title: string; owner: string; linkedFrom: string | null; method: string }>) => {
    for (const c of list) for (const lu of await expand(c.url)) { const h = await testLayer(lu, c); if (h) return h; }
    return null;
  };
  const remember = async (h: ZoningHit) => {
    if (s.jurisdictionKey && h.layerUrl) await saveKnowledge(db, s.jurisdictionKey, h.owner ?? zoningGov, [{ category: "gis_zoning", url: h.layerUrl, title: h.title ?? "Zoning layer", trust: h.onGov ? "authoritative_structured" : "official_catalogue_unconfirmed", host: new URL(h.layerUrl).hostname, meta: { linked_from: h.linkedFrom, method: h.method } }]).catch(() => {});
    return h;
  };

  // 1 — reuse a previously validated layer (still re-queried at THIS property's point).
  const stored = s.discovered?.find((d) => d.category === "gis_zoning");
  if (stored) { n.u.cache_hits++; const h = await testLayer(stored.url, { title: stored.title, owner: stored.host, linkedFrom: (stored.meta as { linked_from?: string } | undefined)?.linked_from ?? null, method: "reused_layer" }); if (h) return h; }

  // 2 — ArcGIS catalogue near the point, matched to the zoning government by name.
  const bbox = `${lng - 0.02},${lat - 0.02},${lng + 0.02},${lat + 0.02}`;
  const catalog: Array<{ url: string; title: string; owner: string; linkedFrom: string | null; method: string }> = [];
  for (const core of cores) {
    const q = `zoning AND (${core.split(" ").map((w) => `"${w}"`).join(" ")}) AND (type:"Feature Service" OR type:"Map Service")`;
    const j = (await getJson(n, `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&bbox=${bbox}&num=20&f=json`, "arcgis_catalog", "ArcGIS Online catalogue", 1)) as unknown as { results?: Array<{ title: string; owner: string; url: string | null; snippet?: string }> } | null;
    for (const r of j?.results ?? []) {
      if (!r.url || ZONING_BAD.test(r.title) || !/zon/i.test(`${r.title} ${r.url}`)) continue;
      const hay = `${r.title} ${r.owner} ${r.url} ${r.snippet ?? ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!hay.includes(core.replace(/[^a-z0-9]/g, ""))) continue;
      if (!catalog.some((c) => c.url === r.url)) catalog.push({ url: r.url, title: r.title, owner: r.owner, linkedFrom: null, method: "arcgis_catalogue" });
      if (catalog.length >= 6) break;
    }
  }
  const c1 = await tryAll(catalog);
  if (c1) return remember(c1);

  // 3 — GIS / open-data links on the government's own planning, zoning and GIS pages (one hop).
  const pagesToScan = (s.discovered ?? []).filter((d) => ["zoning", "planning", "gis", "official_website"].includes(d.category)).slice(0, 4);
  const linked: Array<{ url: string; title: string; owner: string; linkedFrom: string | null; method: string }> = [];
  const itemIds: Array<{ id: string; from: string }> = [];
  for (const pg of pagesToScan) {
    if (/\/(MapServer|FeatureServer)/i.test(pg.url)) { linked.push({ url: pg.url, title: pg.title, owner: pg.host, linkedFrom: null, method: "official_gis_link" }); continue; }
    const r = await getRaw(n, pg.url, {}, "official_site", "Official government website");
    if (!r.html) continue;
    const html = r.html;
    for (const m of html.matchAll(/https?:\/\/[^"'\s<>]+\/rest\/services[^"'\s<>]*/gi)) { const u = m[0].replace(/&amp;/g, "&"); if (!linked.some((l) => l.url === u)) linked.push({ url: u, title: "GIS service linked from official page", owner: new URL(u).hostname, linkedFrom: pg.url, method: "official_page_gis_link" }); }
    for (const m of html.matchAll(/(?:webmap|appid|id)=([0-9a-f]{32})/gi)) if (!itemIds.some((x) => x.id === m[1])) itemIds.push({ id: m[1]!, from: pg.url });
    for (const l of extractLinks(html, pg.url)) if (/zon/i.test(`${l.text} ${l.href}`) && /(map|gis|arcgis|hub|open ?data|viewer)/i.test(`${l.text} ${l.href}`)) {
      if (/\/rest\/services/i.test(l.href)) { if (!linked.some((x) => x.url === l.href)) linked.push({ url: l.href, title: l.text || "Zoning GIS", owner: new URL(l.href).hostname, linkedFrom: pg.url, method: "official_page_gis_link" }); }
      else for (const m of l.href.matchAll(/(?:webmap|appid|id)=([0-9a-f]{32})/gi)) if (!itemIds.some((x) => x.id === m[1])) itemIds.push({ id: m[1]!, from: pg.url });
    }
  }
  // ArcGIS web maps / apps linked from an official page → their operational zoning layers.
  for (const it of itemIds.slice(0, 3)) {
    const data = (await getJson(n, `https://www.arcgis.com/sharing/rest/content/items/${it.id}/data?f=json`, "arcgis_catalog", "ArcGIS Online catalogue", 0)) as unknown as { operationalLayers?: Array<{ title?: string; url?: string; layers?: Array<{ id: number; title?: string }> }>; map?: { itemId?: string }; values?: { webmap?: string } } | null;
    const wm = data?.values?.webmap ?? data?.map?.itemId;
    const ops = data?.operationalLayers ?? (wm ? ((await getJson(n, `https://www.arcgis.com/sharing/rest/content/items/${wm}/data?f=json`, "arcgis_catalog", "ArcGIS Online catalogue", 0)) as unknown as { operationalLayers?: Array<{ title?: string; url?: string }> })?.operationalLayers : null) ?? [];
    for (const o of ops) if (o.url && /zon/i.test(`${o.title ?? ""} ${o.url}`) && !ZONING_BAD.test(o.title ?? "")) linked.push({ url: o.url, title: o.title ?? "Zoning layer", owner: new URL(o.url).hostname, linkedFrom: it.from, method: "official_webmap_layer" });
  }
  const c2 = await tryAll(linked.slice(0, 8));
  if (c2) return remember(c2);

  // 4 — official-host search for the zoning map service / open-data item.
  const stName = STATE_NAMES[s.state ?? ""] ?? s.state ?? "";
  const hits = await searchOfficial(n, `${zoningGov} ${stName} zoning map GIS open data`, (h) => onGovHost(h) || /\.(gov|us)$/.test(h) || /(arcgis\.com|hub\.arcgis\.com|opendata)/.test(h));
  const searchLinked: Array<{ url: string; title: string; owner: string; linkedFrom: string | null; method: string }> = [];
  for (const h of hits.slice(0, 4)) {
    if (/\/rest\/services/i.test(h.url)) searchLinked.push({ url: h.url, title: h.title, owner: h.host, linkedFrom: null, method: "official_search_service" });
    else if (/\.(gov|us)$/.test(h.host)) {
      const r = await getRaw(n, h.url, {}, "official_site", "Official government website");
      if (r.html) for (const m of r.html.matchAll(/https?:\/\/[^"'\s<>]+\/rest\/services[^"'\s<>]*/gi)) searchLinked.push({ url: m[0], title: h.title, owner: new URL(m[0]).hostname, linkedFrom: h.url, method: "official_search_page_gis_link" });
    }
  }
  const c3 = await tryAll(searchLinked.slice(0, 6));
  if (c3) return remember(c3);

  // 5 — official zoning ordinance / code (documentary source only — never a district for this parcel).
  const ord = (s.discovered ?? []).find((d) => d.category === "municipal_code") ?? (s.discovered ?? []).find((d) => d.category === "zoning");
  return { ...none, tried, ordinance: ord ? { url: ord.url, title: ord.title } : null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoningWorker(s: PipelineState, n: Net, db: any = null): Promise<StepResult> {
  const cfg = countyConfigFor(s.state, s.countyFips);
  const facts: Fact[] = [];
  if (!cfg || s.lat === null || s.lng === null || s.incorporation !== "unincorporated") {
    if (s.incorporation === "undetermined" || !s.unit?.name) {
      facts.push(mk({ fact_type: "zoning", fact_key: "district", label: "Zoning district", value: {}, display_value: null, source_org: null, source_title: null, source_url: null, provider: "zoning_discovery", source_tier: 7, origin: "research", verification: "needs_verification", limitation: "Zoning jurisdiction unresolved." }));
      return { facts, health: n.health, status: "warning" };
    }
    const z = await discoverZoning(s, n, db);
    s.zoningCode = z.code;
    const zj = s.zoningAgency ?? s.unit.name;
    const how = z.method ? { reused_layer: "a zoning layer Permivio validated earlier for this jurisdiction", arcgis_catalogue: "the ArcGIS catalogue (publisher matched by name)", official_page_gis_link: "a GIS service linked from the government's own website", official_webmap_layer: "the zoning layer of an official web map linked from the government's website", official_search_service: "an official GIS service located by search", official_search_page_gis_link: "a GIS service linked from an official page located by search", official_gis_link: "an official GIS link" }[z.method] ?? z.method : null;
    facts.push(mk({ fact_type: "zoning", fact_key: "district", label: "Zoning district", value: { code: z.code, district_name: z.name, field: z.field, zoning_jurisdiction: zj, layer: z.layerUrl, owner: z.owner, on_gov_domain: z.onGov, linked_from: z.linkedFrom, method: z.method, layers_tested: z.tried, ordinance: z.ordinance, retrieved_at: z.retrieved }, display_value: z.code ? `${z.code}${z.name && z.name !== z.code ? ` — ${z.name}` : ""}` : null, source_org: z.owner ?? null, source_title: z.title ?? "Zoning source discovery", source_url: z.layerUrl ?? z.ordinance?.url ?? null, provider: "zoning_discovery", source_tier: z.code ? (z.onGov ? 1 : 6) : 7, origin: "research", verification: z.code && z.onGov ? "verified" : "needs_verification",
      limitation: z.code ? (z.onGov ? `Read at the property point from ${how}. Zoning jurisdiction: ${zj}.` : `Read at the property point from ${how}; publisher "${z.owner}" is not confirmed as ${zj}'s official current zoning map.`) : `No zoning layer answering at this property was found (${z.tried} candidate layer(s) tested across catalogue, official-page links and official search).${z.ordinance ? ` The official zoning ordinance/code was located (${z.ordinance.title}) but a district cannot be assigned from text alone.` : ""} Zoning is not inferred from nearby properties.` }));
    return { facts, health: n.health, status: z.code && z.onGov ? "done" : "warning", note: z.code ? (z.onGov ? `Official GIS (${z.method})` : "Discovered layer — needs verification") : "No zoning source found", escalations: z.code ? [] : [`Zoning: no official zoning source discovered for ${zj}.`] };
  }
  const zUrl = pointQuery(cfg.layers.zoning!, s.lat, s.lng);
  const zAll = arcgisAll(await getJson(n, zUrl, "county_gis", "County GIS"));
  const codes = [...new Set(zAll.map((a) => String(a[cfg.layers.zoning!.fields["code"]!] ?? "").trim()).filter(Boolean))];
  const parcelZ = s.parcel ? String(s.parcel["ZONING"] ?? "").trim() : "";
  const conflicts: Conflict[] = [];
  if (parcelZ && codes[0] && !parcelZ.toUpperCase().startsWith(codes[0].toUpperCase())) conflicts.push({ source: "County parcel zoning attribute", says: parcelZ, url: s.parcelUrl });
  if (codes.length > 1) conflicts.push({ source: cfg.layers.zoning!.title, says: `Point intersects multiple districts: ${codes.join(", ")}` });
  s.zoningCode = codes[0] ?? null;
  facts.push(mk({ fact_type: "zoning", fact_key: "district", label: "Zoning district", value: { code: s.zoningCode, zoning_jurisdiction: `${cfg.name} (unincorporated)`, parcel_attribute: parcelZ || null, last_edited: epochToDate(zAll[0]?.["last_edited_date"]) }, display_value: s.zoningCode, source_org: cfg.gisOrg, source_title: cfg.layers.zoning!.title, source_url: zUrl, provider: "county_arcgis_zoning", source_tier: 1, origin: "research", verification: decideVerification({ tier: 1, hasValue: !!s.zoningCode, conflicts }), conflicts, source_updated_at: zAll[0]?.["last_edited_date"] ? new Date(zAll[0]["last_edited_date"] as number).toISOString() : null, limitation: cfg.gisDisclaimer }));
  facts.push(mk({ fact_type: "zoning", fact_key: "district_name", label: "Zoning district name", value: { code: s.zoningCode }, display_value: null, source_org: cfg.zoningCode.org, source_title: cfg.zoningCode.title, source_url: cfg.zoningCode.url, provider: "county_zoning_code", source_tier: 3, origin: "research", verification: "needs_verification", limitation: `The GIS layer publishes only the code "${s.zoningCode ?? "?"}". The district's full name and permitted uses must be read from the Land Development Code.` }));
  const fUrl = pointQuery(cfg.layers.futureLandUse!, s.lat, s.lng);
  const f = arcgisFirst(await getJson(n, fUrl, "county_gis", "County GIS"));
  facts.push(mk({ fact_type: "future_land_use", fact_key: "designation", label: "Future land use", value: { code: f?.["FLU_CODE"] ?? null, name: f?.["DESCRIPTION"] ?? null }, display_value: f ? `${f["FLU_CODE"]} — ${f["DESCRIPTION"]}` : null, source_org: cfg.gisOrg, source_title: cfg.layers.futureLandUse!.title, source_url: fUrl, provider: "county_arcgis_flu", source_tier: 1, origin: "research", verification: decideVerification({ tier: 1, hasValue: !!f }), source_updated_at: f?.["last_edited_date"] ? new Date(f["last_edited_date"] as number).toISOString() : null, limitation: "Future land use is the comprehensive-plan designation — distinct from zoning." }));
  const hits: string[] = [];
  for (const o of cfg.layers.overlays ?? []) {
    const url = pointQuery(o, s.lat, s.lng);
    const j = await getJson(n, url, "county_gis", "County GIS");
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

/** Official state adoption pages for states without a structured adoption provider (discovery sources). */
const STATE_CODE_SOURCES: Record<string, { org: string; title: string; url: string }> = {
  DC: { org: "DC Department of Buildings", title: "DC Construction Codes", url: "https://dob.dc.gov/page/dc-construction-codes" },
  VA: { org: "Virginia DHCD", title: "Virginia Uniform Statewide Building Code", url: "https://www.dhcd.virginia.gov/codes" },
  WA: { org: "Washington State Building Code Council", title: "State Building Code", url: "https://sbcc.wa.gov/state-codes-regulations-guidelines/state-building-code" },
  MD: { org: "Maryland DHCD", title: "Maryland Building Performance Standards", url: "https://dhcd.maryland.gov/Codes/Pages/default.aspx" },
  NC: { org: "NC Office of State Fire Marshal", title: "NC State Building Codes", url: "https://www.ncosfm.gov/codes" },
  MA: { org: "Massachusetts BBRS", title: "Massachusetts State Building Code (780 CMR)", url: "https://www.mass.gov/massachusetts-state-building-code-780-cmr" },
  NH: { org: "NH State Building Code Review Board", title: "State Building Code", url: "https://www.dos.nh.gov/boards-and-commissions/state-building-code-review-board" },
  ME: { org: "Maine Bureau of Building Codes and Standards", title: "Maine Uniform Building and Energy Code", url: "https://www.maine.gov/dps/fmo/building-codes" },
  VT: { org: "Vermont Division of Fire Safety", title: "Vermont Fire & Building Safety Code", url: "https://firesafety.vermont.gov/" },
  PA: { org: "PA Department of Labor & Industry", title: "Uniform Construction Code", url: "https://www.pa.gov/agencies/dli/programs-services/labor-management-relations/uniform-construction-code" },
};
const MODEL_EDITION_RE = /(20[012]\d)\s*(?:edition of the\s*)?(International (?:Building|Residential|Energy Conservation|Existing Building|Fire|Mechanical|Plumbing|Fuel Gas) Code|IBC|IRC|IECC|IEBC|IFC|IMC|IPC|National Electrical Code|NFPA 70|NEC)\b/gi;

async function floridaAmendments(n: Net, s: PipelineState, st: StateConfig): Promise<Fact[]> {
  const facts: Fact[] = [];
  const name = s.unit?.level === "county" ? `County of ${String(s.county ?? "").replace(/ County$/i, "")}` : s.unit?.name ? `${s.unit.kind === "town" ? "Town" : s.unit.kind === "village" ? "Village" : "City"} of ${govNameTokens(s.unit.name).core.replace(/\b\w/g, (c) => c.toUpperCase())}` : null;
  // Building: Florida Building Commission BCIS amendment registry (2023 / 8th Edition technical amendments).
  if (st.amendmentRegistry && name) {
    const form = await getRaw(n, st.amendmentRegistry.url, {}, "fbc_bcis", "Florida Building Commission BCIS");
    let status: "found" | "none_in_registry" | "not_listed" | "unavailable" = "unavailable";
    let rows: ReturnType<typeof parseBcisRows> = [];
    if (form.html) {
      const sel = form.html.match(/name="ddlJurisdiction:drpCustomDropdown"[\s\S]*?<\/select>/)?.[0] ?? "";
      const opt = [...sel.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)/g)].find((m) => m[2]!.trim().toLowerCase() === name.toLowerCase());
      if (!opt) status = "not_listed";
      else {
        const hv = (k: string) => form.html!.match(new RegExp(`id="${k}" value="([^"]*)"`))?.[1] ?? "";
        const body = new URLSearchParams({ __EVENTTARGET: "btnSearch", __EVENTARGUMENT: "", __VIEWSTATE: hv("__VIEWSTATE"), __VIEWSTATEGENERATOR: hv("__VIEWSTATEGENERATOR"), __EVENTVALIDATION: hv("__EVENTVALIDATION"), rblSearchType: "A", "ddlCodeVersion:drpCustomDropdown": "2023", "ddlAmmendType:drpCustomDropdown": "TECHAMND", "ddlJurisdiction:drpCustomDropdown": opt[1]!, "ddlSubCode:drpCustomDropdown": "-2", "ddlChapterTopic:drpCustomDropdown": "-2" });
        const res = await getRaw(n, st.amendmentRegistry.url, { method: "POST", body: body.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", ...(form.cookie ? { Cookie: form.cookie } : {}) } }, "fbc_bcis", "Florida Building Commission BCIS");
        if (res.html) {
          const text = res.html.replace(/<[^>]+>/g, " | ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
          rows = parseBcisRows(text);
          status = rows.length ? "found" : /no records that match/i.test(text) ? "none_in_registry" : "unavailable";
        }
      }
    }
    const disp = { found: `${rows.length} technical amendment(s) listed`, none_in_registry: "None listed in the state registry", not_listed: "Jurisdiction not listed in the state registry", unavailable: null }[status];
    facts.push(mk({ fact_type: "local_amendment", fact_key: "building", label: "Local technical amendments to the FBC (8th Edition)", value: { status, registry_name: name, rows: rows.slice(0, 25) }, display_value: disp, source_org: st.amendmentRegistry.org, source_title: st.amendmentRegistry.title, source_url: st.amendmentRegistry.url, provider: "fbc_bcis_registry", source_tier: 2, origin: "research", verification: status === "found" ? "verified" : "needs_verification", requirement_type: null, limitation: status === "found" ? "Amendments are listed in the state registry; applicability to this project still needs review." : status === "none_in_registry" ? `The Florida Building Commission registry lists no 8th Edition technical amendment for ${name}. This is not proof that none exist — confirm with the local building official.` : status === "not_listed" ? `${name} does not appear as a jurisdiction in the Florida Building Commission amendment registry. That means no amendment was filed there, not that none exist — confirm locally.` : "The state amendment registry could not be searched during this run." } as Fact));
  }
  if (st.fireAmendmentList && name) {
    const t = await getRaw(n, st.fireAmendmentList.url, {}, "fl_sfm", "Florida State Fire Marshal");
    let found: string | null = null;
    let status: "found" | "not_listed" | "unavailable" = "unavailable";
    if (t.html) {
      const slug = govNameTokens(name).core.replace(/\s+/g, "-");
      const link = [...t.html.matchAll(/href="([^"]*local-amendments\/[^"]+\.pdf)"/gi)].map((m) => m[1]!).find((h) => h.toLowerCase().includes(slug));
      found = link ? new URL(link, st.fireAmendmentList.url).toString() : null;
      status = found ? "found" : "not_listed";
    }
    facts.push(mk({ fact_type: "local_amendment", fact_key: "fire", label: "Local amendments to the Florida Fire Prevention Code", value: { status, document: found }, display_value: status === "found" ? "Local amendment on file with the State Fire Marshal" : status === "not_listed" ? "None listed by the State Fire Marshal" : null, source_org: st.fireAmendmentList.org, source_title: st.fireAmendmentList.title, source_url: found ?? st.fireAmendmentList.url, provider: "fl_sfm_amendment_list", source_tier: 2, origin: "research", verification: status === "found" ? "verified" : "needs_verification", limitation: status === "not_listed" ? "Not on the State Fire Marshal's published list — absence from the list is not proof that no local fire amendment exists." : status === "found" ? "Check which provisions affect this project." : "The State Fire Marshal list could not be read during this run." }));
  }
  return facts;
}

type EvidenceRow = { id?: string; state: string; family: string; edition: string | null; adopted: string | null; effective_from: string | null; effective_to: string | null; source_published_at: string | null; retrieved_at: string; authority: string; source_type: string; url: string; quote: string; is_primary: boolean; proposed: boolean; local_only: boolean; recheck_after: string | null; source_status: string; note: string | null; layer: string; jurisdiction_key: string | null };
const toEv = (r: EvidenceRow): CodeEvidence => ({ layer: r.layer as CodeEvidence["layer"], state: r.state, jurisdiction_key: r.jurisdiction_key, family: r.family as CodeFamily, edition: r.edition, adopted: r.adopted, effective_from: r.effective_from, effective_to: r.effective_to, published: r.source_published_at, retrieved_at: r.retrieved_at, authority: r.authority, source_type: r.source_type as SourceType, url: r.url, quote: r.quote, primary: r.is_primary && r.source_status !== "quote_missing", proposed: r.proposed, local_only: r.local_only, note: r.source_status === "quote_missing" ? `${r.note ?? ""} On the last recheck the cited text was no longer found on this page.`.trim() : r.note });
const toRow = (e: CodeEvidence) => ({ layer: e.layer, state: e.state, jurisdiction_key: e.jurisdiction_key ?? null, family: e.family, edition: e.edition, adopted: e.adopted ?? null, effective_from: e.effective_from ?? null, effective_to: e.effective_to ?? null, source_published_at: e.published ?? null, retrieved_at: e.retrieved_at, authority: e.authority, source_type: e.source_type, url: e.url, quote: e.quote, is_primary: e.primary, proposed: !!e.proposed, local_only: !!e.local_only, note: e.note ?? null, discovered_by: "seed" });

/** Load reusable evidence (DB knowledge + seed baseline), seeding the DB the first time a state is seen,
 *  and recheck stale primary evidence by confirming the quoted text is still published. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadCodeEvidence(s: PipelineState, n: Net, db: any, today: string): Promise<{ evidence: CodeEvidence[]; rechecked: number; changed: number }> {
  const seed = seedFor(s.state);
  let rows: EvidenceRow[] = [];
  if (db && s.state) {
    const { data } = await db.from("code_adoption_evidence").select("*").eq("state", s.state).eq("layer", "state");
    rows = (data ?? []) as EvidenceRow[];
    const have = new Set(rows.map((r) => `${r.family}|${r.edition ?? ""}|${r.url}`));
    const missing = seed.filter((e) => !have.has(`${e.family}|${e.edition ?? ""}|${e.url}`));
    if (missing.length) {
      const { data: ins } = await db.from("code_adoption_evidence").insert(missing.map(toRow)).select("*");
      rows.push(...((ins ?? []) as EvidenceRow[]));
    }
  }
  if (!rows.length) return { evidence: seed, rechecked: 0, changed: 0 };
  let rechecked = 0, changed = 0;
  for (const r of rows) {
    if (!r.is_primary || !r.quote || (r.recheck_after && r.recheck_after > today) || rechecked >= 4) continue;
    rechecked++;
    const t = await getText(n, r.url, "code_recheck", "Code adoption source recheck");
    if (t === null) continue; // unreachable: keep prior evidence
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const probe = norm(r.quote).split(" ").filter((w) => w.length > 3).slice(0, 8).join(" ");
    const found = norm(t).includes(probe) || norm(t).includes(norm(r.quote).slice(0, 40));
    const status = found ? "ok" : "quote_missing";
    if (status !== r.source_status) changed++;
    r.source_status = status; r.retrieved_at = new Date().toISOString();
    await db.from("code_adoption_evidence").update({ source_status: status, retrieved_at: r.retrieved_at }).eq("id", r.id);
  }
  return { evidence: rows.map(toEv), rechecked, changed };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function temporalCodeFacts(s: PipelineState, n: Net, db: any, scope: Set<ScopeAttribute>, only?: CodeFamily[], extra: CodeEvidence[] = []): Promise<Fact[]> {
  const today = new Date().toISOString().slice(0, 10);
  const cd = applicableCodeDate({ application_date: s.applicationDate ?? null, today });
  const { evidence } = await loadCodeEvidence(s, n, db, today);
  evidence.push(...extra);
  const out: Fact[] = [];
  // Dynamic code stack: every family relevant to this scope is shown, even when no evidence was found.
  const relevant = ALL_FAMILIES.filter((f) => codeApplicability(f, scope).applicability !== "not_primary");
  const families = [...new Set([...evidence.map((e) => e.family), ...(only ? [] : relevant)])].filter((f) => !only || only.includes(f));
  // A "state baseline" may only be Verified when its citation is on a STATE government host
  // (a city page quoting the state code is useful evidence, not the legal authority).
  const regRows = await dotgovRows(n);
  const stateHosts = new Set(regRows.filter((r) => r.type.startsWith("State") && r.state.toUpperCase() === s.state).map((r) => r.domain));
  const onStateHost = (url: string | null | undefined) => { try { const h = new URL(url!).hostname.toLowerCase().replace(/^www\./, ""); return [...stateHosts].some((d) => h === d || h.endsWith(`.${d}`)) || /\.state\.[a-z]{2}\.us$/.test(h); } catch { return false; } };
  for (const fam of families) {
    const r = resolveFamily(s.state!, fam, evidence, cd.date);
    const app = codeApplicability(fam, scope);
    const localState = LOCAL_ADOPTION_STATES.includes(s.state ?? "");
    const ref = r.current ? r.current.evidence[0]! : (r.future[0] ?? r.proposed[0])?.evidence[0] ?? evidence.find((e) => e.family === fam) ?? null;
    const verification = r.status === "current_verified" && !localState && (onStateHost(ref?.url) || (r.current?.evidence ?? []).some((e) => onStateHost(e.url))) ? "verified" : "needs_verification";
    const evRec = (p: { edition: string; status: string; effective_from: string | null; effective_to: string | null; evidence: CodeEvidence[] }) => ({ edition: p.edition, status: p.status, status_label: TEMPORAL_LABEL[p.status as keyof typeof TEMPORAL_LABEL], effective_from: p.effective_from, effective_to: p.effective_to, sources: p.evidence.map((e) => ({ authority: e.authority, url: e.url, quote: e.quote, source_type: SOURCE_TYPE_LABEL[e.source_type], primary: e.primary, published: e.published ?? null })) });
    out.push(mk({
      fact_type: "code", fact_key: `temporal:${fam}`, label: `${FAMILY_LABEL[fam]} — ${s.state} state baseline`,
      value: { family: fam, status: r.status, status_label: TEMPORAL_LABEL[r.status], why: r.why, code_date: cd.date, code_date_basis: cd.basis, code_date_caveat: cd.caveat,
        current: r.current ? evRec(r.current) : null, future: r.future.map(evRec), proposed: r.proposed.map(evRec), superseded: r.superseded.map(evRec), conflicts: r.conflicts,
        applicability: app.applicability, basis: app.basis, layer: "state", local_adoption_required: localState, recheck_after: r.recheck_after },
      display_value: r.current ? `${r.current.edition} · ${TEMPORAL_LABEL[r.status]}` : TEMPORAL_LABEL[r.status],
      source_org: ref?.authority ?? null, source_title: ref ? SOURCE_TYPE_LABEL[ref.source_type] : null, source_url: ref?.url ?? null,
      provider: "code_adoption_evidence", source_tier: ref?.primary ? 2 : 6, origin: "research", verification, effective_date: r.current?.effective_from ?? null,
      recheck_after: r.recheck_after,
      conflicts: r.conflicts.map((c) => ({ source: c.authority, says: c.edition, url: c.url })),
      limitation: [r.why, localState ? "This is only the state baseline — the local jurisdiction's adoption and amendments determine the code that applies to this project." : "Local amendments may modify this baseline.", cd.caveat].filter(Boolean).join(" "),
    } as Fact));
  }
  const pol = amendmentPolicyFor(s.state);
  if (pol) out.push(mk({ fact_type: "local_amendment", fact_key: "state_policy", label: `Local adoption / amendment rules — ${s.state}`, value: { policy: pol.policy }, display_value: pol.text, source_org: null, source_title: "State amendment policy", source_url: pol.url, provider: "code_adoption_evidence", source_tier: 2, origin: "research", verification: "needs_verification", limitation: "Whether this jurisdiction adopted or amended the code must be checked in its local ordinances." }));
  return out;
}

const ALL_FAMILIES: CodeFamily[] = ["building", "residential", "existing_building", "electrical", "mechanical", "plumbing", "fuel_gas", "energy", "fire", "accessibility"];
const FAMILY_LABEL: Record<CodeFamily, string> = { building: "Building code", residential: "Residential code", existing_building: "Existing building code", electrical: "Electrical code", mechanical: "Mechanical code", plumbing: "Plumbing code", fuel_gas: "Fuel gas code", energy: "Energy code", fire: "Fire code", accessibility: "Accessibility code" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function codesWorker(s: PipelineState, n: Net, db: any = null): Promise<StepResult> {
  const st = s.state ? STATE_CONFIGS[s.state] : undefined;
  const facts: Fact[] = [];
  const scope = effectiveScope(normalizeScope({ scopeText: s.scopeText, workType: s.workType, projectType: s.projectType }).attributes, s.scopeCorrections) as Set<ScopeAttribute>;
  const today = new Date().toISOString().slice(0, 10);
  if (!st) {
    const seeded = seedFor(s.state).length > 0;
    const disc = seeded ? { evidence: [] as CodeEvidence[], pages: 0, sources: [] as string[] } : await discoverStateCodeEvidence(s, n);
    facts.push(...(await temporalCodeFacts(s, n, db, scope, undefined, disc.evidence)));
    if (!seeded) facts.push(mk({ fact_type: "code", fact_key: "state_authority_discovery", label: `State code authority — discovered (${s.state})`, value: { pages_read: disc.pages, sources: disc.sources, statements: disc.evidence.length }, display_value: disc.sources.length ? `${disc.sources.length} official state source(s) · ${disc.evidence.length} edition statement(s)` : "No official state code authority discovered", source_org: "CISA .gov registry → state agency websites", source_title: "Autonomous official-source discovery", source_url: disc.sources[0] ?? null, provider: "evidence_follower", source_tier: disc.sources.length ? 3 : 7, origin: "research", verification: "needs_verification", limitation: "Editions were read only from official state pages and the documents they link to. Page wording is not a formal adoption record unless it is a statute, rule or adoption notice." }));
    const src = s.state ? STATE_CODE_SOURCES[s.state] : undefined;
    const text = src ? await getText(n, src.url, "state_code_page", "State code adoption page") : null;
    const found = new Map<string, Set<string>>();
    if (text) for (const m of text.matchAll(MODEL_EDITION_RE)) { const k = m[2]!.replace(/^NEC$/i, "National Electrical Code").replace(/^NFPA 70$/i, "National Electrical Code"); if (!found.has(k)) found.set(k, new Set()); found.get(k)!.add(m[1]!); }
    if (found.size) {
      for (const [family, years] of found) {
        const ys = [...years].sort();
        facts.push(mk({ fact_type: "code", fact_key: `found:${family.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, label: family, value: { family, editions_mentioned: ys, applicability: "limited", basis: "Mentioned on the state's official code page" }, display_value: ys.length === 1 ? `${ys[0]} edition (mentioned)` : `Editions mentioned: ${ys.join(", ")}`, source_org: src!.org, source_title: src!.title, source_url: src!.url, provider: "state_code_page_extraction", source_tier: 3, origin: "research", verification: "needs_verification", limitation: `${ys.length > 1 ? "Several editions appear on this page (older editions are often listed alongside the current one). " : ""}Edition mentioned on an official page — current adoption and effective date not confirmed. Local adoption may differ.` }));
      }
    }
    facts.push(mk({ fact_type: "code", fact_key: "state_adoption", label: "State code adoption", value: { state: s.state, source: src?.url ?? null, extracted: found.size }, display_value: src ? (text ? `${src.title} — ${found.size ? `${found.size} code families found` : "no editions extracted"}` : `${src.title} — page unavailable`) : null, source_org: src?.org ?? null, source_title: src?.title ?? null, source_url: src?.url ?? null, provider: "state_code_page_extraction", source_tier: src ? 3 : 7, origin: "research", verification: "needs_verification", limitation: `${src ? "" : `No state adoption source is known for ${s.state ?? "this state"} yet — `}Model code → state adoption → state modifications → local adoption must be confirmed for this jurisdiction. Do not assume the newest model code.` }));
    return { facts, health: n.health, status: "warning", escalations: [`Codes: applicable code editions for ${s.unit?.name ?? s.state ?? "this jurisdiction"} need confirmation.`] };
  }
  const pages = new Map<string, string | null>();
  for (const v of st.codes) if (!pages.has(v.source.url) && v.confirmPattern) pages.set(v.source.url, await getText(n, v.source.url, v.discipline === "fire" ? "fl_sfm" : "fbc_site", v.source.org));
  const resources = st.codeResources ? await getText(n, st.codeResources.url, "fbc_site", st.codeResources.org) : null;
  for (const v of st.codes) {
    const text = pages.get(v.source.url) ?? null;
    const confirmed = !!(v.confirmPattern && text && v.confirmPattern.test(text));
    const app = codeApplicability(v.discipline, scope);
    const ev: EditionEvidence[] = [];
    if (confirmed) ev.push({ source: v.source.org, url: v.source.url, edition: v.edition, effective: v.effective, kind: "adoption" });
    if (v.family.startsWith("Florida Building Code") && resources) {
      for (const m of resources.matchAll(/(\d)(?:th|st|nd|rd) Edition ?\((20\d\d)\) Florida Building Code/g)) {
        const ed = `${m[1]}th Edition (${m[2]})`;
        if (ed !== v.edition && Number(m[2]) < 2023 && !ev.some((e) => e.edition === ed)) ev.push({ source: "FBC code resources page (older edition listed)", url: st.codeResources!.url, edition: ed, kind: "informational" });
      }
    }
    const rec = confirmed ? reconcileEditions(ev, today) : null;
    const verification = confirmed && rec?.verification === "verified" ? "verified" : "needs_verification";
    facts.push(mk({ fact_type: "code", fact_key: v.key, label: v.family, value: { family: v.family, discipline: v.discipline, edition: confirmed ? v.edition : null, effective: confirmed ? v.effective : null, authority: v.source.org, applicability: app.applicability, basis: app.basis, reconciliation: rec?.explanation ?? null, superseded: rec?.superseded.map((x) => x.edition) ?? [], note: v.note ?? null }, display_value: confirmed ? `${v.edition} · ${APPLICABILITY_LABEL[app.applicability]}` : `Not confirmed · ${APPLICABILITY_LABEL[app.applicability]}`, source_org: v.source.org, source_title: v.source.title, source_url: v.source.url, provider: "state_code_adoption", source_tier: v.source.tier, origin: "research", verification, effective_date: confirmed ? v.effective : null, conflicts: rec?.conflicts.map((c) => ({ source: c.source, says: c.edition, url: c.url ?? null })) ?? [], limitation: [rec?.explanation, app.basis, v.note, confirmed ? null : "Adoption text was not confirmed from the official page during this run."].filter(Boolean).join(" ") }));
  }
  if (resources) {
    const sups = [...new Set([...resources.matchAll(/(20\d\d)[ _]Supplement[ _]to[ _]the[ _]8th[ _]Edition[\s\S]{0,80}?Supplement[ _]?(\d+)/gi)].map((m) => `Supplement ${m[2]} (${m[1]})`))];
    if (sups.length) facts.push(mk({ fact_type: "code", fact_key: "fbc_supplements", label: "FBC 8th Edition supplements (state modifications)", value: { supplements: sups, applicability: "applies" }, display_value: sups.join(", "), source_org: st.codeResources!.org, source_title: st.codeResources!.title, source_url: st.codeResources!.url, provider: "state_code_adoption", source_tier: 2, origin: "research", verification: "verified", limitation: "Published supplements modify the 8th Edition; which apply depends on each supplement's effective date and the permit application date." }));
  }
  if (st.pendingEditionPattern) {
    const text = [...pages.values(), resources].join(" ");
    if (st.pendingEditionPattern.re.test(text)) facts.push(mk({ fact_type: "special_condition", fact_key: "pending_code_edition", label: "Upcoming code edition", value: {}, display_value: "9th Edition (2026) FBC listed as a draft / upcoming edition", source_org: "Florida Building Commission", source_title: "Florida Building Code menu", source_url: st.codes[0]!.source.url, provider: "state_code_adoption", source_tier: 2, origin: "research", verification: "needs_verification", limitation: st.pendingEditionPattern.note }));
  }
  facts.push(...(await temporalCodeFacts(s, n, db, scope, ["electrical"])));
  facts.push(...(await floridaAmendments(n, s, st)));
  const unresolved = facts.filter((f) => f.fact_type === "code" && f.verification !== "verified" && (f.value as { applicability?: string }).applicability !== "not_primary");
  const esc = facts.filter((f) => f.fact_type === "local_amendment" && f.verification !== "verified").length ? ["Codes: local amendment status could not be established from state registries — confirm with the local building official."] : [];
  return { facts, health: n.health, status: unresolved.length ? "warning" : "done", escalations: esc, sourceUnavailable: pages.size && [...pages.values()].every((t) => !t) ? st.codes.map((v) => `code:${v.key}`) : [] };
}

// ------------------------------------------------------------------ evidence following (nationwide)

// Discovery assist (paid, metered): web search only LOCATES candidate pages; a result is used only when its
// host is an official government / official code-publisher host. Search snippets are never evidence.
const PAID_BUDGET = 14;
const mdLinks = (md: string) => [...md.matchAll(/\[([^\]]{0,120})\]\((https?:[^)\s]+)\)/g)].map((m) => ({ text: m[1]!, href: m[2]! }));
async function searchOfficial(n: Net, query: string, accept: (host: string) => boolean, limit = 6): Promise<Array<{ url: string; title: string; host: string }>> {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key || n.u.paid_data_calls >= PAID_BUDGET) return [];
  const t0 = Date.now();
  n.u.paid_data_calls++; n.u.estimated_cost_usd += 0.002;
  try {
    const { firecrawlSearch } = await import("@/lib/firecrawl.shared");
    const r = await firecrawlSearch(key, query, limit);
    track(n, "discovery_search", "Web search (discovery only)", "api.firecrawl.dev/search", true, 1, Date.now() - t0);
    return r.map((x) => { let host = ""; try { host = new URL(x.url).hostname.toLowerCase(); } catch { /* skip */ } return { url: x.url, title: x.title ?? x.url, host }; }).filter((x) => x.host && accept(x.host));
  } catch (e) {
    track(n, "discovery_search", "Web search (discovery only)", "api.firecrawl.dev/search", false, 1, Date.now() - t0, (e as Error).message);
    return [];
  }
}
async function scrapeFallback(n: Net, url: string): Promise<{ text: string; links: Array<{ text: string; href: string }> } | null> {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key || n.u.paid_data_calls >= PAID_BUDGET) return null;
  const t0 = Date.now();
  n.u.paid_data_calls++; n.u.estimated_cost_usd += 0.001;
  try {
    const { firecrawlScrape } = await import("@/lib/firecrawl.shared");
    const r = await firecrawlScrape(key, url);
    track(n, "official_page_render", "Official page (rendered retrieval)", url.split("?")[0]!, !!r.markdown, 1, Date.now() - t0);
    return r.markdown ? { text: r.markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " "), links: mdLinks(r.markdown) } : null;
  } catch (e) {
    track(n, "official_page_render", "Official page (rendered retrieval)", url.split("?")[0]!, false, 1, Date.now() - t0, (e as Error).message);
    return null;
  }
}

/** Non-.gov hosts accepted for crawling in this run because discovery tied them to the named government. */
const VERIFIED_EXTRA_HOSTS = new Set<string>();
type CachedPage = { at: number; text: string | null; links: Array<{ text: string; href: string }>; pages?: string[]; doc?: CrawlPage["doc"]; unreadable?: string };
const PAGE_CACHE = new Map<string, CachedPage>();
const isOfficialHost = (h: string) => /\.(gov|us)$/.test(h) || VERIFIED_EXTRA_HOSTS.has(h) || /(municode|ecode360|amlegal|codelibrary|codepublishing|generalcode)/.test(h);

export type CrawlPage = { url: string; text: string; depth: number; trail: string[]; pages?: string[]; doc?: { title: string; kind: DocKind; dates: { published: string | null; adopted: string | null; effective: string | null }; totalPages: number } };
const PDF_RE = /\.pdf(\?|$)|\/documentcenter\/view\/|\/showpublisheddocument\/|\/filestorage\/|\/archive\.aspx\?adid=/i;
const hashText = (t: string) => { let h = 5381; const x = t.slice(0, 6000); for (let i = 0; i < x.length; i++) h = ((h << 5) + h + x.charCodeAt(i)) | 0; return h >>> 0; };

/**
 * Bounded breadth-first crawl from official seed pages, following only links that score toward the
 * evidence being sought. Crosses between official hosts (local → county → state) but never leaves them.
 * Limits: maxPages fetched, maxDepth hops, ≤2 PDFs per crawl, duplicate URLs and duplicate content skipped.
 */
async function followEvidence(n: Net, seeds: string[], opts: { maxPages: number; maxDepth: number; provider: string; label: string; readPdf?: boolean; score?: (text: string, href: string) => number; minScore?: number; maxPdfs?: number }): Promise<CrawlPage[]> {
  const out: CrawlPage[] = [];
  const score = opts.score ?? adoptionLinkScore;
  const queue = seeds.map((u) => ({ url: u, depth: 0, score: 99, trail: [] as string[] }));
  const seen = new Set<string>();
  const hashes = new Set<number>();
  let fetched = 0, pdfs = 0;
  while (queue.length && out.length < opts.maxPages && fetched < opts.maxPages + 4) {
    queue.sort((a, b) => b.score - a.score);
    const cur = queue.shift()!;
    const key = cur.url.split("#")[0]!;
    if (seen.has(key)) { n.u.duplicates_skipped = (n.u.duplicates_skipped ?? 0) + 1; continue; }
    seen.add(key);
    let host = "";
    try { host = new URL(key).hostname.toLowerCase(); } catch { continue; }
    if (!isOfficialHost(host)) continue;
    const isPdf = PDF_RE.test(key);
    if (isPdf && (!opts.readPdf || pdfs >= (opts.maxPdfs ?? 2))) continue;
    let hit = PAGE_CACHE.get(key);
    if (hit && Date.now() - hit.at < 6 * 3600000) n.u.cache_hits++;
    else {
      fetched++;
      if (isPdf) {
        pdfs++;
        const t0 = Date.now();
        n.u.deterministic_calls++;
        const { readOfficialPdf } = await import("./officialDocs.server");
        const d = await readOfficialPdf(key);
        track(n, "official_document", "Official document (PDF)", key.split("?")[0]!, d.ok, 1, Date.now() - t0, d.error);
        const title = d.title ?? decodeURIComponent(key.split("/").pop() ?? "document").replace(/[-_]+/g, " ").replace(/\.pdf.*$/i, "");
        if (!d.ok || d.scanned) hit = { at: Date.now(), text: null, links: [], unreadable: d.scanned ? "scanned" : d.error ?? "unreadable" };
        else {
          n.u.documents_read = (n.u.documents_read ?? 0) + 1;
          const full = d.pages.join(" ");
          hit = { at: Date.now(), text: full, links: [], pages: d.pages, doc: { title, kind: classifyDocKind(title, full), dates: documentDates(d.pages), totalPages: d.totalPages } };
        }
        if (hit.unreadable) (n.unreadableDocs ??= []).push({ url: key, title, reason: hit.unreadable });
      } else {
        const r = await getRaw(n, key, {}, opts.provider, opts.label);
        hit = { at: Date.now(), text: r.html ? htmlToText(r.html) : null, links: r.html ? extractLinks(r.html, key) : [] };
        // Bot-blocked / script-rendered official page: retrieve it once through the rendering service.
        if (!hit.text || hit.text.length < 400) { const f = await scrapeFallback(n, key); if (f) hit = { at: Date.now(), text: f.text, links: f.links }; }
      }
      PAGE_CACHE.set(key, hit);
    }
    if (!hit.text) continue;
    const h = hashText(hit.text);
    if (hashes.has(h)) { n.u.duplicates_skipped = (n.u.duplicates_skipped ?? 0) + 1; continue; }
    hashes.add(h);
    out.push({ url: key, text: hit.text, depth: cur.depth, trail: [...cur.trail, key], pages: hit.pages, doc: hit.doc });
    if (cur.depth >= opts.maxDepth) continue;
    for (const l of hit.links) {
      const sc = score(l.text, l.href) + (PDF_RE.test(l.href) && opts.readPdf ? 1 : 0);
      if (sc >= (opts.minScore ?? 3) && !seen.has(l.href)) queue.push({ url: l.href, depth: cur.depth + 1, score: sc, trail: [...cur.trail, key] });
    }
  }
  n.u.pages_read = (n.u.pages_read ?? 0) + out.length;
  return out;
}

const STATE_NAMES: Record<string, string> = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };

/** Unknown state: find its code authority through the .gov registry, then follow the evidence chain. */
async function discoverStateCodeEvidence(s: PipelineState, n: Net): Promise<{ evidence: CodeEvidence[]; pages: number; sources: string[] }> {
  if (!s.state) return { evidence: [], pages: 0, sources: [] };
  const rows = await dotgovRows(n);
  const name = STATE_NAMES[s.state] ?? s.state;
  const stateRows = rows.filter((r) => r.type.startsWith("State") && r.state.toUpperCase() === s.state);
  const CODE_RE = /(building|construction|codes?|fire ?marshal|firemarshal|commerce|labor|industr|licens|safety|housing|dhcd|dli|dol)/i;
  const agencies = stateRows.filter((r) => CODE_RE.test(`${r.org} ${r.domain}`) && !/(court|election|lottery|tourism|fish|hunt|veteran|school|college|univ)/i.test(`${r.org} ${r.domain}`))
    .sort((a, b) => Number(/(building|codes?|construction|fire ?marshal)/i.test(`${b.org} ${b.domain}`)) - Number(/(building|codes?|construction|fire ?marshal)/i.test(`${a.org} ${a.domain}`))).slice(0, 4);
  const portal = stateRows.find((r) => r.domain === `${name.toLowerCase().replace(/ /g, "")}.gov`) ?? stateRows.find((r) => r.domain === `${s.state!.toLowerCase()}.gov`);
  const seeds = [...agencies.map((a) => `https://${a.domain}/`), ...(portal ? [`https://${portal.domain}/`] : [])];
  const found = await searchOfficial(n, `${name} state building code adopted edition effective date residential commercial`, (h) => /\.(gov|us)$/.test(h));
  seeds.unshift(...found.map((f) => f.url).slice(0, 4));
  const pages = await followEvidence(n, seeds, { maxPages: 10, maxDepth: 2, provider: "state_official_site", label: `${name} official state website` });
  const evidence: CodeEvidence[] = [];
  const sources: string[] = [];
  for (const p of pages) {
    const stmts = extractAdoptionStatements(p.text);
    if (!stmts.length) continue;
    sources.push(p.url);
    const type = classifySourceType(p.url, p.text);
    const auth = agencies.find((a) => p.url.includes(a.domain))?.org ?? `${name} state government`;
    for (const st of stmts) evidence.push(toEvidence(st, { layer: "state", state: s.state, authority: auth, url: p.url, source_type: type, primary: true }));
  }
  return { evidence, pages: pages.length, sources };
}

/** Local AHJ adoption & amendment research. Never substitutes the state baseline for an unestablished local adoption. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function localWorker(s: PipelineState, n: Net, db: any): Promise<StepResult> {
  const facts: Fact[] = [];
  const unit = s.unit;
  const localState = LOCAL_ADOPTION_STATES.includes(s.state ?? "");
  const pol = amendmentPolicyFor(s.state);
  // The building authority from the authority graph (may differ from the governing unit, e.g. township → county).
  const bldAgency = s.buildingAgency ?? unit?.name ?? "the local jurisdiction";
  const ahj = bldAgency;
  const disc = s.discovered ?? [];
  const seeds = [...disc.filter((d) => ["building", "permits", "municipal_code", "code_adoption", "county_building", "authority_page"].includes(d.category)).map((d) => d.url), ...disc.filter((d) => d.category === "official_website" || d.category === "county_website").map((d) => d.url)].slice(0, 6);
  if (unit?.name && s.state) {
    const hits = await searchOfficial(n, `${ahj} ${STATE_NAMES[s.state] ?? s.state} adopted building codes edition ordinance`, (h) => isOfficialHost(h));
    for (const h of hits.slice(0, 3)) if (!seeds.includes(h.url)) seeds.unshift(h.url);
  }
  if (!seeds.length) {
    facts.push(mk({ fact_type: "local_amendment", fact_key: "local_adoption", label: `Local code adoption — ${ahj}`, value: { status: "not_established", reason: "no_official_sources" }, display_value: "Needs Verification — local adoption not established", source_org: null, source_title: null, source_url: null, provider: "local_adoption_research", source_tier: 7, origin: "research", verification: "needs_verification", limitation: `No official local building or code pages were discovered for ${ahj}, so local adoption could not be researched. The state baseline is not substituted.` }));
    return { facts, health: n.health, status: "warning", escalations: localState ? [`Local code adoption for ${ahj} not established (state requires local adoption).`] : [] };
  }
  const pages = await followEvidence(n, seeds, { maxPages: 9, maxDepth: 2, provider: "local_official_site", label: `${ahj} official website`, readPdf: true });
  const govHosts = [...new Set(disc.filter((d) => /website|building|permits|authority_page/.test(d.category)).map((d) => d.host).filter(Boolean))];
  const localEv: CodeEvidence[] = [];
  const docs: DocEvidence[] = [];
  let amendmentPage: { url: string; quote: string; page: number | null } | null = null;
  let preempt: { url: string; quote: string } | null = null;
  for (const p of pages) {
    const type = p.doc ? (/(ordinance|resolution)/i.test(p.text.slice(0, 4000)) ? "adoption_notice" : classifySourceType(p.url, p.text)) : classifySourceType(p.url, p.text);
    const auth = documentAuthority(p.url, govHosts);
    const units = p.pages ?? [p.text];
    units.forEach((txt, i) => {
      for (const st of extractAdoptionStatements(txt)) {
        if (st.proposed) continue;
        const pageRef = p.pages ? i + 1 : null;
        const ev = toEvidence(st, { layer: "local", state: s.state ?? "", jurisdiction_key: s.jurisdictionKey ?? null, authority: ahj, url: p.url, source_type: type, primary: auth === "issuing_government" || auth === "code_publisher" });
        if (pageRef) ev.note = `${ev.note ? `${ev.note} ` : ""}Document page ${pageRef}.`;
        if (!localEv.some((e) => e.family === ev.family && e.edition === ev.edition && e.url === ev.url)) localEv.push(ev);
        if (p.doc && docs.length < 12) docs.push({ url: p.url, title: p.doc.title, issuing_authority: auth === "issuing_government" ? ahj : null, authority_class: auth, published: p.doc.dates.published, adopted: st.adopted ?? p.doc.dates.adopted, effective: st.effective_from ?? p.doc.dates.effective, page: pageRef, section: null, excerpt: st.quote.slice(0, 320), retrieved_at: now(), readable: true, kind: p.doc.kind });
      }
      if (!amendmentPage) { const m = txt.match(/[^.]{0,160}\b(local amendments?|amendments? to the (20\d\d )?(international|florida|national|uniform))[^.]{0,200}\./i); if (m) amendmentPage = { url: p.url, quote: m[0].trim().slice(0, 360), page: p.pages ? i + 1 : null }; }
    });
    if (!preempt) { const q = statePreemptionCue(p.text); if (q) preempt = { url: p.url, quote: q }; }
  }
  // Scanned / unreadable official documents: record, never guess.
  for (const u of n.unreadableDocs ?? []) docs.push({ url: u.url, title: u.title, issuing_authority: null, authority_class: documentAuthority(u.url, govHosts), published: null, adopted: null, effective: null, page: null, section: null, excerpt: "", retrieved_at: now(), readable: false, kind: "other" });

  // Temporal resolution of LOCAL evidence, then reconciliation against the state baseline.
  const today = new Date().toISOString().slice(0, 10);
  const cd = applicableCodeDate({ application_date: s.applicationDate ?? null, today });
  let stateEv: CodeEvidence[] = [];
  if (db && s.state) { const { data } = await db.from("code_adoption_evidence").select("*").eq("state", s.state).eq("layer", "state"); stateEv = ((data ?? []) as EvidenceRow[]).map(toEv); }
  if (!stateEv.length) stateEv = seedFor(s.state);
  const fams = [...new Set(localEv.map((e) => e.family))];
  let conflictsResolved = 0;
  for (const fam of fams) {
    const lr = resolveFamily(s.state ?? "", fam, localEv, cd.date, "local", s.jurisdictionKey ?? null);
    const sr = resolveFamily(s.state ?? "", fam, stateEv, cd.date);
    const rec = reconcileLocal(lr, sr, localState);
    if (rec.status === "local_stale" || lr.superseded.length) conflictsResolved++;
    const ev = lr.current?.evidence[0] ?? localEv.find((e) => e.family === fam)!;
    const verified = rec.status === "local_controls" && lr.status === "current_verified" && ev.primary && (ev.source_type === "adoption_notice" || ev.source_type === "rule");
    facts.push(mk({ fact_type: "local_amendment", fact_key: `local_adoption:${fam}`, label: `${FAMILY_LABEL[fam]} — local adoption (${ahj})`,
      value: { family: fam, edition: lr.current?.edition ?? ev.edition, local_status: lr.status, reconciliation: rec.status, why: `${lr.why} ${rec.why}`.trim(), state_edition: sr.current?.edition ?? null,
        superseded: lr.superseded.map((p) => p.edition), stale: rec.status === "local_stale", effective_from: lr.current?.effective_from ?? null, source_type: ev.source_type, quote: ev.quote, note: ev.note ?? null, layer: "local" },
      display_value: rec.status === "local_stale" ? `${ev.edition} on local page · superseded by statewide ${sr.current?.edition}` : `${lr.current?.edition ?? ev.edition}${lr.current?.effective_from ? ` · effective ${lr.current.effective_from}` : ""}`,
      source_org: ahj, source_title: `${SOURCE_TYPE_LABEL[ev.source_type]}${ev.note ? ` — ${ev.note}` : ""}`, source_url: ev.url, provider: "local_adoption_research",
      source_tier: ev.source_type === "rule" || ev.source_type === "adoption_notice" ? 2 : 3, origin: "research", verification: verified ? "verified" : "needs_verification", effective_date: lr.current?.effective_from ?? null,
      conflicts: rec.status === "unresolved" && sr.current ? [{ source: `${s.state} state baseline`, says: sr.current.edition, url: sr.current.evidence[0]?.url ?? null }] : [],
      limitation: `“${ev.quote.slice(0, 220)}” ${rec.why} ${ev.source_type === "rule" || ev.source_type === "adoption_notice" ? "" : "An informational page is not the adopting ordinance — confirm against the ordinance."}`.trim() }));
  }
  if (db && localEv.length) {
    const { data: have } = await db.from("code_adoption_evidence").select("family,edition,url").eq("layer", "local").eq("jurisdiction_key", s.jurisdictionKey ?? "");
    const k = new Set(((have ?? []) as Array<{ family: string; edition: string; url: string }>).map((r) => `${r.family}|${r.edition}|${r.url}`));
    const rows = localEv.filter((e) => !k.has(`${e.family}|${e.edition}|${e.url}`)).map((e) => ({ ...toRow(e), discovered_by: "local_adoption_research" }));
    if (rows.length) await db.from("code_adoption_evidence").insert(rows).then(() => {}, () => {});
  }
  if (!fams.length) facts.push(mk({ fact_type: "local_amendment", fact_key: "local_adoption", label: `Local code adoption — ${ahj}`, value: { status: "not_established", pages_read: pages.length, documents_read: pages.filter((p) => p.doc).length }, display_value: "Needs Verification — local adoption not established", source_org: ahj, source_title: "Official website (searched)", source_url: seeds[0] ?? null, provider: "local_adoption_research", source_tier: 7, origin: "research", verification: "needs_verification", limitation: `${pages.length} official page(s)/document(s) were read; none stated the locally adopted edition. The state baseline is not substituted.` }));
  const am = amendmentPage as { url: string; quote: string; page: number | null } | null;
  facts.push(mk({ fact_type: "local_amendment", fact_key: "local_amendments", label: `Local amendments — ${ahj}`, value: { found: !!am, page: am?.page ?? null }, display_value: am ? `Local amendments referenced${am.page ? ` (document p. ${am.page})` : ""}` : "Not established", source_org: ahj, source_title: am ? "Official page/document mentioning amendments" : null, source_url: am?.url ?? null, provider: "local_adoption_research", source_tier: am ? 3 : 7, origin: "research", verification: "needs_verification", limitation: am ? `“${am.quote}” — amendment text itself must be reviewed in the ordinance.` : "No official page stated whether local amendments exist. Absence is not proof there are none." }));
  if (preempt || pol) facts.push(mk({ fact_type: "local_amendment", fact_key: "amendment_authority", label: "Limits on local amendments", value: { local_quote: preempt?.quote ?? null, state_policy: pol?.policy ?? null }, display_value: preempt ? preempt.quote.slice(0, 120) : pol!.text, source_org: preempt ? ahj : null, source_title: preempt ? "Official local page" : "State amendment policy", source_url: preempt?.url ?? pol?.url ?? null, provider: "local_adoption_research", source_tier: 2, origin: "research", verification: "needs_verification" }));
  if (docs.length) facts.push(docFact(docs, ahj));
  if (db && s.jurisdictionKey && (fams.length || docs.length)) {
    await saveKnowledge(db, s.jurisdictionKey, ahj, [
      ...[...new Set(localEv.map((e) => e.url))].map((u) => ({ category: "code_adoption", url: u, title: `${ahj} — adopted codes`, trust: "official_informational", host: new URL(u).hostname })),
      ...docs.filter((d) => d.readable).map((d) => ({ category: "official_document", url: d.url, title: d.title, trust: d.authority_class, host: new URL(d.url).hostname, meta: d })),
    ]).catch(() => {});
  }
  n.u.conflicts_resolved = (n.u.conflicts_resolved ?? 0) + conflictsResolved;
  const esc = !fams.length && localState ? [`Local code adoption for ${ahj} not established (state requires local adoption).`] : [];
  return { facts, health: n.health, status: fams.length ? "done" : "warning", escalations: esc, note: `${pages.length} official page(s) read · ${pages.filter((p) => p.doc).length} document(s)` };
}

function docFact(docs: DocEvidence[], ahj: string): Fact {
  const readable = docs.filter((d) => d.readable);
  return mk({ fact_type: "local_amendment", fact_key: "official_documents", label: `Official documents read — ${ahj}`, value: { documents: docs },
    display_value: `${readable.length} document(s) read${docs.length > readable.length ? ` · ${docs.length - readable.length} scanned/unreadable` : ""}`,
    source_org: ahj, source_title: readable[0]?.title ?? "Official documents", source_url: readable[0]?.url ?? docs[0]?.url ?? null, provider: "official_document_research", source_tier: 3, origin: "research", verification: "needs_verification",
    limitation: `${docs.length > readable.length ? "Scanned or unreadable documents were not interpreted — they need human review. " : ""}Each excerpt cites its document page. A document hosted on a government website still needs confirmation that it is the adopting body's current version.` });
}

async function permitsWorker(s: PipelineState, n: Net): Promise<StepResult> {
  const facts: Fact[] = [];
  const st = s.state ? STATE_CONFIGS[s.state] ?? null : null;
  const confirmed = new Set(s.confirmedSources);
  if (st?.buildingPermitStatute) {
    const t = await getText(n, st.buildingPermitStatute.url, "fl_statutes", "Florida Statutes");
    if (t && /553\.79/.test(t) && st.buildingPermitStatute.confirmPattern.test(t)) confirmed.add("building_permit_statute");
  }
  if (st?.noticeOfCommencement) {
    const t = await getText(n, st.noticeOfCommencement.url, "fl_statutes", "Florida Statutes");
    if (t && /713\.135/.test(t) && st.noticeOfCommencement.confirmPattern.test(t)) confirmed.add("notice_of_commencement");
  }
  s.confirmedSources = [...confirmed];
  const scope = normalizeScope({ scopeText: s.scopeText, workType: s.workType, projectType: s.projectType });
  const eff = effectiveScope(scope.attributes, s.scopeCorrections);
  facts.push(mk({ fact_type: "scope_attribute", fact_key: "_original", label: "Original scope text", value: { text: scope.original, work_type: s.workType, project_type: s.projectType }, display_value: scope.original || null, source_org: "Project record", source_title: "Customer-entered scope", source_url: null, provider: "project_record", source_tier: 5, origin: "stored", verification: "needs_verification" }));
  for (const a of scope.attributes) {
    facts.push(mk({ fact_type: "scope_attribute", fact_key: `derived:${a.key}`, label: SCOPE_LABEL[a.key], value: { key: a.key, value: a.value, origin: a.origin, evidence: a.evidence, effective: eff.has(a.key) }, display_value: eff.has(a.key) ? "Yes" : "No (corrected)", source_org: "Permivio scope rules", source_title: "Deterministic scope normalization", source_url: null, provider: "scope_rules", source_tier: 7, origin: "research", verification: "potential", limitation: "Derived from the scope text — confirm or correct." }));
  }
  const bldFact = s.unit?.name ? (s.unit.level === "county" ? s.unit.name : s.unit.name) : null;
  const cands = evaluatePermitCandidates({
    state: s.state, county: s.unit?.level === "county" ? countyConfigFor(s.state, s.countyFips) : null, stateCfg: st, incorporation: s.incorporation,
    scope: eff as Set<ScopeAttribute>, flood: s.flood, zoning: { code: s.zoningCode }, historic: s.historic,
    waterProvider: s.parcel ? String(s.parcel["WATERSERVICEAREAS"] ?? "") || null : null,
    wastewaterProvider: s.parcel ? String(s.parcel["WASTEWATERSERVICEAREAS"] ?? "") || null : null,
    hasSepticDocument: s.hasSepticDocument, confirmedSources: confirmed, ahjName: bldFact,
    ahjSource: s.discovered?.find((d) => d.category === "building" || d.category === "permits") ?? null,
  });
  for (const c of cands) {
    facts.push(mk({ fact_type: "permit_candidate", fact_key: c.key, label: c.name, value: { ...c, requirement_type_label: REQUIREMENT_TYPE_LABEL[c.requirement_type] }, display_value: c.agency, source_org: c.source?.org ?? null, source_title: c.source?.title ?? null, source_url: c.source?.url ?? null, provider: "permit_rules_engine", source_tier: c.source?.tier ?? 7, origin: "research", verification: c.verification, requirement_type: c.requirement_type, limitation: c.note ?? null } as Fact));
  }
  return { facts, health: n.health, status: cands.length ? "done" : "warning" };
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
  const n = net(u);
  switch (key) {
    case "property": return { ...(await propertyWorker(s, n)), health: n.health };
    case "boundary": return boundaryWorker(s, n);
    case "ahj": return ahjWorker(s, n, db);
    case "flood": return floodWorker(s, n);
    case "zoning": return { ...(await zoningWorker(s, n, db)), health: n.health };
    case "codes": return codesWorker(s, n, db);
    case "local": return localWorker(s, n, db);
    case "permits": return permitsWorker(s, n);
    case "reconcile": return reconcileWorker(s);
  }
}

export { COUNTY_CONFIGS };
