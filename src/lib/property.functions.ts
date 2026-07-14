import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callLovableAI, loadJurisdictionContextBlock } from "@/lib/ai.shared";
import { geocode, resolveJurisdictionName, type GeocodeResult } from "@/lib/geocoding.shared";

// ---- Types returned to the client ----
export type PropertyIntel = {
  input_address: string;
  geocode: GeocodeResult;
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
