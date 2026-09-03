// PERMIVIO agent prompts — Property, Parcel & Jurisdiction Agent.
//
// The core rule of this agent: a mailing address is not a jurisdiction.
// The postal city on an address is assigned by USPS for mail delivery and
// routinely differs from the incorporated place (or unincorporated county
// area) that actually issues permits. The agent must resolve control from
// official parcel/boundary evidence, never from the mailing address.

import { buildSystemPrompt, PROMPT_VERSIONS } from "../system";

export const PARCEL_JURISDICTION_PROMPT_VERSION = `parcel_jurisdiction@1 (${PROMPT_VERSIONS.base})`;

const INSTRUCTIONS = `TASK
1. Normalize the site address: street number, street name with suffix and direction, unit/suite, postal city, county, state, ZIP+4 when available, and the geocoded coordinates supplied to you.
2. Identify the parcel(s): APN/PIN/tax account number, parcel owner of record when published, parcel acreage/square footage, subdivision/plat or legal description reference, and whether the site spans multiple parcels or a parcel split by a boundary.
3. Determine the controlling land-use authority from boundary evidence, then identify EVERY overlapping authority with a role in permitting.
4. Produce a jurisdictional-responsibility matrix: for each permitting function, name the authority that performs it.

POSTAL CITY IS NOT A JURISDICTION — HARD RULE
- Never conclude that the postal city is the permitting authority because it appears in the mailing address.
- Treat the postal city as an address element only. State explicitly whether the parcel is inside the corporate limits of that municipality, inside a different municipality, or in unincorporated county territory.
- Corporate-limit or unincorporated status may be labeled "verified" ONLY when an official parcel/GIS, jurisdiction-determination, annexation or assessor record was actually retrieved and shows it. Otherwise use "pending_confirmation" and say what must be checked and with whom.
- Where the county and a municipality could each plausibly control (annexation areas, extraterritorial jurisdiction, county islands, split parcels), report both readings and raise a conflict.

OVERLAPPING AUTHORITIES TO EVALUATE (include only those with evidence or a stated basis; mark unknown ones "pending_confirmation")
Building department / building official; planning; zoning; engineering & site development; stormwater; fire marshal or fire district; health department; water provider; sewer/wastewater authority; electric, gas and telecom providers; public works; transportation/right-of-way authority (municipal, county, state DOT); floodplain administrator; environmental agencies (state and federal); historic preservation authority; school/impact-fee authority; special districts, community development districts, HOA/architectural committees, port/airport overlays, coastal or tidal authorities, and any state-level licensing or plan-review agency.

MATRIX FUNCTIONS (one row each, at minimum)
zoning_and_land_use, site_plan_review, building_permit, trade_permits, fire_review_and_permits, health_permits, water_service, sewer_service, stormwater, right_of_way_and_access, floodplain, environmental, historic_review, impact_fees, certificate_of_occupancy.

OUTPUT NOTES
- Each matrix row names the authority, its level (federal/state/county/municipal/utility/private/unknown), what it controls, its verification status and the source_key(s) supporting it.
- Every finding must be tied to source_refs. Cite only sources listed in "sources" that were actually retrieved.
- If the coordinates, parcel data or boundary data are ambiguous, ask a plain-language client question instead of guessing.
- Never state a permit is not required and never say a use is approved.`;

export const parcelJurisdictionSystemPrompt = buildSystemPrompt(
  "Property, Parcel & Jurisdiction Resolution",
  INSTRUCTIONS,
);

export type ParcelJurisdictionPromptInput = {
  rawAddress: string;
  geocode: {
    formattedAddress: string;
    lat: number;
    lng: number;
    postalCity: string | null;
    sublocality: string | null;
    county: string | null;
    state: string | null;
    postalCode: string | null;
    locationType: string;
  };
  projectType: string | null;
  scope: string;
  clientObjective: string;
  knownParcelId: string | null;
  evidence: Array<{ source_key: string; url: string; title: string; retrieved: boolean; excerpt: string }>;
  searchLeads: Array<{ url: string; title: string }>;
};

export function buildParcelJurisdictionPrompt(input: ParcelJurisdictionPromptInput) {
  const g = input.geocode;
  const evidence = input.evidence.length
    ? input.evidence
        .map(
          (e) =>
            `SOURCE ${e.source_key} | retrieved=${e.retrieved} | ${e.title || "(untitled)"} | ${e.url}\n${e.excerpt}`,
        )
        .join("\n\n---\n\n")
    : "(no official documents were retrieved)";

  const leads = input.searchLeads.length
    ? input.searchLeads.map((l) => `- ${l.title || "(untitled)"} — ${l.url}`).join("\n")
    : "(none)";

  return `SITE
Raw address as provided: ${input.rawAddress}
Geocoded address: ${g.formattedAddress}
Coordinates: ${g.lat}, ${g.lng} (geocode precision: ${g.locationType})
Address elements from the geocoder — POSTAL/MAILING ONLY, not a jurisdiction determination:
- postal city: ${g.postalCity ?? "unknown"}
- sublocality/neighborhood: ${g.sublocality ?? "unknown"}
- county: ${g.county ?? "unknown"}
- state: ${g.state ?? "unknown"}
- ZIP: ${g.postalCode ?? "unknown"}
Parcel identifier provided by the client: ${input.knownParcelId ?? "none"}

PROJECT
Client objective: ${input.clientObjective}
Project type: ${input.projectType ?? "not stated"}
Scope: ${input.scope}

RETRIEVED OFFICIAL EVIDENCE
${evidence}

SEARCH RESULT LEADS (titles and URLs only — NOT retrieved, NOT evidence, never cite as verified)
${leads}

Return JSON with exactly these top-level keys:
agent_key ("parcel_jurisdiction"), agent_version, task_summary, status, findings, sources, missing_information, conflicts, risks, recommended_actions, assumptions, professional_confirmation_required, client_questions, completion_summary,
plus:
"address_normalization": { "normalized_address": string, "street_number": string|null, "street_name": string|null, "unit": string|null, "postal_city": string|null, "place_in_control": string|null, "incorporation_status": "inside_municipal_limits"|"unincorporated_county"|"different_municipality_than_postal_city"|"undetermined", "postal_city_is_controlling": boolean|null, "postal_city_note": string, "county": string|null, "state": string|null, "postal_code": string|null, "verification_status": string, "confidence": string, "source_refs": [{ "source_key": string, "supporting_excerpt": string|null, "support_description": string|null, "primary_source": boolean }] },
"parcels": [ { "parcel_id": string|null, "parcel_id_type": string|null, "owner_of_record": string|null, "acreage": string|null, "legal_description": string|null, "spans_multiple_parcels": boolean, "boundary_note": string|null, "verification_status": string, "confidence": string, "source_refs": [ ... ] } ],
"jurisdiction_matrix": [ { "function": string, "authority_name": string, "authority_level": "federal"|"state"|"county"|"municipal"|"utility"|"private"|"unknown", "controls": string, "contact_or_portal": string|null, "verification_status": string, "confidence": string, "notes": string|null, "source_refs": [ ... ] } ],
"overlays_and_districts": [ { "name": string, "kind": string, "effect": string, "verification_status": string, "source_refs": [ ... ] } ]

Every source you list in "sources" must use one of the SOURCE keys above. Do not invent source keys or URLs.`;
}
