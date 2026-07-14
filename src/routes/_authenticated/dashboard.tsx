import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listProjects, listDeadlines, createProject, deleteProject } from "@/lib/projects.functions";
import { generateDailyBriefing } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Sparkles, ArrowUpRight, CalendarClock, ClipboardCheck, Loader2, AlertTriangle, Trophy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Command Center — Permivio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const STAGES = ["Planning", "Building Permit", "Review", "Issued", "Utilities", "Inspections", "C of O"] as const;

function Dashboard() {
  const listProjectsFn = useServerFn(listProjects);
  const listDeadlinesFn = useServerFn(listDeadlines);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => listProjectsFn() });
  const deadlinesQ = useQuery({ queryKey: ["deadlines"], queryFn: () => listDeadlinesFn() });

  const [showCreate, setShowCreate] = useState(false);
  const projects = projectsQ.data ?? [];
  const deadlines = deadlinesQ.data ?? [];

  const { healthScore, atRisk, avgProgress } = useMemo(() => computePortfolio(projects, deadlines), [projects, deadlines]);

  const urgent = deadlines
    .map((d) => ({ ...d, days: differenceInCalendarDays(parseISO(d.due_date), new Date()) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);

  const briefingFn = useServerFn(generateDailyBriefing);
  const briefingQ = useQuery({
    queryKey: ["daily-briefing"],
    queryFn: () => briefingFn(),
    enabled: projects.length > 0,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  return (
    <AppShell>
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 px-6 pt-10 pb-6 lg:px-2">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary shadow-[0_0_10px_oklch(0.66_0.19_258/0.9)]" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {email ? `Signed in · ${email}` : "System Live"}
            </span>
          </div>
          <h1 className="truncate text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Command Center
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden flex-col items-end sm:flex">
            <span className="font-mono text-[10px] uppercase tracking-tight text-muted-foreground">Active</span>
            <span className="text-lg font-semibold text-foreground">
              {String(projects.length).padStart(2, "0")} projects
            </span>
          </div>
          <div className="hidden h-10 w-px bg-border sm:block" />
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            <Plus className="size-4" /> New project
          </button>
        </div>
      </header>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-6 px-4 pb-8 lg:px-2">
        {/* LEFT column: Health + AI insight */}
        <div className="col-span-12 space-y-6 lg:col-span-4">
          {/* Health */}
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 backdrop-blur-xl sm:p-8">
            <div
              aria-hidden
              className="absolute -right-24 -top-24 size-48 rounded-full blur-3xl"
              style={{ background: "oklch(0.66 0.19 258 / 0.25)" }}
            />
            <h3 className="mb-6 text-sm font-medium text-muted-foreground">Portfolio Health</h3>
            <div className="flex items-center justify-between gap-4">
              <HealthRing value={healthScore} />
              <div className="space-y-4">
                <MiniStat label="At risk" value={`${atRisk}`} tone={atRisk > 0 ? "warn" : "signal"} />
                <MiniStat label="Avg progress" value={`${avgProgress}%`} tone="default" />
              </div>
            </div>
          </div>

          {/* AI Daily Briefing */}
          <DailyBriefingCard
            loading={briefingQ.isLoading || briefingQ.isFetching}
            data={briefingQ.data}
            error={briefingQ.error as Error | null}
            onRefresh={() => briefingQ.refetch()}
            hasProjects={projects.length > 0}
          />
          </div>

        {/* RIGHT column: Cycles + stats */}
        <div className="col-span-12 space-y-6 lg:col-span-8">
          {/* Review cycles / project list */}
          <div className="overflow-hidden rounded-3xl border border-border bg-card backdrop-blur-xl">
            <div className="flex items-center justify-between px-6 py-5 sm:px-7">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Active Review Cycles</h3>
                <p className="text-xs text-muted-foreground">
                  {projects.length === 0 ? "No projects yet" : `${projects.length} project${projects.length === 1 ? "" : "s"} in flight`}
                </p>
              </div>
              <Link to="/projects" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                View all →
              </Link>
            </div>

            {projectsQ.isLoading ? (
              <SkeletonRows />
            ) : projects.length === 0 ? (
              <EmptyState onCreate={() => setShowCreate(true)} />
            ) : (
              <div className="divide-y divide-border">
                {projects.slice(0, 6).map((p) => (
                  <ProjectRow key={p.id} project={p} />
                ))}
              </div>
            )}
          </div>

          {/* Bottom stat strip */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatTile label="Upcoming deadlines" value={String(deadlines.length).padStart(2, "0")} />
            <StatTile label="Next 7 days" value={String(urgent.filter((u) => u.days <= 7 && u.days >= 0).length).padStart(2, "0")} tone="warn" />
            <StatTile label="Overdue" value={String(urgent.filter((u) => u.days < 0).length).padStart(2, "0")} tone={urgent.some((u) => u.days < 0) ? "danger" : "default"} />
          </div>

          {/* Deadlines list */}
          <div className="overflow-hidden rounded-3xl border border-border bg-card backdrop-blur-xl">
            <div className="flex items-center justify-between px-6 py-5 sm:px-7">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <CalendarClock className="size-4 text-primary" /> Upcoming Deadlines
              </h3>
            </div>
            {urgent.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground">No deadlines logged yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {urgent.map((d) => (
                  <DeadlineRow key={d.id} title={d.title} project={(d as { projects?: { name?: string } }).projects?.name ?? "—"} due={d.due_date} days={d.days} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && <CreateProjectDialog onClose={() => setShowCreate(false)} />}
    </AppShell>
  );
}

/* ---------- pieces ---------- */

type BriefingData = {
  headline: string;
  summary: string;
  focus_today: Array<{ project: string; action: string; why: string }>;
  risks: string[];
  wins: string[];
  generated_at?: string;
};

function DailyBriefingCard({
  loading, data, error, onRefresh, hasProjects,
}: {
  loading: boolean;
  data: BriefingData | undefined;
  error: Error | null;
  onRefresh: () => void;
  hasProjects: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[oklch(0.68_0.19_305/0.25)] bg-linear-to-br from-[oklch(0.68_0.19_305/0.08)] to-transparent p-6">
      <div
        aria-hidden
        className="absolute -left-16 -bottom-16 size-40 rounded-full blur-3xl"
        style={{ background: "oklch(0.68 0.19 305 / 0.18)" }}
      />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[oklch(0.68_0.19_305/0.15)] p-1.5 text-[oklch(0.78_0.15_305)]">
              <Sparkles className="size-4" />
            </div>
            <span className="text-sm font-semibold text-foreground/90">Daily Briefing</span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading || !hasProjects}
            className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-50"
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>

        {!hasProjects ? (
          <p className="text-sm text-muted-foreground">Add a project to unlock your morning brief.</p>
        ) : loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Compiling your brief…
          </div>
        ) : error ? (
          <p className="text-sm text-[oklch(0.78_0.20_27)]">Briefing failed. {error.message}</p>
        ) : data ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{data.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.summary}</p>
            </div>

            {data.focus_today.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Focus today</p>
                {data.focus_today.slice(0, 3).map((f, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-black/20 p-3">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px_oklch(0.66_0.19_258/0.8)]" />
                      <span className="truncate text-xs font-semibold text-foreground">{f.project}</span>
                    </div>
                    <p className="text-xs text-foreground/90">{f.action}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{f.why}</p>
                  </div>
                ))}
              </div>
            )}

            {data.risks.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[oklch(0.85_0.16_72)]">
                  <AlertTriangle className="size-3" /> Risks
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {data.risks.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex gap-2"><span className="text-[oklch(0.85_0.16_72)]">›</span>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.wins.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[oklch(0.82_0.16_155)]">
                  <Trophy className="size-3" /> Wins
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {data.wins.slice(0, 2).map((w, i) => (
                    <li key={i} className="flex gap-2"><span className="text-[oklch(0.82_0.16_155)]">›</span>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <Link
              to="/assistant"
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[oklch(0.68_0.19_305/0.25)] bg-[oklch(0.68_0.19_305/0.10)] py-2 text-xs font-semibold text-[oklch(0.85_0.09_305)] transition-colors hover:bg-[oklch(0.68_0.19_305/0.18)]"
            >
              Ask the assistant <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}


function HealthRing({ value }: { value: number }) {
  const R = 58;
  const C = 2 * Math.PI * R;
  const offset = C - (Math.min(100, Math.max(0, value)) / 100) * C;
  const label = value >= 85 ? "Optimal" : value >= 65 ? "Stable" : value >= 40 ? "Watch" : "At risk";
  return (
    <div className="relative grid size-32 place-items-center">
      <svg className="size-32 -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={R} fill="transparent" stroke="currentColor" strokeWidth="8" className="text-secondary" />
        <circle
          cx="64" cy="64" r={R} fill="transparent" strokeWidth="8" strokeLinecap="round"
          stroke="url(#healthGrad)" strokeDasharray={C} strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="healthGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.66 0.19 258)" />
            <stop offset="100%" stopColor="oklch(0.68 0.19 305)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-foreground tabular-nums">{value}</span>
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "default" | "signal" | "warn" }) {
  const color =
    tone === "signal" ? "text-[oklch(0.82_0.16_155)]" :
    tone === "warn" ? "text-[oklch(0.85_0.16_72)]" :
    "text-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function StatTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "danger" }) {
  const color =
    tone === "danger" ? "text-[oklch(0.78_0.20_27)]" :
    tone === "warn" ? "text-[oklch(0.85_0.16_72)]" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-5 backdrop-blur-xl">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-tight text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ProjectRow({ project }: { project: {
  id: string; name: string; jurisdiction?: string | null; location?: string | null;
  permit_count: number; permits_issued: number; current_stage: number; status: string;
} }) {
  const stagesLen = STAGES.length;
  const stageIdx = Math.min(stagesLen - 1, Math.max(0, project.current_stage));
  const pct = Math.round(((stageIdx + 1) / stagesLen) * 100);
  const initial = (project.name || "?").trim().charAt(0).toUpperCase();
  const dotClass =
    project.status?.toLowerCase().includes("issued") ? "bg-[oklch(0.75_0.16_155)]" :
    project.status?.toLowerCase().includes("review") ? "bg-primary" :
    project.status?.toLowerCase().includes("hold") ? "bg-[oklch(0.85_0.16_72)]" :
    "bg-muted-foreground";
  const queryClient = useQueryClient();
  const deleteFn = useServerFn(deleteProject);
  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: project.id } }),
    onSuccess: () => {
      toast.success(`Deleted "${project.name}"`);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete project"),
  });
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (deleteMut.isPending) return;
    if (window.confirm(`Delete "${project.name}"? This removes all its checklist items, deadlines, docs, and history. This cannot be undone.`)) {
      deleteMut.mutate();
    }
  };
  return (
    <div className="group relative">
      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-5 transition-colors hover:bg-white/[0.02] sm:px-7"
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-secondary text-lg font-bold text-muted-foreground">
            {initial}
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-foreground">{project.name}</h4>
            <p className="truncate text-xs text-muted-foreground">
              {STAGES[stageIdx]} · {project.permits_issued}/{project.permit_count} permits{project.jurisdiction ? ` · ${project.jurisdiction}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 pr-10">
          <div className="hidden text-right sm:block">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-tight text-muted-foreground">Status</p>
            <div className="flex items-center justify-end gap-2">
              <span className={`size-1.5 rounded-full ${dotClass}`} />
              <span className="text-xs font-medium text-foreground">{project.status}</span>
            </div>
          </div>
          <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-secondary sm:block md:w-32">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, oklch(0.66 0.19 258), oklch(0.68 0.19 305))",
              }}
            />
          </div>
          <div className="min-w-[3rem] text-right">
            <p className="font-mono text-[10px] uppercase tracking-tight text-muted-foreground">Stage</p>
            <p className="font-mono text-sm text-foreground tabular-nums">{stageIdx + 1}/{stagesLen}</p>
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleteMut.isPending}
        aria-label={`Delete project ${project.name}`}
        title="Delete project"
        className="absolute right-3 top-1/2 -translate-y-1/2 grid size-8 place-items-center rounded-lg border border-border bg-background/60 text-muted-foreground opacity-0 transition hover:border-[oklch(0.78_0.20_27)] hover:text-[oklch(0.78_0.20_27)] group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
      >
        {deleteMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
    </div>
  );
}

function DeadlineRow({ title, project, due, days }: { title: string; project: string; due: string; days: number }) {
  const overdue = days < 0;
  const soon = days >= 0 && days <= 3;
  const color = overdue ? "text-[oklch(0.78_0.20_27)]" : soon ? "text-[oklch(0.85_0.16_72)]" : "text-foreground";
  const label = overdue ? `${Math.abs(days)}d late` : days === 0 ? "Today" : `${days}d`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 sm:px-7">
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{title}</p>
        <p className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{project}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{format(parseISO(due), "MMM dd")}</span>
        <span className={`font-mono text-xs font-semibold ${color}`}>{label}</span>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-7 py-5">
          <div className="size-12 shrink-0 animate-pulse rounded-2xl bg-secondary" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-secondary" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-6 pb-8 pt-2 text-center sm:px-8">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
        <ClipboardCheck className="size-5" />
      </div>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">No active sites</p>
      <h3 className="mt-2 text-lg font-semibold text-foreground">Nothing on file yet.</h3>
      <p className="mt-1 text-sm text-muted-foreground">Log your first commercial permit project to get started.</p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_10px_40px_-8px_oklch(0.66_0.19_258/0.6)]"
      >
        <Plus className="size-4" /> Add project
      </button>
    </div>
  );
}

/* ---------- portfolio math ---------- */

function computePortfolio(
  projects: { current_stage: number; permit_count: number; permits_issued: number; status: string }[],
  deadlines: { due_date: string }[],
): { healthScore: number; atRisk: number; avgProgress: number } {
  if (projects.length === 0) return { healthScore: 100, atRisk: 0, avgProgress: 0 };
  const stagesLen = STAGES.length;
  const progressPcts = projects.map((p) => ((Math.min(stagesLen - 1, Math.max(0, p.current_stage)) + 1) / stagesLen) * 100);
  const avgProgress = Math.round(progressPcts.reduce((a, b) => a + b, 0) / progressPcts.length);

  const overdue = deadlines.filter((d) => differenceInCalendarDays(parseISO(d.due_date), new Date()) < 0).length;
  const dueSoon = deadlines.filter((d) => {
    const diff = differenceInCalendarDays(parseISO(d.due_date), new Date());
    return diff >= 0 && diff <= 3;
  }).length;
  const onHold = projects.filter((p) => p.status?.toLowerCase().includes("hold")).length;

  // Health penalty
  let score = 100 - overdue * 12 - dueSoon * 4 - onHold * 8;
  score = Math.max(15, Math.min(100, Math.round(score)));

  const atRisk = overdue + onHold;
  return { healthScore: score, atRisk, avgProgress };
}


/* ---------- create dialog ---------- */

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const createFn = useServerFn(createProject);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [projectType, setProjectType] = useState("Tenant Fit-Out");
  const [permitCount, setPermitCount] = useState(3);

  const mut = useMutation({
    mutationFn: () => createFn({ data: { name, location, jurisdiction, project_type: projectType, permit_count: permitCount } }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
      onClose();
      navigate({ to: "/projects/$id", params: { id: row.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-border bg-popover p-6 pb-8 sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">New site</p>
            <h2 className="mt-1 text-xl font-semibold">Add project</h2>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg border border-border">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (name) mut.mutate(); }} className="flex flex-col gap-3">
          <Field label="Project name">
            <input required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Riverside Plaza"
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary" />
          </Field>
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Cleveland, OH"
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary" />
          </Field>
          <Field label="Jurisdiction">
            <JurisdictionAutocomplete value={jurisdiction} onChange={setJurisdiction} placeholder="Cuyahoga County, OH" />
          </Field>
          <Field label="Project type">
            <select value={projectType} onChange={(e) => setProjectType(e.target.value)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary">
              <optgroup label="Commercial">
                <option>Tenant Fit-Out</option>
                <option>New Build</option>
                <option>Shell / Core-and-Shell</option>
                <option>Renovation</option>
                <option>Addition</option>
                <option>Change of Use</option>
                <option>Demolition</option>
                <option>Commercial</option>
              </optgroup>
              <optgroup label="Other">
                <option>Residential</option>
                <option>Mixed-Use</option>
                <option>Industrial</option>
                <option>Civil</option>
              </optgroup>
            </select>
          </Field>
          <Field label="Estimated permit count">
            <input type="number" min={1} max={20} value={permitCount}
              onChange={(e) => setPermitCount(parseInt(e.target.value) || 1)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary" />
          </Field>

          <button type="submit" disabled={mut.isPending}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_10px_40px_-8px_oklch(0.66_0.19_258/0.6)] disabled:opacity-50">
            {mut.isPending ? "Creating…" : "Create project"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
