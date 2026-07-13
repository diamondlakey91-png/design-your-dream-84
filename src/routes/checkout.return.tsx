import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Checkout — Permivio" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="max-w-md w-full text-center bg-card ring-1 ring-black/5 rounded-2xl p-8">
        {session_id ? (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand/15 text-brand">
              <CheckCircle2 className="size-8" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold">Welcome to Permivio</h1>
            <p className="mt-2 text-muted-foreground">Your subscription is being activated. You can head to your dashboard now.</p>
            <Link to="/dashboard" className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground">
              Go to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">No session info</h1>
            <p className="mt-2 text-muted-foreground">If you completed payment, check your dashboard.</p>
            <Link to="/pricing" className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Back to pricing
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
