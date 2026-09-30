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

/** Charge (fail-closed) → run → log; refund + log on failure. */
export async function runMeteredAi<T>(a: MeterArgs, run: () => Promise<T>): Promise<T> {
  let usageId: string | null = null;
  let internal = a.creditType === null;
  if (a.creditType && a.userId) {
    const c = await chargeIncludedUsage(a.db, a.userId, a.creditType, a.key, { projectId: a.projectId, reason: a.operation });
    usageId = c.usageId;
    internal = c.internal;
  }
  const u: Usage = { model: null, input: 0, output: 0, calls: 0 };
  const base = {
    user_id: a.userId,
    organization_id: a.organizationId ?? null,
    project_id: a.projectId ?? null,
    operation: a.operation,
    provider: "lovable_ai_gateway",
    credit_type: a.creditType,
    credits_charged: usageId ? 1 : 0,
    credit_transaction_id: usageId,
    internal_use: internal,
    request_key: a.key,
  };
  try {
    const out = await store.run(u, run);
    await writeLog({ ...base, success: true, model: u.model, input_tokens: u.input, output_tokens: u.output, estimated_cost: estimate(u) });
    return out;
  } catch (e) {
    if (usageId) await refundCredit(usageId, `${a.operation} failed — credit restored`);
    await writeLog({
      ...base, success: false, error: String((e as Error)?.message ?? e).slice(0, 500),
      refunded: Boolean(usageId), model: u.model, input_tokens: u.input, output_tokens: u.output, estimated_cost: estimate(u),
    });
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
