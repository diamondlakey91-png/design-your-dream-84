import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSearch, FolderOpen, ListChecks, FileDown, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { PlanQaQcTab } from "@/components/project/PlanQaQcTab";
import { listProjects } from "@/lib/projects.functions";
import { PERMIVIO_PROFESSIONAL_DISCLAIMER } from "@/lib/qaqcConfig";

export const Route = createFileRoute("/_authenticated/plan-qaqc")({
  head: () => ({
    meta: [
      { title: "Plan QA/QC Report — Permivio" },
      {
        name: "description",
        content:
          "Upload a plan set, build the drawing inventory, flag missing or unindexed sheets, and download a pre-submission Plan QA/QC report as a PDF.",
      },
      { property: "og:title", content: "Permivio Plan QA/QC Report" },
      {
        property: "og:description",
        content: "Pre-submission plan review: drawing inventory, missing-sheet flags and a downloadable QA/QC findings PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    project: typeof search.project === "string" ? search.project : "",
  }),
  component: PlanQaQcReportPage,
});

const STEPS = [
  { icon: FolderOpen, label: "1. Upload your plan set", copy: "PDF or image sheets — saved to the project's documents." },
  { icon: Sparkles, label: "2. Run the review", copy: "Builds the drawing inventory and checks it against jurisdiction codes." },
  { icon: ListChecks, label: "3. Clear the flags", copy: "Missing sheets, index mismatches, duplicates and conflicting dates." },
  { icon: FileDown, label: "4. Download the report", copy: "A PDF of every finding you can share with your design team." },
];

function PlanQaQcReportPage() {
  const search = Route.useSearch();
  const listFn = useServerFn(listProjects);
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const projects = projectsQ.data ?? [];

  const [projectId, setProjectId] = useState(search.project);
  const active = projects.find((p) => p.id === (projectId || search.project)) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <PermivioPageHeader
          eyebrow="Plan QA/QC"
          title="Plan QA/QC report"
          subtitle="Check a plan set before you submit it: full drawing inventory, missing-sheet flags, findings by severity, and a downloadable PDF."
        />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card/60 p-4">
              <s.icon className="size-4 text-brand" />
              <p className="mt-2 text-sm font-semibold">{s.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card/60 p-4">
          <label htmlFor="qaqc-project" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Which project is this plan set for?
          </label>
          {projectsQ.isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading your projects…</p>
          ) : projects.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              You don't have a project yet. <Link to="/projects" className="text-brand underline">Create a project</Link> first — the review
              uses its address and jurisdiction to pick the right codes.
            </p>
          ) : (
            <select
              id="qaqc-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm sm:max-w-md"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.location ? ` — ${p.location}` : ""}
                </option>
              ))}
            </select>
          )}
          {active && (
            <p className="mt-2 text-xs text-muted-foreground">
              Jurisdiction on file: {active.jurisdiction || "not confirmed yet"} ·{" "}
              <Link to="/projects/$id" params={{ id: active.id }} className="text-brand underline">
                Open the full project
              </Link>
            </p>
          )}
        </div>

        <div className="mt-6">
          {active ? (
            <PlanQaQcTab projectId={active.id} userId={active.user_id} />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <FileSearch className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Pick a project above to upload plans and run the QA/QC review.</p>
            </div>
          )}
        </div>

        <p className="mt-6 rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
          {PERMIVIO_PROFESSIONAL_DISCLAIMER}
        </p>
      </div>
    </AppShell>
  );
}
