import { describe, it, expect } from "vitest";
import {
  REGULATORY_GROUNDING_BLOCK,
  RESEARCH_GROUNDING_BLOCK,
  GROUNDING_MISSING_DATA_LABELS,
  withRegulatoryGrounding,
} from "@/lib/regulatoryGrounding";
import { assertNoLicensureClaim } from "@/features/agents/prompts/system";

describe("regulatory grounding rules", () => {
  it("never claims professional licensure", () => {
    expect(assertNoLicensureClaim(REGULATORY_GROUNDING_BLOCK)).toBe(true);
    expect(assertNoLicensureClaim(RESEARCH_GROUNDING_BLOCK)).toBe(true);
  });

  it("carries no Lakey Permit Group branding", () => {
    expect(REGULATORY_GROUNDING_BLOCK.toLowerCase()).not.toContain("lakey");
    expect(REGULATORY_GROUNDING_BLOCK).toContain("Permivio");
  });

  it("states the evidence chain and missing-data labels", () => {
    expect(REGULATORY_GROUNDING_BLOCK).toContain("VERIFIED CITATION");
    expect(REGULATORY_GROUNDING_BLOCK).toContain(GROUNDING_MISSING_DATA_LABELS.code);
    expect(REGULATORY_GROUNDING_BLOCK).toContain(GROUNDING_MISSING_DATA_LABELS.project);
  });

  it("keeps the review block richer than the research block", () => {
    expect(REGULATORY_GROUNDING_BLOCK).toContain("COMPLIANCE STATUS VOCABULARY");
    expect(RESEARCH_GROUNDING_BLOCK).not.toContain("COMPLIANCE STATUS VOCABULARY");
  });

  it("prefixes agent-specific instructions", () => {
    const p = withRegulatoryGrounding("Do the thing.");
    expect(p.indexOf("ZERO HALLUCINATION")).toBeLessThan(p.indexOf("Do the thing."));
    expect(p).toContain("AGENT-SPECIFIC INSTRUCTIONS");
  });
});
