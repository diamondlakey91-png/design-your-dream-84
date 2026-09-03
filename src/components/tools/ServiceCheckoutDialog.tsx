import { useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createServiceOrder } from "@/lib/toolsReports.functions";
import { DISCLAIMER, TIER_COPY, money, type DeliveryTier, type ProjectLite, type ServiceProduct } from "@/lib/toolsCatalog";

/** Order summary + secure Stripe checkout for a single service purchase. */
export function ServiceCheckoutDialog({
  product,
  tier,
  project,
  onClose,
}: {
  product: ServiceProduct;
  tier: DeliveryTier;
  project: ProjectLite | null;
  onClose: () => void;
}) {
  const createOrder = useServerFn(createServiceOrder);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount =
    tier === "professional_review"
      ? product.professional_review_price_cents ?? product.base_price_cents
      : product.base_price_cents;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createOrder({
        data: {
          productId: product.id,
          projectId: project?.id ?? null,
          deliveryTier: tier,
          rush: false,
          returnUrl: `${window.location.origin}/tools`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) setError(res.error);
      else setClientSecret(res.clientSecret);
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("not configured")
          ? "Payment provider integration required — checkout is not enabled for this build yet."
          : "We couldn't open checkout. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{product.client_title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{TIER_COPY[tier].label}</p>
          </div>
          <button onClick={onClose} aria-label="Close checkout" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {!clientSecret && (
          <>
            <dl className="mt-5 space-y-2 rounded-2xl border border-border bg-background/40 p-4 text-sm">
              <Row label="Project" value={project ? project.name : "Not linked to a project yet"} />
              <Row label="Service" value={product.client_title} />
              <Row label="Delivery" value={TIER_COPY[tier].label} />
              <Row label="Total" value={money(amount, product.currency)} strong />
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">{DISCLAIMER}</p>
            {error && (
              <p className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground">{error}</p>
            )}
            <button
              onClick={start}
              disabled={busy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Proceed to payment
            </button>
          </>
        )}

        {clientSecret && (
          <div className="mt-5">
            <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret: async () => clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}
