/**
 * PERMIVIO — flood data resolution (server-only).
 *
 * Attempts the official FEMA National Flood Hazard Layer map service for the
 * effective flood zone at a point, then always returns the flood authority
 * contacts and official floodplain map portals for the jurisdiction so a report
 * carries real, actionable flood information even when the machine lookup
 * fails. No flood zone, base flood elevation or FIRM panel is ever estimated.
 */

import { buildFloodProfile, type FloodProfile, type FloodZoneLookup } from "@/lib/floodAuthorities";

/** FEMA publishes the NFHL on more than one host; both are tried. */
const NFHL_ENDPOINTS = [
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query",
  "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query",
];

async function queryNfhl(lat: number, lng: number): Promise<{ zone: FloodZoneLookup | null; error: string | null }> {
  const geometry = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
  const qs =
    `?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,DFIRM_ID,FIRM_PAN&returnGeometry=false&f=json`;
  let lastError: string | null = null;
  for (const base of NFHL_ENDPOINTS) {
    const url = `${base}${qs}`;
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "application/json", "User-Agent": "Permivio/1.0 (permitting research)" },
      });
      if (!resp.ok) {
        lastError = `${resp.status} ${resp.statusText}`;
        continue;
      }
      const j = (await resp.json()) as { features?: Array<{ attributes?: Record<string, unknown> }>; error?: { message?: string } };
      if (j.error) {
        lastError = j.error.message ?? "map service error";
        continue;
      }
      const a = j.features?.[0]?.attributes;
      const zone = a && typeof a['FLD_ZONE'] === "string" ? a['FLD_ZONE'] : null;
      if (!zone) return { zone: null, error: null }; // service answered: no mapped zone here
      return {
        zone: {
          zone,
          subtype: typeof a!['ZONE_SUBTY'] === "string" ? (a!['ZONE_SUBTY'] as string) : null,
          sfha: typeof a!['SFHA_TF'] === "string" ? (a!['SFHA_TF'] as string).toUpperCase() === "T" : null,
          firmPanel: typeof a!['FIRM_PAN'] === "string" ? (a!['FIRM_PAN'] as string) : null,
          sourceUrl: url,
        },
        error: null,
      };
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  return { zone: null, error: lastError ?? "FEMA flood map service unreachable" };
}

/** Resolve the full flood package (zone when available + real authorities + maps). */
export async function resolveFloodProfile(input: {
  address: string | null;
  lat: number | null;
  lng: number | null;
  locality: string | null;
  county: string | null;
  state: string | null;
  authorities?: Array<{ role: string; official_name: string; website?: string | null; verification?: string }>;
}): Promise<FloodProfile> {
  let zone: FloodZoneLookup | null = null;
  let serviceError: string | null = null;
  if (input.lat !== null && input.lng !== null) {
    const res = await queryNfhl(input.lat, input.lng);
    zone = res.zone;
    serviceError = res.error;
  }
  return buildFloodProfile({ ...input, zone, serviceError });
}
