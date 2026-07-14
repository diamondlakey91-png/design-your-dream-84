import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { geocode, resolveJurisdictionName } from "@/lib/geocoding.shared";

const GeocodeInput = z.object({ address: z.string().trim().min(4).max(300) });

// Read-only address -> jurisdiction lookup, no AI call. Used to ground
// free-text jurisdiction fields (project creation, permit intake) against
// Google's geocoder without triggering a full Property Intelligence
// analysis on every save.
export const geocodeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GeocodeInput.parse(input))
  .handler(async ({ data }) => {
    const g = await geocode(data.address);
    const j = resolveJurisdictionName(g);
    return {
      jurisdiction: j.name,
      city: j.city,
      county: j.county,
      state: j.state,
      formatted_address: g.formatted_address,
      zip: g.components.postal_code ?? "",
      lat: g.lat,
      lng: g.lng,
    };
  });
