import { FileText } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ORDER_STATUS_LABEL, TIER_COPY, money, statusTone, type ServiceOrder } from "@/lib/toolsCatalog";

const TONE_CLASS: Record<string, string> = {
  blue: "border-primary/40 bg-primary/10 text-primary",
  green: "border-[oklch(0.75_0.16_155)]/40 bg-[oklch(0.75_0.16_155)]/10 text-[oklch(0.82_0.15_155)]",
  gray: "border-border bg-secondary/60 text-muted-foreground",
  red: "border-destructive/40 bg-destructive/10 text-foreground",
};

export type ReportVersion = {
  id: string;
  product_id: string;
  project_id: string | null;
  version: number;
  title: string | null;
  delivery_tier: string;
  reviewed_at: string | null;
  created_at: string;
};

/** Permanent record of everything the client has purchased, plus report history. */
export function PurchasedServicesList({
  orders,
  versions,
  productTitles,
  projectNames,
}: {
  orders: ServiceOrder[];
  versions: ReportVersion[];
  productTitles: Record<string, string>;
  projectNames: Record<string, string>;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You haven't purchased any tools or reports yet. Anything you buy stays saved here permanently.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((order) => {
        const reports = versions.filter(
          (v) => v.product_id === order.product_id && v.project_id === order.project_id,
        );
        const tone = TONE_CLASS[statusTone(order.status)];
        return (
          <li key={order.id} className="rounded-3xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {productTitles[order.product_id] ?? "Permivio service"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {TIER_COPY[order.delivery_tier].label}
                  {order.project_id && projectNames[order.project_id]
                    ? ` · ${projectNames[order.project_id]}`
                    : ""}
                  {" · "}
                  {money(order.amount_cents, order.currency)}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>
                {ORDER_STATUS_LABEL[order.status] ?? "In Progress"}
              </span>
            </div>

            {reports.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
                      <FileText className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">{r.title ?? `Report v${r.version}`}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      v{r.version} · {new Date(r.created_at).toLocaleDateString()}
                      {r.reviewed_at ? " · Professionally reviewed" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {order.project_id && (
              <Link
                to="/projects/$id"
                params={{ id: order.project_id }}
                className="mt-4 inline-flex text-xs font-semibold text-primary hover:underline"
              >
                Open project
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
