// Google Maps geocoding via the Lovable connector gateway, shared by the
// Property Intelligence feature (permitAnalysis-adjacent AI lookup) and
// plain jurisdiction-verification call sites (project creation, permit
// intake) that just want geocode()+resolveJurisdictionName() without the
// AI-analysis step.

export type GeocodeResult = {
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

export async function geocode(address: string): Promise<GeocodeResult> {
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

export function resolveJurisdictionName(g: GeocodeResult): { name: string; city: string; county: string; state: string } {
  const city = g.components.locality || g.components.sublocality || "";
  const county = g.components.county || "";
  const state = g.components.state_code || g.components.state || "";
  // Prefer City, ST when city present; fall back to County, ST
  const name = city ? `${city}, ${state}` : county ? `${county}, ${state}` : state;
  return { name, city, county, state };
}
