import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Building2, CheckCircle2, ClipboardList, MapPinCheck, Sparkles, Zap } from "lucide-react";
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
    links: [
      { rel: "preload", as: "image", href: heroAsset.url, fetchpriority: "high" },
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
            className="hidden text-sm font-medium text-slate-200 hover:text-white sm:inline"
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

      <main>
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

        <p className="mx-auto mt-6 max-w-3xl text-pretty text-base text-slate-300 md:text-lg">
          From property research to permit approval — know what your project needs, what comes next, and what could
          hold it up.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-6 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.6)]"
          >
            Start a project <ArrowRight className="size-4" />
          </Link>
          <Link
            to="/demo"
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-blue-500/30 bg-white/5 px-6 text-sm font-medium text-blue-100 backdrop-blur transition hover:bg-white/10"
          >
            <Play className="size-4" /> View demo
          </Link>
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
            width={2400}
            height={1400}
            decoding="async"
            fetchPriority="high"
          />
        </div>
      </section>

      {/* Feature strip */}
      <section
        id="features"
        className="relative border-y border-blue-500/20 bg-gradient-to-b from-blue-950/20 via-transparent to-blue-950/20"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50rem 30rem at 20% 50%, rgba(59,130,246,0.15), transparent 60%), radial-gradient(50rem 30rem at 80% 50%, rgba(139,92,246,0.10), transparent 60%)",
          }}
        />
        <div className="mx-auto grid max-w-7xl gap-px bg-blue-500/15 md:grid-cols-3">
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
            <div
              key={f.title}
              className="group relative bg-[#04070f]/80 p-8 backdrop-blur transition hover:bg-[#050b1a]"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent opacity-0 transition group-hover:opacity-100"
              />
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/25 to-blue-700/10 text-blue-300 ring-1 ring-blue-500/40 shadow-[0_0_20px_-4px_rgba(59,130,246,0.5)]">
                <f.icon className="size-5" />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-blue-400/80">
                {f.label}
              </p>
              <h3 className="mt-2 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-lg font-semibold text-transparent">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance Depth */}
      <section className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-blue-400/80">
            Compliance depth
          </p>
          <h2 className="mt-3 bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
            Research a reviewer will respect.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-blue-200/70">
            Permivio runs multi-department research on every project — grounded in the exact jurisdiction, cited to code.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: MapPinCheck,
              tint: "from-blue-500/25 to-blue-700/10 text-blue-300 ring-blue-500/40 shadow-[0_0_30px_-8px_rgba(59,130,246,0.55)]",
              title: "Verified Jurisdiction Identification",
              body: "Automatic detection of the correct building department — not just city or county, but the exact jurisdiction responsible for your project location.",
              chip: {
                label: "Example",
                text: 'Identifies "Pikes Peak Regional Building Department" instead of just "Colorado Springs".',
              },
            },
            {
              icon: Building2,
              tint: "from-violet-500/25 to-fuchsia-700/10 text-violet-300 ring-violet-500/40 shadow-[0_0_30px_-8px_rgba(139,92,246,0.55)]",
              title: "Multi-Department Research",
              body: "Comprehensive research across every relevant department in one report: building, health, fire, and ADA compliance requirements.",
              bullets: [
                "Building Department (structural)",
                "Health Department (sanitation)",
                "Fire Department (safety)",
                "ADA Compliance (accessibility)",
              ],
            },
            {
              icon: BookOpen,
              tint: "from-cyan-500/25 to-teal-700/10 text-cyan-300 ring-cyan-500/40 shadow-[0_0_30px_-8px_rgba(34,211,238,0.55)]",
              title: "Code Citations & References",
              body: "Direct references to IPC, ADA, FDA Food Code, and local amendments — with specific section numbers for easy verification.",
              chip: {
                label: "Citations include",
                text: "International Plumbing Code (IPC) · 2010 ADA Standards · FDA Food Code · Local jurisdiction amendments.",
              },
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-blue-500/15 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-7 backdrop-blur transition hover:border-blue-500/30"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent opacity-0 transition group-hover:opacity-100"
              />
              <div
                className={`mb-5 inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${f.tint}`}
              >
                <f.icon className="size-5" />
              </div>
              <h3 className="bg-gradient-to-r from-white to-blue-100 bg-clip-text text-lg font-semibold text-transparent">
                {f.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.body}</p>

              {f.bullets && (
                <ul className="mt-5 space-y-2 text-sm text-blue-100/80">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {f.chip && (
                <div className="mt-5 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
                    {f.chip.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-blue-100/75">{f.chip.text}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Why Permivio is different */}
      <section className="relative border-t border-blue-500/10 py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50rem 30rem at 50% 20%, rgba(59,130,246,0.12), transparent 60%), radial-gradient(40rem 30rem at 50% 100%, rgba(139,92,246,0.10), transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-blue-400/80">
              Why Permivio
            </p>
            <h2 className="mt-3 bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
              Permitting intelligence — not just permit search.
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: MapPinCheck,
                title: "Exact property intelligence",
                body: "Permivio works from the actual project property, jurisdiction, proposed use, and scope — not just generic ZIP-code information.",
              },
              {
                icon: Route,
                title: "From feasibility to CO",
                body: "Site Investigation → Project Setup → Permit Roadmap → Plans → QA/QC → Submission → Corrections → Utilities → Inspections → Certificate of Occupancy.",
              },
              {
                icon: Layers,
                title: "Plans + permits together",
                body: "Permivio connects plan intelligence with jurisdiction and permitting requirements.",
              },
              {
                icon: Sparkles,
                title: "Project-specific AI",
                body: "The AI uses the project address, scope, jurisdiction, documents, and current project information rather than asking you to explain the project again and again.",
              },
              {
                icon: Users,
                title: "Client-friendly project management",
                body: "Clients see what is happening, what happens next, and what they need to do — while detailed technical information stays available for professionals.",
              },
              {
                icon: ShieldCheck,
                title: "Verified vs AI-assisted",
                body: "Important findings clearly distinguish verified, AI-assisted, and needs-confirmation items, so nothing is mistaken for a final agency determination.",
              },
            ].map((d) => (
              <div
                key={d.title}
                className="group relative overflow-hidden rounded-2xl border border-blue-500/15 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-7 backdrop-blur transition hover:border-blue-500/30"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent opacity-0 transition group-hover:opacity-100"
                />
                <div className="mb-5 inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/25 to-blue-700/10 text-blue-300 ring-1 ring-blue-500/40">
                  <d.icon className="size-5" />
                </div>
                <h3 className="bg-gradient-to-r from-white to-blue-100 bg-clip-text text-lg font-semibold text-transparent">
                  {d.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo preview */}
      <section className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-blue-400/80">See it in action</p>
          <h2 className="mt-3 bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
            Watch a project move from address to approval.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-blue-200/70">
            A short walkthrough of a sample restaurant conversion — intake, feasibility, roadmap, plan review,
            corrections, and the path to Certificate of Occupancy.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-3xl border border-blue-500/15 bg-gradient-to-b from-white/[0.05] to-white/[0.01] backdrop-blur">
          <div className="flex items-center gap-2 border-b border-blue-500/10 px-4 py-2.5">
            <PermivioMark className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-blue-300/80">Product demo</span>
            <span className="ml-auto rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-200">
              Sample project
            </span>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-3">
            {[
              { k: "Property", v: "1420 Main Street" },
              { k: "Project", v: "Restaurant tenant improvement" },
              { k: "Result", v: "7 likely approvals · 3 documents needed" },
            ].map((c) => (
              <div key={c.k} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{c.k}</p>
                <p className="mt-1 text-sm text-white">{c.v}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-blue-500/10 px-6 py-5 text-center">
            <Link
              to="/demo"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-6 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.6)]"
            >
              <Play className="size-4" /> View full demo
            </Link>
            <p className="mt-3 text-xs text-slate-500">
              Illustrative sample content for a fictional project — not client data.
            </p>
          </div>
        </div>
      </section>

      {/* Tools & Reports */}
      <section className="relative border-y border-blue-500/15 bg-gradient-to-b from-blue-950/20 via-transparent to-blue-950/20">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent md:text-3xl">
            Need help with only one part of your project?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-blue-200/70">
            Purchase individual reports and tools, or let Permivio manage the full permitting process.
          </p>
          <div className="mt-8">
            <Link
              to="/auth"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-blue-500/30 bg-white/5 px-6 text-sm font-medium text-blue-100 backdrop-blur transition hover:bg-white/10"
            >
              Explore tools &amp; reports <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>


      {/* CTA band */}
      <section className="relative overflow-hidden">

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50rem 30rem at 50% 100%, rgba(59,130,246,0.25), transparent 60%), radial-gradient(40rem 30rem at 50% 0%, rgba(139,92,246,0.15), transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="bg-gradient-to-b from-white via-blue-100 to-blue-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
            Know the path. Clear the way.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-blue-200/70 md:text-lg">
            From site feasibility and plan review through permitting and final approval, Permivio keeps every project
            moving with clarity.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-6 text-sm font-semibold text-white shadow-[0_10px_40px_-8px_rgba(59,130,246,0.7)]"
            >
              Start your project <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        </section>
      </main>

      <footer className="relative border-t border-blue-500/10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"
        />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-10 font-mono text-[11px] uppercase tracking-[0.25em] text-blue-300/90">
          <div className="flex items-center gap-2.5">
            <PermivioMark className="h-5 w-5" />
            <span>© Permivio</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/site-investigation" className="transition hover:text-blue-100">
              Site Investigation Reports
            </Link>
            <span>Intelligent Permitting.</span>
          </div>
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
