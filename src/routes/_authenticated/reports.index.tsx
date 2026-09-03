import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, ShoppingBag } from "lucide-react";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { listMyReports, type ClientReportRow } from "@/lib/clientReports.functions";
import { DISCLAIMER, money } from "@/lib/toolsCatalog";
import { ReportStageTrail, STAGE_LABEL } from "@/components/reports/ReportStageTrail";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "My Reports — Permivio" },
      {
        name: "description",
        content: "Track every Permivio report you've purchased, follow its progress, and download the finalized branded PDF.",
      },
      { property: "og:title", content: "My Reports — Permivio" },
      { property: "og:description", content: "Purchased permitting reports, production progress, and PDF downloads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsWorkspace,
});

function ReportsWorkspace() {
  const fetchReports = useServerFn(listMyReports);
  const q = useQuery({ queryKey: ["my-reports"], queryFn: () => fetchReports() });

  const rows = q.data ?? [];
  const active = rows.filter((r) => r.stage !== "ready" && r.stage !== "delivered");
  const finished = rows.filter((r) => r.stage === "ready" || r.stage === "delivered");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PermivioPageHeader
        eyebrow="Reports"
        title="My Reports"
        subtitle="Every report you've purchased, where it is in production, and the finalized PDF — saved permanently to your account."
      />

      {q.isLoading && (
        <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your reports…
        </p>
      )}

      {!q.isLoading && rows.length === 0 && (
        <div className="mt-8 rounded-3xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            You haven't purchased a report yet. Choose the report that answers your question and we'll take it from there.
          </p>
          <Link
            to="/tools"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <ShoppingBag className="size-4" /> Browse reports
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">In production</h2>
          <ul className="mt-4 space-y-3">
            {active.map((r) => (
              <ReportCard key={r.order_id} row={r} />
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Delivered reports</h2>
          <ul className="mt-4 space-y-3">
            {finished.map((r) => (
              <ReportCard key={r.order_id} row={r} />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 rounded-3xl border border-border bg-card/60 p-5 text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}

function ReportCard({ row }: { row: ClientReportRow }) {
  return (
    <li className="rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{row.title}</p>
          {row.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{row.subtitle}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {row.project_name ?? "Not linked to a project yet"} · {money(row.amount_cents, row.currency)}
            {row.professionally_reviewed ? " · Professionally reviewed" : ""}
            {row.turnaround && row.stage !== "delivered" && row.stage !== "ready" ? ` · typical turnaround ${row.turnaround}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          {STAGE_LABEL[row.stage]}
        </span>
      </div>

      <ReportStageTrail stage={row.stage} className="mt-4" />

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          to="/reports/$id"
          params={{ id: row.order_id }}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
        >
          <FileText className="size-3.5" /> Open report workspace
        </Link>
        {row.project_id && (
          <Link
            to="/projects/$id"
            params={{ id: row.project_id }}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Go to project
          </Link>
        )}
      </div>
    </li>
  );
}
