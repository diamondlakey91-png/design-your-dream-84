import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, FolderKanban, Loader2, MapPinned, Plus, Sparkles, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { getClientDashboard } from "@/lib/clientDashboard.functions";
import { ClientAttentionList } from "@/components/client/ClientAttentionList";
import { ClientProjectCard } from "@/components/client/ClientProjectCard";
import {
  attentionItems,
  clientStatus,
  friendlyActivity,
  type AttentionItem,
  type ClientProjectInput,
  type ClientSignals,
} from "@/lib/clientView";

type Filter = "all" | "attention" | "review" | "approved";

/**
 * Simplified, client-facing dashboard.
 * Reads the same projects, checklist items, deadlines, inspections, documents
 * and activity as the professional views — only the presentation is simpler.
 */
export function ClientDashboard({ onCreateProject }: { onCreateProject: () => void }) {
  const fn = useServerFn(getClientDashboard);
  const q = useQuery({ queryKey: ["client-dashboard"], queryFn: () => fn() });
  const [filter, setFilter] = useState<Filter>("all");

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
    const allAttention: AttentionItem[] = rows.flatMap((r) => r.attention);
    const nameById = new Map(projects.map((p) => [p.id, p.name] as const));
    return {
      profile: d.profile,
      rows,
      allAttention,
      activity: (d.activity as Array<{ id: string; project_id: string | null; description: string; created_at: string }>).map((a) => ({
        ...a,
        projectName: a.project_id ? nameById.get(a.project_id) ?? null : null,
      })),
      counts: {
        active: rows.filter((r) => !["Complete", "Certificate of Occupancy"].includes(r.status.label)).length,
        attention: rows.filter((r) => r.attention.length > 0).length,
        review: rows.filter((r) => ["Jurisdiction Review", "Submitted", "Resubmitted"].includes(r.status.label)).length,
        approved: rows.filter((r) => ["Approved", "Permit Issued", "Final Approvals", "Certificate of Occupancy", "Complete"].includes(r.status.label)).length,
      },
    };
  }, [q.data]);

  const visibleRows = useMemo(() => {
    if (!model) return [];
    switch (filter) {
      case "attention": return model.rows.filter((r) => r.attention.length > 0);
      case "review": return model.rows.filter((r) => ["Jurisdiction Review", "Submitted", "Resubmitted"].includes(r.status.label));
      case "approved": return model.rows.filter((r) => ["Approved", "Permit Issued", "Final Approvals", "Certificate of Occupancy", "Complete"].includes(r.status.label));
      default: return model.rows;
    }
  }, [model, filter]);

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
    <div className="space-y-8">
      {/* Summary cards — click to filter */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <SummaryCard label="Active projects" value={model.counts.active} active={filter === "all"} onClick={() => setFilter("all")} icon={<FolderKanban className="size-4" />} />
        <SummaryCard label="Needs your attention" value={model.counts.attention} tone="yellow" active={filter === "attention"} onClick={() => setFilter("attention")} icon={<AlertTriangle className="size-4" />} />
        <SummaryCard label="In review" value={model.counts.review} tone="blue" active={filter === "review"} onClick={() => setFilter("review")} icon={<ClipboardCheck className="size-4" />} />
        <SummaryCard label="Approved / ready" value={model.counts.approved} tone="green" active={filter === "approved"} onClick={() => setFilter("approved")} icon={<CheckCircle2 className="size-4" />} />
      </div>

      {/* Needs your attention */}
      <section aria-labelledby="needs-attention">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="needs-attention" className="text-lg font-semibold text-foreground">Needs Your Attention</h2>
          {model.allAttention.length > 0 && (
            <span className="rounded-full border border-[oklch(0.85_0.16_72)]/40 bg-[oklch(0.85_0.16_72)]/12 px-3 py-1 text-xs font-medium text-[oklch(0.88_0.15_72)]">
              {model.allAttention.length} item{model.allAttention.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <ClientAttentionList items={model.allAttention.slice(0, 6)} />
      </section>

      {/* My projects */}
      <section aria-labelledby="my-projects">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="my-projects" className="text-lg font-semibold text-foreground">My Projects</h2>
          <div className="flex items-center gap-3">
            {filter !== "all" && (
              <button onClick={() => setFilter("all")} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                Show all projects
              </button>
            )}
            <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              Project board <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
        {visibleRows.length === 0 ? (
          <p className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No projects match that filter right now.
          </p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleRows.map((r) => (
              <ClientProjectCard key={r.project.id} project={r.project} signals={r.signals} />
            ))}
          </div>
        )}
      </section>

      {/* Latest updates */}
      <section aria-labelledby="latest-updates">
        <h2 id="latest-updates" className="mb-3 text-lg font-semibold text-foreground">Latest Updates</h2>
        {model.activity.length === 0 ? (
          <p className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No updates yet. As soon as something happens on a project, you'll see it here.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
            {model.activity.slice(0, 8).map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{friendlyActivity(a.description)}</p>
                  {a.projectName && <p className="mt-0.5 text-xs text-muted-foreground">{a.projectName}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{dayLabel(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
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

function SummaryCard({
  label, value, onClick, active, tone = "default", icon,
}: {
  label: string; value: number; onClick: () => void; active: boolean;
  tone?: "default" | "blue" | "yellow" | "green"; icon: React.ReactNode;
}) {
  const accent =
    tone === "yellow" ? "text-[oklch(0.88_0.15_72)]" :
    tone === "green" ? "text-[oklch(0.82_0.15_155)]" :
    tone === "blue" ? "text-primary" : "text-muted-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-3xl border bg-card p-5 text-left transition-colors ${
        active ? "border-primary/60" : "border-border hover:border-primary/40"
      }`}
    >
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider ${accent}`}>
        {icon} {label}
      </span>
      <span className="mt-3 block text-3xl font-semibold text-foreground">{value}</span>
    </button>
  );
}

function ClientEmptyState({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 sm:p-10">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <Sparkles className="size-3.5" /> Let's get started
      </span>
      <h2 className="mt-4 text-2xl font-semibold text-foreground">Let's get your first project started.</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Enter an address and tell us what you want to do. PERMIVIO will help determine the jurisdiction, the approvals
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
