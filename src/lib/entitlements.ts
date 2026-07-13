// Server-side entitlement checks. Used inside createServerFn handlers.
// Reads the caller's most recent subscription row (env-scoped) and enforces
// tier limits from src/lib/tiers.ts (a client-safe module).
import { BETA_MODE, BETA_TIER, getTier, isSubscriptionActive, tierHasFeature, TIERS, type FeatureKey, type TierDef } from "@/lib/tiers";

type SupabaseCtx = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (
          col: string,
          val: string,
        ) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{
                data: {
                  status: string | null;
                  price_id: string | null;
                  current_period_end: string | null;
                } | null;
              }>;
            };
          };
        };
        eq2?: never;
      };
    };
  };
};

export interface Entitlement {
  isActive: boolean;
  tier: TierDef | null;
  hasFeature: (f: FeatureKey) => boolean;
  projectLimit: number | null;
}

function envFromSecret(): "sandbox" | "live" {
  // Best-effort: infer from Stripe key names. Server has both possibly.
  if (process.env.STRIPE_LIVE_API_KEY && !process.env.STRIPE_SANDBOX_API_KEY) return "live";
  return "sandbox";
}

export async function getEntitlement(
  supabase: unknown,
  userId: string,
): Promise<Entitlement> {
  if (BETA_MODE) {
    return {
      isActive: true,
      tier: BETA_TIER,
      hasFeature: () => true,
      projectLimit: null,
    };
  }
  // Loosely typed to avoid Database import churn.
  const sb = supabase as SupabaseCtx;
  const env = envFromSecret();
  const { data } = await sb
    .from("subscriptions")
    .select("status, price_id, current_period_end")
    .eq("user_id", userId)
    .eq("environment", env)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tier = getTier(data?.price_id ?? null);
  const isActive = isSubscriptionActive(data?.status ?? null, data?.current_period_end ?? null);
  return {
    isActive,
    tier,
    hasFeature: (f) => isActive && tierHasFeature(tier, f),
    projectLimit: tier ? tier.projectLimit : 0, // no sub => 0 (blocks creation)
  };
}


const FEATURE_LABEL: Record<FeatureKey, string> = {
  aiCopilot: "AI Copilot",
  planReview: "AI Plan Review",
  docReader: "AI Document Reader",
  liveJurisdictionSync: "Live Jurisdiction Sync",
};

export function requireFeature(ent: Entitlement, feature: FeatureKey): void {
  if (ent.hasFeature(feature)) return;
  if (!ent.isActive) {
    throw new Error(`${FEATURE_LABEL[feature]} requires an active subscription. Choose a plan on the Pricing page.`);
  }
  // Find the minimum tier that offers this feature.
  const min = Object.values(TIERS)
    .filter((t) => t.features[feature])
    .sort((a, b) => a.rank - b.rank)[0];
  throw new Error(`${FEATURE_LABEL[feature]} is available on ${min?.name ?? "a higher"} plan and above. Upgrade to unlock.`);
}

export async function requireProjectQuota(
  supabase: unknown,
  userId: string,
  ent: Entitlement,
): Promise<void> {
  if (!ent.isActive || !ent.tier) {
    throw new Error("Creating projects requires an active subscription. Choose a plan on the Pricing page.");
  }
  const limit = ent.projectLimit;
  if (limit === null) return; // unlimited
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string, opts: { count: "exact"; head: true }) => {
        eq: (col: string, val: string) => Promise<{ count: number | null }>;
      };
    };
  };
  const { count } = await sb.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const used = count ?? 0;
  if (used >= limit) {
    throw new Error(`Your ${ent.tier.name} plan allows ${limit} projects (you have ${used}). Upgrade to add more.`);
  }
}
