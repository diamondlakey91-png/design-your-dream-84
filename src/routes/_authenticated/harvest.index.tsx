import { createFileRoute, Link } from "@tanstack/react-router";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getHarvestOverview } from "@/lib/harvest.functions";
import { syncJurisdiction } from "@/lib/jurisdictionSync.functions";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Filter,
  FolderPlus,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/harvest/")({
  head: () => ({
    meta: [
      { title: "Portal Harvest — Permivio" },
      {
        name: "description",
        content:
          "Operational monitoring for county and provider portals: harvest health per project, latest recorded checks and fallback workflows.",
      },
      { property: "og:title", content: "Portal Harvest — Permivio" },
      {
        property: "og:description",
        content:
          "Track portal harvest health across linked projects, then open any row for portal detail.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HarvestPage,
});

type Health = "synced" | "stale" | "partial" | "failed" | "blocked" | "awaiting";

type Row = {
  project_id: string;
  project_name: string;
  jurisdiction: string;
  location: string | null;
  project_type: string | null;
  health: Health;
  portal_name: string | null;
  portal_url: string | null;
  summary: string | null;
  error: string | null;
  finding_count: number;
  last_checked_at: string | null;
  check_count: number;
  credential_id: string | null;
  credential_label: string | null;
  credential_kind: string | null;
};

const HEALTH: Record<Health, { label: string; className: string; dot: string }> = {
  synced: {
    label: "Synced",
    className: "border-[oklch(0.75_0.16_155)]/50 text-[oklch(0.78_0.15_155)]",
    dot: "bg-[oklch(0.75_0.16_155)]",
  },
  stale: {
    label: "Stale",
    className: "border-[oklch(0.66_0.19_258)]/50 text-[oklch(0.66_0.19_258)]",
    dot: "bg-[oklch(0.66_0.19_258)]",
  },
  partial: {
    label: "In progress",
    className: "border-primary/50 text-primary",
    dot: "bg-primary",
  },
  blocked: {
    label: "No records found",
    className: "border-[oklch(0.7_0.16_290)]/50 text-[oklch(0.78_0.14_290)]",
    dot: "bg-[oklch(0.7_0.16_290)]",
  },
  failed: {
    label: "Failed",
    className: "border-destructive/50 text-destructive",
    dot: "bg-destructive",
  },
  awaiting: {
    label: "Awaiting first harvest",
    className: "border-border text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
};

const FILTERS: { key: "all" | Health; label: string }[] = [
  { key: "all", label: "All" },
  { key: "synced", label: "Synced" },
  { key: "awaiting", label: "Awaiting" },
  { key: "stale", label: "Stale" },
  { key: "failed", label: "Failed" },
  { key: "blocked", label: "No records" },
];

function ago(iso: string | null) {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background/60">
          <Icon className="size-4 text-primary" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function HarvestPage() {
  const overviewFn = useServerFn(getHarvestOverview);
  const syncFn = useServerFn(syncJurisdiction);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["harvest"], queryFn: () => overviewFn() });
  const rows = (q.data?.rows ?? []) as unknown as Row[];
  const recent = (q.data?.recent ?? []) as unknown as Row[];
  const stats = q.data?.stats;
  const staleDays = q.data?.stale_days ?? 7;

  const [filter, setFilter] = useState<"all" | Health>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sync = useMutation({
    mutationFn: (projectId: string) => syncFn({ data: { project_id: projectId } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["harvest"] }),
  });

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.health === filter)),
    [rows, filter],
  );
  const selected = rows.find((r) => r.project_id === selectedId) ?? null;
  const attention = rows.filter((r) =>
    ["stale", "failed", "partial", "blocked"].includes(r.health),
  );

  const exportCsv = () => {
    const head = [
      "Project",
      "Jurisdiction",
      "Harvest status",
      "Portal",
      "Records found",
      "Checks recorded",
      "Last checked",
    ];
    const body = visible.map((r) => [
      r.project_name,
      r.jurisdiction,
      HEALTH[r.health].label,
      r.portal_name ?? "",
      String(r.finding_count),
      String(r.check_count),
      r.last_checked_at ?? "",
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "permivio-portal-harvest.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        <PermivioPageHeader
          eyebrow="Portal harvest"
          title="Operational monitoring for county and provider portals."
          subtitle="Track harvest health across linked projects, then open any row for portal detail. Every status comes from a recorded check — nothing is simulated."
          actions={<>
          <button
            type="button"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
          >
            {q.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh harvest health
          </button>
          </>}
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Connected projects"
            value={stats?.connected ?? 0}
            hint="Linked to a portal credential"
            icon={KeyRound}
          />
          <StatCard
            label="Up to date"
            value={stats?.synced ?? 0}
            hint={`Checked within ${staleDays} days`}
            icon={CheckCircle2}
          />
          <StatCard
            label="Awaiting first harvest"
            value={stats?.awaiting ?? 0}
            hint="No recorded portal check yet"
            icon={Clock}
          />
          <StatCard
            label="Needs attention"
            value={stats?.attention ?? 0}
            hint="Stale, failed, partial, or blocked"
            icon={AlertTriangle}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <section className="rounded-2xl border border-border bg-card/60 p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Live monitoring
            </p>
            <h2 className="mt-1 text-xl font-semibold">Portal queue</h2>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted-foreground">
                <Filter className="size-3.5" /> Filter
              </span>
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`h-9 rounded-xl border px-3 text-xs transition-colors ${
                    filter === f.key
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                onClick={exportCsv}
                disabled={visible.length === 0}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
              >
                <Download className="size-3.5" /> Export
              </button>
              <Link
                to="/settings"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <FolderPlus className="size-3.5" /> Manage credentials
              </Link>
            </div>

            {q.isLoading ? (
              <div className="mt-10 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading harvest health…
              </div>
            ) : rows.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border/70 px-6 py-16 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-background/60">
                  <Globe className="size-5 text-primary" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  Create a project and link a portal credential to start harvesting portal
                  records.
                </p>
                <Link
                  to="/projects"
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="size-4" /> New project
                </Link>
              </div>
            ) : visible.length === 0 ? (
              <p className="mt-8 py-10 text-center text-sm text-muted-foreground">
                No projects match this filter.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {visible.map((r) => {
                  const h = HEALTH[r.health];
                  const isSyncing =
                    sync.isPending && sync.variables === r.project_id;
                  return (
                    <li key={r.project_id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedId(selectedId === r.project_id ? null : r.project_id)
                        }
                        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                          selectedId === r.project_id
                            ? "border-primary/50 bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className={`size-2 shrink-0 rounded-full ${h.dot}`} />
                          <span className="text-sm font-medium">{r.project_name}</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${h.className}`}
                          >
                            {h.label}
                          </span>
                          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                            {ago(r.last_checked_at)}
                          </span>
                        </div>
                        <p className="mt-1 truncate pl-5 text-xs text-muted-foreground">
                          {r.jurisdiction || "Jurisdiction not set"}
                          {r.portal_name ? ` · ${r.portal_name}` : ""}
                          {r.finding_count > 0 ? ` · ${r.finding_count} records` : ""}
                        </p>
                      </button>

                      {selectedId === r.project_id && (
                        <div className="mt-2 rounded-xl border border-border bg-background/40 p-4">
                          <dl className="grid gap-3 text-xs sm:grid-cols-2">
                            <div>
                              <dt className="text-muted-foreground">Credential</dt>
                              <dd className="mt-0.5">
                                {r.credential_label
                                  ? `${r.credential_label}${r.credential_kind ? ` · ${r.credential_kind}` : ""}`
                                  : "No credential linked for this jurisdiction"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Checks recorded</dt>
                              <dd className="mt-0.5 tabular-nums">{r.check_count}</dd>
                            </div>
                            <div className="sm:col-span-2">
                              <dt className="text-muted-foreground">Last harvest note</dt>
                              <dd className="mt-0.5">
                                {r.error || r.summary || "No harvest recorded yet."}
                              </dd>
                            </div>
                          </dl>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => sync.mutate(r.project_id)}
                              disabled={isSyncing}
                              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
                            >
                              {isSyncing ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="size-3.5" />
                              )}
                              Harvest now
                            </button>
                            <Link
                              to="/projects/$id"
                              params={{ id: r.project_id }}
                              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            >
                              Open project
                            </Link>
                            {r.portal_url && (
                              <a
                                href={r.portal_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                              >
                                <ExternalLink className="size-3.5" /> Open portal
                              </a>
                            )}
                          </div>
                          {sync.isError && isSyncing === false && (
                            <p className="mt-2 text-xs text-destructive">
                              {(sync.error as Error)?.message}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Latest checks
              </p>
              <h2 className="mt-1 text-xl font-semibold">Recently checked projects</h2>
              {recent.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No portal checks recorded yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {recent.map((r) => (
                    <li
                      key={r.project_id}
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2"
                    >
                      <span className={`size-2 rounded-full ${HEALTH[r.health].dot}`} />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.project_name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {ago(r.last_checked_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Operator playbook
              </p>
              <h2 className="mt-1 text-xl font-semibold">Fallback workflows</h2>
              {attention.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No stale, failed, partial, or missing harvests right now — connected projects
                  look up to date.
                </p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm">
                  {attention.slice(0, 5).map((r) => (
                    <li key={r.project_id} className="rounded-xl border border-border px-3 py-2">
                      <p className="font-medium">{r.project_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.health === "failed" &&
                          "Harvest failed — re-run, then check the portal manually and log the status source."}
                        {r.health === "stale" &&
                          `Last check is older than ${staleDays} days — re-run a harvest.`}
                        {r.health === "partial" &&
                          "Harvest still running — wait, then refresh harvest health."}
                        {r.health === "blocked" &&
                          "Portal returned no matching records — verify the address or search by permit number."}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
