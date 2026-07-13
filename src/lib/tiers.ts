// Shared tier definitions — safe to import from client and server.
// Keyed by Stripe price lookup_key (webhook resolves to this via lookup_key).

export type TierKey = "founding_monthly" | "starter_monthly" | "professional_monthly" | "business_monthly";

export interface TierDef {
  key: TierKey;
  name: string;
  rank: number; // higher = more powerful
  projectLimit: number | null; // null = unlimited
  features: {
    aiCopilot: boolean;
    planReview: boolean;
    docReader: boolean;
    liveJurisdictionSync: boolean;
  };
}

export const TIERS: Record<TierKey, TierDef> = {
  starter_monthly: {
    key: "starter_monthly",
    name: "Starter",
    rank: 1,
    projectLimit: 3,
    features: { aiCopilot: false, planReview: false, docReader: false, liveJurisdictionSync: true },
  },
  founding_monthly: {
    key: "founding_monthly",
    name: "Founding Member",
    rank: 2,
    projectLimit: 10,
    features: { aiCopilot: true, planReview: true, docReader: true, liveJurisdictionSync: true },
  },
  professional_monthly: {
    key: "professional_monthly",
    name: "Professional",
    rank: 3,
    projectLimit: 25,
    features: { aiCopilot: true, planReview: true, docReader: true, liveJurisdictionSync: true },
  },
  business_monthly: {
    key: "business_monthly",
    name: "Business",
    rank: 4,
    projectLimit: null,
    features: { aiCopilot: true, planReview: true, docReader: true, liveJurisdictionSync: true },
  },
};

export function getTier(priceId: string | null | undefined): TierDef | null {
  if (!priceId) return null;
  return (TIERS as Record<string, TierDef>)[priceId] ?? null;
}

// Subscription statuses that grant access.
export function isSubscriptionActive(status: string | null | undefined, currentPeriodEnd: string | null | undefined): boolean {
  if (!status) return false;
  const activeStatuses = ["active", "trialing", "past_due"];
  if (activeStatuses.includes(status)) {
    if (!currentPeriodEnd) return true;
    return new Date(currentPeriodEnd).getTime() > Date.now();
  }
  // Immediate revocation on cancel per product decision.
  return false;
}

export type FeatureKey = keyof TierDef["features"];

export function tierHasFeature(tier: TierDef | null, feature: FeatureKey): boolean {
  if (!tier) return false;
  return tier.features[feature];
}
