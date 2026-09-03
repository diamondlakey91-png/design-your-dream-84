import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectIntelligence } from "@/lib/projectIntelligence.functions";
import { HEALTH_LABEL, PARTY_LABEL, type ResponsibleParty } from "@/lib/projectIntelligence";
import { AlertTriangle, CheckCircle2, Circle, Clock, FileWarning, GitBranch, Layers, ShieldCheck, Users } from "lucide-react";

function Card({ title, icon, children, right }: { title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          {icon}
          {title}
        </h3>
        {right}
      </header>
      {children}
    </section>
  );
}

const healthTone: Record<string, string> = {
  on_track: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  at_risk: "text-brand border-brand/40 bg-brand/10",
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
};

export function IntelligenceTab({ projectId }: { projectId: string }) {
  const fn = useServerFn(getProjectIntelligence);
  const q = useQuery({ queryKey: ["project-intelligence", projectId], queryFn: () => fn({ data: { project_id: projectId } }) });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Building project intelligence…</p>;
  if (q.error || !q.data) return <p className="text-sm text-muted-foreground">Intelligence unavailable: {q.error instanceof Error ? q.error.message : "unknown error"}</p>;

  const { core, criticalPath, responsibility, readiness, missingDocuments, health, revisions, openingReadiness } = q.data;

  return (
    <div className="space-y-6">
      <p className="text-[11px] text-muted-foreground">
        Derived from this project's own record — permits, documents, comments, inspections and deadlines. AI-assisted analysis, not a
        jurisdiction determination. Confirm requirements with each agency.
      </p>

      {/* Health + critical path */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Project health"
          icon={<ShieldCheck className="size-3.5" />}
          right={
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-widest ${healthTone[health.level]}`}>
              {HEALTH_LABEL[health.level]}
            </span>
          }
        >
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {health.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <Circle className="mt-1.5 size-1.5 shrink-0 fill-current" /> {r}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Current critical path" icon={<GitBranch className="size-3.5" />}>
          {criticalPath.controlling ? (
            <>
              <p className="text-lg font-medium text-foreground">{criticalPath.controlling.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{criticalPath.controlling.why}</p>
              <p className="mt-2 text-xs text-brand">Owner: {PARTY_LABEL[criticalPath.controlling.party]}</p>
              <p className="mt-3 text-xs text-muted-foreground">{criticalPath.slip_note}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing is currently controlling the completion date.</p>
          )}
          <ol className="mt-4 space-y-1.5">
            {criticalPath.chain.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                {s.state === "complete" ? (
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                ) : s.state === "active" ? (
                  <Clock className="size-3.5 text-brand" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground/50" />
                )}
                <span className={s.state === "not_applicable" ? "text-muted-foreground/60 line-through" : "text-foreground"}>{s.label}</span>
                {s.detail && <span className="truncate text-xs text-muted-foreground">— {s.detail}</span>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* Core record */}
      <Card title="Project intelligence core" icon={<Layers className="size-3.5" />}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Address", core.address],
            ["Jurisdiction", core.jurisdiction ? `${core.jurisdiction}${core.jurisdiction_confirmed ? " (confirmed)" : " (needs confirmation)"}` : null],
            ["Project type", core.project_type],
            ["Existing use", core.occupancy_existing],
            ["Proposed use", core.occupancy_proposed],
            ["Target construction start", core.target_start_date],
            ["Target opening / CO", core.target_open_date],
            ["Permits tracked", String(core.counts.permits)],
            ["Documents on file", String(core.counts.documents)],
            ["Open reviewer comments", String(core.counts.open_comments)],
            ["Unresolved QA/QC findings", String(core.counts.unresolved_findings)],
            ["Inspections", String(core.counts.inspections)],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{label}</dt>
              <dd className="text-sm text-foreground">{value || <span className="text-muted-foreground/60">Not captured yet</span>}</dd>
            </div>
          ))}
        </dl>
        {core.scope_text && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{core.scope_text}</p>}
      </Card>

      {/* Responsibility matrix */}
      <Card title="Who owes what" icon={<Users className="size-3.5" />}>
        {responsibility.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open items on this project.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {responsibility.map((r) => (
              <div key={r.party} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {r.party === "client" ? "Waiting on you" : r.party === "permivio" ? "Permivio is handling" : `Waiting on ${PARTY_LABEL[r.party as ResponsibleParty]}`}
                  </p>
                  <span className="text-xs font-mono text-brand">{r.count} item{r.count === 1 ? "" : "s"}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {r.items.map((i) => (
                    <li key={i.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                      {i.blocking ? <AlertTriangle className="mt-0.5 size-3 shrink-0 text-brand" /> : <Circle className="mt-1 size-1.5 shrink-0 fill-current" />}
                      <span>
                        {i.title}
                        {i.due_date && <span className="text-muted-foreground/70"> · due {i.due_date}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Readiness gate */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Submission readiness"
          icon={<ShieldCheck className="size-3.5" />}
          right={<span className="text-sm font-mono text-brand">{readiness.score}% ready</span>}
        >
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand" style={{ width: `${readiness.score}%` }} />
          </div>
          <ul className="space-y-1.5">
            {readiness.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                {c.passed ? <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-400" /> : <Circle className="mt-1 size-3.5 text-muted-foreground/50" />}
                <span className={c.passed ? "text-muted-foreground" : "text-foreground"}>
                  {c.label}
                  {!c.passed && c.blocking && <span className="ml-1.5 text-[11px] font-mono uppercase text-brand">required</span>}
                </span>
              </li>
            ))}
          </ul>
          {readiness.outstanding.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">{readiness.outstanding.length} item(s) still needed before filing.</p>
          )}
        </Card>

        <Card title="What's missing" icon={<FileWarning className="size-3.5" />}>
          {missingDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No document gaps detected for the permits currently tracked.</p>
          ) : (
            <div className="space-y-3">
              {missingDocuments.map((g) => (
                <div key={g.agency}>
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{g.agency}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {g.present.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-400" />{p}</li>
                    ))}
                    {g.missing.map((m) => (
                      <li key={m.label} className="flex items-center gap-2 text-foreground">
                        <AlertTriangle className="size-3.5 text-brand" />
                        {m.label}
                        {m.blocking && <span className="text-[11px] font-mono uppercase text-brand">blocking</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Revisions + opening readiness */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Revision control" icon={<Layers className="size-3.5" />}>
          {revisions.current === null ? (
            <p className="text-sm text-muted-foreground">No revision numbers detected in uploaded file names.</p>
          ) : (
            <>
              <p className="text-sm text-foreground">Current permit set — Rev {revisions.current}</p>
              {revisions.mixed.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No mixed revisions detected.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {revisions.mixed.map((m) => (
                    <li key={m.name} className="flex items-center gap-2 text-foreground">
                      <AlertTriangle className="size-3.5 text-brand" /> {m.name} is still Rev {m.rev}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card
          title="Opening / CO readiness"
          icon={<CheckCircle2 className="size-3.5" />}
          right={<span className="text-sm font-mono text-brand">{openingReadiness.score}% ready</span>}
        >
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand" style={{ width: `${openingReadiness.score}%` }} />
          </div>
          {openingReadiness.remaining.length === 0 ? (
            <p className="text-sm text-muted-foreground">All tracked final approvals are recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm text-foreground">
              {openingReadiness.remaining.map((r) => (
                <li key={r} className="flex items-center gap-2"><Circle className="size-3.5 text-muted-foreground/50" />{r}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
