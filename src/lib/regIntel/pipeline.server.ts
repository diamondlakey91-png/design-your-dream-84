// PERMIVIO — Property & Jurisdiction research pipeline (server-only).
// Orchestrated workers, each bounded and deterministic: government GIS/API → parsing → facts.
// No generative AI is used in any worker; AI never decides boundaries, zones or verification.

import { censusGeographiesByAddress, censusGeographiesByPoint, type CensusGeography } from "@/lib/govGis.server";
import { COUNTY_CONFIGS, STATE_CONFIGS, countyConfigFor, coverageFor, type ArcgisLayer, type StateConfig } from "./coverage";
import { decideVerification, recheckAfter, resolveGoverningAuthority, type Fact, type Conflict } from "./types";
import { arcgisAll, arcgisFirst, classifyFlood, epochToDate, floodPosition, pickPanel, reconcileEditions, parseBcisRows, withRetry, PROVENANCE_LABEL, type ArcgisResponse, type HealthEvent, type SourceProvenance, type EditionEvidence } from "./providers.shared";
import { codeApplicability, APPLICABILITY_LABEL } from "./codeStack";
import { normalizeScope, effectiveScope, SCOPE_LABEL, type ScopeAttribute } from "./scope";
import { resolveGoverningUnit, matchDotGov, classifyLink, govNameTokens, type GoverningUnit, type DotGovRow, type GeoUnit } from "./nationalAhj";
import { evaluatePermitCandidates, REQUIREMENT_TYPE_LABEL } from "./rules";

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
  geo?: { place: GeoUnit; countySub: GeoUnit } | null;
  unit?: GoverningUnit | null;
  jurisdictionKey?: string | null;
  discovered?: Array<{ category: string; url: string; title: string; trust: string; host: string }> | null;
  storedJurisdiction: { label: string | null; county: string | null; municipality: string | null; incorporated: boolean | null; status: string | null } | null;
};

export type Usage = { deterministic_calls: number; gis_calls: number; paid_data_calls: number; ai_calls: number; tokens: number; estimated_cost_usd: number; duration_ms: number; retries: number; cache_hits: number };
export type StepResult = {
  facts: Fact[]; status: StepState["status"]; note?: string; escalations?: string[];
  /** Provider health observed in this step (tracked separately from facts). */
  health?: HealthEvent[];
  /** fact keys ("type:key") whose authoritative source was unavailable — keep a prior verified value if one exists. */
  sourceUnavailable?: string[];
};

const UA = { "User-Agent": "Permivio/1.0 (permitting research)", Accept: "application/json,text/html" };

type Net = { u: Usage; health: HealthEvent[] };
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

type Discovered = { category: string; url: string; title: string; trust: string; host: string };
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
  return data.map((r: { url: string; title: string; category: string; trust: string; meta: { host?: string } }) => ({ url: r.url, title: r.title, category: r.category, trust: r.trust, host: r.meta?.host ?? "" }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveKnowledge(db: any, key: string, publisher: string, list: Discovered[]) {
  if (!db || !list.length) return;
  const recheck = new Date(Date.now() + 180 * 86400000).toISOString();
  const { data: existing } = await db.from("official_sources").select("id,url,category").eq("jurisdiction_key", key);
  for (const d of list) {
    const hit = (existing ?? []).find((e: { url: string; category: string }) => e.url === d.url && e.category === d.category);
    const row = { url: d.url, title: d.title.slice(0, 200), publisher, kind: d.category === "municipal_code" ? "code" : d.category === "permit_portal" ? "portal" : "agency_site", jurisdiction_key: key, category: d.category, trust: d.trust, discovered_by: "official_source_discovery", verification: "needs_verification", recheck_after: recheck, fetched_at: new Date().toISOString(), meta: { host: d.host } };
    if (hit) await db.from("official_sources").update(row).eq("id", hit.id);
    else await db.from("official_sources").insert(row);
  }
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
    await saveKnowledge(db, key, domainOrg ?? unit.name, sources).catch(() => {});
  }
  s.discovered = sources;
  const site = sources.find((x) => x.category === "official_website");
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
    const gov = unit.level === "county" ? `${unit.name}` : unit.name;
    const noCountyCodes = s.state === "TX" && unit.level === "county";
    facts.push(mk({ fact_type: "agency", fact_key: "building", label: "Building permitting authority", value: { government: gov, level: unit.level, page: bldPage?.url ?? null }, display_value: noCountyCodes ? `${gov} (county building-code authority is limited in Texas)` : `${gov} — building department${bldPage ? ` (${bldPage.title})` : ""}`, source_org: bldPage ? domainOrg ?? gov : "U.S. Census Bureau", source_title: bldPage ? bldPage.title : "Governing jurisdiction from TIGER boundaries", source_url: bldPage?.url ?? s.censusUrl, provider: "ahj_resolver+official_source_discovery", source_tier: bldPage ? 3 : 4, origin: reused ? "stored" : "research", verification: "needs_verification", limitation: `${unit.basis} ${bldPage ? "A building/permits page was found on the official site; the department's responsibility for this scope is not formally confirmed." : "No building-department page was discovered automatically."}${unit.stateNote ? ` ${unit.stateNote}` : ""} Some governments contract building services to another agency.` }));
    facts.push(mk({ fact_type: "agency", fact_key: "planning_zoning", label: "Planning / zoning authority", value: { government: gov, page: zon?.url ?? null }, display_value: `${gov}${zon ? ` — ${zon.title}` : ""}`, source_org: zon ? domainOrg ?? gov : "U.S. Census Bureau", source_title: zon?.title ?? "Governing jurisdiction", source_url: zon?.url ?? s.censusUrl, provider: "ahj_resolver+official_source_discovery", source_tier: zon ? 3 : 4, origin: reused ? "stored" : "research", verification: "needs_verification", limitation: "Zoning is normally administered by the governing jurisdiction; confirm (some towns have no zoning)." }));
  }
  if (portal) facts.push(mk({ fact_type: "agency", fact_key: "permit_portal", label: "Online permit portal", value: { url: portal.url, trust: portal.trust }, display_value: portal.url.replace(/^https?:\/\//, "").slice(0, 80), source_org: domainOrg ?? unit.name, source_title: `Linked from the official website: ${portal.title}`, source_url: portal.url, provider: "official_source_discovery", source_tier: 3, origin: reused ? "stored" : "research", verification: "needs_verification", limitation: "Linked from the official government site; confirm it is the current portal for this permit type." }));
  if (code) facts.push(mk({ fact_type: "local_amendment", fact_key: "municipal_code_source", label: "Local code of ordinances", value: { url: code.url }, display_value: code.url.replace(/^https?:\/\//, "").slice(0, 80), source_org: domainOrg ?? unit.name, source_title: `Linked from the official website: ${code.title}`, source_url: code.url, provider: "official_source_discovery", source_tier: 3, origin: reused ? "stored" : "research", verification: "needs_verification", limitation: "Source for local amendments and zoning text; content not yet extracted." }));
  if (s.parcel && cfg) {
    const w = String(s.parcel["WATERSERVICEAREAS"] ?? "").trim();
    const ww = String(s.parcel["WASTEWATERSERVICEAREAS"] ?? "").trim();
    if (w || ww) facts.push(mk({ fact_type: "agency", fact_key: "utility", label: "Water / wastewater service area", value: { water: w || null, wastewater: ww || null }, display_value: `Water: ${w || "—"} · Wastewater: ${ww || "—"}`, source_org: cfg.gisOrg, source_title: cfg.layers.parcel!.title, source_url: s.parcelUrl, provider: "county_arcgis_parcel", source_tier: 1, origin: "research", verification: "verified", limitation: "Service area does not prove a line is available at the lot." }));
  }
  const esc = site ? [] : [`Permitting authority: official website for ${unit.name} not discovered automatically.`];
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

const ZONING_FIELD = /^(zon(e|ing)?(_?(class|code|dist(rict)?|type|desc))?|zn_?type|zoning_?code|zone_?cd|zonecode|zonedist|zoning1|base_?zone|zone_?name)$/i;
const ZONING_BAD = /(opportunity|flood|school|time|plane|climate|weather|hurricane|fire|evac|storm|parking zone|enterprise|census|utility|police|trash|snow|wind|seismic)/i;

/** Nationwide zoning discovery: known provider → stored layer → ArcGIS catalogue search, validated by
 *  owner/jurisdiction match and an actual point hit. Discovered layers are official-looking but not
 *  verified unless hosted on the government's own .gov domain. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function discoverZoning(s: PipelineState, n: Net, db: any): Promise<{ code: string | null; field: string | null; layerUrl: string | null; title: string | null; owner: string | null; onGov: boolean; tried: number }> {
  const none = { code: null, field: null, layerUrl: null, title: null, owner: null, onGov: false, tried: 0 };
  if (!s.unit?.name || s.lat === null || s.lng === null) return none;
  const core = govNameTokens(s.unit.name).core;
  const govHost = s.discovered?.find((d) => d.category === "official_website")?.host ?? null;
  // Reuse a previously validated zoning layer for this jurisdiction.
  const stored = s.discovered?.find((d) => d.category === "gis_zoning");
  const candidates: Array<{ url: string; title: string; owner: string }> = [];
  if (stored) { candidates.push({ url: stored.url, title: stored.title, owner: stored.host }); n.u.cache_hits++; }
  else {
    const q = `title:zoning AND (${core.split(" ").map((w) => `"${w}"`).join(" ")}) AND (type:"Feature Service" OR type:"Map Service")`;
    const bbox = `${s.lng - 0.02},${s.lat - 0.02},${s.lng + 0.02},${s.lat + 0.02}`;
    const j = (await getJson(n, `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&bbox=${bbox}&num=15&f=json`, "arcgis_catalog", "ArcGIS Online catalogue", 1)) as unknown as { results?: Array<{ title: string; owner: string; url: string | null }> } | null;
    for (const r of j?.results ?? []) {
      if (!r.url || ZONING_BAD.test(r.title)) continue;
      const hay = `${r.title} ${r.owner} ${r.url}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!hay.includes(core.replace(/[^a-z0-9]/g, ""))) continue;
      candidates.push({ url: r.url, title: r.title, owner: r.owner });
      if (candidates.length >= 5) break;
    }
  }
  let tried = 0;
  for (const c of candidates) {
    const isLayer = /\/(MapServer|FeatureServer)\/\d+\/?$/.test(c.url);
    let layers: string[] = [];
    if (isLayer) layers = [c.url.replace(/\/$/, "")];
    else {
      const meta = (await getJson(n, `${c.url.replace(/\/$/, "")}?f=json`, "arcgis_catalog", "ArcGIS Online catalogue", 0)) as unknown as { layers?: Array<{ id: number; name: string }> } | null;
      layers = (meta?.layers ?? []).filter((l) => /zon/i.test(l.name) && !ZONING_BAD.test(l.name)).slice(0, 2).map((l) => `${c.url.replace(/\/$/, "")}/${l.id}`);
      if (!layers.length && (meta?.layers ?? []).length === 1) layers = [`${c.url.replace(/\/$/, "")}/${meta!.layers![0]!.id}`];
    }
    for (const lu of layers) {
      tried++;
      const attrs = arcgisFirst(await getJson(n, pointQuery({ url: lu }, s.lat, s.lng), "discovered_gis", "Discovered local GIS", 0));
      if (!attrs) continue;
      const field = Object.keys(attrs).find((k) => ZONING_FIELD.test(k)) ?? Object.keys(attrs).find((k) => /zon/i.test(k) && typeof attrs[k] === "string");
      const code = field ? String(attrs[field] ?? "").trim() : "";
      if (!code) continue;
      const host = new URL(lu).hostname.toLowerCase();
      const onGov = !!govHost && (host.endsWith(govHost) || host.endsWith(".gov"));
      if (!stored && s.jurisdictionKey) await saveKnowledge(db, s.jurisdictionKey, c.owner, [{ category: "gis_zoning", url: lu, title: c.title, trust: onGov ? "authoritative_structured" : "official_catalogue_unconfirmed", host }]).catch(() => {});
      return { code, field, layerUrl: lu, title: c.title, owner: c.owner, onGov, tried };
    }
  }
  return { ...none, tried };
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
    facts.push(mk({ fact_type: "zoning", fact_key: "district", label: "Zoning district", value: { code: z.code, field: z.field, zoning_jurisdiction: s.unit.name, layer: z.layerUrl, owner: z.owner, on_gov_domain: z.onGov, layers_tested: z.tried }, display_value: z.code, source_org: z.owner ?? null, source_title: z.title ?? "Zoning source discovery", source_url: z.layerUrl, provider: "zoning_discovery", source_tier: z.code ? (z.onGov ? 1 : 6) : 7, origin: "research", verification: z.code && z.onGov ? "verified" : "needs_verification", limitation: z.code ? (z.onGov ? `Read from ${s.unit.name}'s own GIS service at the property point.` : `Read from a zoning layer published by "${z.owner}" in the ArcGIS catalogue that answers at this point. The publisher was matched to ${s.unit.name} by name only — confirm it is the official, current zoning map.`) : `No authoritative zoning layer for ${s.unit.name} was found automatically (${z.tried} candidate layer(s) tested). Research the official zoning map or contact the planning department.` }));
    return { facts, health: n.health, status: z.code && z.onGov ? "done" : "warning", note: z.code ? (z.onGov ? "Official GIS" : "Discovered layer — needs verification") : "No zoning source found", escalations: z.code ? [] : [`Zoning: no official zoning source discovered for ${s.unit.name}.`] };
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

async function codesWorker(s: PipelineState, n: Net): Promise<StepResult> {
  const st = s.state ? STATE_CONFIGS[s.state] : undefined;
  const facts: Fact[] = [];
  const scope = effectiveScope(normalizeScope({ scopeText: s.scopeText, workType: s.workType, projectType: s.projectType }).attributes, s.scopeCorrections) as Set<ScopeAttribute>;
  const today = new Date().toISOString().slice(0, 10);
  if (!st) {
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
    facts.push(mk({ fact_type: "local_amendment", fact_key: "building", label: "Local code adoption / amendments", value: { status: "unknown" }, display_value: null, source_org: null, source_title: null, source_url: s.discovered?.find((d) => d.category === "municipal_code")?.url ?? null, provider: "local_amendment_research", source_tier: 7, origin: "research", verification: "needs_verification", limitation: "Local adoption and amendments were not established automatically. Check the local code of ordinances." }));
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
  facts.push(...(await floridaAmendments(n, s, st)));
  const unresolved = facts.filter((f) => f.fact_type === "code" && f.verification !== "verified" && (f.value as { applicability?: string }).applicability !== "not_primary");
  const esc = facts.filter((f) => f.fact_type === "local_amendment" && f.verification !== "verified").length ? ["Codes: local amendment status could not be established from state registries — confirm with the local building official."] : [];
  return { facts, health: n.health, status: unresolved.length ? "warning" : "done", escalations: esc, sourceUnavailable: pages.size && [...pages.values()].every((t) => !t) ? st.codes.map((v) => `code:${v.key}`) : [] };
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
    case "codes": return codesWorker(s, n);
    case "permits": return permitsWorker(s, n);
    case "reconcile": return reconcileWorker(s);
  }
}

export { COUNTY_CONFIGS };
