import { describe, it, expect } from "vitest";
import { derivePhase, nextActions, permitProgress, type FoundationState } from "../projectFoundation";

const empty: FoundationState = {
  hasAddress: false, hasJurisdiction: false, jurisdictionStatus: "none", hasScope: false, hasRoadmap: false,
  permitsRequired: 0, permitsSubmitted: 0, permitsApproved: 0, planDocs: 0, planDocsReviewed: 0,
  openPlanFindings: 0, openCorrections: 0, inspectionsTotal: 0, inspectionsPassed: 0, inspectionsFailed: 0, inspectionsUpcoming: 0,
};
const keys = (s: FoundationState) => nextActions(s).map((a) => a.key);

describe("deterministic next actions", () => {
  it("new project asks for address and scope", () => {
    expect(derivePhase(empty)).toBe("intake");
    expect(keys(empty)).toEqual(["add_address", "describe_scope"]);
  });
  it("unconfirmed jurisdiction → verify, then roadmap", () => {
    const s = { ...empty, hasAddress: true, hasJurisdiction: true, jurisdictionStatus: "unconfirmed" as const, hasScope: true };
    expect(derivePhase(s)).toBe("jurisdiction");
    expect(keys(s)).toEqual(["verify_jurisdiction", "build_roadmap"]);
  });
  it("roadmap without drawings → upload plans; unreviewed plans → run review", () => {
    const base = { ...empty, hasAddress: true, hasJurisdiction: true, jurisdictionStatus: "user_confirmed" as const, hasScope: true, hasRoadmap: true, permitsRequired: 3 };
    expect(keys(base)).toEqual(["upload_plans"]);
    expect(keys({ ...base, planDocs: 2, planDocsReviewed: 1 })).toEqual(["run_plan_review"]);
    expect(derivePhase({ ...base, planDocs: 2, planDocsReviewed: 1 })).toBe("plan_review");
  });
  it("open corrections are urgent; approved permits → final inspections", () => {
    const s = { ...empty, hasAddress: true, hasJurisdiction: true, jurisdictionStatus: "human_verified" as const, hasScope: true, hasRoadmap: true, planDocs: 1, planDocsReviewed: 1, openCorrections: 2, permitsRequired: 2 };
    expect(nextActions(s).find((a) => a.key === "review_corrections")?.tone).toBe("urgent");
    const done = { ...s, openCorrections: 0, permitsApproved: 2 };
    expect(keys(done)).toContain("track_final_inspections");
    expect(derivePhase(done)).toBe("inspections");
    expect(derivePhase({ ...done, inspectionsTotal: 3, inspectionsPassed: 3 })).toBe("closeout");
  });
  it("permit progress", () => {
    expect(permitProgress({ ...empty, permitsRequired: 4, permitsApproved: 1 })).toEqual({ done: 1, total: 4, pct: 25 });
    expect(permitProgress(empty).pct).toBe(0);
  });
});
