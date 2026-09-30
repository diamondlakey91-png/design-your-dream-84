// PERMIVIO — pure parsing helpers for regulatory providers (testable, no I/O).

export type ArcgisResponse = { features?: Array<{ attributes?: Record<string, unknown> }>; error?: { message?: string } } | null;

/** First feature's attributes, or null when the service errored / returned nothing. Never guesses. */
export function arcgisFirst(j: ArcgisResponse): Record<string, unknown> | null {
  if (!j || j.error) return null;
  return j.features?.[0]?.attributes ?? null;
}

export function arcgisAll(j: ArcgisResponse): Array<Record<string, unknown>> {
  if (!j || j.error) return [];
  return (j.features ?? []).map((f) => f.attributes ?? {}).filter(Boolean);
}

export type FloodClassification = {
  available: boolean;
  zone: string | null;
  subtype: string | null;
  sfha: boolean | null;
  floodway: boolean | null;
  staticBfe: number | null;
  ambiguous: boolean;
  nearbyZones: string[];
  summary: string;
};

/**
 * Classify an NFHL point result. `nearby` = zones within a small buffer; more than one distinct
 * zone means the point is near a boundary → ambiguous (never certain).
 * Outside an SFHA is described as "not in a mapped SFHA" — never "safe from flooding".
 */
export function classifyFlood(input: {
  features: Array<Record<string, unknown>> | null;
  nearby: Array<Record<string, unknown>> | null;
  official: boolean;
}): FloodClassification {
  if (!input.features) {
    return { available: false, zone: null, subtype: null, sfha: null, floodway: null, staticBfe: null, ambiguous: false, nearbyZones: [], summary: "Flood data unavailable — Needs Verification." };
  }
  const a = input.features[0];
  if (!a) {
    return { available: true, zone: null, subtype: null, sfha: null, floodway: null, staticBfe: null, ambiguous: true, nearbyZones: [], summary: "No mapped flood-hazard polygon returned at this point — Needs Verification (unmapped or service gap)." };
  }
  const zone = typeof a["FLD_ZONE"] === "string" ? (a["FLD_ZONE"] as string).trim() : null;
  const subtype = typeof a["ZONE_SUBTY"] === "string" ? (a["ZONE_SUBTY"] as string) : null;
  const sfhaRaw = a["SFHA_TF"];
  const sfha = typeof sfhaRaw === "string" ? sfhaRaw.toUpperCase() === "T" : null;
  const floodway = subtype ? /floodway/i.test(subtype) : null;
  const bfe = typeof a["STATIC_BFE"] === "number" && (a["STATIC_BFE"] as number) > -9000 ? (a["STATIC_BFE"] as number) : null;
  const nearbyZones = [...new Set((input.nearby ?? []).map((n) => String(n["FLD_ZONE"] ?? "").trim()).filter(Boolean))];
  const ambiguous = nearbyZones.length > 1;
  const summary = zone
    ? `FEMA Zone ${zone}${subtype ? ` (${subtype})` : ""} — ${sfha ? "inside a mapped Special Flood Hazard Area" : "not inside a mapped Special Flood Hazard Area (flood risk is not zero)"}${ambiguous ? `; zones ${nearbyZones.join(", ")} occur within ~25 m, so the result is near a boundary` : ""}.`
    : "Flood zone attribute missing — Needs Verification.";
  return { available: true, zone, subtype, sfha, floodway, staticBfe: bfe, ambiguous, nearbyZones, summary };
}

export function epochToDate(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Date(v).toISOString().slice(0, 10);
}

export function addressHash(s: string): string {
  const n = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  let h = 5381;
  for (let i = 0; i < n.length; i++) h = ((h << 5) + h + n.charCodeAt(i)) | 0;
  return `a${(h >>> 0).toString(36)}`;
}
