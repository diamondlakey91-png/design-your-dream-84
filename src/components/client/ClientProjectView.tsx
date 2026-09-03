import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format, parseISO } from "date-fns";
import {
  CalendarClock, FileText, FolderOpen, Loader2, MessageSquare, Sparkles, ClipboardList,
  HardHat, ShieldCheck, ArrowRight,
} from "lucide-react";
import { getClientProject } from "@/lib/clientDashboard.functions";
import { summarizeProjectNextSteps } from "@/lib/chat.functions";
import { ClientAttentionList } from "@/components/client/ClientAttentionList";
import { ClientMilestoneTimeline } from "@/components/client/ClientMilestoneTimeline";
import { dayLabel } from "@/components/client/ClientDashboard";
import {
  TONE_CLASSES, attentionItems, clientStatus, currentPhase, currentRisks, friendlyActivity,
  milestoneState, nextStep, whatWeNeed,
  type ClientProjectInput, type ClientSignals,
} from "@/lib/clientView";

/**
 * Client-friendly project view. Every module stays available through the
 * professional view — this screen answers "where do we stand, what's next,
 * and what do you need from me?" without permitting jargon.
 */
export function ClientProjectView({
  project,
  onOpenTab,
}: {
  project: ClientProjectInput;
  onOpenTab: (tab: string) => void;
}) {
  const fn = useServerFn(getClientProject);
  const q = useQuery({ queryKey: ["client-project", project.id], queryFn: () => fn({ data: { project_id: project.id } }) });

  const summarizeFn = useServerFn(summarizeProjectNextSteps);
  const summary = useMutation({ mutationFn: () => summarizeFn({ data: { id: project.id } }) });

  const model = useMemo(() => {
    const d = q.data;
    const signals: ClientSignals = {
      items: (d?.items ?? []) as ClientSignals["items"],
      deadlines: (d?.deadlines ?? []) as ClientSignals["deadlines"],
      inspections: (d?.inspections ?? []) as ClientSignals["inspections"],
      documentCount: d?.documentCount ?? 0,
    };
    const attention = attentionItems(project, signals);
    return {
      signals,
      attention,
      status: clientStatus(project, signals, attention.length),
      ms: milestoneState(project, signals),
      risks: currentRisks(project, signals),
      activity: (d?.activity ?? []) as Array<{ id: string; description: string; created_at: string }>,
    };
  }, [q.data, project]);

  const tone = TONE_CLASSES[model.status.tone];
  const nextDate = [...model.signals.deadlines].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  const modules = [
    { tab: "docs", label: "Documents", icon: <FolderOpen className="size-4" />, show: true },
    { tab: "checklist", label: "Permits & approvals", icon: <ClipboardList className="size-4" />, show: model.signals.items.length > 0 },
    { tab: "planqaqc", label: "Plan review", icon: <ShieldCheck className="size-4" />, show: model.signals.documentCount > 0 },
    { tab: "site", label: "Site investigation", icon: <FileText className="size-4" />, show: true },
    { tab: "inspections", label: "Inspections", icon: <HardHat className="size-4" />, show: model.signals.inspections.length > 0 },
    { tab: "deadlines", label: "Important dates", icon: <CalendarClock className="size-4" />, show: model.signals.deadlines.length > 0 },
  ].filter((m) => m.show);

  return (
    <div className="space-y-6">
      {/* Snapshot */}
      <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tone.badge}`}>
              <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} /> {model.status.label}
            </span>
            <p className="mt-3 max-w-2xl text-sm text-foreground">{model.status.plain}</p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">Last updated {dayLabel(project.updated_at)}</p>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{model.ms.completed} of {model.ms.total} major milestones completed</span>
            <span className="font-medium text-foreground">{model.ms.percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={model.ms.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(3, model.ms.percent)}%` }} />
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Current phase" value={currentPhase(project, model.signals)} />
          <Field label="Next step" value={nextStep(project, model.signals, model.attention)} />
          <Field
            label="Next date on the calendar"
            value={nextDate ? `${nextDate.title} — ${safeDate(nextDate.due_date)}` : "No date scheduled yet. We'll post one as soon as the jurisdiction confirms it."}
          />
        </dl>
      </div>

      {/* AI summary */}
      <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
            <Sparkles className="size-4 text-primary" /> PERMIVIO Project Summary
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => summary.mutate()}
              disabled={summary.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
            >
              {summary.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {summary.data ? "Refresh summary" : "Summarize my project"}
            </button>
            <Link
              to="/assistant"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <MessageSquare className="size-4" /> Ask PERMIVIO about this project
            </Link>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          PERMIVIO already knows this project's address, type, scope, jurisdiction, and uploaded documents — you don't need to repeat them.
        </p>
        {summary.error && <p className="mt-3 text-sm text-destructive">We couldn't build the summary just now. Please try again.</p>}
        {summary.data?.summary && (
          <div className="prose prose-sm prose-invert mt-4 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.data.summary}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Plain-language overview */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Where things stand" body={model.status.plain} />
        <Panel title="What happens next" body={nextStep(project, model.signals, model.attention)} />
        <Panel title="What we need from you" body={whatWeNeed(model.attention)} />
        <Panel title="Current risks" list={model.risks} />
      </div>

      {/* Needs your attention */}
      <section aria-labelledby="project-attention">
        <h2 id="project-attention" className="mb-3 text-base font-semibold text-foreground">Needs Your Attention</h2>
        <ClientAttentionList items={model.attention} showProject={false} />
      </section>

      {/* Timeline */}
      <section aria-labelledby="project-timeline" className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <h2 id="project-timeline" className="mb-4 text-base font-semibold text-foreground">Project Timeline</h2>
        <ClientMilestoneTimeline steps={model.ms.steps.map((s) => ({ ...s }))} currentIndex={model.ms.currentIndex} />
      </section>

      {/* Sections that matter for this project */}
      <section aria-labelledby="project-sections">
        <h2 id="project-sections" className="mb-3 text-base font-semibold text-foreground">Project Sections</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <button
              key={m.tab}
              onClick={() => onOpenTab(m.tab)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-primary/40"
            >
              <span className="inline-flex items-center gap-2">
                <span className="text-primary">{m.icon}</span> {m.label}
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>

      {/* Latest updates */}
      <section aria-labelledby="project-updates">
        <h2 id="project-updates" className="mb-3 text-base font-semibold text-foreground">Latest Updates</h2>
        {q.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading updates…</p>
        ) : model.activity.length === 0 ? (
          <p className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No updates yet on this project.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
            {model.activity.slice(0, 10).map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-4">
                <p className="text-sm text-foreground">{friendlyActivity(a.description)}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{dayLabel(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Panel({ title, body, list }: { title: string; body?: string; list?: string[] }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {body && <p className="mt-2 text-sm text-muted-foreground">{body}</p>}
      {list && (
        <ul className="mt-2 space-y-1.5">
          {list.map((l) => (
            <li key={l} className="text-sm text-muted-foreground">• {l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function safeDate(iso: string) {
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}
