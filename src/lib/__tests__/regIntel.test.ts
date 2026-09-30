import { describe, it, expect } from "vitest";
import { decideVerification, resolveGoverningAuthority, isStale, recheckAfter } from "@/lib/regIntel/types";
import { normalizeScope, effectiveScope } from "@/lib/regIntel/scope";
import { evaluatePermitCandidates, findDuplicate, type RuleContext } from "@/lib/regIntel/rules";
import { COUNTY_CONFIGS, STATE_CONFIGS, coverageFor, countyConfigFor } from "@/lib/regIntel/coverage";
import { classifyFlood, arcgisFirst } from "@/lib/regIntel/providers.shared";

const BERMUDEZ_SCOPE =
  "New construction of a one-story single-family residence, including associated architectural, structural, electrical, mechanical, plumbing, energy-code, and product-approval documentation as applicable.";

function ctx(over: Partial<RuleContext> = {}): RuleContext {
  const s = normalizeScope({ scopeText: BERMUDEZ_SCOPE, workType: "new_construction", projectType: "Residential — New single-family residence" });
  return {
    state: "FL", county: COUNTY_CONFIGS["FL:12101"]!, stateCfg: STATE_CONFIGS["FL"]!, incorporation: "unincorporated",
    scope: effectiveScope(s.attributes, {}), flood: { sfha: true, zone: "A", verification: "needs_verification" },
    zoning: { code: "R1MH" }, historic: false, waterProvider: "Pasco County Utilities", wastewaterProvider: "Pasco County Utilities",
    hasSepticDocument: true, confirmedSources: new Set(), ...over,
  };
}

describe("jurisdiction", () => {
  it("mailing city does not become the AHJ", () => {
    const r = resolveGoverningAuthority({ postalCity: "Spring Hill", incorporatedPlace: null, county: "Pasco County", boundaryDataAvailable: true });
    expect(r.authority).toBe("Pasco County (Unincorporated)");
    expect(r.postalCityControls).toBe(false);
  });
  it("incorporated vs unincorporated distinction", () => {
    expect(resolveGoverningAuthority({ postalCity: "Dade City", incorporatedPlace: "Dade City city", county: "Pasco County", boundaryDataAvailable: true }).status).toBe("incorporated");
    expect(resolveGoverningAuthority({ postalCity: "X", incorporatedPlace: null, county: "Y", boundaryDataAvailable: false }).status).toBe("undetermined");
  });
  it("authoritative source required for Verified", () => {
    expect(decideVerification({ tier: 1, hasValue: true })).toBe("verified");
    expect(decideVerification({ tier: 6, hasValue: true })).toBe("needs_verification");
    expect(decideVerification({ tier: 7, hasValue: true })).toBe("potential");
    expect(decideVerification({ tier: 1, hasValue: false })).toBe("needs_verification");
    expect(decideVerification({ tier: 1, hasValue: true, conflicts: [{ source: "a", says: "b" }] })).toBe("needs_verification");
  });
  it("coverage is explicit per launch state", () => {
    expect(coverageFor("FL", "12101").level).toBe("partial_structured");
    expect(coverageFor("TX", "48201").level).toBe("official_source_research");
    expect(coverageFor("CA", "06037").level).toBe("human_verification");
    expect(countyConfigFor("FL", "12053")).toBeNull();
  });
});

describe("flood", () => {
  it("point lookup returns zone with source", () => {
    const r = classifyFlood({ features: [{ FLD_ZONE: "A", SFHA_TF: "T", ZONE_SUBTY: null }], nearby: [{ FLD_ZONE: "A" }], official: true });
    expect(r.zone).toBe("A"); expect(r.sfha).toBe(true); expect(r.ambiguous).toBe(false);
  });
  it("unavailable service fails safely", () => {
    const r = classifyFlood({ features: null, nearby: null, official: true });
    expect(r.zone).toBeNull(); expect(r.available).toBe(false);
  });
  it("ambiguous boundary does not produce certainty", () => {
    const r = classifyFlood({ features: [{ FLD_ZONE: "X" }], nearby: [{ FLD_ZONE: "X" }, { FLD_ZONE: "AE" }], official: true });
    expect(r.ambiguous).toBe(true);
    expect(decideVerification({ tier: 1, hasValue: true, ambiguous: r.ambiguous })).toBe("needs_verification");
  });
  it("outside SFHA is not labelled safe", () => {
    const r = classifyFlood({ features: [{ FLD_ZONE: "X", SFHA_TF: "F" }], nearby: [{ FLD_ZONE: "X" }], official: true });
    expect(r.summary.toLowerCase()).not.toContain("safe");
  });
});

describe("zoning", () => {
  it("reads an authoritative GIS result", () => {
    expect(arcgisFirst({ features: [{ attributes: { ZN_TYPE: "R1MH" } }] })?.["ZN_TYPE"]).toBe("R1MH");
  });
  it("unavailable source → no value", () => {
    expect(arcgisFirst({ error: { message: "down" } })).toBeNull();
    expect(arcgisFirst(null)).toBeNull();
  });
  it("zoning and future land use are separate layers", () => {
    const c = COUNTY_CONFIGS["FL:12101"]!;
    expect(c.layers.zoning!.url).not.toBe(c.layers.futureLandUse!.url);
  });
});

describe("codes", () => {
  it("every code edition carries an adoption source", () => {
    for (const v of STATE_CONFIGS["FL"]!.codes) expect(v.source.url).toMatch(/^https:\/\//);
  });
  it("FBC edition has effective-date evidence pattern", () => {
    const fbc = STATE_CONFIGS["FL"]!.codes.find((v) => v.key === "fbc_residential")!;
    expect(fbc.effective).toBe("2023-12-31");
    expect(fbc.confirmPattern!.test("The Effective Date for the Florida Building Code, 8th Edition (2023), is December 31, 2023.")).toBe(true);
  });
  it("local amendment is kept distinct from base code", () => {
    const c = COUNTY_CONFIGS["FL:12101"]!;
    expect(c.localAmendments.source?.url).toBeTruthy();
    expect(STATE_CONFIGS["FL"]!.codes.some((v) => v.key.includes("amend"))).toBe(false);
  });
});

describe("scope", () => {
  it("preserves original text and derives attributes", () => {
    const s = normalizeScope({ scopeText: BERMUDEZ_SCOPE, workType: "new_construction", projectType: null });
    expect(s.original).toBe(BERMUDEZ_SCOPE);
    const keys = s.attributes.map((a) => a.key);
    for (const k of ["new_construction", "single_family", "residential", "structural", "electrical", "mechanical", "plumbing", "energy", "product_approvals"]) expect(keys).toContain(k);
  });
  it("user correction persists over derived", () => {
    const s = normalizeScope({ scopeText: BERMUDEZ_SCOPE, workType: null, projectType: null });
    const eff = effectiveScope(s.attributes, { plumbing: false, pool: true });
    expect(eff.has("plumbing")).toBe(false); expect(eff.has("pool")).toBe(true);
  });
});

describe("permit requirements", () => {
  it("jurisdiction-aware: no county config → no county agencies", () => {
    const withCfg = evaluatePermitCandidates(ctx());
    const without = evaluatePermitCandidates(ctx({ county: null, stateCfg: null }));
    expect(withCfg.find((c) => c.key === "building_permit")!.agency).toBe("Pasco County Building Construction Services");
    expect(without.find((c) => c.key === "building_permit")!.agency).toMatch(/not resolved/);
    expect(without.find((c) => c.key === "product_approvals")).toBeUndefined();
  });
  it("flood rules only fire from a mapped SFHA", () => {
    expect(evaluatePermitCandidates(ctx()).some((c) => c.key === "floodplain_review")).toBe(true);
    expect(evaluatePermitCandidates(ctx({ flood: { sfha: false, zone: "X", verification: "verified" } })).some((c) => c.key === "floodplain_review")).toBe(false);
  });
  it("source evidence retained", () => {
    for (const c of evaluatePermitCandidates(ctx())) if (c.key !== "historic_review") expect(c.source?.url).toBeTruthy();
  });
  it("Potential/Needs Verification does not become Verified without a confirmed source", () => {
    const c = evaluatePermitCandidates(ctx());
    expect(c.every((x) => x.verification !== "verified")).toBe(true);
    const confirmed = evaluatePermitCandidates(ctx({ confirmedSources: new Set(["building_permit_statute"]) }));
    expect(confirmed.find((x) => x.key === "building_permit")!.verification).toBe("verified");
    expect(confirmed.filter((x) => x.key !== "building_permit").every((x) => x.verification !== "verified")).toBe(true);
  });
  it("duplicates do not flood the roadmap", () => {
    const items = [{ id: "1", name: "Building Permit", category: "building" }, { id: "2", name: "Electrical permit", category: "electrical" }];
    expect(findDuplicate({ key: "building_permit", name: "Residential building permit", category: "building" }, items)).toBe("1");
    expect(findDuplicate({ key: "electrical_trade", name: "Electrical trade permit / approval", category: "electrical" }, items)).toBe("2");
    expect(findDuplicate({ key: "onsite_sewage", name: "Onsite sewage permit", category: "health" }, items)).toBeNull();
    expect(findDuplicate({ key: "x", name: "Anything", category: "c" }, [{ id: "9", name: "zzz", category: "c", regulatory_fact_key: "x" }])).toBe("9");
  });
});

describe("freshness", () => {
  it("flags stale facts", () => {
    expect(isStale({ recheck_after: "2020-01-01T00:00:00Z" })).toBe(true);
    expect(isStale({ recheck_after: recheckAfter("flood") })).toBe(false);
  });
});
