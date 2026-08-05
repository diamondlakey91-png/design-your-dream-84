import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Workflow, Loader2, ExternalLink, ShieldCheck } from "lucide-react";
import { getIntakePipeline } from "@/lib/pipeline.functions";
import type { PipelineState } from "@/lib/pipeline.server";

type ProjectOption = { id: string; name: string };

const STATE_STYLE: Record<PipelineState, { label: string; chip: string; dot: string }> = {
  idle: {
    label: "Idle",
    chip: "border-border text-muted-foreground",
    dot: "border-border",
  },
  waiting: {
    label: "Waiting",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    dot: "border-amber-500/70 shadow-[0_0_12px_oklch(0.78_0.16_75/0.5)]",
  },
  pending: {
    label: "Pending",
    chip: "border-border/60 bg-muted/30 text-muted-foreground",
    dot: "border-border",
  },
  running: {
    label: "In progress",
    chip: "border-primary/40 bg-primary/10 text-primary",
    dot: "border-primary shadow-[0_0_12px_oklch(0.66_0.19_258/0.6)]",
  },
  complete: {
    label: "Complete",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    dot: "border-emerald-500/70 shadow-[0_0_12px_oklch(0.72_0.16_160/0.5)]",
  },
};

export function IntakePipelineCard({ projects }: { projects: ProjectOption[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const projectId = selected ?? projects[0]?.id ?? null;

  const getFn = useServerFn(getIntakePipeline);
  const q = useQuery({
    queryKey: ["intake-pipeline", projectId],
    queryFn: () => getFn({ data: { project_id: projectId! } }),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const stages = useMemo(() => q.data?.stages ?? [], [q.data]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-56 rounded-full blur-3xl"
        style={{ background: "oklch(0.66 0.19 258 / 0.16)" }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4 px-6 py-5 sm:px-7">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Intake Pipeline</p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Workflow className="size-4 text-primary" /> Permit Intake Pipeline
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Steps 1–5 of the intake chain. Every status below shows its source — nothing here is a live portal feed.
          </p>
        </div>
        {projects.length > 1 && (
          <select
            value={projectId ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            className="max-w-[14rem] rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
            aria-label="Select project for the intake pipeline"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {!projectId ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground sm:px-7">
          Add a project to scope the intake pipeline.
        </p>
      ) : q.isLoading ? (
        <div className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground sm:px-7">
          <Loader2 className="size-4 animate-spin" /> Reading project records…
        </div>
      ) : q.error ? (
        <p className="px-6 pb-6 text-sm text-[oklch(0.78_0.20_27)] sm:px-7">
          Could not load the pipeline. {(q.error as Error).message}
        </p>
      ) : (
        <ol className="relative px-6 pb-6 sm:px-7">
          {stages.map((s, i) => {
            const style = STATE_STYLE[s.state];
            const last = i === stages.length - 1;
            return (
              <li key={s.key} className="relative flex gap-4 pb-5 last:pb-0">
                <div className="relative flex flex-col items-center">
                  <span className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2 bg-background ${style.dot}`} />
                  {!last && <span className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{s.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${style.chip}`}>
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                  <p className="mt-1 text-xs text-foreground/90">{s.detail}</p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <ShieldCheck className="size-3" /> {s.source}
                  </p>
                  {s.action && (
                    <Link
                      to={s.action.to}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/60"
                    >
                      <ExternalLink className="size-3.5" /> {s.action.label}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
