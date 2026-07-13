import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSharedBatchReport } from "@/lib/reportShares.functions";
import { ShieldCheck, Lock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/share/reports/$token")({
  head: () => ({ meta: [
    { title: "Shared PermitHealth Report — Permivio" },
    { name: "description", content: "Consolidated AI plan review shared from a Permivio project." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: SharedReportPage,
});

type ReportShape = Awaited<ReturnType<typeof getSharedBatchReport>>;

function SharedReportPage() {
  const { token } = Route.useParams();
  const fetchFn = useServerFn(getSharedBatchReport);
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<ReportShape | null>(null);

  const load = useMutation({
    mutationFn: (pw?: string) => fetchFn({ data: { token, password: pw } }),
    onSuccess: (r) => setResult(r),
  });

  useEffect(() => { load.mutate(undefined); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  if (!result || load.isPending) {
    return <Shell><p className="text-sm text-muted-foreground">Loading shared report…</p></Shell>;
  }

  if (result.status === "not_found") {
    return <Shell><Notice icon={<AlertTriangle className="size-5" />} title="Link not found" body="This shared report link is invalid or has been removed by the owner." /></Shell>;
  }
  if (result.status === "revoked") {
    return <Shell><Notice icon={<AlertTriangle className="size-5" />} title="Link revoked" body="The project owner has revoked this shared report." /></Shell>;
  }
  if (result.status === "expired") {
    return <Shell><Notice icon={<AlertTriangle className="size-5" />} title="Link expired" body="This shared report link has expired. Ask the project owner for a fresh link." /></Shell>;
  }
  if (result.status === "password_required" || result.status === "bad_password") {
    const project = (result as { project?: { name?: string; jurisdiction?: string } }).project;
    return (
      <Shell>
        <div className="max-w-sm mx-auto space-y-4 text-center">
          <Lock className="size-8 mx-auto text-brand" />
          <div>
            <p className="text-sm font-semibold">Password required</p>
            {project?.name && <p className="text-xs text-muted-foreground mt-1">{project.name}{project.jurisdiction ? ` · ${project.jurisdiction}` : ""}</p>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); load.mutate(password); }} className="space-y-2">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter access password"
              className="w-full h-10 px-3 rounded-lg bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
            />
            <button className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Unlock</button>
            {result.status === "bad_password" && <p className="text-xs text-destructive">Incorrect password.</p>}
          </form>
        </div>
      </Shell>
    );
  }

  const report = result.report as BatchReport;
  const project = (result.project ?? {}) as { name?: string; jurisdiction?: string; location?: string; project_type?: string };
  const created = result.created_at ? new Date(result.created_at).toLocaleString() : "";
  const expires = result.expires_at ? new Date(result.expires_at).toLocaleDateString() : null;
  const riskColor = report.overall_risk === "high" ? "text-destructive" : report.overall_risk === "medium" ? "text-amber-600" : "text-emerald-600";

  return (
    <Shell>
      <div className="space-y-6">
        <header className="border-b border-border pb-4">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-brand">
            <ShieldCheck className="size-3.5" /> Shared PermitHealth Report
          </div>
          <h1 className="text-2xl font-bold mt-1">{project.name ?? "Project"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {[project.project_type, project.jurisdiction, project.location].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            Generated {created}{expires ? ` · Link expires ${expires}` : ""}
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Plan Health" value={String(report.plan_health_score)} sub={`${report.overall_risk} risk`} valueClass={riskColor} />
          <Metric label="Findings" value={String(report.total_findings)} sub={`${report.by_severity.high} high`} subClass="text-destructive" />
          <Metric label="Medium" value={String(report.by_severity.medium)} valueClass="text-amber-600" />
          <Metric label="Low" value={String(report.by_severity.low)} valueClass="text-emerald-600" />
        </div>

        {report.jurisdictions?.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-mono uppercase tracking-wider mr-1">Jurisdictions:</span>
            {report.jurisdictions.join(", ")}
          </p>
        )}

        {Object.keys(report.by_category ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(report.by_category).map(([k, v]) => (
              <span key={k} className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border border-border bg-card">
                {k.replace(/_/g, " ")} · {v}
              </span>
            ))}
          </div>
        )}

        {report.top_findings?.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Top findings</h2>
            <ul className="space-y-2">
              {report.top_findings.map((f, i) => (
                <li key={i} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${f.severity === "high" ? "bg-destructive/15 text-destructive" : f.severity === "medium" ? "bg-amber-500/15 text-amber-700 dark:text-amber-500" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-500"}`}>{f.severity}</span>
                    <span className="text-[9px] font-mono uppercase text-muted-foreground">{f.category?.replace(/_/g, " ")}</span>
                    <span className="font-medium">{f.title}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{f.detail}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {f.document_name}{f.sheet_reference ? ` · ${f.sheet_reference}` : ""}{f.code_reference ? ` · ${f.code_reference}` : ""}{f.local_amendment ? ` · Local: ${f.local_amendment}` : ""}
                  </p>
                  {f.recommendation && <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-500">→ {f.recommendation}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {report.applied_amendments?.length > 0 && (
          <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
            Applied amendments: {report.applied_amendments.slice(0, 8).join(" · ")}
          </p>
        )}

        <footer className="pt-6 mt-6 border-t border-border text-[11px] text-muted-foreground text-center">
          Confidential — shared via Permivio. Do not redistribute this link.
        </footer>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-10">{children}</div>
    </div>
  );
}

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="max-w-md mx-auto text-center py-16 space-y-3">
      <div className="mx-auto text-muted-foreground">{icon}</div>
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Metric({ label, value, sub, valueClass = "", subClass = "text-muted-foreground" }: { label: string; value: string; sub?: string; valueClass?: string; subClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] font-mono uppercase text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      {sub && <p className={`text-[10px] uppercase ${subClass}`}>{sub}</p>}
    </div>
  );
}

// Loose local type mirroring batchReviewPlans return shape (report is stored as jsonb).
type BatchReport = {
  overall_risk: "low" | "medium" | "high";
  plan_health_score: number;
  total_findings: number;
  by_severity: { high: number; medium: number; low: number };
  by_category: Record<string, number>;
  top_findings: Array<{
    severity: "low" | "medium" | "high";
    category?: string;
    title: string;
    detail: string;
    document_name: string;
    sheet_reference?: string;
    code_reference?: string;
    local_amendment?: string;
    recommendation?: string;
  }>;
  jurisdictions: string[];
  applied_amendments: string[];
};
