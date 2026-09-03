import { describe, expect, it } from "vitest";

import { AGENT_KEYS, WORKFLOW_KEYS, type RunStatus } from "../types";
import { AGENT_REGISTRY, getAgent, listAgents } from "../registry";
import { WORKFLOW_REGISTRY, listWorkflows, planWorkflow } from "../workflows/registry";
import { assertRunTransition, assertTaskTransition, canRetryTask, canTransitionRun, runProgress, usableInFinalReport } from "../state-machine";
import { parseAgentOutput } from "../schemas";
import { assertNoLicensureClaim, buildSystemPrompt } from "../prompts/system";
import { toClientFindings, toClientProgress, stripInternal } from "../client-view";
import { buildLedgerEntry, chargeKey, reconcileUsage, reserveCredits } from "../usage.server";
import { AgentError } from "../errors";

describe("agent registry", () => {
  it("registers every declared agent independently", () => {
    expect(listAgents().length).toBe(AGENT_KEYS.length);
    for (const key of AGENT_KEYS) expect(getAgent(key).key).toBe(key);
  });

  it("declares only known dependencies and no self dependency", () => {
    for (const a of listAgents()) {
      expect(a.dependencies).not.toContain(a.key);
      for (const d of a.dependencies) expect(AGENT_REGISTRY[d]).toBeTruthy();
    }
  });

  it("versions prompts so historical output stays reproducible", () => {
    for (const a of listAgents()) {
      expect(a.promptVersion).toMatch(/@\d+$/);
      expect(a.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

describe("workflow registry", () => {
  it("defines every declared workflow", () => {
    expect(listWorkflows().length).toBe(WORKFLOW_KEYS.length);
    for (const key of WORKFLOW_KEYS) expect(WORKFLOW_REGISTRY[key].key).toBe(key);
  });

  it("plans tasks with dependencies satisfied before use", () => {
    for (const key of WORKFLOW_KEYS) {
      const tasks = planWorkflow(key);
      expect(tasks.length).toBeGreaterThan(0);
      const groupByAgent = new Map(tasks.map((t) => [t.agentKey, t.parallelGroup]));
      for (const t of tasks) {
        for (const dep of t.dependencies) {
          expect(groupByAgent.get(dep)!).toBeLessThan(t.parallelGroup);
        }
      }
    }
  });

  it("keeps parallel groups concurrency-safe", () => {
    for (const key of WORKFLOW_KEYS) {
      const tasks = planWorkflow(key);
      const byGroup = new Map<number, string[]>();
      for (const t of tasks) byGroup.set(t.parallelGroup, [...(byGroup.get(t.parallelGroup) ?? []), t.agentKey]);
      for (const members of byGroup.values()) {
        if (members.length > 1) for (const m of members) expect(getAgent(m as never).concurrencySafe).toBe(true);
      }
    }
  });

  it("ends every workflow with QA/QC validation", () => {
    for (const key of WORKFLOW_KEYS) {
      const tasks = planWorkflow(key);
      expect(tasks[tasks.length - 1]!.agentKey).toBe("qaqc_validation");
    }
  });
});

describe("state machine", () => {
  it("rejects invalid transitions", () => {
    expect(canTransitionRun("failed", "delivered")).toBe(false);
    expect(canTransitionRun("cancelled", "researching")).toBe(false);
    expect(() => assertRunTransition("qaqc_pending", "delivered")).toThrow(AgentError);
    expect(() => assertTaskTransition("succeeded", "running")).toThrow(AgentError);
  });

  it("blocks approval while critical quality checks fail", () => {
    expect(() =>
      assertRunTransition("qaqc_in_progress", "approved", {
        criticalQaFailures: 2,
        humanReviewRecorded: true,
        professionalReviewRequired: true,
      }),
    ).toThrow(/quality check/i);
  });

  it("requires a recorded human review when the workflow demands it", () => {
    expect(() =>
      assertRunTransition("professional_review_in_progress", "approved", {
        criticalQaFailures: 0,
        humanReviewRecorded: false,
        professionalReviewRequired: true,
      }),
    ).toThrow(/professional review/i);
    expect(() =>
      assertRunTransition("professional_review_in_progress", "approved", {
        criticalQaFailures: 0,
        humanReviewRecorded: true,
        professionalReviewRequired: true,
      }),
    ).not.toThrow();
  });

  it("stops retries once a run is cancelled and honours attempt limits", () => {
    expect(canRetryTask({ attempt: 1, maxAttempts: 3, runStatus: "cancelled" as RunStatus, retryable: true })).toBe(false);
    expect(canRetryTask({ attempt: 3, maxAttempts: 3, runStatus: "researching", retryable: true })).toBe(false);
    expect(canRetryTask({ attempt: 1, maxAttempts: 3, runStatus: "researching", retryable: true })).toBe(true);
    expect(canRetryTask({ attempt: 1, maxAttempts: 3, runStatus: "researching", retryable: false })).toBe(false);
  });

  it("never reuses superseded findings in a final report", () => {
    expect(usableInFinalReport({ verification_status: "superseded" })).toBe(false);
    expect(usableInFinalReport({ verification_status: "verified", superseded_by: "abc" })).toBe(false);
    expect(usableInFinalReport({ verification_status: "verified", superseded_by: null })).toBe(true);
  });

  it("reports progress from task counts", () => {
    expect(runProgress([{ status: "succeeded" }, { status: "pending" }])).toBe(50);
  });
});

const validSource = {
  source_key: "s1",
  source_type: "adopted_ordinance_or_code",
  title: "Zoning Ordinance Section 12-3",
  publisher: "Example County",
  url: "https://county.gov/code/12-3",
  authority_level: "county",
  retrieved: true,
};

function baseFinding() {
  return {
    finding_key: "zoning.use_permitted",
    module: "zoning_entitlement",
    category: "permitted_use",
    title: "Proposed use permitted by right",
    finding: "Restaurants are permitted by right in the C-2 district.",
    analysis: "The adopted ordinance lists restaurants as a permitted use in this district.",
    applicability: "Applies to the subject parcel as currently zoned.",
    verification_status: "verified",
    confidence: "high",
    source_refs: [{ source_key: "s1", primary_source: true }],
    risk_level: "none",
    confirmation_required: true,
    client_visible: true,
  };
}

function output(overrides: Record<string, unknown> = {}) {
  return {
    agent_key: "zoning_entitlement",
    agent_version: "1.0.0",
    task_summary: "Reviewed zoning for the proposed restaurant use.",
    status: "complete",
    findings: [baseFinding()],
    sources: [validSource],
    professional_confirmation_required: true,
    completion_summary: "Zoning review complete; confirmation with the county recommended.",
    ...overrides,
  };
}

describe("output contract", () => {
  it("accepts a well-formed agent output", () => {
    expect(parseAgentOutput(output()).ok).toBe(true);
  });

  it("rejects malformed output", () => {
    const res = parseAgentOutput({ agent_key: "zoning_entitlement" });
    expect(res.ok).toBe(false);
  });

  it("rejects findings that reference an unknown source", () => {
    const res = parseAgentOutput(output({ findings: [{ ...baseFinding(), source_refs: [{ source_key: "missing" }] }] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.join(" ")).toMatch(/not in sources/);
  });

  it("rejects a verified finding with no supporting source", () => {
    const res = parseAgentOutput(output({ findings: [{ ...baseFinding(), source_refs: [] }] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.join(" ")).toMatch(/no source reference/);
  });

  it("rejects a verified finding supported only by a secondary source", () => {
    const res = parseAgentOutput(output({ sources: [{ ...validSource, source_type: "secondary_source" }] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.join(" ")).toMatch(/retrieved official source/);
  });

  it("rejects a verified finding whose source was never retrieved", () => {
    const res = parseAgentOutput(output({ sources: [{ ...validSource, retrieved: false }] }));
    expect(res.ok).toBe(false);
  });

  it("rejects duplicate finding keys", () => {
    const res = parseAgentOutput(output({ findings: [baseFinding(), baseFinding()] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.join(" ")).toMatch(/duplicate finding_key/);
  });
});

describe("prompt safety", () => {
  it("builds a versioned system prompt with evidence rules", () => {
    const p = buildSystemPrompt("Zoning and Entitlement Agent", "Determine the zoning district and permitted uses.");
    expect(p).toMatch(/Permivio/);
    expect(p).toMatch(/EVIDENCE RULES/);
    expect(assertNoLicensureClaim(p)).toBe(true);
  });

  it("blocks prompts that claim licensure", () => {
    expect(() => assertNoLicensureClaim("You are a licensed engineer reviewing this plan.")).toThrow(/licensure/i);
  });

  it("contains no Lakey Permit Group or LPG references", () => {
    for (const key of AGENT_KEYS) {
      const a = getAgent(key);
      const p = buildSystemPrompt(a.name, a.description);
      expect(p).not.toMatch(/\bLPG\b/);
      expect(p).not.toMatch(/Lakey/i);
    }
  });
});

describe("client-facing projection", () => {
  it("hides internal findings and internal fields", () => {
    const rows = [
      { title: "A", finding: "a", analysis: "x", verification_status: "verified", agency: null, risk_level: "low", recommendation: null, confirmation_required: false, client_visible: true },
      { title: "B", finding: "b", analysis: "y", verification_status: "verified", agency: null, risk_level: "low", recommendation: null, confirmation_required: false, client_visible: false },
      { title: "C", finding: "c", analysis: "z", verification_status: "superseded", agency: null, risk_level: "low", recommendation: null, confirmation_required: false, client_visible: true },
    ];
    const out = toClientFindings(rows);
    expect(out.map((f) => f.title)).toEqual(["A"]);
    expect(out[0]!.status_label).toBe("Verified");
  });

  it("never exposes prompts, models, tokens or cost", () => {
    const stripped = stripInternal({ id: "1", prompt: "secret", model: "google/gemini-2.5-pro", input_units: 10, estimated_cost: 1.2, credits_used: 3, title: "ok" });
    expect(Object.keys(stripped).sort()).toEqual(["id", "title"]);
  });

  it("shows plain-language progress with information needed", () => {
    const p = toClientProgress({
      status: "waiting_for_client",
      updated_at: "2026-01-05T00:00:00.000Z",
      tasks: [{ status: "succeeded" }, { status: "pending" }, { status: "pending" }, { status: "pending" }],
      open_questions: ["Confirm the tenant space square footage"],
    });
    expect(p.current_stage).toBe("Information needed from you");
    expect(p.information_needed).toHaveLength(1);
    expect(p.percent_complete).toBe(25);
    expect(JSON.stringify(p)).not.toMatch(/gemini|token|prompt/i);
  });
});

describe("usage and credits", () => {
  const entitlement = { hasPurchasedProduct: false, availableCredits: 100 };

  it("refuses to run a paid workflow without entitlement or credits", () => {
    expect(() =>
      reserveCredits({ organizationId: "o1", agentRunId: "r1", estimatedCredits: 50, entitlement: { hasPurchasedProduct: false, availableCredits: 10 } }),
    ).toThrow(AgentError);
  });

  it("reserves then reconciles and releases the unused remainder", () => {
    const reservation = reserveCredits({ organizationId: "o1", agentRunId: "r1", estimatedCredits: 50, entitlement });
    const entry = buildLedgerEntry({
      organizationId: "o1",
      agentRunId: "r1",
      agentTaskId: "t1",
      attempt: 1,
      usage: { model: "google/gemini-2.5-flash", inputUnits: 4000, outputUnits: 2000, researchCalls: 3, documentPages: 0 },
    });
    const result = reconcileUsage(reservation, [entry]);
    expect(result.actualCredits).toBeGreaterThan(0);
    expect(result.releasedCredits).toBe(50 - result.actualCredits);
    expect(result.reservation.status).toBe("reconciled");
  });

  it("does not double-charge a retried task attempt", () => {
    const reservation = reserveCredits({ organizationId: "o1", agentRunId: "r1", estimatedCredits: 50, entitlement });
    const usage = { model: "google/gemini-2.5-pro", inputUnits: 1000, outputUnits: 500, researchCalls: 1, documentPages: 2 };
    const a = buildLedgerEntry({ organizationId: "o1", agentRunId: "r1", agentTaskId: "t1", attempt: 1, usage });
    const dup = buildLedgerEntry({ organizationId: "o1", agentRunId: "r1", agentTaskId: "t1", attempt: 1, usage });
    expect(chargeKey({ agentRunId: "r1", agentTaskId: "t1", attempt: 1 })).toBe(a.chargeKey);
    const once = reconcileUsage(reservation, [a]);
    const twice = reconcileUsage(reservation, [a, dup]);
    expect(twice.actualCredits).toBe(once.actualCredits);
    expect(twice.chargedEntries).toBe(1);
  });
});
