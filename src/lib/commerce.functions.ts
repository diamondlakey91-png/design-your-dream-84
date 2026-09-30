import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CREDIT = z.enum(["report_credits", "plan_review_credits", "correction_review_credits", "ai_queries"]);
const ENT_KEY = z.enum([
  "active_projects",
  "team_seats",
  "ai_queries",
  "report_credits",
  "plan_review_credits",
  "correction_review_credits",
  "document_storage_mb",
  "subscriber_discount_percent",
]);

async function assertAdmin(supabase: { rpc: (...a: never[]) => unknown }, userId: string) {
  const { data } = (await (supabase as never as { rpc: (f: string, a: unknown) => Promise<{ data: unknown }> }).rpc(
    "has_role",
    { _user_id: userId, _role: "admin" },
  ));
  if (data !== true) throw new Error("Forbidden");
}

/** Billing overview for the signed-in customer: plan, allowances, balances, history. */
export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { getMembership, CREDIT_TYPES } = await import("@/lib/commerce.server");
    const membership = await getMembership(supabase, userId);
    const [{ data: ledger }, { data: orders }, { data: plans }] = await Promise.all([
      supabase.from("credit_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
      supabase
        .from("service_orders")
        .select("id,status,amount_cents,discount_cents,currency,payment_method,created_at,project_id, service_products(client_title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("subscription_plans")
        .select("id,plan_key,name,description,monthly_price_cents,currency,display_order, plan_entitlements(entitlement_key,limit_value,period)")
        .eq("active", true)
        .order("display_order"),
    ]);
    const rows = (ledger ?? []) as Array<{ credit_type: string; quantity: number; transaction_type: string; created_at: string }>;
    const periodStart = membership.subscription?.current_period_start ?? null;
    const allowances = CREDIT_TYPES.map((type) => {
      const bal = rows.filter((r) => r.credit_type === type).reduce((s, r) => s + r.quantity, 0);
      const inPeriod = rows.filter((r) => r.credit_type === type && (!periodStart || r.created_at >= periodStart));
      const included = membership.limits[type]?.limit ?? null;
      const used = -inPeriod.filter((r) => r.transaction_type === "usage").reduce((s, r) => s + r.quantity, 0)
        - inPeriod.filter((r) => r.transaction_type === "refund").reduce((s, r) => s + r.quantity, 0);
      return { type, included, used: Math.max(0, used), remaining: bal };
    });
    return {
      membership,
      allowances,
      ledger: rows.slice(0, 50),
      orders: orders ?? [],
      plans: plans ?? [],
    };
  });

/**
 * Use an included membership credit for a Tools & Reports product. The credit
 * is validated and consumed atomically in the database before the order and
 * entitlement are created; any failure afterwards restores the credit.
 */
export const redeemServiceWithCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      productId: z.string().uuid(),
      projectId: z.string().uuid().nullable().optional(),
      deliveryTier: z.enum(["ai_assisted", "professional_review"]),
      requestId: z.string().uuid(),
      environment: z.enum(["sandbox", "live"]),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ orderId: string } | { error: string }> => {
    const { supabase, userId } = context;
    const { getMembership, consumeCredit, refundCredit, getAdmin } = await import("@/lib/commerce.server");
    const { data: product } = await supabase.from("service_products").select("*").eq("id", data.productId).eq("active", true).maybeSingle();
    if (!product) return { error: "That service is not available right now." };
    const p = product as typeof product & { credit_type: string | null; credits_consumed: number };
    if (!p.credit_type || !p.credits_consumed) return { error: "This service can't be redeemed with an included credit." };
    if (p.professional_review_required && data.deliveryTier !== "professional_review") {
      return { error: "This report always includes professional review." };
    }
    const m = await getMembership(supabase, userId);
    if (!m.active) return { error: "Included credits require an active Permivio membership." };

    let usageId: string;
    try {
      usageId = await consumeCredit({
        userId,
        type: p.credit_type as never,
        quantity: p.credits_consumed,
        key: `redeem:${data.requestId}`,
        productId: p.id,
        projectId: data.projectId ?? null,
        reason: `Included credit used for ${p.client_title}`,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "No included credit available." };
    }

    const admin = await getAdmin();
    try {
      const { data: order, error } = await admin
        .from("service_orders")
        .insert({
          user_id: userId,
          project_id: data.projectId ?? null,
          product_id: p.id,
          delivery_tier: data.deliveryTier,
          status: "processing",
          amount_cents: 0,
          currency: p.currency,
          environment: data.environment,
          payment_method: "credit",
          credit_transaction_id: usageId,
          client_notes: "Redeemed with an included membership credit.",
        })
        .select("id")
        .single();
      if (error || !order) throw new Error(error?.message ?? "order");
      await admin.from("credit_transactions").update({ order_id: order.id, subscription_id: m.subscription?.id ?? null }).eq("id", usageId);
      await admin.from("service_entitlements").insert({
        user_id: userId,
        project_id: data.projectId ?? null,
        product_id: p.id,
        order_id: order.id,
        entitlement_type: "subscription",
        entitlement_status: "active",
        delivery_tier: data.deliveryTier,
      });
      if (data.projectId) {
        await admin.from("activity").insert({
          project_id: data.projectId,
          user_id: userId,
          description: `${p.client_title} ordered with an included membership credit`,
        });
      }
      return { orderId: order.id as string };
    } catch {
      await refundCredit(usageId, "Order could not be created — credit restored");
      return { error: "We couldn't start that order. Your credit has been restored." };
    }
  });

// ------------------------------------------------------------------ admin

export const listPlansAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("subscription_plans")
      .select("*, plan_entitlements(id,entitlement_key,limit_value,period)")
      .order("display_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertPlanAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      plan_key: z.string().min(2).max(80).regex(/^[a-z0-9_]+$/),
      name: z.string().min(2).max(120),
      description: z.string().max(1000).nullable().optional(),
      monthly_price_cents: z.number().int().min(0).max(10_000_000).nullable().optional(),
      active: z.boolean().default(true),
      display_order: z.number().int().min(0).max(999).default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { id, ...row } = data;
    const q = id
      ? context.supabase.from("subscription_plans").update(row).eq("id", id)
      : context.supabase.from("subscription_plans").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPlanEntitlementAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      plan_id: z.string().uuid(),
      entitlement_key: ENT_KEY,
      /** undefined/"remove" deletes the row; null = unlimited */
      limit_value: z.number().int().min(0).max(1_000_000).nullable(),
      period: z.enum(["none", "monthly"]),
      remove: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (data.remove) {
      const { error } = await context.supabase
        .from("plan_entitlements")
        .delete()
        .eq("plan_id", data.plan_id)
        .eq("entitlement_key", data.entitlement_key);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await context.supabase.from("plan_entitlements").upsert(
      { plan_id: data.plan_id, entitlement_key: data.entitlement_key, limit_value: data.limit_value, period: data.period },
      { onConflict: "plan_id,entitlement_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin manual credit adjustment — always recorded in the ledger with a reason. */
export const adjustCreditsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      credit_type: CREDIT,
      quantity: z.number().int().min(-1000).max(1000).refine((n) => n !== 0),
      reason: z.string().min(3).max(300),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { getAdmin } = await import("@/lib/commerce.server");
    const admin = await getAdmin();
    const { error } = await admin.from("credit_transactions").insert({
      user_id: data.user_id,
      credit_type: data.credit_type,
      quantity: data.quantity,
      transaction_type: "adjustment",
      reason: data.reason,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin-only: every AI call across the platform (most recent first). */
export const listAiUsageAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data, error } = await (context.supabase as never as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("ai_usage_log")
      .select("id,created_at,user_id,project_id,operation,model,success,error,input_tokens,output_tokens,estimated_cost,credit_type,credits_charged,refunded,internal_use")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string; created_at: string; user_id: string | null; project_id: string | null; operation: string; model: string | null;
      success: boolean; error: string | null; input_tokens: number; output_tokens: number; estimated_cost: number;
      credit_type: string | null; credits_charged: number; refunded: boolean; internal_use: boolean;
    }>;
  });
