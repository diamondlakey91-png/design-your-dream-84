import { describe, it, expect } from "vitest";
import { MD_COUNTIES, VA_COUNTIES, VA_INDEPENDENT_CITIES, buildMdVaAuthorities, isMdVaLocality, canonicalMdVaLocality } from "@/lib/mdVaAuthorities";

describe("MD/VA coverage", () => {
  it("every MD county resolves", () => {
    for (const c of MD_COUNTIES) {
      expect(isMdVaLocality("MD", c), c).toBe(true);
      expect(buildMdVaAuthorities("MD", c).length).toBeGreaterThanOrEqual(7);
    }
  });
  it("every VA county + city resolves", () => {
    for (const c of [...VA_COUNTIES, ...VA_INDEPENDENT_CITIES]) {
      expect(isMdVaLocality("VA", c), c).toBe(true);
      const a = buildMdVaAuthorities("VA", c);
      expect(a.length).toBeGreaterThanOrEqual(7);
      expect(a.every((x) => !!x.website)).toBe(true);
    }
  });
  it("normalizes geocoder names", () => {
    expect(canonicalMdVaLocality("VA", "Fairfax County")).toBe("Fairfax");
    expect(canonicalMdVaLocality("VA", "Alexandria City")).toBe("Alexandria");
    expect(canonicalMdVaLocality("MD", "Prince George's County")).toBe("Prince George's");
  });
});
