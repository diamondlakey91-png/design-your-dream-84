import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, X, AlertCircle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

const DISMISS_KEY = "permivio.welcomeBanner.dismissed";

export function WelcomeBanner() {
  const { loading, tier, isActive, isInWelcomeWindow, cancelPending } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { /* noop */ }
  }, []);

  if (loading) return null;

  // 1. No active subscription — show subscribe prompt
  if (!isActive) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="flex-1">
          <div className="font-medium text-foreground">Read-only mode</div>
          <div className="text-muted-foreground">Choose a plan to create projects and unlock AI Copilot, Plan Review, and Doc Reader.</div>
        </div>
        <Link to="/pricing" className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground">See plans</Link>
      </div>
    );
  }

  // 2. Cancel pending — inform end date
  if (cancelPending) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <div className="font-medium">Subscription ending</div>
          <div className="text-muted-foreground">Your {tier?.name ?? "plan"} is set to cancel at period end.</div>
        </div>
      </div>
    );
  }

  // 3. Welcome window — first 7 days after activation
  if (isInWelcomeWindow && !dismissed && tier) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-brand/40 bg-brand/10 p-3 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="flex-1">
          <div className="font-medium text-foreground">Welcome to {tier.name}</div>
          <div className="text-muted-foreground">
            {tier.projectLimit === null ? "Unlimited projects" : `${tier.projectLimit} projects`}
            {tier.features.aiCopilot ? " · AI Copilot" : ""}
            {tier.features.planReview ? " · Plan Review" : ""}
            {tier.features.docReader ? " · Doc Reader" : ""}
            {" "}unlocked.
          </div>
        </div>
        <button
          onClick={() => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ } setDismissed(true); }}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return null;
}
