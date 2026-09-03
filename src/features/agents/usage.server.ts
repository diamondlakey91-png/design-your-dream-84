// PERMIVIO agent framework — usage, cost and credit control (server-only).
//
// Paid workflows reserve credits before running, reconcile actual usage after,
// release the unused reservation, and never double-charge a retry of the same
// task attempt.

import type { UsageRecord } from "./types";
import { AgentError } from "./errors";

/** Rough per-model unit prices (USD per 1K units) used for internal estimates only. */
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-pro": { input: 0.00125, output: 0.01 },
  "google/gemini-2.5-flash": { input: 0.0003, output: 0.0025 },
};

const RESEARCH_CALL_COST = 0.002;
const DOCUMENT_PAGE_COST = 0.001;

export function estimateCost(u: Omit<UsageRecord, "estimatedCost" | "creditsUsed">): number {
  const rate = MODEL_RATES[u.model] ?? { input: 0.001, output: 0.005 };
  const cost =
    (u.inputUnits / 1000) * rate.input +
    (u.outputUnits / 1000) * rate.output +
    u.researchCalls * RESEARCH_CALL_COST +
    u.documentPages * DOCUMENT_PAGE_COST;
  return Math.round(cost * 1e6) / 1e6;
}

/** Credits are whole units; a run always consumes at least one. */
export function costToCredits(cost: number): number {
  return Math.max(1, Math.ceil(cost * 100));
}

export type Reservation = {
  key: string;
  organizationId: string;
  agentRunId: string;
  credits: number;
  status: "reserved" | "reconciled" | "released";
};

/**
 * Deterministic reservation/charge key. A retry of the same task attempt maps to
 * the same key, so reconciliation is idempotent and cannot double-charge.
 */
export function chargeKey(parts: { agentRunId: string; agentTaskId?: string | null; attempt?: number | null }): string {
  return [parts.agentRunId, parts.agentTaskId ?? "run", parts.attempt ?? 0].join(":");
}

export type EntitlementCheck = {
  hasPurchasedProduct: boolean;
  availableCredits: number;
};

/** Confirm entitlement and reserve credits before a paid workflow runs. */
export function reserveCredits(args: {
  organizationId: string;
  agentRunId: string;
  estimatedCredits: number;
  entitlement: EntitlementCheck;
}): Reservation {
  const { entitlement, estimatedCredits } = args;
  if (!entitlement.hasPurchasedProduct && entitlement.availableCredits < estimatedCredits) {
    throw new AgentError("entitlement", "This report is not included in your current plan or order.");
  }
  return {
    key: chargeKey({ agentRunId: args.agentRunId }),
    organizationId: args.organizationId,
    agentRunId: args.agentRunId,
    credits: estimatedCredits,
    status: "reserved",
  };
}

export type LedgerEntry = UsageRecord & {
  chargeKey: string;
  organizationId: string;
  agentRunId: string;
  agentTaskId: string | null;
};

/** Fold ledger entries, ignoring duplicate charge keys (retry safety). */
export function reconcileUsage(reservation: Reservation, entries: LedgerEntry[]) {
  const seen = new Set<string>();
  let cost = 0;
  let credits = 0;
  for (const e of entries) {
    if (seen.has(e.chargeKey)) continue;
    seen.add(e.chargeKey);
    cost += e.estimatedCost;
    credits += e.creditsUsed;
  }
  const actualCredits = Math.max(0, credits);
  return {
    reservation: { ...reservation, status: "reconciled" as const },
    actualCost: Math.round(cost * 1e6) / 1e6,
    actualCredits,
    releasedCredits: Math.max(0, reservation.credits - actualCredits),
    chargedEntries: seen.size,
  };
}

/** Build a ledger row for one task attempt. */
export function buildLedgerEntry(args: {
  organizationId: string;
  agentRunId: string;
  agentTaskId: string | null;
  attempt: number;
  usage: Omit<UsageRecord, "estimatedCost" | "creditsUsed">;
}): LedgerEntry {
  const estimatedCost = estimateCost(args.usage);
  return {
    ...args.usage,
    estimatedCost,
    creditsUsed: costToCredits(estimatedCost),
    chargeKey: chargeKey({ agentRunId: args.agentRunId, agentTaskId: args.agentTaskId, attempt: args.attempt }),
    organizationId: args.organizationId,
    agentRunId: args.agentRunId,
    agentTaskId: args.agentTaskId,
  };
}
