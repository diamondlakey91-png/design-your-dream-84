import { describe, expect, it } from "vitest";
import {
  MATRIX_FUNCTIONS,
  gatherParcelJurisdictionEvidence,
} from "../agents/parcelJurisdiction.server";
import {
  buildParcelJurisdictionPrompt,
  parcelJurisdictionSystemPrompt,
} from "../prompts/agents/parcelJurisdiction";
import { assertNoLicensureClaim } from "../prompts/system";

const geo = {
  formattedAddress: "100 Main St, Springfield, VA 22150, USA",
  lat: 38.77,
  lng: -77.18,
  postalCity: "Springfield",
  sublocality: null,
  county: "Fairfax County",
  state: "Virginia",
  postalCode: "22150",
  locationType: "ROOFTOP",
};

describe("parcel & jurisdiction agent prompt", () => {
  it("never claims licensure", () => {
    expect(assertNoLicensureClaim(parcelJurisdictionSystemPrompt)).toBe(true);
  });

  it("forbids treating the postal city as the jurisdiction", () => {
    expect(parcelJurisdictionSystemPrompt).toMatch(/POSTAL CITY IS NOT A JURISDICTION/);
    expect(parcelJurisdictionSystemPrompt).toMatch(/unincorporated county territory/);
  });

  it("labels geocoder address elements as postal only and marks leads as non-evidence", () => {
    const prompt = buildParcelJurisdictionPrompt({
      rawAddress: "100 Main St, Springfield VA",
      geocode: geo,
      projectType: "restaurant fit-out",
      scope: "New 2,400 sf restaurant in an existing shell.",
      clientObjective: "Confirm who controls permitting.",
      knownParcelId: null,
      evidence: [],
      searchLeads: [{ url: "https://example.com/blog", title: "Permit tips" }],
    });
    expect(prompt).toMatch(/POSTAL\/MAILING ONLY, not a jurisdiction determination/);
    expect(prompt).toMatch(/NOT retrieved, NOT evidence/);
    expect(prompt).toMatch(/jurisdiction_matrix/);
  });

  it("covers every permitting function in the responsibility matrix", () => {
    expect(MATRIX_FUNCTIONS).toContain("building_permit");
    expect(MATRIX_FUNCTIONS).toContain("certificate_of_occupancy");
    expect(new Set(MATRIX_FUNCTIONS).size).toBe(MATRIX_FUNCTIONS.length);
  });

  it("returns no evidence rather than fabricating it when research is unavailable", async () => {
    const prev = process.env['FIRECRAWL_API_KEY'];
    delete process.env['FIRECRAWL_API_KEY'];
    const res = await gatherParcelJurisdictionEvidence({
      address: geo.formattedAddress,
      postalCity: geo.postalCity,
      county: geo.county,
      state: geo.state,
      parcelId: null,
    });
    expect(res.evidence).toEqual([]);
    expect(res.leads).toEqual([]);
    if (prev) process.env['FIRECRAWL_API_KEY'] = prev;
  });
});
