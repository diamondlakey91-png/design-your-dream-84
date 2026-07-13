import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Sparkles, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Permivio" },
      { name: "description", content: "Simple, transparent pricing for permit expediters, contractors, architects, and enterprise teams. Starter $49, Professional $149, Business $399. Founding Member $99 for the first 50." },
      { property: "og:title", content: "Pricing — Permivio" },
      { property: "og:description", content: "Simple, transparent pricing for permit expediters, contractors, and enterprise teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

type Tier = {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  audience: string[];
  features: string[];
  cta: string;
  href: string;
  priceId?: string;
  featured?: boolean;
  badge?: string;
};

const FOUNDING_SEATS = 50;
const FOUNDING_TAKEN = 12; // placeholder — wire to Stripe later

const founding: Tier = {
  name: "Founding Member",
  price: "$99",
  cadence: "/month",
  tagline: "First 50 customers only. Lifetime discounted pricing while subscribed.",
  audience: ["Beta launch supporters"],
  features: [
    "Up to 10 active projects",
    "Up to 3 users",
    "AI Assistant + AI Copilot add-on",
    "Project dashboard & permit roadmap",
    "Document storage & weekly status reports",
    "Locked-in pricing for life",
  ],
  cta: "Claim Founding seat",
  href: "/auth",
  priceId: "founding_monthly",
  badge: "LIMITED",
};

const tiers: Tier[] = [
  {
    name: "Starter",
    price: "$49",
    cadence: "/month",
    tagline: "For solo expediters and small contractors.",
    audience: ["Independent permit expediters", "Small contractors", "Consultants"],
    features: [
      "5 active projects",
      "1 user",
      "Basic AI assistance",
      "Document storage",
      "Task management",
    ],
    cta: "Start with Starter",
    href: "/auth",
    priceId: "starter_monthly",
  },
  {
    name: "Professional",
    price: "$149",
    cadence: "/month",
    tagline: "The sweet spot for growing firms managing many permits.",
    audience: ["General contractors", "Architecture firms", "Engineering firms"],
    features: [
      "25 active projects",
      "5 users",
      "Unlimited permit roadmaps",
      "AI document summaries",
      "Review-cycle tracking",
      "Client reporting",
      "Notifications & priority support",
    ],
    cta: "Choose Professional",
    href: "/auth",
    featured: true,
    badge: "MOST POPULAR",
  },
  {
    name: "Business",
    price: "$399",
    cadence: "/month",
    tagline: "For regional teams running portfolios of active projects.",
    audience: ["Regional contractors", "Franchise development", "Developers"],
    features: [
      "100 active projects",
      "15 users",
      "Portfolio dashboard",
      "Advanced permissions",
      "Analytics",
      "Team collaboration",
      "API access (coming soon)",
      "Enhanced AI usage",
    ],
    cta: "Go Business",
    href: "/auth",
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    tagline: "National brands, developers, and large construction firms.",
    audience: ["National restaurant brands", "Large developers", "Enterprise firms"],
    features: [
      "Unlimited users",
      "Single sign-on (SSO)",
      "Custom integrations",
      "Dedicated support",
      "SLAs",
      "Implementation & training",
    ],
    cta: "Talk to sales",
    href: "mailto:sales@permivio.com",
  },
];

const services = [
  { name: "Team onboarding", price: "$500–$2,000" },
  { name: "Data migration", price: "$500–$5,000" },
  { name: "Custom workflows", price: "$1,000+" },
  { name: "Premium training", price: "$250–$1,500" },
  { name: "Annual health check", price: "$500" },
];

function PricingPage() {
  const seatsLeft = Math.max(0, FOUNDING_SEATS - FOUNDING_TAKEN);
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
          Get started <ArrowRight className="size-4" />
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        {/* Hero */}
        <section className="pt-8 pb-14 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Pricing</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight">
            Priced for the permits — not the permits department.
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
            One clear price per team size. No per-jurisdiction fees, no add-on bloat.
            Every plan includes the AI Assistant and permit roadmap out of the box.
          </p>
        </section>

        {/* Founding Member */}
        <section className="mb-16">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand/15 via-brand/5 to-transparent ring-1 ring-brand/30 p-6 md:p-8">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand text-brand-foreground text-[10px] font-mono uppercase tracking-widest px-2 py-1">
                    <Sparkles className="size-3" /> {founding.badge}
                  </span>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-brand">
                    {seatsLeft} of {FOUNDING_SEATS} seats left
                  </span>
                </div>
                <h2 className="mt-3 text-2xl md:text-3xl font-semibold">{founding.name}</h2>
                <p className="mt-1 text-muted-foreground max-w-lg">{founding.tagline}</p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-semibold">
                  {founding.price}<span className="text-base font-normal text-muted-foreground">{founding.cadence}</span>
                </div>
                <Link to={founding.href} className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground">
                  {founding.cta} <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {founding.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="size-4 text-brand mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {/* Seats gauge */}
            <div className="mt-6">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-brand" style={{ width: `${(FOUNDING_TAKEN / FOUNDING_SEATS) * 100}%` }} />
              </div>
            </div>
          </div>
        </section>

        {/* Public tiers */}
        <section aria-labelledby="public-pricing">
          <h2 id="public-pricing" className="sr-only">Public pricing</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={`relative flex flex-col rounded-2xl p-6 ring-1 ${
                  t.featured
                    ? "bg-card ring-brand shadow-lg shadow-brand/10"
                    : "bg-card ring-black/5"
                }`}
              >
                {t.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-brand text-brand-foreground text-[10px] font-mono uppercase tracking-widest px-2 py-1">
                    <Star className="size-3" /> {t.badge}
                  </span>
                )}
                <h3 className="text-lg font-semibold">{t.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground min-h-[2.5rem]">{t.tagline}</p>
                <div className="mt-4">
                  <span className="text-3xl font-semibold">{t.price}</span>
                  <span className="text-sm text-muted-foreground">{t.cadence}</span>
                </div>

                <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">For</p>
                <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                  {t.audience.map((a) => <li key={a}>· {a}</li>)}
                </ul>

                <ul className="mt-5 space-y-2 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="size-4 text-brand mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {t.href.startsWith("mailto:") ? (
                  <a
                    href={t.href}
                    className={`mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${
                      t.featured ? "bg-brand text-brand-foreground" : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {t.cta}
                  </a>
                ) : (
                  <Link
                    to={t.href}
                    className={`mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${
                      t.featured ? "bg-brand text-brand-foreground" : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {t.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Copilot add-on */}
        <section className="mt-20">
          <div className="rounded-2xl bg-card ring-1 ring-black/5 p-6 md:p-8">
            <div className="flex items-start gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-brand/15 text-brand">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Add-on</p>
                <h2 className="text-2xl font-semibold">Permivio AI Copilot</h2>
                <p className="mt-1 text-muted-foreground max-w-2xl">
                  Drafts client updates, summarizes reviewer comments across your document vault,
                  generates meeting agendas, flags schedule risks, and answers project questions in seconds.
                </p>
              </div>
            </div>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                "Drafts client updates",
                "Summarizes reviewer comments",
                "Generates meeting agendas",
                "Suggests next actions",
                "Flags schedule risks",
                "Answers project questions",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="size-4 text-brand mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-muted-foreground">
              Included with Founding Member and Professional and above. Available as an add-on for Starter.
            </p>
          </div>
        </section>

        {/* Professional services */}
        <section className="mt-16">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-center">Professional services</p>
          <h2 className="mt-2 text-2xl font-semibold text-center">Optional services that get you productive faster.</h2>
          <div className="mt-6 rounded-2xl bg-card ring-1 ring-black/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground py-3 px-5">Service</th>
                  <th className="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground py-3 px-5">Price</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s, i) => (
                  <tr key={s.name} className={i > 0 ? "border-t border-border" : ""}>
                    <td className="py-3 px-5">{s.name}</td>
                    <td className="py-3 px-5 text-right font-mono text-xs text-muted-foreground">{s.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-center">Common questions</h2>
          <div className="mt-6 space-y-3">
            {[
              { q: "What counts as an 'active project'?", a: "A project with any activity — checklist items, deadlines, or documents — in the last 60 days. Archived projects don't count." },
              { q: "Can I cancel anytime?", a: "Yes. Monthly plans cancel at the end of the billing period. Founding Member pricing is locked in for as long as you keep the subscription." },
              { q: "Is there a free trial?", a: "You can start on Starter and upgrade whenever you outgrow it. Founding Member spots are limited to the first 50 customers." },
              { q: "Do you support jurisdictions outside the US?", a: "Today we're focused on US municipal permitting across 20,000+ jurisdictions. International support is on the Enterprise roadmap." },
            ].map((item) => (
              <details key={item.q} className="rounded-xl bg-card ring-1 ring-black/5 p-4">
                <summary className="cursor-pointer text-sm font-medium">{item.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-20 text-center">
          <h2 className="text-3xl font-semibold">Ready to close out your next permit faster?</h2>
          <Link
            to="/auth"
            className="mt-5 inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-6 text-base font-semibold text-brand-foreground"
          >
            Get started <ArrowRight className="size-4" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Permivio</span>
          <Link to="/" className="hover:text-foreground">Home</Link>
        </div>
      </footer>
    </div>
  );
}
