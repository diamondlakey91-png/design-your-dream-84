import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { getTier, isSubscriptionActive, tierHasFeature, type FeatureKey, type TierDef } from "@/lib/tiers";

interface SubscriptionRow {
  id: string;
  status: string;
  price_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface SubscriptionState {
  loading: boolean;
  row: SubscriptionRow | null;
  tier: TierDef | null;
  isActive: boolean;
  cancelPending: boolean;
  hasFeature: (f: FeatureKey) => boolean;
  isInWelcomeWindow: boolean; // first 7 days after most recent activation
  refetch: () => void;
}

export function useSubscription(): SubscriptionState {
  const [row, setRow] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        if (!cancelled) { setRow(null); setLoading(false); }
        return;
      }
      let env: "sandbox" | "live";
      try { env = getStripeEnvironment(); } catch { env = "sandbox"; }
      const { data } = await supabase
        .from("subscriptions")
        .select("id,status,price_id,current_period_start,current_period_end,cancel_at_period_end,created_at")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as SubscriptionRow | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  // Realtime: refetch on subscription changes for this user.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      channel = supabase
        .channel(`subs-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${userId}` },
          () => setNonce((n) => n + 1))
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const tier = getTier(row?.price_id);
  const isActive = isSubscriptionActive(row?.status, row?.current_period_end);
  const cancelPending = Boolean(row?.cancel_at_period_end);

  const activationTs = row?.current_period_start ? new Date(row.current_period_start).getTime() : row?.created_at ? new Date(row.created_at).getTime() : 0;
  const isInWelcomeWindow = isActive && activationTs > 0 && Date.now() - activationTs < 7 * 24 * 60 * 60 * 1000;

  return {
    loading,
    row,
    tier,
    isActive,
    cancelPending,
    hasFeature: (f) => isActive && tierHasFeature(tier, f),
    isInWelcomeWindow,
    refetch: () => setNonce((n) => n + 1),
  };
}
