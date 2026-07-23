import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Structured address required. A ZIP code alone is never a jurisdiction.
const AddressInput = z.object({
  project_id: z.string().uuid(),
  street: z.string().trim().min(3, "Street required"),
  suite: z.string().trim().max(40).optional().nullable(),
  city: z.string().trim().min(2, "City required"),
  state: z.string().trim().length(2, "Use 2-letter state code"),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "ZIP must be 5 or 9 digits"),
  parcel_number: z.string().trim().max(60).optional().nullable(),
});

type GeocodeResult = {
  formatted_address: string;
  lat: number;
  lng: number;
  county: string | null;
  municipality: string | null;
  state: string | null;
  incorporated: boolean;
  location_type: string;
  place_id?: string;
};

async function geocodeGoogle(address: string): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    status: string;
    results?: Array<{
      formatted_address: string;
      place_id: string;
      geometry: { location: { lat: number; lng: number }; location_type: string };
      address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
    }>;
  };
  if (json.status !== "OK" || !json.results?.length) return null;
  const r = json.results[0];
  const comp = (type: string) =>
    r.address_components.find((c) => c.types.includes(type)) ?? null;
  const county = comp("administrative_area_level_2")?.long_name?.replace(/\s+County$/i, "") ?? null;
  const stateShort = comp("administrative_area_level_1")?.short_name ?? null;
  const locality = comp("locality")?.long_name ?? null; // incorporated place
  const subLocality = comp("sublocality")?.long_name ?? null;
  const municipality = locality ?? subLocality;
  const incorporated = !!locality;
  return {
    formatted_address: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    county,
    municipality,
    state: stateShort,
    incorporated,
    location_type: r.geometry.location_type,
    place_id: r.place_id,
  };
}

/** Authority candidate suggested for a resolved jurisdiction. */
type AuthorityCandidate = {
  role:
    | "building" | "planning_zoning" | "fire" | "health" | "public_works"
    | "site_development" | "environmental" | "transportation_row"
    | "utility_water" | "utility_sewer" | "utility_electric" | "utility_gas"
    | "stormwater" | "historic" | "floodplain" | "other";
  official_name: string;
  department?: string;
  responsibility: string;
  website?: string | null;
  portal_url?: string | null;
  verification: "verified" | "ai_assisted" | "needs_confirmation";
  source?: { url: string; title: string; publisher: string } | null;
};

/**
 * Curated authority records. Extend this over time.
 * Keyed by `${state}|${county}|${municipality ?? ''}`. Municipality "" = unincorporated / county-wide.
 */
const CURATED_AUTHORITIES: Record<string, AuthorityCandidate[]> = {
  "MD|Anne Arundel|": [
    { role: "building", official_name: "Anne Arundel County Department of Inspections and Permits", department: "Permit Application Center", responsibility: "Primary AHJ for building, trade, and site permits countywide (outside Annapolis).", website: "https://www.aacounty.org/inspections-and-permits", portal_url: "https://www.aacounty.org/inspections-and-permits/permits", verification: "ai_assisted", source: { url: "https://www.aacounty.org/inspections-and-permits/permits", title: "Anne Arundel County — Permits", publisher: "Anne Arundel County, MD" } },
    { role: "planning_zoning", official_name: "Anne Arundel County Office of Planning and Zoning", responsibility: "Zoning verification, use approvals, subdivision, and site design review.", website: "https://www.aacounty.org/planning-and-zoning", verification: "ai_assisted", source: null },
    { role: "fire", official_name: "Anne Arundel County Fire Marshal's Office", responsibility: "Fire and life-safety plan review, fire alarm and suppression permits, inspections.", website: "https://www.aacounty.org/fire", verification: "ai_assisted", source: null },
    { role: "health", official_name: "Anne Arundel County Department of Health", department: "Environmental Health", responsibility: "Food service plan review, well & septic, environmental health.", website: "https://health.aacounty.org", verification: "ai_assisted", source: null },
    { role: "public_works", official_name: "Anne Arundel County Department of Public Works", responsibility: "Grading, stormwater, and utility engineering review.", website: "https://www.aacounty.org/public-works", verification: "ai_assisted", source: null },
  ],
  "MD|Anne Arundel|Annapolis": [
    { role: "building", official_name: "City of Annapolis Department of Planning and Zoning", department: "Permits & Inspections", responsibility: "Primary AHJ for building permits inside Annapolis city limits.", website: "https://www.annapolis.gov/165/Planning-Zoning", verification: "ai_assisted", source: null },
    { role: "planning_zoning", official_name: "City of Annapolis Department of Planning and Zoning", responsibility: "Zoning, historic preservation, and site plan review inside city limits.", website: "https://www.annapolis.gov/165/Planning-Zoning", verification: "ai_assisted", source: null },
    { role: "fire", official_name: "Annapolis Fire Department — Fire Marshal", responsibility: "Fire and life-safety review inside city limits.", website: "https://www.annapolis.gov/172/Fire", verification: "ai_assisted", source: null },
    { role: "health", official_name: "Anne Arundel County Department of Health", responsibility: "Food service plan review — county health serves city addresses.", website: "https://health.aacounty.org", verification: "ai_assisted", source: null },
    { role: "historic", official_name: "Annapolis Historic Preservation Commission", responsibility: "Certificate of Approval for work in historic district.", website: "https://www.annapolis.gov/166/Historic-Preservation", verification: "ai_assisted", source: null },
  ],
};

function candidatesFor(state: string | null, county: string | null, municipality: string | null, incorporated: boolean): AuthorityCandidate[] {
  if (!state || !county) return [];
  if (incorporated && municipality) {
    const cityKey = `${state}|${county}|${municipality}`;
    if (CURATED_AUTHORITIES[cityKey]) return CURATED_AUTHORITIES[cityKey];
  }
  const countyKey = `${state}|${county}|`;
  return CURATED_AUTHORITIES[countyKey] ?? [];
}

// ---------- Server functions ----------

export const resolveAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddressInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project ownership
    const { data: proj } = await supabase
      .from("projects").select("id, user_id").eq("id", data.project_id).maybeSingle();
    if (!proj || proj.user_id !== userId) throw new Error("Project not found.");

    const fullAddress = `${data.street}, ${data.city}, ${data.state} ${data.zip}`;
    const geo = await geocodeGoogle(fullAddress);

    if (!geo || geo.location_type === "APPROXIMATE") {
      // Low confidence — write an unconfirmed row without a jurisdiction link
      const row = {
        project_id: data.project_id,
        street: data.street,
        suite: data.suite ?? null,
        city: data.city,
        state: data.state.toUpperCase(),
        zip: data.zip,
        formatted_address: geo?.formatted_address ?? null,
        parcel_number: data.parcel_number ?? null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        incorporated: geo?.incorporated ?? null,
        status: "unconfirmed" as const,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase.from("jurisdiction_confirmations") as any)
        .select("id").eq("project_id", data.project_id).maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = existing?.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (supabase.from("jurisdiction_confirmations") as any).update(row).eq("id", existing.id).select("*").single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : (supabase.from("jurisdiction_confirmations") as any).insert(row).select("*").single();
      const { data: saved, error } = await q;
      if (error) throw new Error(error.message);
      return {
        confirmation: saved,
        jurisdiction: null,
        candidates: [] as AuthorityCandidate[],
        low_confidence: true,
        message: "Address could not be geocoded precisely. Please refine and try again.",
      };
    }

    // Upsert jurisdiction record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const juRes = await (supabase.from("jurisdictions") as any)
      .upsert(
        {
          state: geo.state ?? data.state.toUpperCase(),
          county: geo.county ?? "Unknown",
          municipality: geo.incorporated ? geo.municipality : null,
          incorporated: geo.incorporated,
          centroid_lat: geo.lat,
          centroid_lng: geo.lng,
        },
        { onConflict: "state,county,municipality", ignoreDuplicates: false },
      )
      .select("id, state, county, municipality, incorporated")
      .single();

    // Fallback: if onConflict form isn't supported, do read-then-insert
    let jurisdiction = juRes.data;
    if (!jurisdiction) {
      const { data: found } = await supabase.from("jurisdictions").select("*")
        .eq("state", geo.state ?? data.state.toUpperCase())
        .eq("county", geo.county ?? "Unknown")
        .is("municipality", geo.incorporated ? geo.municipality as unknown as null : null)
        .maybeSingle();
      if (found) jurisdiction = found;
    }

    const cands = candidatesFor(geo.state, geo.county, geo.municipality, geo.incorporated);

    // Upsert confirmation
    const confirmRow = {
      project_id: data.project_id,
      jurisdiction_id: jurisdiction?.id ?? null,
      street: data.street,
      suite: data.suite ?? null,
      city: data.city,
      state: (geo.state ?? data.state).toUpperCase(),
      zip: data.zip,
      formatted_address: geo.formatted_address,
      parcel_number: data.parcel_number ?? null,
      lat: geo.lat,
      lng: geo.lng,
      incorporated: geo.incorporated,
      status: "unconfirmed" as const,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase.from("jurisdiction_confirmations") as any)
      .select("id").eq("project_id", data.project_id).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saveQ = existing?.id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase.from("jurisdiction_confirmations") as any).update(confirmRow).eq("id", existing.id).select("*").single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (supabase.from("jurisdiction_confirmations") as any).insert(confirmRow).select("*").single();
    const { data: confirmation, error: cErr } = await saveQ;
    if (cErr) throw new Error(cErr.message);

    return { confirmation, jurisdiction, candidates: cands, low_confidence: false };
  });

export const getJurisdictionConfirmation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: confirmation } = await (supabase.from("jurisdiction_confirmations") as any)
      .select("*").eq("project_id", data.project_id).maybeSingle();
    if (!confirmation) return { confirmation: null, jurisdiction: null, candidates: [] as AuthorityCandidate[] };
    let jurisdiction = null as null | { id: string; state: string; county: string; municipality: string | null; incorporated: boolean };
    if (confirmation.jurisdiction_id) {
      const { data: j } = await supabase.from("jurisdictions").select("id, state, county, municipality, incorporated").eq("id", confirmation.jurisdiction_id).maybeSingle();
      jurisdiction = j as typeof jurisdiction;
    }
    const candidates = jurisdiction
      ? candidatesFor(jurisdiction.state, jurisdiction.county, jurisdiction.municipality, jurisdiction.incorporated)
      : [];
    return { confirmation, jurisdiction, candidates };
  });

export const confirmJurisdiction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      mode: z.enum(["user_confirmed", "pending_review"]).default("user_confirmed"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase.from("jurisdiction_confirmations") as any)
      .select("*").eq("project_id", data.project_id).maybeSingle();
    if (!existing) throw new Error("Resolve the project address first.");
    if (!existing.jurisdiction_id) throw new Error("Cannot confirm — jurisdiction not resolved. Refine the address.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("jurisdiction_confirmations") as any)
      .update({
        status: data.mode,
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true, status: data.mode };
  });

export const requestJurisdictionHumanReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ project_id: z.string().uuid(), notes: z.string().max(2000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase.from("jurisdiction_confirmations") as any)
      .select("id").eq("project_id", data.project_id).maybeSingle();
    if (!existing) throw new Error("Resolve the project address first.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("jurisdiction_confirmations") as any)
      .update({ status: "pending_review", notes: data.notes ?? null })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type { AuthorityCandidate };
