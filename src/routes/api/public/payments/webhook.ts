import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

type Sub = {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ current_period_start?: number; current_period_end?: number; price?: { id?: string; product?: string; lookup_key?: string; metadata?: Record<string, string> } }> };
};

async function handleSubscriptionCreated(subscription: Sub, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) { console.error("No userId in subscription metadata"); return; }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function handleSubscriptionUpdated(subscription: Sub, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase()
    .from("subscriptions")
    .update({
      status: subscription.status,
      product_id: productId,
      price_id: priceId,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleSubscriptionDeleted(subscription: Sub, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

type CheckoutSession = {
  id: string;
  payment_intent?: string | null;
  payment_status?: string;
  metadata?: Record<string, string>;
};

/**
 * Fulfilment for one-off Tools & Reports purchases. The order is only marked
 * paid — and the entitlement granted — here, after Stripe signature verification.
 */
async function handleServiceCheckoutCompleted(session: CheckoutSession) {
  const orderId = session.metadata?.orderId;
  const userId = session.metadata?.userId;
  if (session.metadata?.kind !== "service_order" || !orderId || !userId) return;
  if (session.payment_status && session.payment_status !== "paid") return;

  const db = getSupabase();
  const { data: order } = await db
    .from("service_orders")
    .select("id,user_id,project_id,product_id,delivery_tier,status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.user_id !== userId) return;
  if (order.status !== "payment_required") return;

  await db
    .from("service_orders")
    .update({
      status: "processing",
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await db.from("service_entitlements").insert({
    user_id: userId,
    project_id: order.project_id,
    product_id: order.product_id,
    order_id: orderId,
    entitlement_type: "purchase",
    entitlement_status: "active",
    delivery_tier: order.delivery_tier,
  });

  if (order.project_id) {
    await db.from("activity").insert({
      project_id: order.project_id,
      user_id: userId,
      description: "Permivio service purchased — preparing your report",
    });
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleServiceCheckoutCompleted(event.data.object as CheckoutSession); break;
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object as Sub, env); break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Sub, env); break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Sub, env); break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook: invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
