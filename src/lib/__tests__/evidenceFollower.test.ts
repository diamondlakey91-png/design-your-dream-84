import { describe, it, expect } from "vitest";
import { extractAdoptionStatements, adoptionLinkScore, parseDate, classifySourceType, statePreemptionCue, toEvidence } from "@/lib/regIntel/evidenceFollower";

describe("evidence follower", () => {
  it("extracts explicit adoption statements with effective dates", () => {
    const t = "The City has adopted the 2021 International Building Code and the 2020 National Electrical Code, effective July 1, 2023, with local amendments.";
    const s = extractAdoptionStatements(t);
    const b = s.find((x) => x.family === "building")!;
    expect(b.edition).toBe("2021 IBC");
    expect(s.find((x) => x.family === "electrical")?.edition).toBe("2020 NFPA 70 (NEC)");
    expect(b.effective_from).toBe("2023-07-01");
    expect(b.amended).toBe(true);
  });
  it("ignores bare mentions without an adoption cue", () => {
    expect(extractAdoptionStatements("Buy the 2024 International Fire Code book at our store.")).toHaveLength(0);
  });
  it("marks proposed editions as proposed, never current", () => {
    const s = extractAdoptionStatements("The board proposes to adopt the 2024 International Residential Code; public comment closes soon.");
    expect(s[0]!.proposed).toBe(true);
    expect(toEvidence(s[0]!, { layer: "local", state: "OH", authority: "X", url: "https://x.gov", source_type: "agency_current_code_page", primary: true }).source_type).toBe("development");
  });
  it("parses common date formats", () => {
    expect(parseDate("effective 3/15/2024")).toBe("2024-03-15");
    expect(parseDate("as of Sept. 1, 2025")).toBe("2025-09-01");
    expect(parseDate("2026-01-01")).toBe("2026-01-01");
  });
  it("scores adoption links above noise", () => {
    expect(adoptionLinkScore("Adopted Codes", "https://city.gov/building/codes")).toBeGreaterThanOrEqual(5);
    expect(adoptionLinkScore("Upcoming events", "https://city.gov/news")).toBe(0);
    expect(adoptionLinkScore("Facebook", "https://facebook.com/city")).toBe(0);
  });
  it("classifies source authority from URL and text", () => {
    expect(classifySourceType("https://library.municode.com/oh/x/codes", "")).toBe("rule");
    expect(classifySourceType("https://codes.ohio.gov/ohio-administrative-code/4101:1", "")).toBe("statute");
    expect(classifySourceType("https://city.gov/b", "Ordinance No. 2023-14 hereby adopt")).toBe("adoption_notice");
    expect(classifySourceType("https://city.gov/faq", "Frequently asked questions")).toBe("faq");
  });
  it("detects state limits on local amendments", () => {
    expect(statePreemptionCue("The code is uniform statewide. Local jurisdictions may not amend the residential code.")).toMatch(/uniform statewide|may not amend/);
  });
});
