import { describe, it, expect } from "vitest";
import { buildFloodProfile } from "../floodAuthorities";
import { buildSirReport } from "../sirReport";
describe("flood", () => {
  it("builds", () => {
    const flood = buildFloodProfile({ address: "8025 Georgia Ave, Silver Spring, MD", lat: 38.9958, lng: -77.0261, locality: "Montgomery", county: "Montgomery", state: "MD", authorities: [{ role: "floodplain", official_name: "Montgomery County DPS", website: "https://www.montgomerycountymd.gov/DPS/" }], serviceError: "timeout" });
    console.log(JSON.stringify(flood, null, 1));
    const mod = buildSirReport({ jurisdiction: { authorities: [] }, flood }).flatMap((s) => s.modules).find((m) => m.key === "flood");
    console.log(mod?.findings.map((f) => `${f.verification} :: ${f.title} :: ${f.source ?? "-"}`).join("\n"));
    expect(mod!.findings.length).toBeGreaterThan(5);
  });
});
