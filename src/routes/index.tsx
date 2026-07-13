import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ClipboardList, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-brand">
            <div className="size-4 rounded-sm border-2 border-ink/30" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Permivio</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/auth" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
            Sign in
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground"
          >
            Get started <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-20 md:pt-20">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          V.03 / SITE_READY
        </p>
        <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          Permit intelligence, built for people on job sites.
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground md:text-lg">
          Permivio tracks every application, deadline, and jurisdiction requirement across
          your projects — with an AI assistant that reads the code so you don't have to.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-6 text-sm font-semibold text-brand-foreground"
          >
            Start a project <ArrowRight className="size-4" />
          </Link>
          <a
            href="#features"
            className="inline-flex h-12 items-center rounded-lg border border-border bg-card px-6 text-sm font-medium"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* Feature strip */}
      <section id="features" className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-px bg-border md:grid-cols-3">
          {[
            { icon: ClipboardList, label: "PIPELINE", title: "Every stage on one wall.", body: "Pre-planning through issuance, always in view — with the exact next action highlighted." },
            { icon: Sparkles, label: "AI ASSIST", title: "Reads the local code.", body: "Tell the assistant your project and jurisdiction; it returns the permits you actually need." },
            { icon: CheckCircle2, label: "DEADLINES", title: "Never miss a resubmit.", body: "Every deadline surfaces on the dashboard, sorted by urgency. Field-tested, quiet." },
          ].map((f) => (
            <div key={f.title} className="bg-background p-8">
              <div className="mb-4 inline-flex size-9 items-center justify-center rounded-md bg-brand/15 text-brand">
                <f.icon className="size-5" />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{f.label}</p>
              <h3 className="mt-2 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <span>© Permivio</span>
          <span>Built for the trades.</span>
        </div>
      </footer>
    </div>
  );
}
