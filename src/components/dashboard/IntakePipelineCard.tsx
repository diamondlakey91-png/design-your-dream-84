import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Workflow, Loader2, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { getIntakePipeline } from "@/lib/pipeline.functions";
import type { PipelineState } from "@/lib/pipeline.server";

type ProjectOption = { id: string; name: string };

const STATE_STYLE: Record<PipelineState, { label: string; chip: string; dot: string; rail: string }> = {
  idle: {
    label: "Idle",
    chip: "border-border text-muted-foreground",
    dot: "border-border",
    rail: "bg-border",
  },
  waiting: {
    label: "Waiting",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    dot: "border-sky-500/70 shadow-[0_0_12px_oklch(0.78_0.16_75/0.5)]",
    rail: "bg-sky-500/30",
  },
  pending: {
    label: "Pending",
    chip: "border-border/60 bg-muted/30 text-muted-foreground",
    dot: "border-border",
    rail: "bg-border",
  },
  running: {
    label: "In progress",
    chip: "border-primary/40 bg-primary/10 text-primary",
    dot: "border-primary shadow-[0_0_12px_oklch(0.66_0.19_258/0.6)]",
    rail: "bg-primary/40",
  },
  complete: {
    label: "Complete",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    dot: "border-emerald-500/70 shadow-[0_0_12px_oklch(0.72_0.16_160/0.5)]",
    rail: "bg-emerald-500/30",
  },
};

export function IntakePipelineCard({ projects }: { projects: ProjectOption[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const projectId = selected ?? projects[0]?.id ?? null;
  const activeProject = projects.find((p) => p.id === projectId) ?? null;

  const getFn = useServerFn(getIntakePipeline);
  const q = useQuery({
    queryKey: ["intake-pipeline", projectId],
    queryFn: () => getFn({ data: { project_id: projectId! } }),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const stages = useMemo(() => q.data?.stages ?? [], [q.data]);
  const completed = stages.filter((s) => s.state === "complete").length;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-56 rounded-full blur-3xl"
        style={{ background: "oklch(0.66 0.19 258 / 0.16)" }}
      />

      <div className="relative grid gap-6 px-6 py-5 sm:px-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* Left: header + agent timeline */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Intake Pipeline</p>
              <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Workflow className="size-4 text-primary" /> Permit Intake Pipeline
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Agent chain status (Steps 1–{stages.length || 5}). Every status shows its source — nothing here is a live
                portal feed.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-primary">
              <Sparkles className="size-3" /> AI-assisted
            </span>
          </div>

          {!projectId ? (
            <p className="mt-5 text-sm text-muted-foreground">Add a project to scope the intake pipeline.</p>
          ) : q.isLoading ? (
            <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reading project records…
            </div>
          ) : q.error ? (
            <p className="mt-5 text-sm text-[oklch(0.78_0.20_27)]">
              Could not load the pipeline. {(q.error as Error).message}
            </p>
          ) : (
            <ol className="relative mt-5">
              {stages.map((s, i) => {
                const style = STATE_STYLE[s.state];
                const last = i === stages.length - 1;
                return (
                  <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
                    <div className="relative flex flex-col items-center">
                      <span
                        className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2 bg-background ${style.dot}`}
                      >
                        <span className="size-1.5 rounded-full bg-current opacity-60" />
                      </span>
                      {!last && <span className={`mt-1 w-px flex-1 ${style.rail}`} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                          Step {i + 1}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{s.name} Agent</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${style.chip}`}
                        >
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                      <p className="mt-1 text-xs text-foreground/90">{s.detail}</p>
                      <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <ShieldCheck className="size-3" /> {s.source}
                      </p>
                      {s.action && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Link
                            to={s.action.to}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/60"
                          >
                            <ExternalLink className="size-3.5" /> {s.action.label}
                          </Link>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Right: pipeline context panel */}
        <aside className="lg:sticky lg:top-4 h-fit rounded-2xl border border-border bg-background/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Pipeline context</p>
          {projects.length > 1 ? (
            <select
              value={projectId ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground"
              aria-label="Select project for the intake pipeline"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : activeProject ? (
            <p className="mt-2 truncate text-sm font-medium text-foreground">{activeProject.name}</p>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            {projectId
              ? "Scoped to this project's documents, checklist, and manual portal checks. Run a portal check to advance the chain."
              : "Select a project to scope portal checks and the agent chain."}
          </p>

          {projectId && !q.isLoading && !q.error && (
            <>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${stages.length ? (completed / stages.length) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {completed} of {stages.length} steps complete
              </p>
              <Link
                to="/projects/$id"
                params={{ id: projectId }}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/60"
              >
                Open project
              </Link>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
