import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, FileText, ClipboardCheck, Landmark, ListChecks, History } from "lucide-react";
import { getProjectFoundation } from "@/lib/projectFoundation.functions";
import type { ProjectTabKey } from "@/lib/projectFoundation";

export function useProjectFoundation(projectId: string) {
  const fn = useServerFn(getProjectFoundation);
  return useQuery({ queryKey: ["project-foundation", projectId], queryFn: () => fn({ data: { project_id: projectId } }) });
}

const JUR_LABEL: Record<string, { label: string; cls: string }> = {
  human_verified: { label: "Verified by Permivio", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  user_confirmed: { label: "Confirmed by you · needs verification", cls: "border-border bg-muted text-muted-foreground" },
  pending_review: { label: "Pending Permivio review", cls: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
  unconfirmed: { label: "Needs verification", cls: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
  none: { label: "Not identified", cls: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
};
const VERIF: Record<string, string> = { verified: "Verified", ai_assisted: "Needs verification", needs_agency_confirmation: "Needs verification" };

/** Compact persistent context for the project header: phase + permit progress. */
export function ProjectPhaseChips({ projectId }: { projectId: string }) {
  const q = useProjectFoundation(projectId);
  if (!q.data) return null;
  const { phaseLabel, progress } = q.data;
  return (
    <span className="inline-flex items-center gap-3">
      <span className="inline-flex items-center gap-1">· Phase: <span className="text-foreground">{phaseLabel}</span></span>
      <span className="inline-flex items-center gap-1.5">
        · Permits {progress.total ? `${progress.done}/${progress.total}` : "—"}
        {progress.total > 0 && (
          <span className="inline-block h-1.5 w-16 rounded-full bg-muted overflow-hidden">
            <span className="block h-full bg-brand" style={{ width: `${progress.pct}%` }} />
          </span>
        )}
      </span>
    </span>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
      <p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="text-brand">{icon}</span>{title}
      </p>
      {children}
    </section>
  );
}

export function ProjectFoundationPanel({ projectId, onOpenTab }: { projectId: string; onOpenTab: (t: ProjectTabKey) => void }) {
  const q = useProjectFoundation(projectId);
  if (q.isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading project status…</div>;
  if (q.error || !q.data) return <div className="p-4 text-sm text-muted-foreground">Project status is unavailable right now.</div>;
  const d = q.data;
  const jur = JUR_LABEL[d.jurisdiction.status] ?? JUR_LABEL.none;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card icon={<ListChecks className="size-3.5" />} title="Next actions">
          {d.nextActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing outstanding right now.</p>
          ) : (
            <ul className="space-y-2">
              {d.nextActions.slice(0, 5).map((a) => (
                <li key={a.key}>
                  <button onClick={() => onOpenTab(a.tab)} className="group w-full text-left rounded-lg border border-border p-3 hover:border-brand">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {a.tone === "urgent" && <span className="mr-2 inline-block size-2 rounded-full bg-destructive align-middle" />}
                        {a.title}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-brand" />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{a.why}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={<ClipboardCheck className="size-3.5" />} title="Project status">
          <p className="text-lg font-semibold text-foreground">{d.phaseLabel}</p>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Required permits approved</span>
              <span>{d.progress.total ? `${d.progress.done} of ${d.progress.total}` : "No permit list yet"}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-brand" style={{ width: `${d.progress.pct}%` }} /></div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Open findings", d.state.openPlanFindings, "planqaqc"],
              ["Open corrections", d.state.openCorrections, "responses"],
              ["Upcoming inspections", d.state.inspectionsUpcoming, "inspections"],
            ].map(([l, n, t]) => (
              <button key={l as string} onClick={() => onOpenTab(t as ProjectTabKey)} className="rounded-lg border border-border p-2 hover:border-brand">
                <dt className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{l}</dt>
                <dd className="text-lg font-semibold text-foreground">{n as number}</dd>
              </button>
            ))}
          </dl>
        </Card>
      </div>

      <Card icon={<Landmark className="size-3.5" />} title="Property & jurisdiction">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="text-sm">
            <p className="text-foreground">{d.jurisdiction.address || "No address yet"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[d.jurisdiction.municipality, d.jurisdiction.county, d.jurisdiction.state].filter(Boolean).join(" · ") || d.jurisdiction.name || "Jurisdiction not identified"}
            </p>
          </div>
          <span className={`rounded border px-2 py-0.5 text-[11px] ${jur.cls}`}>{jur.label}</span>
        </div>
        {d.jurisdiction.authorities.length > 0 && (
          <ul className="mt-3 divide-y divide-border text-sm">
            {d.jurisdiction.authorities.map((a) => (
              <li key={a.official_name + a.role} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="text-foreground">{a.official_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{a.role.replace(/_/g, " ")}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-xs">
                  <span className="text-muted-foreground">{VERIF[a.verification] ?? "Needs verification"}</span>
                  {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Source</a>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button onClick={() => onOpenTab("property")} className="mt-3 text-xs text-brand hover:underline">Open property & jurisdiction →</button>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card icon={<FileText className="size-3.5" />} title="Recent documents">
          {d.recentDocuments.length === 0 ? <p className="text-sm text-muted-foreground">No documents uploaded.</p> : (
            <ul className="space-y-1.5 text-sm">
              {d.recentDocuments.map((doc) => (
                <li key={doc.id} className="flex justify-between gap-2">
                  <span className="truncate text-foreground">{doc.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => onOpenTab("docs")} className="mt-3 text-xs text-brand hover:underline">Open documents →</button>
        </Card>
        <Card icon={<History className="size-3.5" />} title="Recent activity">
          {d.recentActivity.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
            <ul className="space-y-1.5 text-sm">
              {d.recentActivity.slice(0, 5).map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="truncate text-foreground">{a.description}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => onOpenTab("timeline")} className="mt-3 text-xs text-brand hover:underline">Full activity →</button>
        </Card>
      </div>
    </div>
  );
}
