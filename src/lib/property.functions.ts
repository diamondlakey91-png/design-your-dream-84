import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callLovableAI, loadJurisdictionContextBlock } from "@/lib/ai.shared";

// ---- Types returned to the client ----
export type PropertyIntel = {
  input_address: string;
  geocode: {
    formatted_address: string;
    lat: number;
    lng: number;
    place_id: string;
    components: {
      street_number?: string;
      route?: string;
      locality?: string;
      sublocality?: string;
      county?: string;
      state?: string;
      state_code?: string;
      postal_code?: string;
      country?: string;
      neighborhood?: string;
    };
    location_type: string;
    viewport?: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } };
  };
  jurisdiction: {
    resolved: string;
    city: string;
    county: string;
    state: string;
    has_cached_profile: boolean;
    portal_url: string | null;
    department: string | null;
  };
  ai: PropertyAiAnalysis;
};

export type ConfidenceTag = "verified" | "ai_assisted" | "needs_confirmation";

export type PropertyAiAnalysis = {
  summary: string;
  property: {
    likely_use?: string;
    likely_zoning?: string;
    lot_context?: string;
    confidence: ConfidenceTag;
  };
  authorities: Array<{
    role: string; // e.g. "Building Department"
    name: string;
    contact_hint?: string;
    confidence: ConfidenceTag;
  }>;
  utilities: Array<{
    utility: "Water" | "Sewer" | "Electric" | "Gas" | "Stormwater" | "Telecom" | "Trash";
    provider?: string;
    notes?: string;
    confidence: ConfidenceTag;
  }>;
  constraints: Array<{
    label: string; // e.g. "FEMA Flood Zone", "Historic District", "Wetlands proximity"
    detail: string;
    severity: "info" | "watch" | "risk";
    confidence: ConfidenceTag;
  }>;
  likely_permits: Array<{
    name: string;
    when_required: string;
    confidence: ConfidenceTag;
  }>;
  required_documents: string[];
  next_steps: string[];
  disclaimers: string[];
};

const AnalyzeInput = z.object({ address: z.string().trim().min(4).max(300) });

// ---- Google Maps geocoding via gateway ----
type GAddrComp = { long_name: string; short_name: string; types: string[] };
type GGeo = {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    place_id: string;
    address_components: GAddrComp[];
    geometry: {
      location: { lat: number; lng: number };
      location_type: string;
      viewport?: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } };
    };
  }>;
};

async function geocode(address: string): Promise<PropertyIntel["geocode"]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) throw new Error("Google Maps is not configured.");
  const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(address)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey },
  });
  if (resp.status === 403) {
    const body = await resp.text();
    throw new Error(`Google Maps request denied (403). ${body.slice(0, 200)}`);
  }
  if (!resp.ok) {
    throw new Error(`Geocoding failed [${resp.status}]: ${(await resp.text()).slice(0, 200)}`);
  }
  const j = (await resp.json()) as GGeo;
  if (j.status !== "OK" || !j.results.length) {
    throw new Error(`No geocoding result for "${address}"${j.error_message ? `: ${j.error_message}` : ""}.`);
  }
  const r = j.results[0];
  const get = (type: string) => r.address_components.find((c) => c.types.includes(type));
  const state = get("administrative_area_level_1");
  return {
    formatted_address: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    place_id: r.place_id,
    location_type: r.geometry.location_type,
    viewport: r.geometry.viewport,
    components: {
      street_number: get("street_number")?.long_name,
      route: get("route")?.long_name,
      locality: get("locality")?.long_name,
      sublocality: get("sublocality")?.long_name,
      county: get("administrative_area_level_2")?.long_name,
      state: state?.long_name,
      state_code: state?.short_name,
      postal_code: get("postal_code")?.long_name,
      country: get("country")?.long_name,
      neighborhood: get("neighborhood")?.long_name,
    },
  };
}

function resolveJurisdictionName(g: PropertyIntel["geocode"]): { name: string; city: string; county: string; state: string } {
  const city = g.components.locality || g.components.sublocality || "";
  const county = g.components.county || "";
  const state = g.components.state_code || g.components.state || "";
  // Prefer City, ST when city present; fall back to County, ST
  const name = city ? `${city}, ${state}` : county ? `${county}, ${state}` : state;
  return { name, city, county, state };
}

function extractJson<T>(raw: string): T {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("AI returned no JSON object.");
  return JSON.parse(cleaned.slice(s, e + 1)) as T;
}

export const analyzeProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }): Promise<PropertyIntel> => {
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) throw new Error("AI is not configured.");

    const g = await geocode(data.address);
    const j = resolveJurisdictionName(g);
    const ctx = await loadJurisdictionContextBlock(context.supabase as unknown as { from: (t: string) => unknown }, j.name);

    const prompt = `You are a GIS analyst and permit expeditor building a Property Intelligence profile for construction permitting.

INPUT
- Address: ${g.formatted_address}
- Coordinates: ${g.lat}, ${g.lng}
- City: ${j.city || "(unknown)"}
- County: ${j.county || "(unknown)"}
- State: ${j.state || "(unknown)"}
- Neighborhood: ${g.components.neighborhood ?? "(unknown)"}
- ZIP: ${g.components.postal_code ?? "(unknown)"}
${ctx.block}

RETURN VALID JSON ONLY of shape:
{
  "summary": "3-4 sentence plain-English overview: where it is, likely context (urban/suburban/rural), and the top 2 permitting factors to be aware of.",
  "property": { "likely_use": "e.g. Single-family residential | Commercial | Mixed-use", "likely_zoning": "district if known or plausible guess", "lot_context": "short note", "confidence": "verified|ai_assisted|needs_confirmation" },
  "authorities": [
    { "role": "Building Department", "name": "...", "contact_hint": "portal or phone if in cached context", "confidence": "..." },
    { "role": "Planning Department", "name": "...", "confidence": "..." },
    { "role": "Fire Marshal", "name": "...", "confidence": "..." },
    { "role": "Health Department", "name": "...", "confidence": "..." },
    { "role": "Public Works", "name": "...", "confidence": "..." },
    { "role": "Environmental / Stormwater", "name": "...", "confidence": "..." },
    { "role": "Historic Preservation", "name": "...", "confidence": "..." }
  ],
  "utilities": [
    { "utility": "Water", "provider": "...", "notes": "...", "confidence": "..." },
    { "utility": "Sewer", "provider": "...", "confidence": "..." },
    { "utility": "Electric", "provider": "...", "confidence": "..." },
    { "utility": "Gas", "provider": "...", "confidence": "..." },
    { "utility": "Stormwater", "provider": "...", "confidence": "..." }
  ],
  "constraints": [
    { "label": "FEMA Flood Zone", "detail": "likely X/AE/etc or 'unknown — check FEMA map'", "severity": "info|watch|risk", "confidence": "..." },
    { "label": "Historic District", "detail": "...", "severity": "...", "confidence": "..." },
    { "label": "Wetlands / Environmental", "detail": "...", "severity": "...", "confidence": "..." },
    { "label": "Tree protection", "detail": "...", "severity": "...", "confidence": "..." },
    { "label": "Right-of-way / Access", "detail": "...", "severity": "...", "confidence": "..." }
  ],
  "likely_permits": [
    { "name": "Building Permit", "when_required": "...", "confidence": "..." }
  ],
  "required_documents": ["Site plan", "Plat / survey", "Construction drawings", "..."],
  "next_steps": ["Confirm parcel ID via county GIS", "..."],
  "disclaimers": ["Parcel boundaries, zoning, and flood zones are not verified against live GIS layers — confirm before filing."]
}

RULES
- NEVER fabricate parcel numbers, exact zoning codes, FEMA zones, easements, or utility account details. When not certain, mark confidence "needs_confirmation" and phrase as "likely" or "check with ...".
- Prefer facts from the JURISDICTION CONTEXT block if present; those are "verified".
- 5-10 authorities max, dedupe roles that don't apply.
- Utilities: only include the ones you can name a real provider for or plausibly identify by region; otherwise omit that row.
- Every array item MUST include a confidence field.
- Output JSON only — no prose, no fences.`;

    const raw = await callLovableAI(aiKey, [
      { role: "system", content: "You output valid JSON only. No prose, no fences." },
      { role: "user", content: prompt },
    ], "google/gemini-2.5-flash");

    let ai: PropertyAiAnalysis;
    try {
      ai = extractJson<PropertyAiAnalysis>(raw);
    } catch {
      throw new Error("AI returned unparseable property analysis. Try again.");
    }

    return {
      input_address: data.address,
      geocode: g,
      jurisdiction: {
        resolved: j.name,
        city: j.city,
        county: j.county,
        state: j.state,
        has_cached_profile: ctx.hasData,
        portal_url: ctx.profile?.portal_url ?? null,
        department: ctx.profile?.department ?? null,
      },
      ai,
    };
  });
