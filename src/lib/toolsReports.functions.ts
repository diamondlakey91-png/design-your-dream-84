import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";
import { priceBreakdown, type ServiceProduct } from "@/lib/toolsCatalog";


/** Catalog + purchase state for the client-facing Tools & Reports area. */
export const getToolsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [products, projects, orders, entitlements, versions, requests] = await Promise.all([
      supabase.from("service_products").select("*").eq("active", true).order("display_order"),
      supabase.from("projects").select("id,name,location,project_type,status,current_stage,jurisdiction,updated_at").order("created_at", { ascending: false }),
      supabase.from("service_orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("service_entitlements").select("*").eq("user_id", userId).eq("entitlement_status", "active"),
      supabase.from("service_report_versions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("service_upgrade_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);
    if (products.error) throw new Error(products.error.message);
    return {
      products: products.data ?? [],
      projects: projects.data ?? [],
      orders: orders.data ?? [],
      entitlements: entitlements.data ?? [],
      versions: versions.data ?? [],
      requests: requests.data ?? [],
    };
  });

const OrderInput = z.object({
  productId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  deliveryTier: z.enum(["ai_assisted", "professional_review"]),
  rush: z.boolean().default(false),
  clientNotes: z.string().max(2000).optional(),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
});

type OrderResult = { orderId: string; clientSecret: string } | { error: string };

/**
 * Creates a real order row (status = payment_required) and a Stripe Checkout
 * session for it. The order is only marked paid — and an entitlement granted —
 * by the verified Stripe webhook, never by the browser.
 */
export const createServiceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrderInput.parse(input))
  .handler(async ({ data, context }): Promise<OrderResult> => {
    const { supabase, userId } = context;
    const { data: product, error: pErr } = await supabase
      .from("service_products")
      .select("*")
      .eq("id", data.productId)
      .eq("active", true)
      .maybeSingle();
    if (pErr || !product) return { error: "That service is not available right now." };

    if (product.custom_quote_required) {
      return {
        error:
          "This report is scoped with you before work begins. Request a custom scope and a Permivio permitting professional will confirm the scope and price.",
      };
    }
    if (product.professional_review_required && data.deliveryTier !== "professional_review") {
      return { error: "This report always includes professional review. Please choose the professionally reviewed option." };
    }

    // Server-side pricing — never trust an amount from the browser.
    const quote = priceBreakdown(product as unknown as ServiceProduct, data.deliveryTier, data.rush);
    const amount = quote.total_cents;
    if (amount <= 0) return { error: "This service is not priced yet. Please contact Permivio." };


    const { data: order, error: oErr } = await supabase
      .from("service_orders")
      .insert({
        user_id: userId,
        project_id: data.projectId ?? null,
        product_id: product.id,
        delivery_tier: data.deliveryTier,
        status: "payment_required",
        amount_cents: amount,
        currency: product.currency,
        rush: data.rush,
        environment: data.environment,
        client_notes: data.clientNotes ?? null,
      })
      .select("id")
      .single();
    if (oErr || !order) return { error: "We couldn't start that order. Please try again." };

    // One row per priced line so the client's receipt matches the quote exactly.
    await supabase.from("service_order_items").insert(
      quote.lines.map((line) => ({
        order_id: order.id,
        product_id: product.id,
        delivery_tier: data.deliveryTier,
        quantity: 1,
        unit_amount_cents: line.amount_cents,
        label: line.label,
      })),
    );


    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: `${data.returnUrl}${data.returnUrl.includes("?") ? "&" : "?"}order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: product.currency,
              unit_amount: amount,
              product_data: {
                name:
                  data.deliveryTier === "professional_review"
                    ? `${product.client_title} — Professionally Reviewed`
                    : `${product.client_title} — AI-Assisted`,
              },
            },
          },
        ],
        metadata: { userId, orderId: order.id, kind: "service_order" },
      });
      await supabase.from("service_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
      return { orderId: order.id, clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

const UpgradeInput = z.object({
  projectId: z.string().uuid().nullable().optional(),
  preferredContact: z.string().max(40).optional(),
  contactValue: z.string().max(200).optional(),
  desiredTimeline: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
});

/** "Have Permivio handle this project" — creates a service request on the project. */
export const requestFullService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpgradeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("service_upgrade_requests").insert({
      user_id: userId,
      project_id: data.projectId ?? null,
      request_type: "full_service",
      preferred_contact: data.preferredContact ?? null,
      contact_value: data.contactValue ?? null,
      desired_timeline: data.desiredTimeline ?? null,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    if (data.projectId) {
      await supabase.from("activity").insert({
        project_id: data.projectId,
        user_id: userId,
        description: "Full-service permitting requested",
      });
    }
    return { ok: true };
  });

/** Admin-only pricing/visibility update. */
export const updateServiceProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        base_price_cents: z.number().int().min(0).max(100_000_00).optional(),
        professional_review_price_cents: z.number().int().min(0).max(100_000_00).nullable().optional(),
        rush_price_cents: z.number().int().min(0).max(100_000_00).nullable().optional(),
        turnaround_estimate: z.string().max(120).nullable().optional(),
        active: z.boolean().optional(),
        display_order: z.number().int().min(0).max(999).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { id, ...patch } = data;
    const { error } = await supabase.from("service_products").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin-only order list for Tools & Reports management. */
export const listServiceOrdersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await supabase
      .from("service_orders")
      .select("*, service_products(client_title)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Admin-only full catalog (including inactive products). */
export const listServiceProductsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await supabase.from("service_products").select("*").order("display_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ProductInput = z.object({
  id: z.string().uuid().optional(),
  product_key: z.string().min(2).max(80).regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores"),
  name: z.string().min(2).max(160),
  client_title: z.string().min(2).max(160),
  client_question: z.string().max(300).nullable().optional(),
  description: z.string().min(2).max(2000),
  category: z.string().min(2).max(80),
  base_price_cents: z.number().int().min(0).max(100_000_00),
  professional_review_price_cents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  rush_price_cents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  turnaround_estimate: z.string().max(120).nullable().optional(),
  deliverables: z.array(z.string().max(300)).max(30).default([]),
  supports_professional_review: z.boolean().default(true),
  active: z.boolean().default(true),
  display_order: z.number().int().min(0).max(999).default(0),
});

/** Admin-only create/update of a Tools & Reports product. */
export const upsertServiceProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProductInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { id, ...row } = data;
    const payload = {
      ...row,
      client_question: row.client_question ?? null,
      professional_review_price_cents: row.professional_review_price_cents ?? null,
      rush_price_cents: row.rush_price_cents ?? null,
      turnaround_estimate: row.turnaround_estimate ?? null,
      deliverables: row.deliverables as never,
    };
    if (id) {
      const { error } = await supabase.from("service_products").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: inserted, error } = await supabase.from("service_products").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id as string };
  });

/** Admin-only order status management. Payment status is never set here. */
export const updateServiceOrderAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "paid",
          "processing",
          "waiting_client",
          "ai_in_progress",
          "professional_review",
          "ready",
          "delivered",
          "cancelled",
          "refunded",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await supabase
      .from("service_orders")
      .update({
        status: data.status,
        delivered_at: data.status === "delivered" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CheckoutContextInput = z.object({ product_key: z.string().max(80) });

/** Everything the /tools/checkout page needs for one product. */
export const getCheckoutContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckoutContextInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [product, projects] = await Promise.all([
      supabase.from("service_products").select("*").eq("product_key", data.product_key).eq("active", true).maybeSingle(),
      supabase.from("projects").select("id,name,location,project_type,status,jurisdiction").order("created_at", { ascending: false }),
    ]);
    if (product.error) throw new Error(product.error.message);
    const p = product.data as unknown as ServiceProduct | null;
    // Authoritative price lines — the checkout page never computes its own totals.
    const quotes = p
      ? {
          ai_assisted: priceBreakdown(p, "ai_assisted", false),
          ai_assisted_rush: priceBreakdown(p, "ai_assisted", true),
          professional_review: priceBreakdown(p, "professional_review", false),
          professional_review_rush: priceBreakdown(p, "professional_review", true),
        }
      : null;
    return { product: product.data, projects: projects.data ?? [], quotes };
  });


/** Post-payment state for one order: paid?, delivery stage, saved report versions. */
export const getOrderState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order, error } = await supabase
      .from("service_orders")
      .select("id,product_id,project_id,delivery_tier,status,amount_cents,currency,rush,created_at,delivered_at")
      .eq("id", data.order_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { order: null, product_title: null, versions: [] };
    const [product, versions] = await Promise.all([
      supabase.from("service_products").select("client_title,name,turnaround_estimate").eq("id", order.product_id).maybeSingle(),
      supabase
        .from("service_report_versions")
        .select("id,title,summary,version,delivery_tier,reviewed_at,created_at")
        .eq("order_id", order.id)
        .order("version", { ascending: false }),
    ]);
    return {
      order,
      product_title: product.data?.client_title ?? product.data?.name ?? "Purchased service",
      turnaround: product.data?.turnaround_estimate ?? null,
      versions: versions.data ?? [],
    };
  });
