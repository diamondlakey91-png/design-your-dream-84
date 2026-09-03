// PERMIVIO agent framework — Property, Parcel & Jurisdiction Agent (server-only).
//
// Real research: geocode the address, retrieve official parcel/boundary and
// agency pages, then have the model produce a jurisdictional-responsibility
// matrix grounded in what was actually retrieved.
//
// The framework — not the model — decides what counts as retrieved evidence,
// and downgrades any "verified" claim that is not supported by a retrieved
// official source. The postal city is never treated as controlling.

import { z } from "zod";
import { geocode } from "@/lib/geocoding.shared";
import { resolveAuthoritativeGeography, type AuthoritativeGeography } from "@/lib/govGis.server";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";
import { callGeminiJSON } from "@/lib/ai.shared";
import { agentOutputSchema, findingSourceRefSchema, parseAgentOutput, type AgentOutput } from "../schemas";
import { VERIFIABLE_SOURCE_TYPES, type SourceType } from "../types";
import { AgentError } from "../errors";
import { getAgent } from "../registry";
import { assertNoLicensureClaim } from "../prompts/system";
import {
  buildParcelJurisdictionPrompt,
  parcelJurisdictionSystemPrompt,
  PARCEL_JURISDICTION_PROMPT_VERSION,
} from "../prompts/agents/parcelJurisdiction";

export const MATRIX_FUNCTIONS = [
  "zoning_and_land_use",
  "site_plan_review",
  "building_permit",
  "trade_permits",
  "fire_review_and_permits",
  "health_permits",
  "water_service",
  "sewer_service",
  "stormwater",
  "right_of_way_and_access",
  "floodplain",
  "environmental",
  "historic_review",
  "impact_fees",
  "certificate_of_occupancy",
] as const;

const authorityLevel = z.enum(["federal", "state", "county", "municipal", "utility", "private", "unknown"]);
const verification = z.string();

const addressNormalizationSchema = z.object({
  normalized_address: z.string(),
  street_number: z.string().nullable().default(null),
  street_name: z.string().nullable().default(null),
  unit: z.string().nullable().default(null),
  postal_city: z.string().nullable().default(null),
  place_in_control: z.string().nullable().default(null),
  incorporation_status: z
    .enum([
      "inside_municipal_limits",
      "unincorporated_county",
      "different_municipality_than_postal_city",
      "undetermined",
    ])
    .default("undetermined"),
  postal_city_is_controlling: z.boolean().nullable().default(null),
  postal_city_note: z.string(),
  county: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
  postal_code: z.string().nullable().default(null),
  verification_status: verification,
  confidence: z.string(),
  source_refs: z.array(findingSourceRefSchema).default([]),
});

const parcelSchema = z.object({
  parcel_id: z.string().nullable().default(null),
  parcel_id_type: z.string().nullable().default(null),
  owner_of_record: z.string().nullable().default(null),
  acreage: z.string().nullable().default(null),
  legal_description: z.string().nullable().default(null),
  spans_multiple_parcels: z.boolean().default(false),
  boundary_note: z.string().nullable().default(null),
  verification_status: verification,
  confidence: z.string(),
  source_refs: z.array(findingSourceRefSchema).default([]),
});

const matrixRowSchema = z.object({
  function: z.string(),
  authority_name: z.string(),
  authority_level: authorityLevel.default("unknown"),
  controls: z.string(),
  contact_or_portal: z.string().nullable().default(null),
  verification_status: verification,
  confidence: z.string(),
  notes: z.string().nullable().default(null),
  source_refs: z.array(findingSourceRefSchema).default([]),
});

const overlaySchema = z.object({
  name: z.string(),
  kind: z.string(),
  effect: z.string(),
  verification_status: verification,
  source_refs: z.array(findingSourceRefSchema).default([]),
});

/** Raw model contract: the shared agent output plus this agent's structured record. */
const rawSchema = agentOutputSchema
  .partial({ agent_key: true, agent_version: true })
  .extend({
    address_normalization: addressNormalizationSchema,
    parcels: z.array(parcelSchema).default([]),
    jurisdiction_matrix: z.array(matrixRowSchema).default([]),
    overlays_and_districts: z.array(overlaySchema).default([]),
  });

export type AddressNormalization = z.output<typeof addressNormalizationSchema>;
export type ParcelRecord = z.output<typeof parcelSchema>;
export type JurisdictionMatrixRow = z.output<typeof matrixRowSchema>;
export type OverlayRecord = z.output<typeof overlaySchema>;

export type ParcelJurisdictionResult = {
  output: AgentOutput;
  addressNormalization: AddressNormalization;
  parcels: ParcelRecord[];
  jurisdictionMatrix: JurisdictionMatrixRow[];
  overlays: OverlayRecord[];
  geocode: {
    formattedAddress: string;
    lat: number;
    lng: number;
    postalCity: string | null;
    county: string | null;
    state: string | null;
    postalCode: string | null;
    locationType: string;
  };
  /** Boundary facts read from official government GIS, not from a model. */
  geography: AuthoritativeGeography;
  evidence: RetrievedEvidence[];
  searchLeads: Array<{ url: string; title: string }>;
  promptVersion: string;
  model: string;
  downgrades: string[];
};

export type RetrievedEvidence = {
  source_key: string;
  url: string;
  title: string;
  retrieved: boolean;
  excerpt: string;
  guessedType: SourceType;
};

const OFFICIAL_HOST = /(\.gov|\.us|\.state\.[a-z]{2}\.us|\.mil)(\/|$)/i;

function guessSourceType(url: string, title: string): SourceType {
  const s = `${url} ${title}`.toLowerCase();
  if (/parcel|assessor|property\s*(search|record)|gis|cama|tax\s*map/.test(s)) return "official_gis_or_parcel_data";
  if (/zoning\s*map|zoning\s*viewer|future\s*land\s*use/.test(s)) return "official_zoning_map";
  if (/ordinance|municipal\s*code|county\s*code|chapter\s*\d|ecode|municode|library\.municode/.test(s))
    return "adopted_ordinance_or_code";
  if (/fee\s*schedule|fees/.test(s)) return "official_fee_schedule";
  if (/application|form|checklist\.pdf/.test(s)) return "official_form";
  if (/water|sewer|sanitary|utility|authority/.test(s)) return "official_utility_information";
  if (OFFICIAL_HOST.test(url)) return "official_agency_instruction";
  return "secondary_source";
}

/**
 * Boundary-first research. Queries lead with parcel/GIS and corporate-limit
 * evidence precisely because the mailing address cannot establish control.
 */
export async function gatherParcelJurisdictionEvidence(args: {
  address: string;
  postalCity: string | null;
  county: string | null;
  state: string | null;
  parcelId: string | null;
  /** Governing municipality from official boundary data (null = unincorporated). */
  controllingPlace?: string | null;
  /** Extra evidence already retrieved from authoritative GIS services. */
  seedEvidence?: RetrievedEvidence[];
}): Promise<{ evidence: RetrievedEvidence[]; leads: Array<{ url: string; title: string }> }> {
  const seed = args.seedEvidence ?? [];
  const key = process.env['FIRECRAWL_API_KEY'];
  if (!key) return { evidence: seed, leads: [] };
  const { address, postalCity, county, state, parcelId } = args;
  // Search the municipality the boundary data says controls — never the
  // mailing city. Unincorporated sites search the county instead.
  const controlling = args.controllingPlace === undefined ? postalCity : args.controllingPlace;
  const city = controlling ?? "";
  const cnty = county ?? "";
  const st = state ?? "";

  const queries = [
    `${address} parcel property record assessor account`,
    parcelId ? `"${parcelId}" parcel record ${cnty} ${st}` : `"${cnty}" ${st} parcel viewer GIS property search site:.gov`,
    `"${cnty}" ${st} jurisdiction determination incorporated municipal boundary annexation map site:.gov`,
    `"${city}" ${st} corporate limits city limits map annexation site:.gov`,
    `"${city}" ${st} building permits planning zoning department site:.gov`,
    `"${cnty}" ${st} building permits planning zoning unincorporated area site:.gov`,
    `"${cnty}" ${st} fire marshal plan review health department plan review site:.gov`,
    `"${city}" OR "${cnty}" ${st} water sewer service area authority new connection`,
    `"${cnty}" ${st} floodplain administrator FEMA flood map stormwater right of way permit site:.gov`,
    `"${cnty}" ${st} special taxing districts historic district overlay impact fees site:.gov`,
  ].filter(Boolean) as string[];

  const hits = (await Promise.all(queries.map((q) => firecrawlSearch(key, q, 3).catch(() => [])))).flat();
  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    if (!h.url || seen.has(h.url)) return false;
    seen.add(h.url);
    return true;
  });
  // Prefer official hosts for retrieval; keep the rest as non-evidence leads.
  const ranked = [...unique].sort((a, b) => Number(OFFICIAL_HOST.test(b.url)) - Number(OFFICIAL_HOST.test(a.url)));
  const targets = ranked.slice(0, 12);
  const offset = seed.length;

  const evidence = await Promise.all(
    targets.map(async (t, i): Promise<RetrievedEvidence> => {
      const source_key = `S${offset + i + 1}`;
      const title = t.title ?? "";
      try {
        const s = await firecrawlScrape(key, t.url);
        const md = (s.markdown ?? "").trim();
        if (!md) throw new Error("empty");
        return {
          source_key,
          url: t.url,
          title: s.title || title,
          retrieved: true,
          excerpt: md.slice(0, 3000),
          guessedType: guessSourceType(t.url, s.title || title),
        };
      } catch {
        return {
          source_key,
          url: t.url,
          title,
          retrieved: false,
          excerpt: `(not retrieved) ${t.description ?? ""}`.slice(0, 400),
          guessedType: guessSourceType(t.url, title),
        };
      }
    }),
  );

  return { evidence: [...seed, ...evidence], leads: ranked.slice(12).map((l) => ({ url: l.url, title: l.title ?? "" })) };
}

function isVerifiable(e: RetrievedEvidence | undefined) {
  return !!e && e.retrieved && VERIFIABLE_SOURCE_TYPES.includes(e.guessedType);
}

/** Run the agent for one site. Throws AgentError on unrecoverable failure. */
export async function runParcelJurisdictionAgent(input: {
  address: string;
  parcelId?: string | null;
  projectType?: string | null;
  scope?: string;
  clientObjective?: string;
}): Promise<ParcelJurisdictionResult> {
  const def = getAgent("parcel_jurisdiction");
  if (!input.address?.trim()) {
    throw new AgentError("permanent", "A site address is required to resolve the parcel and jurisdiction.");
  }

  let g;
  try {
    g = await geocode(input.address.trim());
  } catch (e) {
    throw new AgentError("temporary", `Address lookup failed: ${(e as Error).message}`);
  }

  const geo = {
    formattedAddress: g.formatted_address,
    lat: g.lat,
    lng: g.lng,
    postalCity: g.components.locality ?? null,
    sublocality: g.components.sublocality ?? null,
    county: g.components.county ?? null,
    state: g.components.state ?? null,
    postalCode: g.components.postal_code ?? null,
    locationType: g.location_type,
  };

  // Authoritative boundary databases first: they decide which jurisdiction
  // the rest of the research targets.
  const geography = await resolveAuthoritativeGeography({
    address: geo.formattedAddress,
    lat: geo.lat,
    lng: geo.lng,
    postalCity: geo.postalCity,
  });

  const govEvidence: RetrievedEvidence[] = geography.evidence.map((e) => ({
    source_key: e.source_key,
    url: e.url,
    title: e.title,
    retrieved: e.retrieved,
    excerpt: e.excerpt,
    guessedType: e.kind,
  }));

  const authoritativeCounty = geography.census?.county ?? geography.fcc?.countyName ?? geo.county;
  const authoritativeState = geography.census?.state ?? geo.state;
  const controllingPlace = geography.determination.authoritative
    ? geography.determination.incorporation_status === "unincorporated_county"
      ? null
      : geography.determination.place_in_control
    : geo.postalCity;

  const { evidence, leads } = await gatherParcelJurisdictionEvidence({
    address: geo.formattedAddress,
    postalCity: geo.postalCity,
    county: authoritativeCounty,
    state: authoritativeState,
    parcelId: input.parcelId ?? null,
    controllingPlace,
    seedEvidence: govEvidence,
  });

  const boundaryBrief = [
    geography.determination.note,
    geography.census
      ? `Official record (Census TIGER, source G1): incorporated place = ${geography.census.place ? geography.census.place.name : "NONE (unincorporated)"}; county = ${geography.census.county ?? "unknown"}; state = ${geography.census.state ?? "unknown"}; county subdivision = ${geography.census.countySubdivision?.name ?? "none"}.`
      : null,
    geography.flood
      ? `FEMA NFHL (source G3): flood zone ${geography.flood.zone}${geography.flood.sfha ? " — inside a Special Flood Hazard Area, floodplain review applies" : ""}.`
      : null,
    geography.unavailable.length
      ? `Services that could not be reached this run (treat those aspects as unconfirmed): ${geography.unavailable.join("; ")}.`
      : null,
    "Cite G1/G2/G3 for these facts. Route permitting functions to the authority that actually governs this boundary, then confirm each department from its own official page.",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = buildParcelJurisdictionPrompt({
    rawAddress: input.address.trim(),
    geocode: geo,
    projectType: input.projectType ?? null,
    scope: input.scope ?? "Not provided.",
    clientObjective: input.clientObjective ?? "Confirm the property, parcel and every authority with jurisdiction.",
    knownParcelId: input.parcelId ?? null,
    authoritativeBoundary: boundaryBrief,
    evidence: evidence.map((e) => ({
      source_key: e.source_key,
      url: e.url,
      title: e.title,
      retrieved: e.retrieved,
      excerpt: e.excerpt,
    })),
    searchLeads: leads,
  });

  assertNoLicensureClaim(parcelJurisdictionSystemPrompt);

  type Raw = z.output<typeof rawSchema>;
  let raw: Raw;
  try {
    raw = await callGeminiJSON(prompt, parcelJurisdictionSystemPrompt, rawSchema as unknown as z.ZodType<Raw>, {
      model: def.model.id,
      max_tokens: def.model.maxOutputTokens ?? 12000,
    });
  } catch (e) {
    throw new AgentError("temporary", `Jurisdiction analysis failed: ${(e as Error).message}`);
  }

  const byKey = new Map(evidence.map((e) => [e.source_key, e]));
  const downgrades: string[] = [];

  // The framework owns retrieval truth and source typing: never the model.
  const sources = (raw.sources ?? [])
    .filter((s) => byKey.has(s.source_key))
    .map((s) => {
      const e = byKey.get(s.source_key)!;
      return {
        ...s,
        url: e.url,
        title: s.title || e.title || e.url,
        source_type: e.guessedType,
        retrieved: e.retrieved,
        accessed_at: e.retrieved ? new Date().toISOString() : null,
      };
    });
  // Include any retrieved evidence the model cited only through findings.
  for (const e of evidence) {
    if (e.retrieved && !sources.some((s) => s.source_key === e.source_key)) {
      const cited = [
        ...(raw.findings ?? []).flatMap((f) => f.source_refs ?? []),
        ...(raw.jurisdiction_matrix ?? []).flatMap((m) => m.source_refs ?? []),
        ...(raw.parcels ?? []).flatMap((p) => p.source_refs ?? []),
        ...(raw.address_normalization.source_refs ?? []),
      ].some((r) => r.source_key === e.source_key);
      if (!cited) continue;
      sources.push({
        source_key: e.source_key,
        source_type: e.guessedType,
        title: e.title || e.url,
        publisher: new URL(e.url).hostname,
        url: e.url,
        uploaded_document_id: null,
        code_section: null,
        page_reference: null,
        map_layer: null,
        effective_date: null,
        accessed_at: new Date().toISOString(),
        geographic_scope: null,
        authority_level: "unknown" as const,
        retrieved: true,
      });
    }
  }

  const supported = (refs: Array<{ source_key: string }>) =>
    refs.some((r) => isVerifiable(byKey.get(r.source_key)));

  const gate = <T extends { verification_status: string; source_refs: Array<{ source_key: string }> }>(
    item: T,
    label: string,
  ): T => {
    const refs = (item.source_refs ?? []).filter((r) => byKey.has(r.source_key));
    if (item.verification_status === "verified" && !supported(refs)) {
      downgrades.push(`${label}: "verified" downgraded to pending_confirmation (no retrieved official source).`);
      return { ...item, source_refs: refs, verification_status: "pending_confirmation" };
    }
    return { ...item, source_refs: refs };
  };

  const findings = (raw.findings ?? []).map((f) => gate(f, `finding ${f.finding_key}`));
  const parcels = (raw.parcels ?? []).map((p, i) => gate(p, `parcel ${p.parcel_id ?? i + 1}`));
  const overlays = (raw.overlays_and_districts ?? []).map((o) => gate(o, `overlay ${o.name}`));
  let addressNormalization = gate(raw.address_normalization, "address normalization");

  // Postal-city guard: control may never be asserted from the mailing address.
  const postal = (geo.postalCity ?? "").toLowerCase();
  const place = (addressNormalization.place_in_control ?? "").toLowerCase();
  const boundaryEvidence = addressNormalization.source_refs.some((r) => {
    const e = byKey.get(r.source_key);
    return !!e && e.retrieved && (e.guessedType === "official_gis_or_parcel_data" || e.guessedType === "official_zoning_map" || e.guessedType === "official_agency_instruction");
  });
  if (postal && place && place.includes(postal) && !boundaryEvidence) {
    downgrades.push(
      "Controlling place matches the postal city without retrieved boundary evidence — flagged undetermined for confirmation.",
    );
    addressNormalization = {
      ...addressNormalization,
      incorporation_status: "undetermined",
      postal_city_is_controlling: null,
      verification_status: "pending_confirmation",
      postal_city_note: `${addressNormalization.postal_city_note} Permivio could not retrieve an official corporate-limit or parcel record confirming that ${geo.postalCity} controls this parcel; the mailing address alone does not establish jurisdiction. Confirm corporate-limit status with the county GIS/assessor and the municipal planning office before relying on this.`,
    };
  }

  const matrix = (raw.jurisdiction_matrix ?? []).map((m) => gate(m, `matrix ${m.function}`));
  // Guarantee every permitting function appears, even when unresolved.
  const present = new Set(matrix.map((m) => m.function));
  for (const fn of MATRIX_FUNCTIONS) {
    if (present.has(fn)) continue;
    matrix.push({
      function: fn,
      authority_name: "Not yet identified",
      authority_level: "unknown",
      controls: "Responsibility for this function has not been confirmed from an official source.",
      contact_or_portal: null,
      verification_status: "pending_confirmation",
      confidence: "low",
      notes: "Permivio could not confirm this authority from retrieved official sources. Confirm before submission.",
      source_refs: [],
    });
  }

  const parsed = parseAgentOutput({
    ...raw,
    agent_key: "parcel_jurisdiction",
    agent_version: def.version,
    findings,
    sources,
    professional_confirmation_required: true,
  });
  if (!parsed.ok) {
    throw new AgentError("permanent", `Agent output failed validation: ${parsed.issues.slice(0, 5).join("; ")}`);
  }

  return {
    output: parsed.output,
    addressNormalization,
    parcels,
    jurisdictionMatrix: matrix,
    overlays,
    geocode: {
      formattedAddress: geo.formattedAddress,
      lat: geo.lat,
      lng: geo.lng,
      postalCity: geo.postalCity,
      county: geo.county,
      state: geo.state,
      postalCode: geo.postalCode,
      locationType: geo.locationType,
    },
    evidence,
    searchLeads: leads,
    promptVersion: PARCEL_JURISDICTION_PROMPT_VERSION,
    model: def.model.id,
    downgrades,
  };
}
