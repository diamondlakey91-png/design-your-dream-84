// PERMIVIO AI metering (server-only).
// Every AI Gateway call goes through aiGatewayFetch so its token usage is
// captured; every paid "Run" goes through runMeteredAi, which charges a credit
// (fail-closed), runs, refunds on failure and writes one ai_usage_log row.
import { AsyncLocalStorage } from "node:async_hooks";
import { chargeIncludedUsage, refundCredit, type CreditType } from "@/lib/commerce.server";

type Usage = { model: string | null; input: number; output: number; calls: number };
const store = new AsyncLocalStorage<Usage>();

/** Rough USD per 1K tokens, internal estimate only. */
const RATES: Record<string, { i: number; o: number }> = {
  "google/gemini-2.5-pro": { i: 0.00125, o: 0.01 },
  "google/gemini-2.5-flash": { i: 0.0003, o: 0.0025 },
  "google/gemini-3-flash-preview": { i: 0.0005, o: 0.003 },
};
function estimate(u: Usage): number {
  const r = (u.model && RATES[u.model]) || { i: 0.001, o: 0.005 };
  return Math.round(((u.input / 1000) * r.i + (u.output / 1000) * r.o) * 1e6) / 1e6;
}

/** Drop-in replacement for fetch() to the Lovable AI Gateway that records token usage. */
export async function aiGatewayFetch(input: string, init?: RequestInit): Promise<Response> {
  const u = store.getStore();
  if (u && typeof init?.body === "string") {
    try { const m = JSON.parse(init.body)?.model; if (m) u.model = m; } catch { /* ignore */ }
  }
  const res = await fetch(input, init);
  if (!u) {
    // Call outside a metered run: still record it as internal, non-billable use.
    let model: string | null = null;
    try { model = typeof init?.body === "string" ? JSON.parse(init.body)?.model ?? null : null; } catch { /* ignore */ }
    void writeLog({ user_id: null, operation: "unmetered_ai_call", provider: "lovable_ai_gateway", model, success: res.ok, internal_use: true, error: res.ok ? null : `HTTP ${res.status}` });
  }
  if (u) {
    u.calls++;
    if ((res.headers.get("content-type") ?? "").includes("application/json")) {
      try {
        const j = await res.clone().json();
        u.input += j?.usage?.prompt_tokens ?? j?.usage?.input_tokens ?? 0;
        u.output += j?.usage?.completion_tokens ?? j?.usage?.output_tokens ?? 0;
      } catch { /* ignore */ }
    }
  }
  return res;
}

async function writeLog(row: Record<string, unknown>) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_usage_log").insert(row as never);
  } catch (e) {
    console.error("ai_usage_log write failed", e);
  }
}

export type MeterArgs = {
  db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string | null;
  operation: string;
  /** null = non-billable internal call (still logged). */
  creditType: CreditType | null;
  key: string;
  projectId?: string | null;
  organizationId?: string | null;
};

/** Thrown when the same run is already in progress or already completed. */
export class DuplicateRunError extends Error {
  constructor(message = "This run is already in progress or was just completed. Refresh to see the result.") {
    super(message);
    this.name = "DuplicateRunError";
  }
}

/** Claim → charge (fail-closed) → run → log; refund + log on failure. */
export async function runMeteredAi<T>(a: MeterArgs, run: () => Promise<T>): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const logs = supabaseAdmin.from("ai_usage_log") as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  // Claim the request key first (unique index) so a repeat click can't run the AI twice.
  const { data: claim, error: claimErr } = await logs
    .insert({
      user_id: a.userId, organization_id: a.organizationId ?? null, project_id: a.projectId ?? null,
      operation: a.operation, provider: "lovable_ai_gateway", credit_type: a.creditType,
      success: false, error: "running", internal_use: a.creditType === null, request_key: a.key,
    })
    .select("id")
    .single();
  if (claimErr) {
    if (claimErr.code === "23505") throw new DuplicateRunError();
    throw new Error("We couldn't start this run. Please try again.");
  }
  const claimId = claim.id as string;
  let usageId: string | null = null;
  let internal = a.creditType === null;
  try {
    if (a.creditType && a.userId) {
      // Charge with a unique per-attempt key: the claim row above already blocks
      // concurrent duplicates, so every run that starts must consume its own credit.
      const c = await chargeIncludedUsage(a.db, a.userId, a.creditType, `${a.key}:charge:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, { projectId: a.projectId, reason: a.operation });
      usageId = c.usageId;
      internal = c.internal;
    }
  } catch (e) {
    // Blocked before the AI was called: no usage row is kept.
    await logs.delete().eq("id", claimId);
    throw e;
  }
  const u: Usage = { model: null, input: 0, output: 0, calls: 0 };
  const base = { credits_charged: usageId ? 1 : 0, credit_transaction_id: usageId, internal_use: internal };
  try {
    const out = await store.run(u, run);
    await logs.update({
      ...base, success: true, error: null, model: u.model, input_tokens: u.input, output_tokens: u.output, estimated_cost: estimate(u),
      // Free the key once the run is done: a deliberate re-run is allowed (and charges again);
      // only a duplicate while the run is still in progress is blocked.
      request_key: `${a.key}:done:${Date.now()}`,
    }).eq("id", claimId);
    return out;
  } catch (e) {
    if (usageId) await refundCredit(usageId, `${a.operation} failed — credit restored`);
    await logs.update({
      ...base, success: false, error: String((e as Error)?.message ?? e).slice(0, 500),
      refunded: Boolean(usageId), model: u.model, input_tokens: u.input, output_tokens: u.output, estimated_cost: estimate(u),
      // Free the key so the customer can retry after a failure.
      request_key: `${a.key}:failed:${Date.now()}`,
    }).eq("id", claimId);
    throw e;
  }
}

/** Log a call whose billing is handled elsewhere (e.g. streamed chat). */
export async function logAiCall(row: {
  userId: string | null; operation: string; model?: string | null; success: boolean; error?: string | null;
  projectId?: string | null; creditType?: CreditType | null; creditTransactionId?: string | null; internal?: boolean; key?: string | null;
  refunded?: boolean;
}) {
  await writeLog({
    user_id: row.userId, operation: row.operation, model: row.model ?? null, success: row.success,
    error: row.error ?? null, project_id: row.projectId ?? null, credit_type: row.creditType ?? null,
    credits_charged: row.creditTransactionId ? 1 : 0, credit_transaction_id: row.creditTransactionId ?? null,
    internal_use: row.internal ?? false, request_key: row.key ?? null, refunded: row.refunded ?? false,
    provider: "lovable_ai_gateway",
  });
}

(globalThis as { __permivioAiFetch?: typeof aiGatewayFetch }).__permivioAiFetch = aiGatewayFetch;

/** Duplicate-request key: same user + same input within 5 minutes = one charge. */
export function meterKey(op: string, userId: string, data: unknown): string {
  const rid = (data as { request_id?: string } | null)?.request_id;
  const str = JSON.stringify(data ?? null);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return [op, userId, (h >>> 0).toString(36), rid ?? `t${Math.floor(Date.now() / 300_000)}`].join(":");
}
