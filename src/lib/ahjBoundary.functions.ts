// PERMIVIO — AHJ boundary + parcel point resolver for the map view.
//
// Returns only values read from government services: Google geocoding for the
// site point, U.S. Census Bureau TIGER boundaries for the authority in control
// (the same determination the Permit Requirements and QA/QC agents use), and
// the TIGERweb map service for that authority's real boundary geometry.
// Nothing here is model generated; unreachable services are reported.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ query: z.string().trim().min(3).max(300) });

export type AhjBoundaryResult =
  | { ok: false; error: string }
  | {
      ok: true;
      point: { lat: number; lng: number; label: string } | null;
      ahj: {
        name: string | null;
        level: "incorporated_place" | "county" | "unknown";
        geoid: string | null;
        incorporation_status: string;
        postal_city_is_controlling: boolean | null;
        note: string;
        authoritative: boolean;
      };
      county: string | null;
      state: string | null;
      flood_zone: string | null;
      /** GeoJSON geometry of the controlling authority's boundary, when retrieved. */
      boundary: unknown | null;
      boundary_source: { title: string; url: string } | null;
      sources: Array<{ title: string; url: string }>;
      unavailable: string[];
    };

const PLACES_LAYER =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4";
const COUNTY_LAYER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1";

function boundaryUrl(layer: string, geoid: string): string {
  return (
    `${layer}/query?where=${encodeURIComponent(`GEOID='${geoid}'`)}` +
    `&outFields=NAME,GEOID&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0004&f=geojson`
  );
}

async function fetchBoundary(layer: string, geoid: string): Promise<{ geometry: unknown; url: string } | null> {
  const url = boundaryUrl(layer, geoid);
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" } });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { features?: Array<{ geometry?: unknown }> };
    const geometry = j.features?.[0]?.geometry ?? null;
    return geometry ? { geometry, url } : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the controlling authority boundary and site point for one address or
 * jurisdiction name. Safe to call for a jurisdiction label alone (the point is
 * then the jurisdiction centroid returned by geocoding).
 */
export const resolveAhjBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<AhjBoundaryResult> => {
    const { geocode } = await import("@/lib/geocoding.shared");
    const { resolveAuthoritativeGeography } = await import("@/lib/govGis.server");

    let g: Awaited<ReturnType<typeof geocode>> | null = null;
    try {
      g = await geocode(data.query);
    } catch {
      g = null;
    }
    if (!g?.lat || !g?.lng) {
      return { ok: false, error: "That address or jurisdiction could not be located on the map." };
    }

    const geo = await resolveAuthoritativeGeography({
      address: g.formatted_address ?? data.query,
      lat: g.lat,
      lng: g.lng,
      postalCity: g.components.locality ?? null,
    }).catch(() => null);

    const unavailable = [...(geo?.unavailable ?? [])];
    if (!geo) unavailable.push("U.S. Census Bureau boundary services");

    const place = geo?.census?.place ?? null;
    const countyFips = geo?.census?.countyFips ?? null;

    let boundary: unknown | null = null;
    let boundary_source: { title: string; url: string } | null = null;
    if (place?.geoid) {
      const b = await fetchBoundary(PLACES_LAYER, place.geoid);
      if (b) {
        boundary = b.geometry;
        boundary_source = { title: `U.S. Census TIGERweb — ${place.name} corporate limits`, url: b.url };
      }
    } else if (countyFips) {
      const b = await fetchBoundary(COUNTY_LAYER, countyFips);
      if (b) {
        boundary = b.geometry;
        boundary_source = {
          title: `U.S. Census TIGERweb — ${geo?.census?.county ?? "county"} boundary`,
          url: b.url,
        };
      }
    }
    if (!boundary) unavailable.push("U.S. Census TIGERweb boundary geometry");

    const sources: Array<{ title: string; url: string }> = [
      ...(geo?.evidence ?? []).map((e) => ({ title: e.title, url: e.url })),
      ...(boundary_source ? [boundary_source] : []),
    ];

    return {
      ok: true,
      point: { lat: g.lat, lng: g.lng, label: g.formatted_address ?? data.query },
      ahj: {
        name: geo?.determination.place_in_control ?? null,
        level: place?.geoid ? "incorporated_place" : countyFips ? "county" : "unknown",
        geoid: place?.geoid ?? countyFips ?? null,
        incorporation_status: geo?.determination.incorporation_status ?? "undetermined",
        postal_city_is_controlling: geo?.determination.postal_city_is_controlling ?? null,
        note:
          geo?.determination.note ??
          "No official boundary service could be reached, so the controlling authority is unconfirmed. The mailing address does not establish jurisdiction.",
        authoritative: geo?.determination.authoritative ?? false,
      },
      county: geo?.census?.county ?? geo?.fcc?.countyName ?? null,
      state: geo?.census?.stateAbbr ?? geo?.census?.state ?? null,
      flood_zone: geo?.flood?.zone ?? null,
      boundary,
      boundary_source,
      unavailable: [...new Set(unavailable)],
    };
  });
