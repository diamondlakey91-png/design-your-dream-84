import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CreditCard, Loader2 } from "lucide-react";
import { getBillingOverview } from "@/lib/commerce.functions";
import { createPortalSession } from "@/lib/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { money } from "@/lib/toolsCatalog";
import { ENTITLEMENT_LABEL, ENTITLEMENT_ORDER, TRANSACTION_LABEL } from "@/lib/commerceLabels";

const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : "—");

/** Account billing: plan, status, period, allowances, purchases and credit history. */
export function BillingPanel() {
  const fn = useServerFn(getBillingOverview);
  const portalFn = useServerFn(createPortalSession);
  const q = useQuery({ queryKey: ["billing-overview"], queryFn: () => fn() });
  const [portalErr, setPortalErr] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading billing…
      </div>
    );
  }
  if (!q.data) return <p className="text-sm text-muted-foreground">Billing details are unavailable right now.</p>;
  const { membership, allowances, ledger, orders } = q.data;
  const sub = membership.subscription;

  const manage = async () => {
    setOpening(true);
    setPortalErr(null);
    try {
      const res = await portalFn({ data: { returnUrl: window.location.href, environment: getStripeEnvironment() } });
      if ("url" in res) window.location.assign(res.url);
      else setPortalErr(res.error);
    } catch {
      setPortalErr("Subscription management isn't available yet for this account.");
    } finally {
      setOpening(false);
    }
  };

  const limitRows = ENTITLEMENT_ORDER.filter((k) => membership.limits[k]);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Current plan</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {membership.active ? membership.plan?.name ?? "Permivio Membership" : "Pay as you go"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {sub
                ? `Status: ${sub.status}${sub.cancel_at_period_end ? " · cancels at period end" : ""} · Billing period ${fmtDate(sub.current_period_start)} – ${fmtDate(sub.current_period_end)}`
                : "No membership. Buy individual reports anytime — everything you purchase stays with your projects if you join later."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sub && (
              <button
                onClick={manage}
                disabled={opening}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:border-primary/50"
              >
                {opening ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />} Manage subscription
              </button>
            )}
            <Link to="/pricing" className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              {membership.active ? "Compare plans" : "View memberships"}
            </Link>
          </div>
        </div>
        {portalErr && <p className="mt-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground">{portalErr}</p>}
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Included allowances</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {allowances.map((a) => (
            <div key={a.type} className="rounded-2xl border border-border bg-background/40 p-3">
              <p className="text-xs text-muted-foreground">{ENTITLEMENT_LABEL[a.type]}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{a.remaining} remaining</p>
              <p className="text-[11px] text-muted-foreground">
                {a.included == null ? "Not included in your plan" : `${a.included} included per period`} · {a.used} used this period · 1 credit per AI run
              </p>
            </div>
          ))}
        </div>
        {limitRows.length > 0 && (
          <ul className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {limitRows.map((k) => (
              <li key={k}>
                {ENTITLEMENT_LABEL[k]}: <span className="text-foreground">{membership.limits[k]?.limit ?? "Unlimited"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Recent report & service purchases</h3>
        {orders.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No purchases yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {(orders as Array<{ id: string; created_at: string; amount_cents: number; currency: string; payment_method: string; status: string; service_products: { client_title: string } | null }>).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-foreground">{o.service_products?.client_title ?? "Service"}</span>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(o.created_at)} · {o.payment_method === "credit" ? "Included credit" : money(o.amount_cents, o.currency)} · {o.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Credit & usage history</h3>
        {ledger.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No credit activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {(ledger as Array<{ id?: string; created_at: string; credit_type: string; quantity: number; transaction_type: string; reason?: string | null }>).map((r, i) => (
              <li key={r.id ?? i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-foreground">
                  {TRANSACTION_LABEL[r.transaction_type] ?? r.transaction_type} · {ENTITLEMENT_LABEL[r.credit_type as never] ?? r.credit_type}
                  {r.reason ? <span className="text-muted-foreground"> — {r.reason}</span> : null}
                </span>
                <span className={`text-xs font-semibold ${r.quantity > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {r.quantity > 0 ? `+${r.quantity}` : r.quantity} · {fmtDate(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
