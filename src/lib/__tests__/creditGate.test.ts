import { describe, it, expect, vi, beforeEach } from "vitest";

let ledger: Array<{ id: string; quantity: number; idempotency_key: string; credit_type: string }> = [];
const q = (rows: () => typeof ledger) => {
  const f: Record<string, unknown> = {};
  const filters: Array<[string, unknown]> = [];
  const res = () => rows().filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
  Object.assign(f, {
    select: () => f,
    eq: (k: string, v: unknown) => { if (k !== "user_id") filters.push([k, v]); return f; },
    maybeSingle: async () => ({ data: res()[0] ?? null }),
    then: (ok: (v: unknown) => void) => ok({ data: res() }),
  });
  return f;
};
const admin = {
  from: () => q(() => ledger),
  rpc: async (_fn: string, a: { _idempotency_key: string; _quantity: number; _credit_type: string }) => {
    const id = `u${ledger.length}`;
    ledger.push({ id, quantity: -a._quantity, idempotency_key: a._idempotency_key, credit_type: a._credit_type });
    return { data: id, error: null };
  },
};
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));

const userDb = (internal: boolean) => ({ rpc: async (_f: string, a: { _role: string }) => ({ data: internal && a._role === "internal_ai" }) });
// admin-only user (no internal_ai): must still be blocked
const adminOnlyDb = { rpc: async (_f: string, a: { _role: string }) => ({ data: a._role === "admin" }) };

describe("chargeIncludedUsage (fail-closed)", () => {
  beforeEach(() => { ledger = []; });

  it("blocks a user with no credits (no subscription / no plan limit)", async () => {
    const { chargeIncludedUsage, CreditRequiredError } = await import("@/lib/commerce.server");
    await expect(chargeIncludedUsage(userDb(false), "u1", "ai_queries", "k1", { reason: "t" })).rejects.toBeInstanceOf(CreditRequiredError);
  });

  it("internal_ai holders run as internal use without a charge", async () => {
    const { chargeIncludedUsage } = await import("@/lib/commerce.server");
    expect(await chargeIncludedUsage(userDb(true), "a1", "ai_queries", "k2", { reason: "t" })).toEqual({ usageId: null, internal: true });
  });

  it("admin role alone does not bypass credits", async () => {
    const { chargeIncludedUsage, CreditRequiredError } = await import("@/lib/commerce.server");
    await expect(chargeIncludedUsage(adminOnlyDb, "s1", "ai_queries", "k9", { reason: "t" })).rejects.toBeInstanceOf(CreditRequiredError);
  });

  it("charges once per key when a credit exists", async () => {
    ledger.push({ id: "g", quantity: 1, idempotency_key: "grant", credit_type: "ai_queries" });
    const { chargeIncludedUsage } = await import("@/lib/commerce.server");
    const a = await chargeIncludedUsage(userDb(false), "u1", "ai_queries", "k3", { reason: "t" });
    const b = await chargeIncludedUsage(userDb(false), "u1", "ai_queries", "k3", { reason: "t" });
    expect(a.usageId).toBeTruthy();
    expect(b.usageId).toBe(a.usageId);
    expect(ledger.filter((r) => r.quantity < 0)).toHaveLength(1);
  });
});
