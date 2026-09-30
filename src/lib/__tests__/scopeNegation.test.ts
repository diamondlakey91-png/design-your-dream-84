import { describe, it, expect } from "vitest";
import { normalizeScope } from "@/lib/regIntel/scope";

const keys = (i: Parameters<typeof normalizeScope>[0]) => normalizeScope(i).attributes.map((a) => a.key);

describe("scope normalization", () => {
  it("ignores negated mentions", () => {
    expect(keys({ scopeText: "Office tenant improvement, no change of occupancy", workType: "Alteration", projectType: "Commercial" })).not.toContain("change_of_occupancy");
  });
  it("normalizes spaced work types and descriptive new-home text", () => {
    const k = keys({ scopeText: "New one-story single-family residence", workType: "New Construction", projectType: "Residential" });
    expect(k).toContain("new_construction");
    expect(k).toContain("residential");
  });
});
