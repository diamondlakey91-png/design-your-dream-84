import { describe, it, expect } from "vitest";
import { buildFloodProfile } from "../floodAuthorities";
import { buildSirReport } from "../sirReport";

describe("flood authority package", () => {
  it("always supplies a local administrator, state coordinator and FEMA map portals", () => {
    const flood = buildFloodProfile({
      address: "8025 Georgia Ave, Silver Spring, MD",
      lat: 38.9958,
      lng: -77.0261,
      locality: "Montgomery County",
      county: "Montgomery",
      state: "MD",
      authorities: [{ role: "floodplain", official_name: "Montgomery County Department of Permitting Services", website: "https://www.montgomerycountymd.gov/DPS/" }],
      serviceError: "timeout",
    });
    expect(flood.contacts.map((c) => c.role)).toEqual([
      "local_floodplain_administrator",
      "state_nfip_coordinator",
      "federal_map_service",
    ]);
    expect(flood.contacts[1]!.official_name).toContain("Maryland Department of the Environment");
    expect(flood.maps.some((m) => m.url.startsWith("https://msc.fema.gov/portal/search"))).toBe(true);
  });

  it("never states a flood zone when the map service did not answer", () => {
    const flood = buildFloodProfile({ address: null, lat: null, lng: null, locality: null, county: null, state: "VA" });
    expect(flood.zone).toBeNull();
    expect(flood.lookup_status).toBe("no_coordinates");
    const mod = buildSirReport({ jurisdiction: { authorities: [] }, flood })
      .flatMap((s) => s.modules)
      .find((m) => m.key === "flood");
    expect(mod?.findings[0]!.verification).toBe("needs_confirmation");
    expect(mod?.findings[0]!.title).toContain("not established");
  });

  it("reports a retrieved zone as verified with its source", () => {
    const flood = buildFloodProfile({
      address: "1 Main St",
      lat: 38.9,
      lng: -77.1,
      locality: "Arlington County",
      county: "Arlington",
      state: "VA",
      zone: { zone: "AE", subtype: null, sfha: true, firmPanel: "51013C0021E", sourceUrl: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?x=1" },
    });
    expect(flood.lookup_status).toBe("retrieved");
    const mod = buildSirReport({ jurisdiction: { authorities: [] }, flood })
      .flatMap((s) => s.modules)
      .find((m) => m.key === "flood");
    expect(mod?.findings[0]!.verification).toBe("verified");
    expect(mod?.findings[0]!.title).toContain("Special Flood Hazard Area");
  });
});
