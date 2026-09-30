import { describe, it, expect } from "vitest";
import { blockers, isBlocked, wouldCreateCycle, orderByDependencies, roadmapSummary, guessCategory } from "../roadmapWorkflow";
import { nextActions, type FoundationState } from "../projectFoundation";

const zoning = { id: "z", name: "Zoning Approval", status: "under_review", required: true, depends_on: [], requirement_confidence: "verified" };
const bldg = { id: "b", name: "Building Permit", status: "not_started", required: true, depends_on: ["z"], requirement_confidence: "needs_verification" };
const trade = { id: "t", name: "Electrical Permit", status: "not_started", required: true, depends_on: ["b"], requirement_confidence: "potential" };
const all = [trade, bldg, zoning];

describe("roadmap dependencies", () => {
  it("blocks an item while a prerequisite is unfinished", () => {
    expect(blockers(bldg, all)).toEqual(["Zoning Approval"]);
    expect(isBlocked(bldg, all)).toBe(true);
  });
  it("unblocks once the prerequisite is approved or not required", () => {
    const done = [{ ...zoning, status: "approved" }, bldg];
    expect(isBlocked(bldg, done)).toBe(false);
    expect(isBlocked(bldg, [{ ...zoning, status: "n_a" }, bldg])).toBe(false);
  });
  it("never blocks an item already submitted (user controls real status)", () => {
    expect(isBlocked({ ...bldg, status: "submitted" }, all)).toBe(false);
  });
  it("detects dependency loops", () => {
    expect(wouldCreateCycle("z", "t", all)).toBe(true);
    expect(wouldCreateCycle("t", "z", all)).toBe(false);
    expect(wouldCreateCycle("b", "b", all)).toBe(true);
  });
  it("orders prerequisites first", () => {
    expect(orderByDependencies(all).map((i) => i.id)).toEqual(["z", "b", "t"]);
  });
  it("summarises blocked / verification / ready", () => {
    const s = roadmapSummary([...all, { id: "r", name: "Sign", status: "ready_to_submit", required: true, depends_on: [], requirement_confidence: "verified" }]);
    expect(s.blocked.map((i) => i.id).sort()).toEqual(["b", "t"]);
    expect(s.needsVerification.length).toBe(2);
    expect(s.readyToSubmit.map((i) => i.name)).toEqual(["Sign"]);
  });
  it("suggests a document category from the filename", () => {
    expect(guessCategory("Correction Letter #2.pdf")).toBe("correction");
    expect(guessCategory("Certificate of Occupancy.pdf")).toBe("certificate");
    expect(guessCategory("A-101 floor plan.pdf")).toBe("drawings");
  });
});

describe("Next Actions with roadmap signals", () => {
  const base: FoundationState = {
    hasAddress: true, hasJurisdiction: true, jurisdictionStatus: "user_confirmed", hasScope: true, hasRoadmap: true,
    permitsRequired: 2, permitsSubmitted: 0, permitsApproved: 0, planDocs: 1, planDocsReviewed: 1, openPlanFindings: 0,
    openCorrections: 0, inspectionsTotal: 0, inspectionsPassed: 0, inspectionsFailed: 0, inspectionsUpcoming: 0,
  };
  it("asks to verify, resolve prerequisite, submit and review corrections", () => {
    const keys = nextActions({ ...base, roadmapNeedsVerification: 1, roadmapBlocked: [{ name: "Building Permit", waitingOn: ["Zoning Approval"] }], roadmapReadyToSubmit: ["Sign"], roadmapCorrectionsRequired: ["Fire"] }).map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(["verify_requirements", "blocked_Building Permit", "prepare_submit", "roadmap_corrections"]));
    const blocked = nextActions({ ...base, roadmapBlocked: [{ name: "Building Permit", waitingOn: ["Zoning Approval"] }] }).find((a) => a.key.startsWith("blocked"));
    expect(blocked?.why).toBe("Blocked by: Zoning Approval");
  });
});
