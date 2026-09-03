import { Link } from "@tanstack/react-router";
import { ArrowRight, Info, MapPin, Building2, Clock, Compass } from "lucide-react";
import { formatDistanceToNow, isToday, format, parseISO } from "date-fns";
import {
  TONE_CLASSES,
  attentionItems,
  clientStatus,
  currentPhase,
  nextStep,
  type ClientProjectInput,
  type ClientSignals,
} from "@/lib/clientView";

function updatedLabel(iso: string) {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return `Today at ${format(d, "h:mm a")}`;
    return `${formatDistanceToNow(d, { addSuffix: true })}`;
  } catch {
    return "—";
  }
}

/** Clean, scannable project card for the client dashboard. */
export function ClientProjectCard({ project, signals }: { project: ClientProjectInput; signals: ClientSignals }) {
  const attention = attentionItems(project, signals);
  const status = clientStatus(project, signals, attention.length);
  const tone = TONE_CLASSES[status.tone];

  return (
    <div className="rounded-3xl border border-border bg-card p-5 transition-colors hover:border-primary/40 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-foreground">{project.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {project.location && (
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{project.location}</span>
            )}
            {project.project_type && (
              <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" />{project.project_type}</span>
            )}
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tone.badge}`}>
          <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} /> {status.label}
        </span>
      </div>

      {attention.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-primary/35 bg-primary/10 px-3 py-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs text-foreground">
            We need {attention.length} item{attention.length === 1 ? "" : "s"} from you: {attention[0].whatIsNeeded}
            {attention.length > 1 ? ` and ${attention.length - 1} more.` : "."}
          </p>
        </div>
      )}


      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Current step</dt>
          <dd className="mt-1 text-sm text-foreground">{currentPhase(project, signals)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Next step</dt>
          <dd className="mt-1 text-sm text-foreground">{nextStep(project, signals, attention)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" /> Last updated {updatedLabel(project.updated_at)}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Link
            to="/projects/$id"
            params={{ id: project.id }}
            search={{ tab: "site" }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Compass className="size-4" /> Site Investigation
          </Link>
          <Link
            to="/projects/$id"
            params={{ id: project.id }}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            View project <ArrowRight className="size-4" />
          </Link>
        </span>
      </div>
    </div>
  );
}
