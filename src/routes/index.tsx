import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ClipboardList, Sparkles } from "lucide-react";
import heroAsset from "@/assets/permivio-hero.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Permivio — Intelligent Permitting. Faster Approvals." },
      {
        name: "description",
        content:
          "Permivio is the AI permit operating system: track every application, deadline, and jurisdiction requirement across all your projects.",
      },
      { property: "og:title", content: "Permivio — Intelligent Permitting. Faster Approvals." },
      {
        property: "og:description",
        content:
          "AI permit assistant, 20,000+ U.S. jurisdictions, live portal tracking, review-cycle intelligence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#04070f] text-foreground">
      {/* Ambient glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70rem 45rem at 50% -10%, rgba(59,130,246,0.28), transparent 60%), radial-gradient(50rem 40rem at 10% 30%, rgba(37,99,235,0.18), transparent 60%), radial-gradient(50rem 40rem at 100% 20%, rgba(139,92,246,0.12), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent"
      />

      {/* Nav */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <PermivioMark className="h-8 w-8" />
          <span className="bg-gradient-to-r from-blue-300 via-blue-400 to-blue-600 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            PERMIVIO
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            className="hidden text-sm font-medium text-slate-400 hover:text-white sm:inline"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-4 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.6)] transition hover:shadow-[0_10px_40px_-4px_rgba(59,130,246,0.8)]"
          >
            Get started <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pt-8 pb-16 text-center md:pt-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-blue-400/80">
          AI Permit Operating System
        </p>

        <div className="mt-8 flex items-center justify-center gap-4 md:gap-6">
          <PermivioMark className="h-16 w-16 md:h-24 md:w-24" />
          <h1 className="bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-8xl">
            PERMIVIO
            <sup className="ml-1 text-base text-blue-300/80 md:text-xl">™</sup>
          </h1>
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg font-light uppercase tracking-[0.18em] text-blue-200/80 md:text-xl">
          Intelligent Permitting. Faster Approvals. Stronger Projects.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-6 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.6)]"
          >
            Start a project <ArrowRight className="size-4" />
          </Link>
          <a
            href="#features"
            className="inline-flex h-12 items-center rounded-lg border border-blue-500/30 bg-white/5 px-6 text-sm font-medium text-blue-100 backdrop-blur transition hover:bg-white/10"
          >
            See how it works
          </a>
        </div>

        {/* Device mockup */}
        <div className="relative mx-auto mt-16 max-w-6xl">
          <div
            aria-hidden
            className="absolute -inset-8 -z-10 rounded-[2rem] bg-gradient-to-b from-blue-500/20 via-blue-600/10 to-transparent blur-3xl"
          />
          <img
            src={heroAsset.url}
            alt="Permivio dashboard on desktop, tablet, and mobile showing project health, permit assistant, and jurisdiction library."
            className="w-full rounded-2xl"
            loading="eager"
          />
        </div>
      </section>

      {/* Feature strip */}
      <section
        id="features"
        className="border-y border-blue-500/10 bg-gradient-to-b from-white/[0.02] to-transparent"
      >
        <div className="mx-auto grid max-w-7xl gap-px bg-blue-500/10 md:grid-cols-3">
          {[
            {
              icon: ClipboardList,
              label: "PIPELINE",
              title: "Every stage on one wall.",
              body: "Pre-planning through issuance — with the exact next action highlighted.",
            },
            {
              icon: Sparkles,
              label: "AI ASSIST",
              title: "Reads the local code.",
              body: "Tell the assistant your project and jurisdiction; it returns the permits you actually need.",
            },
            {
              icon: CheckCircle2,
              label: "DEADLINES",
              title: "Never miss a resubmit.",
              body: "Every deadline surfaces on the dashboard, sorted by urgency.",
            },
          ].map((f) => (
            <div key={f.title} className="bg-[#04070f] p-8">
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30">
                <f.icon className="size-5" />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-blue-400/70">
                {f.label}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">
          <span>© Permivio</span>
          <span>Intelligent Permitting.</span>
        </div>
      </footer>
    </div>
  );
}

function PermivioMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="permivioGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <path
        d="M14 8 L14 56 L24 56 L24 40 L34 40 C44 40 52 32 52 22 C52 14 46 8 36 8 Z M24 18 L34 18 C39 18 42 20 42 24 C42 28 39 30 34 30 L24 30 Z"
        fill="url(#permivioGrad)"
      />
    </svg>
  );
}
