import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Purchased report ↔ project attachment
// A purchased tool/report only becomes project intelligence once it is tied to
// a project. These functions move an order (plus its report versions and
// entitlement) onto a project and log the change to the project timeline.
// ---------------------------------------------------------------------------

export type AttachableOrder = {
  id: string;
  product_id: string;
  product_title: string;
  status: string;
  delivery_tier: string;
  amount_cents: number;
  created_at: string;
  project_id: string | null;
  report_count: number;
};

/** Every order the signed-in user owns, with product titles and current project. */
export const listAttachableOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AttachableOrder[]> => {
    const { supabase, userId } = context;
    const [orders, products, versions] = await Promise.all([
      supabase
        .from("service_orders")
        .select("id,product_id,status,delivery_tier,amount_cents,created_at,project_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("service_products").select("id,title"),
      supabase.from("service_report_versions").select("id,order_id").eq("user_id", userId),
    ]);
    if (orders.error) throw new Error(orders.error.message);
    const titles = new Map((products.data ?? []).map((p) => [p.id, p.title]));
    const counts = new Map<string, number>();
    for (const v of versions.data ?? []) {
      if (v.order_id) counts.set(v.order_id, (counts.get(v.order_id) ?? 0) + 1);
    }
    return (orders.data ?? []).map((o) => ({
      id: o.id,
      product_id: o.product_id,
      product_title: titles.get(o.product_id) ?? "Purchased service",
      status: o.status,
      delivery_tier: o.delivery_tier,
      amount_cents: o.amount_cents,
      created_at: o.created_at,
      project_id: o.project_id,
      report_count: counts.get(o.id) ?? 0,
    }));
  });

const AttachInput = z.object({
  order_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
});

/**
 * Attaches (or detaches, with project_id = null) a purchased order to a project.
 * Report versions and the entitlement follow the order so the findings show up in
 * the project's Intelligence tab, and the move is written to the project timeline.
 */
export const attachOrderToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AttachInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: order, error: oErr } = await supabase
      .from("service_orders")
      .select("id,product_id,project_id,delivery_tier,status")
      .eq("id", data.order_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("That purchase could not be found on your account.");

    let projectName: string | null = null;
    if (data.project_id) {
      const { data: project, error: pErr } = await supabase
        .from("projects")
        .select("id,name")
        .eq("id", data.project_id)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!project) throw new Error("That project could not be found on your account.");
      projectName = project.name;
    }

    const { error: upErr } = await supabase
      .from("service_orders")
      .update({ project_id: data.project_id })
      .eq("id", order.id)
      .eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);

    // Report versions and the entitlement follow the order.
    await supabase
      .from("service_report_versions")
      .update({ project_id: data.project_id })
      .eq("order_id", order.id)
      .eq("user_id", userId);
    await supabase
      .from("service_entitlements")
      .update({ project_id: data.project_id })
      .eq("order_id", order.id)
      .eq("user_id", userId);

    const { data: product } = await supabase
      .from("service_products")
      .select("title")
      .eq("id", order.product_id)
      .maybeSingle();
    const title = product?.title ?? "Purchased service";

    if (data.project_id) {
      await supabase.from("activity").insert({
        user_id: userId,
        project_id: data.project_id,
        description: `${title} attached to this project — its report findings now feed project intelligence.`,
      });
    } else if (order.project_id) {
      await supabase.from("activity").insert({
        user_id: userId,
        project_id: order.project_id,
        description: `${title} was detached from this project.`,
      });
    }

    return { ok: true as const, project_name: projectName, title };
  });
