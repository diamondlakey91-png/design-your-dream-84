/**
 * PERMIVIO — flood / floodplain authority library (client + server safe).
 *
 * Purpose: a Site Investigation or Feasibility report must always tell the
 * client WHO administers floodplain development at the site and WHERE the
 * official floodplain maps are, even when a machine flood-zone lookup cannot
 * be completed. Nothing here invents a flood zone, a base flood elevation or a
 * FIRM panel — those come only from an official map service response or are
 * reported as requiring confirmation.
 *
 * Contact records carry a verification level per PERMIVIO verification rules.
 * Only federal FEMA map portals are labelled "verified"; every office name,
 * phone number and local link must be confirmed with the office itself.
 */

import { govSearchUrl } from "@/lib/portalRegistry";

export type FloodContactRole =
  | "local_floodplain_administrator"
  | "state_nfip_coordinator"
  | "federal_map_service";

export type FloodContact = {
  role: FloodContactRole;
  official_name: string;
  responsibility: string;
  website: string | null;
  phone: string | null;
  verification: "verified" | "needs_confirmation";
};

export type FloodMapResource = {
  title: string;
  url: string;
  publisher: string;
  kind: "federal_firm" | "federal_map_change" | "state_flood_map" | "local_flood_map";
};

export type FloodZoneLookup = {
  zone: string;
  subtype: string | null;
  sfha: boolean | null;
  firmPanel: string | null;
  sourceUrl: string;
};

export type FloodProfile = {
  /** Effective flood zone at the site, only when an official service answered. */
  zone: FloodZoneLookup | null;
  lookup_status: "retrieved" | "no_mapped_zone_returned" | "service_unavailable" | "no_coordinates";
  lookup_note: string;
  contacts: FloodContact[];
  maps: FloodMapResource[];
  /** Plain-language floodplain permitting implications, never a determination. */
  implications: string[];
};

/* ------------------------------------------------------------------ */
/* Federal                                                             */
/* ------------------------------------------------------------------ */

export const FEMA_FMIX: FloodContact = {
  role: "federal_map_service",
  official_name: "FEMA Map Information eXchange (FMIX)",
  responsibility:
    "Federal help line for effective FIRM panels, flood zone determinations, Letters of Map Amendment/Revision (LOMA/LOMR) and map history at a specific address.",
  website: "https://www.floodmaps.fema.gov/fhm/fmx_main.html",
  phone: "1-877-336-2627",
  verification: "verified",
};

function femaMaps(address: string | null, lat: number | null, lng: number | null): FloodMapResource[] {
  const maps: FloodMapResource[] = [
    {
      title: address
        ? `FEMA Flood Map Service Center — effective FIRM search for ${address}`
        : "FEMA Flood Map Service Center — effective FIRM search",
      url: address
        ? `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(address)}`
        : "https://msc.fema.gov/portal/search",
      publisher: "Federal Emergency Management Agency",
      kind: "federal_firm",
    },
    {
      title: "FEMA National Flood Hazard Layer (NFHL) Viewer — interactive effective flood hazard map",
      url: "https://www.fema.gov/flood-maps/national-flood-hazard-layer",
      publisher: "Federal Emergency Management Agency",
      kind: "federal_firm",
    },
    {
      title: "FEMA Map Service Center — LOMC / map change and preliminary product search",
      url: "https://msc.fema.gov/portal/advanceSearch",
      publisher: "Federal Emergency Management Agency",
      kind: "federal_map_change",
    },
  ];
  if (lat !== null && lng !== null) {
    maps.push({
      title: `FEMA Flood Map Service Center — map panel search at site coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      url: `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(`${lat}, ${lng}`)}`,
      publisher: "Federal Emergency Management Agency",
      kind: "federal_firm",
    });
  }
  return maps;
}

/* ------------------------------------------------------------------ */
/* State NFIP coordinating agencies                                    */
/* ------------------------------------------------------------------ */

type StateFlood = { agency: string; website: string; phone?: string; mapViewer?: { title: string; url: string } };

/** State NFIP coordinating agencies PERMIVIO has on file. Confirm before relying. */
const STATE_NFIP: Record<string, StateFlood> = {
  MD: {
    agency: "Maryland Department of the Environment — Flood Hazard Mitigation / NFIP State Coordinator",
    website: "https://mde.maryland.gov/programs/water/FloodHazardMitigation/Pages/index.aspx",
    phone: "410-537-3000",
  },
  VA: {
    agency: "Virginia Department of Conservation and Recreation — Division of Dam Safety and Floodplain Management (NFIP State Coordinator)",
    website: "https://www.dcr.virginia.gov/dam-safety-and-floodplains/floodplain-management",
    phone: "804-786-6124",
    mapViewer: {
      title: "Virginia Flood Risk Information System (VFRIS) — state floodplain map viewer",
      url: "https://www.dcr.virginia.gov/dam-safety-and-floodplains/vfris",
    },
  },
  DC: {
    agency: "District of Columbia Department of Energy and Environment — Floodplain Management",
    website: "https://doee.dc.gov/service/flooding-washington-dc",
    phone: "202-535-2600",
  },
  DE: {
    agency: "Delaware Department of Natural Resources and Environmental Control — Flood Mitigation / NFIP State Coordinator",
    website: "https://dnrec.delaware.gov/climate-coastal-energy/flood-planning/",
  },
  WV: {
    agency: "West Virginia Emergency Management Division — State NFIP Coordinator",
    website: "https://emd.wv.gov/mitigation/pages/floodplain-management.aspx",
  },
  PA: {
    agency: "Pennsylvania Department of Community and Economic Development — State NFIP Coordinator",
    website: "https://dced.pa.gov/local-government/floodplain-management/",
  },
  NC: {
    agency: "North Carolina Floodplain Mapping Program (NCEM) — State NFIP Coordinator",
    website: "https://www.ncfloodmaps.com/",
    mapViewer: { title: "North Carolina Flood Risk Information System (FRIS)", url: "https://fris.nc.gov/fris/" },
  },
};

const STATE_COORDINATOR_DIRECTORY = {
  title: "FEMA — NFIP State Floodplain Management Coordinators directory",
  url: "https://www.fema.gov/flood-plain-management/state-coordinators",
};

/* ------------------------------------------------------------------ */
/* Profile builder                                                     */
/* ------------------------------------------------------------------ */

type ResolvedAuthority = { role: string; official_name: string; website?: string | null; verification?: string };

const LOCAL_FLOOD_ROLES = ["floodplain", "stormwater", "site_development", "public_works", "planning_zoning", "building"];

/**
 * Assemble the flood authority + floodplain map package for a site.
 * `zone` is supplied only when an official flood map service answered.
 */
export function buildFloodProfile(input: {
  address: string | null;
  lat: number | null;
  lng: number | null;
  locality: string | null;
  county: string | null;
  state: string | null;
  authorities?: ResolvedAuthority[];
  zone?: FloodZoneLookup | null;
  serviceError?: string | null;
}): FloodProfile {
  const state = (input.state ?? "").trim().toUpperCase().slice(0, 2) || null;
  const jurisdictionName = input.locality ?? input.county ?? null;
  const contacts: FloodContact[] = [];

  // 1. Local floodplain administrator — every NFIP community must designate one.
  const stack = input.authorities ?? [];
  const local =
    LOCAL_FLOOD_ROLES.map((r) => stack.find((a) => a.role === r)).find(Boolean) ?? null;
  contacts.push({
    role: "local_floodplain_administrator",
    official_name: local
      ? `${local.official_name} — floodplain administration`
      : jurisdictionName
        ? `${jurisdictionName} floodplain administrator (office not yet identified)`
        : "Local floodplain administrator (jurisdiction not established)",
    responsibility:
      "Issues the floodplain development permit, applies the local floodplain ordinance (which may be stricter than the minimum NFIP standard), sets lowest-floor / freeboard and elevation-certificate requirements, and confirms the effective flood zone of record for permitting.",
    website:
      local?.website ??
      (jurisdictionName && state
        ? govSearchUrl(`${jurisdictionName} ${state} floodplain administrator floodplain development permit`)
        : null),
    phone: null,
    verification: "needs_confirmation",
  });

  // 2. State NFIP coordinating agency.
  const st = state ? STATE_NFIP[state] : undefined;
  contacts.push(
    st
      ? {
          role: "state_nfip_coordinator",
          official_name: st.agency,
          responsibility:
            "State NFIP coordinating office: floodplain ordinance interpretation, state floodplain permitting requirements, map-revision guidance and community assistance.",
          website: st.website,
          phone: st.phone ?? null,
          verification: "needs_confirmation",
        }
      : {
          role: "state_nfip_coordinator",
          official_name: "State NFIP Floodplain Management Coordinator",
          responsibility:
            "State NFIP coordinating office for this state — identify the office through FEMA's published state-coordinator directory, then confirm floodplain requirements directly.",
          website: STATE_COORDINATOR_DIRECTORY.url,
          phone: null,
          verification: "needs_confirmation",
        },
  );

  // 3. Federal map help line.
  contacts.push(FEMA_FMIX);

  const maps = femaMaps(input.address, input.lat, input.lng);
  if (st?.mapViewer) {
    maps.push({ title: st.mapViewer.title, url: st.mapViewer.url, publisher: st.agency, kind: "state_flood_map" });
  }
  if (jurisdictionName && state) {
    maps.push({
      title: `${jurisdictionName}, ${state} — local floodplain / GIS flood map lookup`,
      url: govSearchUrl(`${jurisdictionName} ${state} flood map GIS floodplain`),
      publisher: `${jurisdictionName} government`,
      kind: "local_flood_map",
    });
  }

  const zone = input.zone ?? null;
  const lookup_status: FloodProfile["lookup_status"] =
    zone ? "retrieved" : input.lat === null || input.lng === null ? "no_coordinates" : input.serviceError ? "service_unavailable" : "no_mapped_zone_returned";

  const lookup_note =
    lookup_status === "retrieved"
      ? `FEMA National Flood Hazard Layer returned flood zone ${zone!.zone}${zone!.subtype ? ` (${zone!.subtype})` : ""} at the site coordinates${zone!.firmPanel ? `, FIRM panel ${zone!.firmPanel}` : ""}. The floodplain administrator's determination of record governs permitting.`
      : lookup_status === "no_coordinates"
        ? "The site could not be geocoded, so no flood map query was possible. Obtain the flood zone from the floodplain administrator or the FEMA Map Service Center panel for the parcel."
        : lookup_status === "service_unavailable"
          ? "The FEMA flood map service could not be reached for this site, so no flood zone is reported here. Use the official map portals and the floodplain administrator below to obtain the effective zone — Permivio does not estimate flood zones."
          : "No mapped FEMA flood hazard area was returned at the site coordinates. That is not a determination that the site is outside the floodplain: unmapped, revised and locally regulated areas exist. Confirm with the floodplain administrator and the effective FIRM panel.";

  const implications = [
    "If any part of the site lies in a Special Flood Hazard Area, a floodplain development permit is typically required in addition to the building permit, and grading, fill, utilities and mechanical equipment placement are regulated.",
    "Local floodplain ordinances frequently add freeboard above the base flood elevation and require an Elevation Certificate prepared by a licensed surveyor or engineer before a Certificate of Occupancy.",
    "Substantial improvement / substantial damage rules can force a full flood-resistant retrofit of an existing building — confirm the threshold with the floodplain administrator early.",
    "Map revisions (LOMA / LOMR / LOMR-F) take their own review time and must be scheduled ahead of permit submission when the mapped zone is disputed.",
  ];

  return { zone, lookup_status, lookup_note, contacts, maps, implications };
}
