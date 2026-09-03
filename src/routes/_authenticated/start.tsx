import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, FileSearch, MapPinned, Route as RouteIcon } from "lucide-react";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { StartProjectForm } from "@/components/project/StartProjectForm";

export const Route = createFileRoute("/_authenticated/start")({
  head: () => ({
    meta: [
      { title: "Start a Project — Permivio" },
      {
        name: "description",
        content:
          "Start a permitting project in Permivio: confirm the address and jurisdiction, describe the work, and get your permit roadmap.",
      },
      { property: "og:title", content: "Start a Project — Permivio" },
      {
        property: "og:description",
        content: "One flow to open a project, confirm the jurisdiction, and build your permit roadmap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StartProjectPage,
});

const STEPS = [
  { icon: MapPinned, title: "Address & jurisdiction", body: "We resolve the site and the agencies that control it." },
  { icon: ClipboardList, title: "Scope questions", body: "A short intake tailored to what you're building." },
  { icon: RouteIcon, title: "Permit roadmap", body: "Likely approvals, documents, and sequence for your project." },
  { icon: FileSearch, title: "Track & review", body: "Filings, inspections, plan QA/QC, and corrections in one record." },
];

function StartProjectPage() {
  return (
    <div className="px-4 pt-6 pb-12 space-y-6 lg:px-2">
      <PermivioPageHeader
        eyebrow="New project"
        title="Start a Project"
        subtitle="One place to open a project. Everything else in Permivio reads from this record."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground">How it works</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <s.icon className="size-4 text-brand" aria-hidden /> {s.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">
              Not ready to open a project? You can research a site first.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/property"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <MapPinned className="size-3.5" /> Property analysis
              </Link>
              <Link
                to="/tools"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Browse reports
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground">Project details</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Just the basics — you can change any of this later.
          </p>
          <StartProjectForm />
        </section>
      </div>
    </div>
  );
}
