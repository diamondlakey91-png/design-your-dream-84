/**
 * Delivery of purchased Tools & Reports.
 *
 * A paid order becomes a delivered report only when real research output exists
 * for it. This helper records that output as a saved report version, moves the
 * order into its client-facing delivery state and logs the change on the
 * project timeline. Nothing here invents findings — it stores what the
 * research engine actually produced.
 */

type Sb = {
  from: (table: string) => any;
};

export type DeliveryPayload = {
  title: string;
  summary: string | null;
  key_findings: string[];
  risks: string[];
  next_steps: string[];
  source_table: string;
  source_id: string;
};

/**
 * Attaches finished research output to the oldest awaiting paid order for this
 * project. Returns the order it delivered against, or null when the client has
 * no outstanding purchase (research still runs and is saved as normal).
 */
export async function deliverReportForProject(
  sb: Sb,
  userId: string,
  projectId: string,
  payload: DeliveryPayload,
): Promise<{ order_id: string; delivery_tier: string } | null> {
  const { data: orders } = await sb
    .from("service_orders")
    .select("id,product_id,delivery_tier,status,created_at")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .in("status", ["paid", "processing", "ai_in_progress", "waiting_client"])
    .order("created_at", { ascending: true });

  const order = (orders ?? [])[0] as
    | { id: string; product_id: string; delivery_tier: string }
    | undefined;
  if (!order) return null;

  const { data: existing } = await sb
    .from("service_report_versions")
    .select("id")
    .eq("order_id", order.id)
    .order("version", { ascending: false });
  const version = ((existing ?? []).length as number) + 1;

  await sb.from("service_report_versions").insert({
    user_id: userId,
    project_id: projectId,
    product_id: order.product_id,
    order_id: order.id,
    title: payload.title,
    summary: payload.summary,
    version,
    delivery_tier: order.delivery_tier,
    source_table: payload.source_table,
    source_id: payload.source_id,
    payload: {
      key_findings: payload.key_findings,
      risks: payload.risks,
      next_steps: payload.next_steps,
    },
  });

  const professional = order.delivery_tier === "professional_review";
  await sb
    .from("service_orders")
    .update({
      status: professional ? "professional_review" : "ready",
      delivered_at: professional ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  await sb.from("activity").insert({
    project_id: projectId,
    user_id: userId,
    description: professional
      ? `${payload.title} drafted — now with a Permivio permitting professional for review before delivery.`
      : `${payload.title} delivered — saved to this project's reports.`,
  });

  return { order_id: order.id, delivery_tier: order.delivery_tier };
}
