import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Loader2, MapPinned, Plus, Sparkles } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { getClientDashboard } from "@/lib/clientDashboard.functions";
import { ClientAttentionList } from "@/components/client/ClientAttentionList";
import { ClientProjectCard } from "@/components/client/ClientProjectCard";
import {
  attentionItems,
  clientStatus,
  type AttentionItem,
  type ClientProjectInput,
  type ClientSignals,
} from "@/lib/clientView";

/**
 * Simplified, client-facing dashboard.
 * Reads the same projects, checklist items, deadlines, inspections and documents
 * as the professional views — only the presentation is simpler.
 */
export function ClientDashboard({ onCreateProject }: { onCreateProject: () => void }) {
  const fn = useServerFn(getClientDashboard);
  const q = useQuery({ queryKey: ["client-dashboard"], queryFn: () => fn() });

  const model = useMemo(() => {
    const d = q.data;
    if (!d) return null;
    const projects = d.projects as unknown as ClientProjectInput[];
    const docCounts = new Map<string, number>();
    for (const doc of d.documents as Array<{ project_id: string }>) {
      docCounts.set(doc.project_id, (docCounts.get(doc.project_id) ?? 0) + 1);
    }
    const rows = projects.map((p) => {
      const signals: ClientSignals = {
        items: (d.items as ClientSignals["items"]).filter((i) => i.project_id === p.id),
        deadlines: (d.deadlines as ClientSignals["deadlines"]).filter((x) => x.project_id === p.id),
        inspections: (d.inspections as ClientSignals["inspections"]).filter((x) => x.project_id === p.id),
        documentCount: docCounts.get(p.id) ?? 0,
      };
      const attention = attentionItems(p, signals);
      const status = clientStatus(p, signals, attention.length);
      return { project: p, signals, attention, status };
    });
    const groups = rows
      .filter((r) => r.attention.length > 0)
      .map((r) => ({ project: r.project, items: r.attention.slice(0, 4) as AttentionItem[] }));
    return { rows, groups };
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading your projects…
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="rounded-3xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-foreground">
        We couldn't load your projects just now. Please refresh the page.
      </div>
    );
  }
  if (!model) return null;

  if (model.rows.length === 0) {
    return <ClientEmptyState onCreateProject={onCreateProject} />;
  }

  return (
    <div className="space-y-10">
      {/* Items needed from you */}
      <section aria-labelledby="items-needed">
        <h2 id="items-needed" className="mb-3 text-lg font-semibold text-foreground">
          Items Needed From You
        </h2>
        {model.groups.length === 0 ? (
          <div className="flex items-start gap-3 rounded-3xl border border-border bg-card p-5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[oklch(0.82_0.15_155)]" />
            <div>
              <p className="text-sm font-medium text-foreground">Nothing needed from you right now.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Permivio is handling the next steps. Anything we need will appear here first.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {model.groups.map((g) => (
              <div key={g.project.id} className="rounded-3xl border border-border bg-card p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{g.project.name}</p>
                  <Link
                    to="/projects/$id"
                    params={{ id: g.project.id }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View project <ArrowRight className="size-3.5" />
                  </Link>
                </div>
                <ClientAttentionList items={g.items} showProject={false} compact />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My projects */}
      <section aria-labelledby="my-projects">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="my-projects" className="text-lg font-semibold text-foreground">My Projects</h2>
          <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            Project board <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {model.rows.map((r) => (
            <ClientProjectCard key={r.project.id} project={r.project} signals={r.signals} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function dayLabel(iso: string) {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMMM d");
  } catch {
    return "—";
  }
}

function ClientEmptyState({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 sm:p-10">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <Sparkles className="size-3.5" /> Let's get started
      </span>
      <h2 className="mt-4 text-2xl font-semibold text-foreground">Let's get your first project started.</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Enter an address and tell us what you want to do. Permivio will help determine the jurisdiction, the approvals
        you'll likely need, the documents to gather, and your next steps — in plain language.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={onCreateProject}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          <Plus className="size-4" /> Start a project
        </button>
        <Link
          to="/property"
          className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <MapPinned className="size-4" /> Run a site investigation
        </Link>
      </div>
    </div>
  );
}
