// PERMIVIO — live municipal evidence resolver (server-only).
//
// One shared pipeline that every permitting agent (Permit Requirements,
// Permit Roadmap, Plan QA/QC, Correction Analysis) uses to ground its findings
// in real government records instead of model assumptions:
//
//   1. Authority resolution — U.S. Census Bureau Geocoder + TIGER boundaries
//      (via govGis.server) decide which place actually controls the parcel.
//      The postal city is never assumed to be the AHJ.
//   2. Official document retrieval — Firecrawl search + scrape restricted to
//      .gov / .us / official code publishers (Municode, eCode360, American
//      Legal, Code Publishing, General Code), by research topic.
//   3. A prompt-ready evidence block with numbered sources, so a model can
//      only mark a fact "confirmed by source" when it appears in the block.
//
// Nothing here is model generated. Every returned source was actually fetched;
// when a service or page cannot be reached it is reported as unavailable.

import { geocode } from "@/lib/geocoding.shared";
import { resolveAuthoritativeGeography, type AuthoritativeGeography, type GovEvidenceItem } from "@/lib/govGis.server";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";

export type EvidenceTopic =
  | "permit_requirements"
  | "fee_schedule"
  | "adopted_codes"
  | "submittal_standards"
  | "resubmittal_procedure"
  | "zoning"
  | "fire"
  | "health"
  | "site_utilities"
  | "inspections_co";

export type MunicipalSource = {
  url: string;
  title: string;
  publisher: string | null;
  topic: EvidenceTopic;
  official: boolean;
  excerpt: string;
  retrieved: boolean;
};

export type MunicipalEvidencePack = {
  /** The jurisdiction label the research was actually run against. */
  jurisdiction_label: string;
  ahj: {
    controlling_authority: string | null;
    incorporation_status: AuthoritativeGeography["determination"]["incorporation_status"];
    postal_city_is_controlling: boolean | null;
    county: string | null;
    state: string | null;
    flood_zone: string | null;
    note: string;
    authoritative: boolean;
  } | null;
  gov_evidence: GovEvidenceItem[];
  sources: MunicipalSource[];
  /** Prompt-ready block. Empty string when nothing could be retrieved. */
  block: string;
  has_official_sources: boolean;
  unavailable: string[];
};

const OFFICIAL_RE = /(^|\.)([a-z0-9-]+\.)?(gov|mil)(\/|$|:)|\.us(\/|$|:)|municode|ecode360|codepublishing|amlegal|generalcode|library\.municode/i;

function isOfficial(url: string): boolean {
  try {
    const u = new URL(url);
    return OFFICIAL_RE.test(u.host) || OFFICIAL_RE.test(url);
  } catch {
    return false;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const TOPIC_QUERIES: Record<EvidenceTopic, (j: string) => string> = {
  permit_requirements: (j) => `"${j}" building permit application requirements when a permit is required site:.gov`,
  fee_schedule: (j) => `"${j}" building permit fee schedule site:.gov`,
  adopted_codes: (j) => `"${j}" adopted building code edition local amendments ordinance`,
  submittal_standards: (j) => `"${j}" plan submittal requirements checklist sheet size seal signature site:.gov`,
  resubmittal_procedure: (j) => `"${j}" plan review comments resubmittal response requirements revision procedure site:.gov`,
  zoning: (j) => `"${j}" zoning ordinance use permitted site plan review setbacks site:.gov`,
  fire: (j) => `"${j}" fire marshal permit sprinkler alarm plan review requirements site:.gov`,
  health: (j) => `"${j}" health department food service plan review permit requirements site:.gov`,
  site_utilities: (j) => `"${j}" grading stormwater right of way water sewer connection permit site:.gov`,
  inspections_co: (j) => `"${j}" inspection schedule certificate of occupancy requirements site:.gov`,
};

/** Resolve the controlling authority for an address using government boundary data. */
async function resolveAhj(address: string): Promise<{
  geo: AuthoritativeGeography | null;
  label: string | null;
}> {
  try {
    const g = await geocode(address);
    if (!g?.lat || !g?.lng) return { geo: null, label: null };
    const geo = await resolveAuthoritativeGeography({
      address: g.formatted_address ?? address,
      lat: g.lat,
      lng: g.lng,
      postalCity: g.components.locality ?? null,
    });
    const state = geo.census?.stateAbbr ?? geo.census?.state ?? g.components.state_code ?? g.components.state ?? null;
    const controlling = geo.determination.place_in_control ?? geo.census?.county ?? null;
    const label = controlling ? [controlling, state].filter(Boolean).join(", ") : null;
    return { geo, label };
  } catch {
    return { geo: null, label: null };
  }
}

async function retrieveTopic(
  fcKey: string,
  jurisdiction: string,
  topic: EvidenceTopic,
  perTopic: number,
): Promise<MunicipalSource[]> {
  const hits = await firecrawlSearch(fcKey, TOPIC_QUERIES[topic](jurisdiction), 4).catch(() => []);
  const targets = hits.filter((h) => h.url && isOfficial(h.url)).slice(0, perTopic);
  const out = await Promise.all(
    targets.map(async (t): Promise<MunicipalSource> => {
      const base = {
        url: t.url,
        title: t.title ?? "",
        publisher: hostOf(t.url),
        topic,
        official: true,
      };
      try {
        const timeout = new Promise<null>((res) => setTimeout(() => res(null), 12000));
        const s = await Promise.race([firecrawlScrape(fcKey, t.url), timeout]);
        if (!s?.markdown) return { ...base, excerpt: (t.description ?? "").slice(0, 600), retrieved: false };
        return { ...base, title: s.title || base.title, excerpt: s.markdown.slice(0, 3500), retrieved: true };
      } catch {
        return { ...base, excerpt: (t.description ?? "").slice(0, 600), retrieved: false };
      }
    }),
  );
  return out;
}

/**
 * Gather live municipal evidence for one jurisdiction/address and the research
 * topics an agent actually needs. Safe to call without Firecrawl configured —
 * the pack then carries only the authoritative boundary determination.
 */
export async function gatherMunicipalEvidence(opts: {
  jurisdiction?: string | null;
  address?: string | null;
  topics: EvidenceTopic[];
  /** Pages scraped per topic. Default 2. */
  perTopic?: number;
}): Promise<MunicipalEvidencePack> {
  const unavailable: string[] = [];
  const address = (opts.address ?? "").trim();
  const fallbackLabel = (opts.jurisdiction ?? "").trim();

  let geo: AuthoritativeGeography | null = null;
  let resolvedLabel: string | null = null;
  if (address) {
    const r = await resolveAhj(address);
    geo = r.geo;
    resolvedLabel = r.label;
    if (!geo) unavailable.push("U.S. Census Bureau boundary services");
    else unavailable.push(...geo.unavailable);
  }

  const jurisdiction_label = resolvedLabel || fallbackLabel;

  const ahj: MunicipalEvidencePack["ahj"] = geo
    ? {
        controlling_authority: geo.determination.place_in_control,
        incorporation_status: geo.determination.incorporation_status,
        postal_city_is_controlling: geo.determination.postal_city_is_controlling,
        county: geo.census?.county ?? geo.fcc?.countyName ?? null,
        state: geo.census?.stateAbbr ?? geo.census?.state ?? null,
        flood_zone: geo.flood?.zone ?? null,
        note: geo.determination.note,
        authoritative: geo.determination.authoritative,
      }
    : null;

  let sources: MunicipalSource[] = [];
  const fcKey = process.env["FIRECRAWL_API_KEY"];
  if (!fcKey) {
    unavailable.push("Official document retrieval (Firecrawl not configured)");
  } else if (jurisdiction_label) {
    const perTopic = opts.perTopic ?? 2;
    const batches = await Promise.all(
      opts.topics.map((t) => retrieveTopic(fcKey, jurisdiction_label, t, perTopic).catch(() => [] as MunicipalSource[])),
    );
    const seen = new Set<string>();
    for (const b of batches) {
      for (const s of b) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        sources.push(s);
      }
    }
    sources = sources.filter((s) => s.excerpt.trim().length > 0);
    if (sources.length === 0) unavailable.push(`No official web sources retrieved for ${jurisdiction_label}`);
  }

  const govLines = (geo?.evidence ?? []).map(
    (e, i) => `GOV RECORD ${i + 1} — ${e.title}\nURL: ${e.url}\n${e.excerpt}`,
  );
  const srcLines = sources.map(
    (s, i) =>
      `SOURCE ${i + 1} [${s.topic}]${s.retrieved ? "" : " (search result only — page body not retrieved)"}\nURL: ${s.url}\nTITLE: ${s.title}\n${s.excerpt}`,
  );

  const parts: string[] = [];
  if (ahj) {
    parts.push(
      [
        `[CONTROLLING AUTHORITY — resolved from government boundary data]`,
        `Authority in control: ${ahj.controlling_authority ?? "undetermined"}`,
        `Corporate-limit status: ${ahj.incorporation_status}`,
        `County: ${ahj.county ?? "unknown"} · State: ${ahj.state ?? "unknown"}`,
        ahj.flood_zone ? `FEMA effective flood zone at the site: ${ahj.flood_zone}` : "",
        `Determination: ${ahj.note}`,
        `Boundary data was ${ahj.authoritative ? "retrieved from an official service — treat the controlling authority as confirmed" : "NOT available — treat the controlling authority as unconfirmed"}.`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (govLines.length) parts.push(`[OFFICIAL GOVERNMENT GIS RECORDS]\n${govLines.join("\n\n")}`);
  if (srcLines.length) parts.push(`[OFFICIAL JURISDICTION DOCUMENTS — ${sources.length} retrieved]\n${srcLines.join("\n\n---\n\n")}`);
  if (unavailable.length) parts.push(`[SERVICES UNAVAILABLE ON THIS RUN]\n- ${unavailable.join("\n- ")}`);
  if (parts.length) {
    parts.push(
      [
        `[RULES FOR USING LIVE EVIDENCE]`,
        `- A fact may only be labelled confirmed/verified when it appears verbatim in the records above; copy the URL you used.`,
        `- Facts you cannot find above are AI-assisted or need agency confirmation — never upgrade them.`,
        `- Never invent fees, review durations, code editions, amendment numbers, department names, phone numbers or URLs.`,
        `- The controlling authority above overrides the mailing address city wherever they differ.`,
      ].join("\n"),
    );
  }

  return {
    jurisdiction_label,
    ahj,
    gov_evidence: geo?.evidence ?? [],
    sources,
    block: parts.length ? `\n\n${parts.join("\n\n")}` : "",
    has_official_sources: sources.some((s) => s.retrieved) || !!ahj?.authoritative,
    unavailable,
  };
}
