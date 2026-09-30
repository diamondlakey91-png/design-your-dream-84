// PERMIVIO — nationwide governing-unit resolver (pure). Uses Census TIGER geography only; never the
// mailing city. Handles incorporated places, New England / mid-Atlantic towns & townships (active MCDs),
// independent cities, the District of Columbia and unincorporated county territory.

export type GeoUnit = { name: string; lsad: string | null; funcstat: string | null; geoid?: string | null } | null;

export type GoverningUnit = {
  level: "municipality" | "town_or_township" | "independent_city" | "federal_district" | "county" | "undetermined";
  name: string | null;
  kind: string | null;
  /** How confident the structural rule is: "structural" = boundary + government-type rule; "confirm" = state practice varies. */
  certainty: "structural" | "confirm";
  basis: string;
  stateNote: string | null;
};

/** States whose county subdivisions (towns/townships) are general-purpose governments that commonly administer permits. */
const STRONG_MCD: Record<string, string> = {
  CT: "towns", MA: "towns and cities", ME: "towns and cities", NH: "towns and cities", RI: "towns and cities", VT: "towns",
  NJ: "townships, boroughs and towns", PA: "townships and boroughs", NY: "towns",
};
/** States where MCDs exist as governments but permit administration varies (often county/state). */
const WEAK_MCD = new Set(["MI", "WI", "MN", "OH", "IN", "IL", "KS", "MO", "NE", "ND", "SD", "IA"]);

const LSAD_KIND: Record<string, string> = {
  "21": "borough", "25": "city", "43": "town", "44": "township", "47": "village", "46": "urban county", "57": "census designated place", "53": "city and borough",
};

/** State-level permitting structure notes (facts about structure, not code editions). */
export const STATE_STRUCTURE_NOTES: Record<string, string> = {
  TX: "Texas counties have limited authority to adopt building codes; outside city limits and ETJ rules, a county building permit may not exist — confirm with the county.",
  VT: "Vermont has no statewide residential building code; the Division of Fire Safety regulates public buildings. Town permits are mainly zoning.",
  ME: "Maine's uniform building code (MUBEC) is enforced by municipalities above a population threshold; smaller towns may rely on third-party inspectors.",
  VA: "Virginia enforces the statewide Uniform Statewide Building Code through each locality's building official; independent cities are separate from counties.",
  MD: "Maryland Building Performance Standards are adopted and enforced by each county and many municipalities.",
  NC: "The North Carolina State Building Code is enforced by city or county inspection departments.",
  DC: "The District of Columbia Department of Buildings is the building authority.",
};

export function resolveGoverningUnit(input: {
  state: string | null;
  county: string | null;
  countyFips: string | null;
  place: GeoUnit;
  countySubdivision: GeoUnit;
}): GoverningUnit {
  const st = (input.state ?? "").toUpperCase();
  const note = STATE_STRUCTURE_NOTES[st] ?? null;
  if (!st || !input.county) return { level: "undetermined", name: null, kind: null, certainty: "confirm", basis: "Boundary data unavailable.", stateNote: note };
  if (st === "DC") return { level: "federal_district", name: "District of Columbia", kind: "federal district", certainty: "structural", basis: "Property is in the District of Columbia.", stateNote: note };
  const place = input.place;
  const placeActive = !!place && place.lsad !== "57" && place.funcstat !== "S";
  if (/ city$/i.test(input.county) && (st === "VA" || /^(24510|29510|32510)$/.test(input.countyFips ?? ""))) {
    return { level: "independent_city", name: input.county.replace(/^(.*) city$/i, "City of $1"), kind: "independent city", certainty: "structural", basis: `${input.county} is a county-equivalent independent city (Census TIGER).`, stateNote: note };
  }
  if (placeActive) {
    const kind = LSAD_KIND[place!.lsad ?? ""] ?? "incorporated place";
    return { level: "municipality", name: place!.name, kind, certainty: "structural", basis: `Point is inside the incorporated ${kind} of ${place!.name} (Census TIGER Incorporated Places).`, stateNote: note };
  }
  const sub = input.countySubdivision;
  const subActive = !!sub && sub.funcstat === "A";
  if (subActive && STRONG_MCD[st]) {
    const kind = LSAD_KIND[sub!.lsad ?? ""] ?? "town";
    return { level: "town_or_township", name: sub!.name, kind, certainty: "structural", basis: `No incorporated place at the point; in ${st} the ${STRONG_MCD[st]} are general-purpose governments — ${sub!.name} (Census County Subdivisions, active government).`, stateNote: note };
  }
  if (subActive && WEAK_MCD.has(st)) {
    const kind = LSAD_KIND[sub!.lsad ?? ""] ?? "township";
    return { level: "town_or_township", name: sub!.name, kind, certainty: "confirm", basis: `No incorporated place at the point; ${sub!.name} is an active ${kind} government, but in ${st} permits may be administered by the ${kind}, the county or the state — confirm.`, stateNote: note };
  }
  return { level: "county", name: input.county, kind: "county (unincorporated area)", certainty: note && st === "TX" ? "confirm" : "structural", basis: `No incorporated place${sub ? " or permitting town/township" : ""} at the point — unincorporated ${input.county} (Census TIGER).`, stateNote: note };
}

/** Name tokens used to match a governing unit against the .gov registry. */
export function govNameTokens(name: string): { core: string; kind: string | null } {
  const m = name.match(/^(?:(city|town|township|village|borough|county) of )?(.*?)(?: (city|town|township|village|borough|county|cdp))?$/i);
  const core = (m?.[2] ?? name).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase();
  const kind = (m?.[1] ?? m?.[3] ?? null)?.toLowerCase() ?? null;
  return { core, kind };
}

export type DotGovRow = { domain: string; type: string; org: string; city: string; state: string };

/** Choose the official .gov domain for a government from the CISA .gov registry (exact name + state + type). */
export function matchDotGov(rows: DotGovRow[], unit: { name: string; level: GoverningUnit["level"] }, state: string): DotGovRow | null {
  const { core } = govNameTokens(unit.name);
  if (!core) return null;
  const wantType = unit.level === "county" ? "County" : unit.level === "federal_district" ? null : unit.level === "town_or_township" ? null : "City";
  const cands = rows.filter((r) => r.state.toUpperCase() === state.toUpperCase() && (!wantType || r.type === wantType || (wantType === "City" && r.type === "City")));
  const orgHas = (r: DotGovRow) => {
    const o = r.org.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
    return new RegExp(`\\b${core.replace(/\s+/g, "\\s+")}\\b`).test(o);
  };
  const scored = cands.filter(orgHas).map((r) => {
    let sc = 0;
    const o = r.org.toLowerCase();
    if (unit.level === "county" && /county/.test(o)) sc += 3;
    if (unit.level !== "county" && /(city|town|township|village|borough)/.test(o)) sc += 3;
    if (unit.level !== "county" && /county/.test(o)) sc -= 4;
    if (/(police|court|clerk|sheriff|school|library|corrections|fire|water|utilit|election|tourism|airport|transit|housing|attorney|museum|parks|health)/.test(o + " " + r.domain)) sc -= 3;
    if (r.domain.replace(/[^a-z]/g, "").includes(core.replace(/[^a-z]/g, ""))) sc += 2;
    sc -= r.domain.length / 100;
    return { r, sc };
  }).sort((a, b) => b.sc - a.sc);
  return scored[0] && scored[0].sc > 0 ? scored[0].r : null;
}

/** Classify an official-site link by what regulatory information it likely leads to (discovery only). */
export function classifyLink(text: string, href: string): string | null {
  const t = `${text} ${href}`.toLowerCase();
  if (/(accela|energov|tylerhost|citizenserve|opengov|viewpointcloud|mygov|permitportal|etrakit|citizenaccess|selectron|cityview|idt|permits?\.)/.test(href.toLowerCase())) return "permit_portal";
  if (/(municode|ecode360|amlegal|codelibrary|generalcode|codepublishing|library\.municode)/.test(href.toLowerCase())) return "municipal_code";
  if (/(arcgis|\/gis|gis\.|maps?\.|mapviewer|experience\.arcgis|hub\.arcgis)/.test(href.toLowerCase()) && /(gis|map|zoning|parcel)/.test(t)) return "gis";
  if (/\bzoning\b/.test(t)) return "zoning";
  if (/(building (department|division|services|safety|inspection)|inspections?\b|building permit|code enforcement|development services)/.test(t)) return "building";
  if (/\b(permit|permits|permitting)\b/.test(t)) return "permits";
  if (/\bplanning\b/.test(t)) return "planning";
  if (/(appraiser|assessor|property search|real estate records)/.test(t)) return "assessor";
  if (/(floodplain|flood zone|stormwater)/.test(t)) return "floodplain";
  if (/(fire marshal|fire prevention)/.test(t)) return "fire";
  return null;
}
