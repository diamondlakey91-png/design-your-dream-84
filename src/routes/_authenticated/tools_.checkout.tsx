import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { ArrowLeft, CheckCircle2, Clock, FileText, Loader2, Lock, Sparkles, UserCheck } from "lucide-react";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createServiceOrder, getCheckoutContext, getOrderState } from "@/lib/toolsReports.functions";
import { DISCLAIMER, TIER_COPY, money, type DeliveryTier } from "@/lib/toolsCatalog";

export const Route = createFileRoute("/_authenticated/tools_/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Permivio Tools & Reports" },
      { name: "description", content: "Order a Permivio report and pay securely. Your report is saved to your project when it's delivered." },
      { property: "og:title", content: "Checkout — Permivio Tools & Reports" },
      { property: "og:description", content: "Order a Permivio permitting report and pay securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    product: typeof search.product === "string" ? search.product : "",
    tier: search.tier === "professional_review" ? ("professional_review" as const) : ("ai_assisted" as const),
    project: typeof search.project === "string" ? search.project : "",
    rush: search.rush === "1" || search.rush === true,
    order_id: typeof search.order_id === "string" ? search.order_id : undefined,
  }),
  component: CheckoutPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CheckoutPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  // ---- Paid order view -----------------------------------------------------
  if (search.order_id) return <OrderStatusView orderId={search.order_id} />;

  const fetchContext = useServerFn(getCheckoutContext);
  const createOrder = useServerFn(createServiceOrder);

  const ctx = useQuery({
    queryKey: ["checkout-context", search.product],
    queryFn: () => fetchContext({ data: { product_key: search.product } }),
    enabled: Boolean(search.product),
  });

  const product = ctx.data?.product ?? null;
  const projects = ctx.data?.projects ?? [];

  const [tier, setTier] = useState<DeliveryTier>(search.tier);
  const [projectId, setProjectId] = useState(search.project);
  const [rush, setRush] = useState(Boolean(search.rush));
  const [notes, setNotes] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const quoteKey = `${tier}${rush ? "_rush" : ""}` as
    | "ai_assisted"
    | "ai_assisted_rush"
    | "professional_review"
    | "professional_review_rush";
  const quote = ctx.data?.quotes ? ctx.data.quotes[quoteKey] : null;
  const amount = quote?.total_cents ?? 0;
  const customQuote = Boolean(product?.custom_quote_required);
  const rushAmount = product ? product.rush_addon_price_cents ?? product.rush_price_cents ?? null : null;

  useEffect(() => {
    if (product?.professional_review_required) setTier("professional_review");
  }, [product?.professional_review_required]);




  const requestScope = async () => {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      await askForScope({
        data: {
          projectId: projectId || null,
          notes: `Custom scope requested for ${product.client_title}${notes ? ` — ${notes}` : ""}`,
        },
      });
      setQuoteRequested(true);
    } catch {
      setError("We couldn't send your scope request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const startPayment = async () => {

    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createOrder({
        data: {
          productId: product.id,
          projectId: projectId || null,
          deliveryTier: tier,
          rush,
          clientNotes: notes || undefined,
          returnUrl: `${window.location.origin}/tools/checkout`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) setError(res.error);
      else setClientSecret(res.clientSecret);
    } catch (e) {
      setError(
        e instanceof Error && e.message.toLowerCase().includes("not configured")
          ? "Card payments aren't switched on for this build yet. Complete payment setup to take live orders."
          : "We couldn't open the payment form. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!search.product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <PermivioPageHeader eyebrow="Checkout" title="Checkout" subtitle="Choose a report to get started." />
        <Link to="/tools" className="mt-6 inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft className="size-4" /> Back to Tools &amp; Reports
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PermivioPageHeader
        eyebrow="Checkout"
        title={product ? product.client_title : "Checkout"}
        subtitle="Review your order and pay securely. Your report is saved to your account and, when linked, to your project."
      />

      <Link to="/tools" className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Tools &amp; Reports
      </Link>

      {ctx.isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading your order…</p>}
      {!ctx.isLoading && !product && (
        <p className="mt-8 rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
          That report isn't available right now. Please choose another from Tools &amp; Reports.
        </p>
      )}

      {product && (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            {!clientSecret ? (
              <>
                <Section title="What you're ordering">
                  <p className="text-sm text-foreground">{product.description}</p>
                  {product.turnaround_estimate && (
                    <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="size-3.5" /> Typical turnaround: {product.turnaround_estimate}
                    </p>
                  )}
                </Section>

                <Section title="Delivery level">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["ai_assisted", "professional_review"] as DeliveryTier[]).map((t) => {
                      const disabled =
                        (t === "professional_review" && !product.supports_professional_review) ||
                        (t === "ai_assisted" && Boolean(product.professional_review_required));
                      const q = ctx.data?.quotes?.[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={disabled}
                          onClick={() => setTier(t)}
                          className={`rounded-2xl border p-4 text-left transition-colors disabled:opacity-40 ${
                            tier === t ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/40"
                          }`}
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            {t === "professional_review" ? <UserCheck className="size-4" /> : <Sparkles className="size-4" />}
                            {TIER_COPY[t].label}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">{TIER_COPY[t].blurb}</span>
                          <span className="mt-2 block text-sm font-semibold text-foreground">
                            {customQuote ? "Custom scope" : money(q?.total_cents ?? 0, product.currency)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {rushAmount ? (
                    <label className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-background/40 p-4 text-sm">
                      <input
                        type="checkbox"
                        checked={rush}
                        onChange={(e) => setRush(e.target.checked)}
                        className="mt-0.5 size-4 accent-[oklch(0.66_0.19_258)]"
                      />
                      <span>
                        <span className="font-medium text-foreground">Move me to the front of the queue</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Adds {money(rushAmount, product.currency)} for expedited handling.
                        </span>
                      </span>
                    </label>
                  ) : null}
                </Section>


                <Section title="Where this report belongs">
                  <label htmlFor="checkout-project" className="text-xs text-muted-foreground">
                    Link to a project (optional — you can attach it later)
                  </label>
                  <select
                    id="checkout-project"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="">Not linked to a project yet</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.location ? ` — ${p.location}` : ""}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="checkout-notes" className="mt-4 block text-xs text-muted-foreground">
                    Anything we should know about the site or scope?
                  </label>
                  <textarea
                    id="checkout-notes"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Address, intended use, target opening date, or anything unusual about the property."
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  />
                </Section>
              </>
            ) : (
              <Section title="Payment">
                <div id="payment-form">
                  <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret: async () => clientSecret }}>
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
              </Section>
            )}
          </div>

          {/* Order summary */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Order summary</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <Row label="Report" value={product.client_title} />
                <Row label="Delivery" value={TIER_COPY[tier].label} />
                <Row label="Project" value={projects.find((p) => p.id === projectId)?.name ?? "Not linked yet"} />
                <div className="space-y-2 border-t border-border pt-2">
                  {customQuote ? (
                    <Row
                      label="Scope & price"
                      value={
                        product.starting_price_cents
                          ? `Confirmed with you — from ${money(product.starting_price_cents, product.currency)}`
                          : "Confirmed with you before work begins"
                      }
                    />
                  ) : (
                    (quote?.lines ?? []).map((line) => (
                      <Row key={line.label} label={line.label} value={money(line.amount_cents, product.currency)} />
                    ))
                  )}
                </div>
                {!customQuote && (
                  <div className="border-t border-border pt-2">
                    <Row label="Total due today" value={money(amount, product.currency)} strong />
                  </div>
                )}
              </dl>


              {error && <p className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground">{error}</p>}

              {customQuote ? (
                quoteRequested ? (
                  <p className="mt-5 rounded-2xl border border-primary/40 bg-primary/10 p-3 text-xs text-foreground">
                    Scope request received. A Permivio permitting professional will confirm the scope and price with you
                    before any work or payment.
                  </p>
                ) : (
                  <button
                    onClick={requestScope}
                    disabled={busy}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    Request scope &amp; quote
                  </button>
                )
              ) : !clientSecret ? (
                <button
                  onClick={startPayment}
                  disabled={busy || amount <= 0}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                  Continue to payment
                </button>
              ) : null}

              {clientSecret && (
                <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="size-3.5" /> Card details are entered directly with our payment processor — Permivio never sees them.
                </p>
              )}
              <button
                onClick={() => navigate({ to: "/tools" })}
                className="mt-3 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            <p className="rounded-3xl border border-border bg-card/60 p-5 text-xs text-muted-foreground">{DISCLAIMER}</p>
          </aside>
        </div>
      )}
    </div>
  );
}

/** After Stripe returns, this polls the order until the verified payment lands. */
function OrderStatusView({ orderId }: { orderId: string }) {
  const fetchState = useServerFn(getOrderState);
  const q = useQuery({
    queryKey: ["order-state", orderId],
    queryFn: () => fetchState({ data: { order_id: orderId } }),
    refetchInterval: (query) => {
      const s = query.state.data?.order?.status;
      return !s || s === "payment_required" ? 3000 : false;
    },
  });
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const order = q.data?.order ?? null;
  const paid = order && order.status !== "payment_required";
  const professional = order?.delivery_tier === "professional_review";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PermivioPageHeader
        eyebrow="Order confirmed"
        title={paid ? "Thank you — your report is in production" : "Confirming your payment"}
        subtitle={
          paid
            ? "We've recorded your order. Here's exactly what happens next."
            : "This takes a few seconds while your payment is verified."
        }
      />

      <div className="mt-6 space-y-5">
        <section className="rounded-3xl border border-border bg-card p-6">
          {q.isLoading && <p className="text-sm text-muted-foreground">Loading your order…</p>}
          {!q.isLoading && !order && (
            <p className="text-sm text-muted-foreground">We couldn't find that order on your account. Check Tools &amp; Reports for your purchases.</p>
          )}
          {order && (
            <>
              <div className="flex items-start gap-3">
                {paid ? (
                  <CheckCircle2 className="mt-0.5 size-5 text-[oklch(0.78_0.15_155)]" />
                ) : (
                  <Loader2 className="mt-0.5 size-5 animate-spin text-primary" />
                )}
                <div>
                  <h2 className="text-base font-semibold text-foreground">{q.data?.product_title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {money(order.amount_cents, order.currency)} · {TIER_COPY[order.delivery_tier as DeliveryTier].label}
                    {order.rush ? " · expedited" : ""}
                    {q.data?.turnaround ? ` · typical turnaround ${q.data.turnaround}` : ""}
                  </p>
                </div>
              </div>

              {!paid && waited > 20 && (
                <p className="mt-4 rounded-2xl border border-border bg-background/40 p-3 text-xs text-muted-foreground">
                  Still confirming. If you completed payment, your order will appear under Tools &amp; Reports shortly — you can safely
                  leave this page.
                </p>
              )}

              {paid && (
                <ol className="mt-5 space-y-3 text-sm">
                  <Step done label="Payment received and your order recorded" />
                  <Step
                    done={Boolean((q.data?.versions ?? []).length)}
                    label={
                      order.project_id
                        ? "Research runs on your project and the findings are saved as your report"
                        : "Link this order to a project so we know which site to research"
                    }
                  />
                  <Step
                    done={Boolean(order.delivered_at)}
                    label={professional ? "A Permivio permitting professional reviews the findings before delivery" : "Report delivered to your project and reports library"}
                  />
                </ol>
              )}

              {paid && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {order.project_id ? (
                    <Link
                      to="/projects/$id"
                      params={{ id: order.project_id }}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                    >
                      <FileText className="size-4" /> Go to my project
                    </Link>
                  ) : (
                    <Link to="/projects" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                      <FileText className="size-4" /> Choose a project
                    </Link>
                  )}
                  <Link to="/tools" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm text-foreground">
                    View my tools &amp; reports
                  </Link>
                </div>
              )}
            </>
          )}
        </section>

        {(q.data?.versions ?? []).length > 0 && (
          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Delivered reports</h2>
            <ul className="mt-4 space-y-3">
              {(q.data?.versions ?? []).map((v) => (
                <li key={v.id} className="rounded-2xl border border-border bg-background/40 p-4">
                  <p className="text-sm font-medium text-foreground">
                    {v.title} <span className="text-muted-foreground">· v{v.version}</span>
                  </p>
                  {v.summary && <p className="mt-1 text-sm text-muted-foreground">{v.summary}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="rounded-3xl border border-border bg-card/60 p-5 text-xs text-muted-foreground">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

function Step({ done, label }: { done?: boolean; label: string }) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-4 text-[oklch(0.78_0.15_155)]" />
      ) : (
        <Clock className="mt-0.5 size-4 text-muted-foreground" />
      )}
      <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${strong ? "text-base font-semibold text-foreground" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}
