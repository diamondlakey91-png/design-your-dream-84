import { Check, Clock, Sparkles, UserCheck } from "lucide-react";
import {
  money,
  RECOMMENDATION_LABEL,
  TIER_COPY,
  type DeliveryTier,
  type Recommendation,
  type ServiceProduct,
} from "@/lib/toolsCatalog";

const TONE: Record<Recommendation, string> = {
  recommended: "border-primary/45 bg-primary/10 text-primary",
  completed: "border-[oklch(0.75_0.16_155)]/40 bg-[oklch(0.75_0.16_155)]/10 text-[oklch(0.82_0.15_155)]",
  available: "border-border bg-secondary/60 text-muted-foreground",
  later: "border-border bg-secondary/60 text-muted-foreground",
};

export function ServiceProductCard({
  product,
  recommendation,
  onBuy,
  onFullService,
  purchasedTier,
}: {
  product: ServiceProduct;
  recommendation: Recommendation;
  onBuy: (tier: DeliveryTier) => void;
  onFullService: () => void;
  purchasedTier?: DeliveryTier | null;
}) {
  const deliverables = Array.isArray(product.deliverables) ? (product.deliverables as string[]) : [];
  const proPrice = product.professional_review_price_cents;

  return (
    <article className="flex flex-col rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {product.client_question && (
            <p className="text-sm font-medium text-primary">“{product.client_question}”</p>
          )}
          <h3 className="mt-1 text-lg font-semibold text-foreground">{product.client_title}</h3>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${TONE[recommendation]}`}>
          {RECOMMENDATION_LABEL[recommendation]}
        </span>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{product.description}</p>

      {deliverables.length > 0 && (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {deliverables.slice(0, 6).map((d) => (
            <li key={d} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" /> {d}
            </li>
          ))}
          {deliverables.length > 6 && (
            <li className="text-xs text-muted-foreground/80">+ {deliverables.length - 6} more items</li>
          )}
        </ul>
      )}

      {product.turnaround_estimate && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" /> Typical turnaround: {product.turnaround_estimate}
        </p>
      )}

      <div className="mt-5 space-y-2 border-t border-border pt-4">
        <TierRow
          icon={<Sparkles className="size-4 text-primary" />}
          tier="ai_assisted"
          price={money(product.base_price_cents, product.currency)}
          purchased={purchasedTier === "ai_assisted"}
          onBuy={() => onBuy("ai_assisted")}
        />
        {product.supports_professional_review && proPrice ? (
          <TierRow
            icon={<UserCheck className="size-4 text-primary" />}
            tier="professional_review"
            price={money(proPrice, product.currency)}
            purchased={purchasedTier === "professional_review"}
            onBuy={() => onBuy("professional_review")}
          />
        ) : null}
      </div>

      <button
        onClick={onFullService}
        className="mt-4 w-full rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        Have Permivio handle this project
      </button>
    </article>
  );
}

function TierRow({
  icon,
  tier,
  price,
  purchased,
  onBuy,
}: {
  icon: React.ReactNode;
  tier: DeliveryTier;
  price: string;
  purchased: boolean;
  onBuy: () => void;
}) {
  const copy = TIER_COPY[tier];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {icon} {copy.label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.blurb}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-foreground">{price}</p>
        <button
          onClick={onBuy}
          className="mt-1 inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {purchased ? "Buy again" : tier === "professional_review" ? "Add review" : "Buy report"}
        </button>
      </div>
    </div>
  );
}
