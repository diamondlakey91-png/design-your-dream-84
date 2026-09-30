import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EMPTY_FILTERS, filterFindings, findingLanguage, markersForPage, reviewSummary, validBbox, type WorkspaceFinding,
} from "@/lib/planReviewUx";
import { nextActions, planReviewSignals, type FoundationState } from "@/lib/projectFoundation";

const f = (o: Partial<WorkspaceFinding>): WorkspaceFinding => ({
  id: "f1", finding_no: 1, severity: "medium", category: "architectural", discipline: "architectural",
  sheet_number: "A2.1", sheet_title: null, location: null, summary: "Door clearance", plain_language: null,
  why_it_matters: null, code_basis: null, jurisdiction_source_url: null, recommended_action: null,
  responsible_discipline: null, verification: "ai_suggested", status: "open", confidence: "medium",
  page: null, bbox: null, document_id: null, related_sheets: [], ...o,
});

describe("findings: filters, summary, language", () => {
  const list = [
    f({ id: "a", severity: "critical", discipline: "life_safety", status: "open", confidence: "high" }),
    f({ id: "b", severity: "low", discipline: "mechanical", sheet_number: "M1.2", status: "resolved", confidence: "low" }),
    f({ id: "c", severity: "high", status: "needs_review", related_sheets: ["M1.2"], confidence: null }),
  ];
  it("filters by discipline / severity / confidence / status / sheet and resets", () => {
    expect(filterFindings(list, { ...EMPTY_FILTERS, discipline: "mechanical" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterFindings(list, { ...EMPTY_FILTERS, severity: "high_priority" }).map((x) => x.id)).toEqual(["a", "c"]);
    expect(filterFindings(list, { ...EMPTY_FILTERS, confidence: "unrated" }).map((x) => x.id)).toEqual(["c"]);
    expect(filterFindings(list, { ...EMPTY_FILTERS, status: "active" }).map((x) => x.id)).toEqual(["a", "c"]);
    // cross-sheet finding appears under both sheets
    expect(filterFindings(list, { ...EMPTY_FILTERS, sheet: "M1.2" }).map((x) => x.id)).toEqual(["b", "c"]);
    expect(filterFindings(list, EMPTY_FILTERS)).toHaveLength(3);
  });
  it("summary has no score and counts resolved / verification", () => {
    const s = reviewSummary(list);
    expect(s).toMatchObject({ total: 3, highPriority: 2, open: 2, resolved: 1, needsVerification: 1 });
    expect(Object.keys(s)).not.toContain("score");
  });
  it("never states a confirmed violation; low confidence → verification required", () => {
    expect(findingLanguage(f({ confidence: "low", verification: "verified_requirement", jurisdiction_source_url: "https://x.gov" }))).toBe("Verification required");
    expect(findingLanguage(f({}))).toBe("Potential issue");
    expect(findingLanguage(f({ verification: "verified_requirement", jurisdiction_source_url: "https://x.gov", confidence: "high" }))).toMatch(/confirm with AHJ/);
  });
});

describe("visual locations", () => {
  it("rejects invalid boxes and never makes a fake marker", () => {
    expect(validBbox(null)).toBeNull();
    expect(validBbox({ x: 0.9, y: 0.1, w: 0.3, h: 0.1 })).toBeNull();
    expect(validBbox({ x: "1" })).toBeNull();
    expect(validBbox({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 })).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
  });
  it("markers map to the right finding on the right document + page", () => {
    const list = [
      f({ id: "m1", finding_no: 4, document_id: "d1", page: 2, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }),
      f({ id: "m2", document_id: "d1", page: 2, bbox: null }),
      f({ id: "m3", document_id: "d2", page: 2, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }),
    ];
    expect(markersForPage(list, "d1", 2)).toEqual([{ id: "m1", no: 4, severity: "medium", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }]);
    expect(markersForPage(list, "d1", 1)).toEqual([]);
  });
});

describe("plan set association + Next Actions", () => {
  const sets = [
    { id: "v1", title: "Plan Set V1", version_number: 1, is_current: false },
    { id: "v2", title: "Plan Set V2", version_number: 2, is_current: true },
  ];
  const reviews = [{ id: "r1", plan_set_id: "v1", created_at: "2026-09-10" }];
  const openF = [{ review_id: "r1", status: "open", severity: "critical" }];
  const base: FoundationState = {
    hasAddress: true, hasJurisdiction: true, jurisdictionStatus: "user_confirmed", hasScope: true, hasRoadmap: true,
    permitsRequired: 0, permitsSubmitted: 0, permitsApproved: 0, planDocs: 2, planDocsReviewed: 0, openPlanFindings: 0,
    openCorrections: 0, inspectionsTotal: 0, inspectionsPassed: 0, inspectionsFailed: 0, inspectionsUpcoming: 0,
  };
  it("new current set does not inherit V1 findings and prompts Plan Review", () => {
    const s = planReviewSignals(sets, reviews, openF);
    expect(s.open).toBe(0);
    expect(s.current).toEqual({ label: "Plan Set V2", reviewed: false, previousReviewedLabel: "Plan Set V1" });
    const acts = nextActions({ ...base, openPlanFindings: s.open, currentPlanSet: s.current });
    expect(acts.find((a) => a.key === "run_plan_review")?.why).toMatch(/Previous findings belong to Plan Set V1/);
    expect(acts.find((a) => a.key === "review_findings")).toBeUndefined();
  });
  it("historical review stays with V1", () => {
    const s = planReviewSignals([{ ...sets[0], is_current: true }, { ...sets[1], is_current: false }], reviews, openF);
    expect(s).toMatchObject({ open: 1, high: 1, current: { reviewed: true } });
  });
  it("open findings prompt review; resolved ones do not; needs review prompts flagged", () => {
    const rv = [{ id: "r2", plan_set_id: "v2", created_at: "2026-09-20" }];
    const s = planReviewSignals(sets, rv, [{ review_id: "r2", status: "needs_review", severity: "low" }]);
    const acts = nextActions({ ...base, openPlanFindings: s.open, planFindingsNeedsReview: s.needsReview, currentPlanSet: s.current });
    expect(acts.map((a) => a.key)).toEqual(expect.arrayContaining(["review_findings", "review_flagged_findings"]));
    expect(acts.find((a) => a.key === "run_plan_review")).toBeUndefined();
    const done = planReviewSignals(sets, rv, [{ review_id: "r2", status: "resolved", severity: "high" }]);
    expect(nextActions({ ...base, openPlanFindings: done.open, currentPlanSet: done.current }).find((a) => a.key.startsWith("review_"))).toBeUndefined();
  });
});

// ---- Entitlement regression for the Plan Review meter (no real AI) ----
const logRows: Array<{ id: string; request_key: string; [k: string]: unknown }> = [];
const charges: string[] = [];
const refunds: string[] = [];
let credits = 0;
let internal = false;
vi.mock("@/integrations/supabase/client.server", () => {
  const tbl = {
    insert: (row: { request_key: string }) => ({
      select: () => ({
        single: async () => {
          if (logRows.some((r) => r.request_key === row.request_key)) return { data: null, error: { code: "23505" } };
          const r = { ...row, id: `l${logRows.length}` };
          logRows.push(r);
          return { data: { id: r.id }, error: null };
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => ({ eq: async (_k: string, id: string) => { Object.assign(logRows.find((r) => r.id === id)!, patch); return {}; } }),
    delete: () => ({ eq: async (_k: string, id: string) => { logRows.splice(logRows.findIndex((r) => r.id === id), 1); return {}; } }),
  };
  return { supabaseAdmin: { from: () => tbl } };
});
vi.mock("@/lib/commerce.server", () => ({
  chargeIncludedUsage: async (_db: unknown, _u: string, _t: string, key: string) => {
    if (internal) return { usageId: null, internal: true };
    if (credits <= 0) throw new Error("No Plan Review credit");
    credits--; charges.push(key);
    return { usageId: `c-${key}`, internal: false };
  },
  refundCredit: async (id: string) => { refunds.push(id); credits++; },
}));

describe("Plan Review entitlements (runMeteredAi, plan_review_credits)", () => {
  beforeEach(() => { logRows.length = 0; charges.length = 0; refunds.length = 0; credits = 0; internal = false; });
  const args = (key: string) => ({ db: {}, userId: "u1", operation: "plan_qaqc", creditType: "plan_review_credits" as const, key, projectId: "p1" });

  it("no credit → blocked BEFORE AI execution, nothing logged", async () => {
    const { runMeteredAi } = await import("@/lib/aiMeter.server");
    const ai = vi.fn(async () => "ran");
    await expect(runMeteredAi(args("k0"), ai)).rejects.toThrow(/credit/);
    expect(ai).not.toHaveBeenCalled();
    expect(logRows).toHaveLength(0);
  });
  it("valid credit → exactly one charge; double-click → one execution / charge / usage row", async () => {
    credits = 3;
    const { runMeteredAi } = await import("@/lib/aiMeter.server");
    const ai = vi.fn(async () => { await new Promise((r) => setTimeout(r, 10)); return "ok"; });
    const [a, b] = await Promise.allSettled([runMeteredAi(args("k1"), ai), runMeteredAi(args("k1"), ai)]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(ai).toHaveBeenCalledTimes(1);
    expect(charges).toEqual(["k1"]);
    expect(logRows).toHaveLength(1);
    expect(logRows[0]).toMatchObject({ success: true, credits_charged: 1 });
  });
  it("failure → credit restored and key freed for retry", async () => {
    credits = 1;
    const { runMeteredAi } = await import("@/lib/aiMeter.server");
    await expect(runMeteredAi(args("k2"), async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(refunds).toEqual(["c-k2"]);
    expect(credits).toBe(1);
    expect(logRows[0]).toMatchObject({ success: false, refunded: true });
    await expect(runMeteredAi(args("k2"), async () => "retry")).resolves.toBe("retry");
  });
  it("INTERNAL_ACCESS → no customer credit, logged as internal use", async () => {
    internal = true;
    const { runMeteredAi } = await import("@/lib/aiMeter.server");
    await runMeteredAi(args("k3"), async () => "ok");
    expect(charges).toHaveLength(0);
    expect(logRows[0]).toMatchObject({ internal_use: true, credits_charged: 0 });
  });
});
