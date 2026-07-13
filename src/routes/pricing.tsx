import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, Check } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Permivio" },
      { name: "description", content: "Permivio is free during our beta. Every feature — AI Assistant, Plan Review, Live Permit Tracking, Copilot — is unlocked for early users. Paid plans return at launch." },
      { property: "og:title", content: "Free during beta — Permivio" },
      { property: "og:description", content: "Permivio is free for all early users during beta. Paid plans return at launch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

const betaFeatures = [
  "Unlimited active projects",
  "AI Assistant with jurisdiction-specific answers",
  "AI Plan Review with redlined PDFs",
  "AI Copilot: drafts, agendas, risk flags",
  "Live permit tracking by permit number",
  "Document vault, deadlines, inspection mode",
  "Shareable PermitHealth reports",
];

function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-brand">
            <div className="size-4 rounded-sm border-2 border-ink/30" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Permivio</span>
        </Link>
        <Link
          to="/auth"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground"
        >
          Get started free <ArrowRight className="size-4" />
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <section className="pt-8 pb-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 text-brand text-[11px] font-mono uppercase tracking-widest px-3 py-1.5">
            <Sparkles className="size-3.5" /> Beta
          </span>
          <h1 className="mt-5 text-4xl md:text-5xl font-semibold tracking-tight">
            Free while we're in beta.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Permivio is pre-launch. Every feature is unlocked free for early users —
            no credit card, no plan to pick. Paid plans return when we go live.
          </p>
        </section>

        <section className="rounded-2xl bg-gradient-to-br from-brand/15 via-brand/5 to-transparent ring-1 ring-brand/30 p-6 md:p-8">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-brand">Beta access</div>
              <h2 className="mt-2 text-2xl md:text-3xl font-semibold">Everything, unlocked</h2>
              <p className="mt-1 text-muted-foreground">Full product access for every signed-up user.</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-semibold">
                $0<span className="text-base font-normal text-muted-foreground">/mo</span>
              </div>
              <Link
                to="/auth"
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground"
              >
                Join the beta <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {betaFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="size-4 text-brand mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          We'll email you before any plan pricing goes into effect. Early users get a founding-member discount at launch.
        </p>
      </main>
    </div>
  );
}
