// PERMIVIO — shared "who actually controls this permit" lookup.
//
// Resolves the controlling authority from official boundary data, then returns
// the live published contact record for each relevant agency plus the official
// online permit portal. Used by the Permit Filing and Site Investigation
// workspaces so both show the same real authority, not the mailing-address city.
//
// Nothing here is estimated. A service that cannot be reached is reported as
// unavailable; a field an agency does not publish stays absent.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgencyContact, AgencyRole } from "@/lib/agencyContacts";

const Input = z.object({
  query: z.string().min(3).max(300),
  roles: z
    .array(z.enum(["building", "planning_zoning", "fire", "health", "public_works", "utilities"]))
    .max(6)
    .optional(),
});

export type AhjContactsResult =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Authority resolved from boundary data — the AHJ, not the postal city. */
      authority: string | null;
      county: string | null;
      state: string | null;
      /** Whether the site sits inside municipal corporate limits. */
      incorporated: boolean | null;
      postal_city: string | null;
      formatted_address: string | null;
      contacts: AgencyContact[];
      /** Official online permit portals found on the agencies' own pages. */
      portals: Array<{ label: string; url: string; source_url: string }>;
      sources: Array<{ title: string; url: string }>;
      unavailable: string[];
    };

/**
 * Resolve the controlling authority and its live agency contacts for one
 * address or jurisdiction name.
 */
export const lookupAhjContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<AhjContactsResult> => {
    const { geocode } = await import("@/lib/geocoding.shared");
    const { resolveAuthoritativeGeography } = await import("@/lib/govGis.server");
    const { gatherAgencyContacts } = await import("@/lib/agencyContacts.server");

    let g: Awaited<ReturnType<typeof geocode>> | null = null;
    try {
      g = await geocode(data.query);
    } catch {
      g = null;
    }

    const unavailable: string[] = [];
    const sources: Array<{ title: string; url: string }> = [];
    let authority: string | null = null;
    let county: string | null = null;
    let state: string | null = null;
    let incorporated: boolean | null = null;

    if (g?.lat && g?.lng) {
      const geo = await resolveAuthoritativeGeography({
        address: g.formatted_address ?? data.query,
        lat: g.lat,
        lng: g.lng,
        postalCity: g.components.locality ?? null,
      }).catch(() => null);

      if (!geo) {
        unavailable.push("U.S. Census Bureau boundary services");
      } else {
        unavailable.push(...geo.unavailable);
        const place = geo.census?.place ?? null;
        county = geo.census?.countyName ?? null;
        state = geo.census?.stateName ?? geo.census?.stateAbbr ?? null;
        incorporated = place ? true : geo.census ? false : null;
        authority = place?.name ?? county ?? null;
        for (const e of geo.evidence ?? []) {
          if (e?.url) sources.push({ title: e.title ?? e.url, url: e.url });
        }
      }
    } else {
      unavailable.push("Address geocoding (the location could not be placed on the map)");
    }

    // Fall back to the typed jurisdiction only when boundary data is unavailable,
    // and say so — never silently treat the mailing city as the authority.
    const jurisdictionForContacts = authority ?? (g?.components?.locality ?? null);
    if (!authority && jurisdictionForContacts) {
      unavailable.push(
        "Controlling authority not confirmed from boundary data — contacts below were searched by place name and must be confirmed",
      );
    }
    if (!jurisdictionForContacts) {
      return {
        ok: true,
        authority: null,
        county,
        state,
        incorporated,
        postal_city: g?.components?.locality ?? null,
        formatted_address: g?.formatted_address ?? null,
        contacts: [],
        portals: [],
        sources,
        unavailable: [...unavailable, "Agency contact directory (no jurisdiction to search)"],
      };
    }

    const { contacts, unavailable: contactGaps } = await gatherAgencyContacts({
      jurisdiction: jurisdictionForContacts,
      roles: data.roles as AgencyRole[] | undefined,
    }).catch(() => ({ contacts: [] as AgencyContact[], unavailable: ["Agency contact directory (retrieval failed)"] }));

    const portals: Array<{ label: string; url: string; source_url: string }> = [];
    for (const c of contacts) {
      if (c.portal_url && !portals.some((p) => p.url === c.portal_url)) {
        portals.push({ label: `${c.role_label} — online permit portal`, url: c.portal_url, source_url: c.source_url });
      }
      if (c.source_url && !sources.some((s) => s.url === c.source_url)) {
        sources.push({ title: `${c.jurisdiction} — ${c.role_label}`, url: c.source_url });
      }
    }

    return {
      ok: true,
      authority,
      county,
      state,
      incorporated,
      postal_city: g?.components?.locality ?? null,
      formatted_address: g?.formatted_address ?? null,
      contacts,
      portals,
      sources,
      unavailable: [...unavailable, ...contactGaps],
    };
  });
