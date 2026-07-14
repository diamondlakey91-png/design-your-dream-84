import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, CheckCircle2, Circle, Loader2, Milestone, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { STAGES } from "@/lib/permits";
import { listPermitItems } from "@/lib/checklist.functions";
import { listDeadlines } from "@/lib/projects.functions";
import { listDocuments } from "@/lib/documents.functions";
import { StageDocs } from "@/components/project/StageDocs";

const STAGE_BLURB: Record<number, string> = {
  0: "Confirm scope, jurisdiction, and the full set of permits required for this project type.",
  1: "Applications filed with the AHJ. Track intake receipts and assigned reviewer.",
  2: "Under plan review — expect reviewer comments and revision cycles.",
  3: "Plans approved. Pay fees, print card, and prepare for issuance.",
  4: "Permits issued. Schedule inspections and drive to Certificate of Occupancy.",
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  issued: "Issued",
  n_a: "N/A",
};
const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  under_review: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  issued: "bg-brand/20 text-brand",
  n_a: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 line-through",
};

export function PermitRoadmap({
  projectId, userId, stage, onAdvance, advancing,
}: {
  projectId: string; userId: string; stage: number; onAdvance: () => void; advancing: boolean;
}) {
  const itemsFn = useServerFn(listPermitItems);
  const deadlinesFn = useServerFn(listDeadlines);
  const docsFn = useServerFn(listDocuments);

  const itemsQ = useQuery({
    queryKey: ["permit_items", projectId],
    queryFn: () => itemsFn({ data: { project_id: projectId } }),
  });
  const deadlinesQ = useQuery({
    queryKey: ["deadlines", "roadmap"],
    queryFn: () => deadlinesFn(),
  });
  const docsQ = useQuery({
    queryKey: ["docs", projectId],
    queryFn: () => docsFn({ data: { project_id: projectId } }),
  });

  const items = (itemsQ.data ?? []) as Array<{ id: string; name: string; status: string; due_date: string | null }>;
  const openItems = items.filter((i) => i.status !== "issued" && i.status !== "approved" && i.status !== "n_a");
  const nextUp = openItems.slice(0, 4);

  const upcoming = (deadlinesQ.data ?? [])
    .filter((d: { project_id?: string | null; due_date: string }) => d.project_id === projectId && new Date(d.due_date).getTime() > Date.now() - 86400000)
    .slice(0, 3) as Array<{ id: string; title: string; due_date: string }>;

  const allDocs = (docsQ.data ?? []) as Array<{ id: string; name: string; storage_path: string; mime_type: string; size_bytes: number; url: string | null; stage: number | null; permit_item_id: string | null }>;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-brand">
          <Milestone className="size-4" />
          <p className="font-mono text-[10px] uppercase tracking-widest">Permit Roadmap</p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Stage {stage + 1} of {STAGES.length}
        </span>
      </div>

      <div className="rounded-xl bg-card ring-1 ring-black/5 p-4">
        <ol className="relative">
          {STAGES.map((label, i) => {
            const done = i < stage;
            const current = i === stage;
            const isLast = i === STAGES.length - 1;
            const stageDocs = allDocs.filter((d) => d.stage === i);
            return (
              <li key={label} className="relative pl-9 pb-5 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[13px] top-6 bottom-0 w-px ${done ? "bg-brand/60" : "bg-border"}`}
                  />
                )}
                <span
                  className={`absolute left-0 top-0 grid size-7 place-items-center rounded-full ring-2 ${
                    done
                      ? "bg-brand text-brand-foreground ring-brand/40"
                      : current
                      ? "bg-brand/15 text-brand ring-brand animate-pulse"
                      : "bg-muted text-muted-foreground ring-border"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="size-4" />
                  ) : current ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                </span>

                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-semibold ${current ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground"}`}>
                    {label}
                  </p>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${
                    done ? "bg-brand/15 text-brand" : current ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"
                  }`}>
                    {done ? "Complete" : current ? "In progress" : "Upcoming"}
                  </span>
                  {stageDocs.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider">
                      <Paperclip className="size-2.5" /> {stageDocs.length}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{STAGE_BLURB[i]}</p>

                {current && (
                  <div className="mt-3 space-y-2">
                    {nextUp.length > 0 && (
                      <div className="rounded-lg border border-border bg-background/60 p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-brand">
                          <ArrowRight className="size-3" /> Next up
                        </p>
                        <ul className="space-y-1.5">
                          {nextUp.map((it) => (
                            <li key={it.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate text-foreground">{it.name}</span>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase ${STATUS_COLOR[it.status] ?? "bg-muted"}`}>
                                {STATUS_LABEL[it.status] ?? it.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {openItems.length > nextUp.length && (
                          <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            +{openItems.length - nextUp.length} more in Checklist
                          </p>
                        )}
                      </div>
                    )}
                    {upcoming.length > 0 && (
                      <div className="rounded-lg border border-border bg-background/60 p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-brand">
                          <CalendarClock className="size-3" /> Upcoming deadlines
                        </p>
                        <ul className="space-y-1.5">
                          {upcoming.map((d) => (
                            <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate text-foreground">{d.title}</span>
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                {format(new Date(d.due_date), "MMM d")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {nextUp.length === 0 && upcoming.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No pending items — you're clear to advance.</p>
                    )}
                  </div>
                )}

                <StageDocs
                  projectId={projectId}
                  userId={userId}
                  stage={i}
                  docs={stageDocs}
                  items={items}
                  defaultOpen={current}
                />
              </li>
            );
          })}
        </ol>

        {stage < STAGES.length - 1 && (
          <button
            onClick={onAdvance}
            disabled={advancing}
            className="mt-2 w-full inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {advancing ? "Advancing…" : <>Advance to {STAGES[stage + 1]} <ArrowRight className="size-4" /></>}
          </button>
        )}
      </div>
    </section>
  );
}
