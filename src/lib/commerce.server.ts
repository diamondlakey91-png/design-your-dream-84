// PERMIVIO commerce & entitlement core (server-only).
// Plans, limits and prices are data-driven (subscription_plans, plan_entitlements,
// service_products). The credit_transactions ledger is the only source of truth
// for balances; writes go through the service role only.
import { isSubscriptionActive } from "@/lib/tiers";

export const CREDIT_TYPES = ["report_credits", "plan_review_credits", "correction_review_credits", "ai_queries", "ai_messages"] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

export const ENTITLEMENT_KEYS = [
  "active_projects",
  "team_seats",
  "ai_queries",
  "ai_messages",
  "report_credits",
  "plan_review_credits",
  "correction_review_credits",
  "document_storage_mb",
  "subscriber_discount_percent",
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Membership = {
  active: boolean;
  subscription: {
    id: string;
    status: string;
    price_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    environment: string;
  } | null;
  plan: { id: string; plan_key: string; name: string } | null;
  /** entitlement_key → { limit (null = unlimited), period } */
  limits: Partial<Record<EntitlementKey, { limit: number | null; period: string }>>;
};

export async function getAdmin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Resolve the caller's current membership from their latest subscription row. */
export async function getMembership(db: Db, userId: string): Promise<Membership> {
  const { data: sub } = await db
    .from("subscriptions")
    .select("id,status,price_id,current_period_start,current_period_end,cancel_at_period_end,environment")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active = Boolean(sub && isSubscriptionActive(sub.status, sub.current_period_end));
  let plan: Membership["plan"] = null;
  const limits: Membership["limits"] = {};
  if (sub?.price_id) {
    const { data: p } = await db
      .from("subscription_plans")
      .select("id,plan_key,name, plan_entitlements(entitlement_key,limit_value,period)")
      .eq("plan_key", sub.price_id)
      .maybeSingle();
    if (p) {
      plan = { id: p.id, plan_key: p.plan_key, name: p.name };
      for (const e of (p.plan_entitlements ?? []) as Array<{ entitlement_key: EntitlementKey; limit_value: number | null; period: string }>) {
        limits[e.entitlement_key] = { limit: e.limit_value, period: e.period };
      }
    }
  }
  return { active, subscription: sub ?? null, plan, limits };
}

export async function creditBalance(db: Db, userId: string, type: CreditType): Promise<number> {
  const { data } = await db.from("credit_transactions").select("quantity").eq("user_id", userId).eq("credit_type", type);
  return ((data ?? []) as Array<{ quantity: number }>).reduce((s, r) => s + r.quantity, 0);
}

/**
 * Member price for a product, from admin-configured data only:
 * subscriber_price_cents replaces the base price; otherwise an eligible product
 * gets the plan's subscriber_discount_percent. Returns the discount in cents.
 */
export function memberDiscountCents(
  product: { base_price_cents: number; subscriber_price_cents?: number | null; subscriber_discount_eligible?: boolean | null },
  totalCents: number,
  membership: Membership,
): number {
  if (!membership.active) return 0;
  if (product.subscriber_price_cents != null && product.subscriber_price_cents < product.base_price_cents) {
    return Math.min(totalCents, product.base_price_cents - product.subscriber_price_cents);
  }
  const pct = membership.limits.subscriber_discount_percent?.limit ?? 0;
  if (product.subscriber_discount_eligible && pct > 0) {
    return Math.min(totalCents, Math.round((totalCents * Math.min(pct, 100)) / 100));
  }
  return 0;
}

/** Atomically consume credits (validated + locked in the database). Idempotent on key. */
export async function consumeCredit(args: {
  userId: string;
  type: CreditType;
  quantity: number;
  key: string;
  productId?: string | null;
  projectId?: string | null;
  reason: string;
}): Promise<string> {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc("consume_credit", {
    _user_id: args.userId,
    _credit_type: args.type,
    _quantity: args.quantity,
    _idempotency_key: args.key,
    _product_id: args.productId ?? null,
    _project_id: args.projectId ?? null,
    _reason: args.reason,
  });
  if (error) {
    if (String(error.message).includes("insufficient_credits")) throw new Error("You don't have an included credit available for this.");
    throw new Error("We couldn't apply your included credit. Please try again.");
  }
  return data as string;
}

/** Restore a consumed credit after a permanent Permivio/system failure. */
export async function refundCredit(usageId: string, reason: string): Promise<void> {
  const admin = await getAdmin();
  await admin.rpc("refund_credit", { _usage_id: usageId, _reason: reason });
}

/** Thrown when a paid AI run has no credit behind it. Fail-closed. */
export class CreditRequiredError extends Error {
  constructor(message = "This run needs a credit. Choose a plan or buy a report on the Tools page.") {
    super(message);
    this.name = "CreditRequiredError";
  }
}

/**
 * Server-side gate for every paid AI "Run". Fail-closed: holders of the
 * internal_ai role run as internal use; everyone else must hold at least one ledger credit of this
 * type (from a membership grant, purchase or admin adjustment). No subscription,
 * no plan limit or a zero balance blocks the run — there is no free pass-through.
 */
export async function chargeIncludedUsage(
  db: Db,
  userId: string,
  type: CreditType,
  key: string,
  meta: { projectId?: string | null; reason: string },
): Promise<{ usageId: string | null; internal: boolean }> {
  // Internal AI access is its own server-controlled role — admin alone does NOT bypass credits.
  const { data: isInternal } = await db.rpc("has_role", { _user_id: userId, _role: "internal_ai" });
  if (isInternal === true) return { usageId: null, internal: true };
  const admin = await getAdmin();
  // Idempotent retry of the same run: already charged, don't block or re-charge.
  const { data: prior } = await admin.from("credit_transactions").select("id").eq("idempotency_key", key).maybeSingle();
  if (prior?.id) {
    const { data: refunded } = await admin.from("credit_transactions").select("id").eq("idempotency_key", `refund:${prior.id}`).maybeSingle();
    if (!refunded) return { usageId: prior.id as string, internal: false };
    key = `${key}:retry:${Date.now()}`;
  }
  const bal = await creditBalance(admin, userId, type);
  if (bal < 1) throw new CreditRequiredError();
  try {
    const usageId = await consumeCredit({ userId, type, quantity: 1, key, projectId: meta.projectId, reason: meta.reason });
    return { usageId, internal: false };
  } catch (e) {
    if (String((e as Error).message).includes("included credit")) throw new CreditRequiredError();
    throw e;
  }
}

/**
 * Grant a billing period's allowances. Called only from the verified webhook.
 * Unused monthly allowance from the previous period expires first. Every write
 * carries an idempotency key derived from the Stripe invoice id.
 */
export async function grantPeriodAllowances(admin: Db, args: {
  userId: string;
  subscriptionRowId: string;
  planKey: string;
  invoiceId: string;
}): Promise<number> {
  const { data: plan } = await admin
    .from("subscription_plans")
    .select("id, plan_entitlements(entitlement_key,limit_value,period)")
    .eq("plan_key", args.planKey)
    .maybeSingle();
  if (!plan) return 0;
  let granted = 0;
  for (const e of (plan.plan_entitlements ?? []) as Array<{ entitlement_key: string; limit_value: number | null; period: string }>) {
    if (!(CREDIT_TYPES as readonly string[]).includes(e.entitlement_key)) continue;
    if (e.period !== "monthly" || !e.limit_value || e.limit_value <= 0) continue;
    const type = e.entitlement_key as CreditType;

    // Expire the unused part of the most recent monthly grant (no rollover).
    const { data: lastGrant } = await admin
      .from("credit_transactions")
      .select("quantity")
      .eq("user_id", args.userId)
      .eq("credit_type", type)
      .eq("transaction_type", "subscription_grant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const bal = await creditBalance(admin, args.userId, type);
    const expire = Math.min(bal, lastGrant?.quantity ?? 0);
    if (expire > 0) {
      await admin.from("credit_transactions").upsert(
        {
          user_id: args.userId,
          subscription_id: args.subscriptionRowId,
          credit_type: type,
          quantity: -expire,
          transaction_type: "expiration",
          reason: "Unused monthly allowance expired at renewal",
          idempotency_key: `expire:${args.invoiceId}:${type}`,
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true },
      );
    }
    const { error } = await admin.from("credit_transactions").upsert(
      {
        user_id: args.userId,
        subscription_id: args.subscriptionRowId,
        credit_type: type,
        quantity: e.limit_value,
        transaction_type: "subscription_grant",
        reason: "Monthly membership allowance",
        idempotency_key: `grant:${args.invoiceId}:${type}`,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );
    if (!error) granted++;
  }
  return granted;
}

/**
 * Run a metered operation with credit protection: charge (idempotent on key),
 * run, and restore the credit automatically if the run fails.
 */
export async function withIncludedUsage<T>(
  db: Db,
  userId: string,
  type: CreditType,
  key: string,
  meta: { projectId?: string | null; reason: string },
  run: () => Promise<T>,
): Promise<T> {
  const { usageId } = await chargeIncludedUsage(db, userId, type, key, meta);
  try {
    return await run();
  } catch (e) {
    if (usageId) await refundCredit(usageId, `${meta.reason} failed — credit restored`);
    throw e;
  }
}

/** Duplicate-request key: the caller's request id, else a short time window. */
export function requestKey(prefix: string, parts: string[], requestId?: string | null): string {
  const bucket = requestId ?? `t${Math.floor(Date.now() / (5 * 60_000))}`;
  return [prefix, ...parts, bucket].join(":");
}
