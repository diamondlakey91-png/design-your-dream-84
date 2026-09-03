import { createFileRoute, Link } from "@tanstack/react-router";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { listProjects } from "@/lib/projects.functions";
import { FileSignature, FolderKanban, Globe, LayoutGrid, List as ListIcon, Plus, RefreshCw, Search, Inbox, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Permivio" },
      { name: "description", content: "Manage your permit projects and track their status across the review pipeline." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProjectsPage,
});

type Project = {
  id: string;
  name: string;
  status: string;
  current_stage: number;
  permit_count: number;
  permits_issued: number;
  jurisdiction?: string | null;
  location?: string | null;
  project_type?: string | null;
};

const COLUMNS = [
  { key: "draft", label: "Draft", dot: "bg-muted-foreground", tint: "bg-secondary/60" },
  { key: "submitted", label: "Submitted", dot: "bg-primary", tint: "bg-primary/10" },
  { key: "review", label: "In Review", dot: "bg-[oklch(0.66_0.19_258)]", tint: "bg-[oklch(0.66_0.19_258)]/10" },
  { key: "corrections", label: "Corrections", dot: "bg-destructive", tint: "bg-destructive/10" },
  { key: "approved", label: "Approved", dot: "bg-[oklch(0.75_0.16_155)]", tint: "bg-[oklch(0.75_0.16_155)]/10" },
] as const;

function columnFor(p: Project): (typeof COLUMNS)[number]["key"] {
  const s = (p.status || "").toLowerCase();
  if (s.includes("correction") || s.includes("revision") || s.includes("hold")) return "corrections";
  if (s.includes("approved") || s.includes("issued") || s.includes("occupancy") || s.includes("c of o")) return "approved";
  if (s.includes("review")) return "review";
  if (s.includes("submit")) return "submitted";
  if (p.current_stage >= 3) return "approved";
  if (p.current_stage === 2) return "review";
  if (p.current_stage === 1) return "submitted";
  return "draft";
}

function ProjectsPage() {
  const listProjectsFn = useServerFn(listProjects);
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => listProjectsFn() });
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [q, setQ] = useState("");

  const projects = (projectsQ.data ?? []) as unknown as Project[];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) =>
      [p.name, p.jurisdiction, p.location, p.project_type, p.status].filter(Boolean).join(" ").toLowerCase().includes(needle),
    );
  }, [projects, q]);

  const grouped = useMemo(() => {
    const map: Record<string, Project[]> = { draft: [], submitted: [], review: [], corrections: [], approved: [] };
    filtered.forEach((p) => map[columnFor(p)].push(p));
    return map;
  }, [filtered]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <PermivioPageHeader
          eyebrow="Projects"
          title="Projects"
          subtitle="Manage your permit projects and track their status."
          actions={<>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/harvest"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Globe className="size-4 text-primary" /> Portal Harvest
            </Link>
            <Link
              to="/filing"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <FileSignature className="size-4 text-primary" /> Permit Filing
            </Link>
          </div>
          </>}
        />


        {/* Toolbar */}
        <div className="mt-7 rounded-3xl border border-border bg-card/60 p-4 backdrop-blur-xl sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects, jurisdictions, types…"
                className="h-11 w-full rounded-xl border border-input bg-background/60 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {filtered.length} project{filtered.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center rounded-xl border border-border p-1">
                <ViewTab active={view === "kanban"} onClick={() => setView("kanban")} icon={<LayoutGrid className="size-3.5" />} label="Kanban" />
                <ViewTab active={view === "list"} onClick={() => setView("list")} icon={<ListIcon className="size-3.5" />} label="List" />
              </div>
              <button
                onClick={() => projectsQ.refetch()}
                aria-label="Refresh projects"
                className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                {projectsQ.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              </button>
              <Link
                to="/start"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-primary-foreground"
                style={{ background: "linear-gradient(90deg, oklch(0.66 0.19 258), oklch(0.68 0.19 305))" }}
              >
                <Plus className="size-4" /> Start a Project
              </Link>
            </div>
          </div>
        </div>

        {/* Board / list */}
        <div className="mt-6">
          {projectsQ.isLoading ? (
            <div className="grid gap-4 lg:grid-cols-5">
              {COLUMNS.map((c) => (
                <div key={c.key} className="h-56 animate-pulse rounded-2xl border border-border bg-card/50" />
              ))}
            </div>
          ) : view === "kanban" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {COLUMNS.map((col) => (
                <section key={col.key} className="rounded-2xl border border-border bg-card/40 p-2">
                  <div className={`mb-2 flex items-center justify-between rounded-xl px-3 py-2.5 ${col.tint}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`size-1.5 shrink-0 rounded-full ${col.dot}`} />
                      <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-widest text-foreground">{col.label}</span>
                    </span>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {grouped[col.key].length}
                    </span>
                  </div>
                  <div className="space-y-2 p-1">
                    {grouped[col.key].length === 0 ? (
                      <div className="grid place-items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-10 text-center">
                        <Inbox className="size-5 text-muted-foreground/60" />
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">No projects</p>
                        <p className="text-xs text-muted-foreground/80">Nothing in this stage yet.</p>
                      </div>
                    ) : (
                      grouped[col.key].map((p) => <KanbanCard key={p.id} project={p} />)
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-border bg-card">
              {filtered.length === 0 ? (
                <div className="px-6 py-14 text-center text-sm text-muted-foreground">No projects match your search.</div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((p) => (
                    <Link
                      key={p.id}
                      to="/projects/$id"
                      params={{ id: p.id }}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:px-7"
                    >
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-foreground">{p.name}</h4>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.status} · {p.permits_issued}/{p.permit_count} permits{p.jurisdiction ? ` · ${p.jurisdiction}` : ""}
                        </p>
                      </div>
                      <StageChip project={p} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ViewTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StageChip({ project }: { project: Project }) {
  const col = COLUMNS.find((c) => c.key === columnFor(project))!;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-foreground ${col.tint}`}>
      <span className={`size-1.5 rounded-full ${col.dot}`} />
      {col.label}
    </span>
  );
}

function KanbanCard({ project }: { project: Project }) {
  const pct = project.permit_count > 0 ? Math.round((project.permits_issued / project.permit_count) * 100) : 0;
  return (
    <Link
      to="/projects/$id"
      params={{ id: project.id }}
      className="block rounded-xl border border-border bg-background/50 p-3 transition-colors hover:border-primary/50"
    >
      <h4 className="truncate text-sm font-semibold text-foreground">{project.name}</h4>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{project.jurisdiction || project.location || "No jurisdiction set"}</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg, oklch(0.66 0.19 258), oklch(0.68 0.19 305))" }}
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {project.permits_issued}/{project.permit_count}
        </span>
      </div>
    </Link>
  );
}
