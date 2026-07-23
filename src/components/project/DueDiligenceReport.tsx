import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles, ShieldCheck, ShieldAlert, ShieldQuestion,
  Building2, ClipboardList, FileText, Search, ListChecks,
  AlertTriangle, HelpCircle, ArrowRight, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  generateDueDiligence,
  getDueDiligence,
  type DueDiligenceReport,
} from "@/lib/dueDiligence.functions";
import { generateRoadmapFromRules } from "@/lib/roadmap.functions";

type V = "verified" | "ai_assisted" | "needs_confirmation";

const V_META: Record<V, { label: string; klass: string; Icon: typeof ShieldCheck }> = {
  verified: {
    label: "Verified",
    klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30",
    Icon: ShieldCheck,
  },
  ai_assisted: {
    label: "AI-assisted",
    klass: "text-brand bg-brand/10 ring-brand/30",
    Icon: ShieldAlert,
  },
  needs_confirmation: {
    label: "Needs confirmation",
    klass: "text-amber-400 bg-amber-500/10 ring-amber-500/30",
    Icon: ShieldQuestion,
  },
};

function VBadge({ v }: { v: V }) {
  const m = V_META[v] ?? V_META.needs_confirmation;
  const Icon = m.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm ring-1 ${m.klass}`}
    >
      <Icon className="size-3" /> {m.label}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: typeof Building2;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-brand" />
          <h3 className="text-xs font-mono uppercase tracking-widest">{title}</h3>
        </div>
        {typeof count === "number" && (
          <span className="text-[10px] font-mono text-muted-foreground">{count}</span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LineRow({
  label,
  detail,
  v,
  source,
}: {
  label: string;
  detail?: string | null;
  v: V;
  source?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/60 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {detail && <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>}
        {source && (
          <div className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">{source}</div>
        )}
      </div>
      <VBadge v={v} />
    </div>
  );
}

export function DueDiligenceReport({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getDueDiligence);
  const genFn = useServerFn(generateDueDiligence);
  const roadmapFn = useServerFn(generateRoadmapFromRules);

  const q = useQuery({
    queryKey: ["due-diligence", projectId],
    queryFn: () => getFn({ data: { project_id: projectId } }),
  });

  const gen = useMutation({
    mutationFn: () => genFn({ data: { project_id: projectId } }),
    onSuccess: () => {
      toast.success("Due Diligence report generated");
      qc.invalidateQueries({ queryKey: ["due-diligence", projectId] });
      qc.invalidateQueries({ queryKey: ["scope", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Report failed"),
  });

  const buildRoadmap = useMutation({
    mutationFn: () => roadmapFn({ data: { project_id: projectId } }),
    onSuccess: (res) => {
      const c = res?.counts;
      toast.success(
        c
          ? `Roadmap built — ${c.permits} permits · ${c.agencies} agencies · ${c.checklist_added} tasks · ${c.deadlines_added} deadlines · ~${c.timeline_days_min}–${c.timeline_days_max}d (${c.review_cycles_expected} cycle${c.review_cycles_expected > 1 ? "s" : ""})`
          : "Permit Roadmap created",
      );
      qc.invalidateQueries({ queryKey: ["roadmap", projectId] });
      qc.invalidateQueries({ queryKey: ["scope", projectId] });
      qc.invalidateQueries({ queryKey: ["checklist", projectId] });
      qc.invalidateQueries({ queryKey: ["deadlines", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Roadmap failed"),
  });


  const report = q.data?.report ?? null;
  const status = q.data?.intake_status ?? "draft";
  const intakeReady = status !== "draft" && status !== "questions";

  // Empty / CTA state
  if (!report) {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-mono uppercase tracking-widest text-brand">
              Project Due Diligence
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Generate a plain-language report from your intake answers: agencies, likely approvals,
              required documents, inspections, sequencing, and risks — each with a verification badge.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => gen.mutate()}
            disabled={!intakeReady || gen.isPending}
            title={!intakeReady ? "Finish the intake first" : ""}
          >
            <Sparkles className="size-4 mr-1.5" />
            {gen.isPending ? "Generating…" : "Generate report"}
          </Button>
        </div>
        {!intakeReady && (
          <div className="mt-3 text-[11px] text-muted-foreground">
            Complete the intake steps above, then generate your report.
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overview */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-mono uppercase tracking-widest text-brand">
                Project Due Diligence
              </h3>
              <VBadge v={report.overview.verification as V} />
            </div>
            <div className="text-lg font-semibold mt-2">
              {report.overview.project_type_label}
            </div>
            <div className="text-xs text-muted-foreground">{report.overview.jurisdiction_line}</div>
            <p className="text-sm mt-3 leading-relaxed max-w-3xl">
              {report.overview.plain_summary}
            </p>
            {q.data?.generated_at && (
              <div className="text-[10px] font-mono text-muted-foreground/70 mt-3">
                Generated {new Date(q.data.generated_at).toLocaleString()}
                {q.data.model ? ` · ${q.data.model}` : ""}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => gen.mutate()}
              disabled={gen.isPending}
            >
              <RefreshCw className={`size-4 mr-1.5 ${gen.isPending ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
            <Button
              size="sm"
              onClick={() => buildRoadmap.mutate()}
              disabled={buildRoadmap.isPending}
              title="Builds permit matrix, agency matrix, checklist, tasks, review cycles, and timeline"
            >
              <ArrowRight className="size-4 mr-1.5" />
              {buildRoadmap.isPending ? "Building roadmap…" : "Create Permit Roadmap"}
            </Button>
            <p className="text-[10px] text-muted-foreground text-right leading-tight max-w-[14rem]">
              Builds permits · agencies · checklist · tasks · review cycles · timeline
            </p>

          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
          {(["verified", "ai_assisted", "needs_confirmation"] as V[]).map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <VBadge v={k} />
              <span className="text-[10px] text-muted-foreground">
                {k === "verified" && "confirmed by your intake"}
                {k === "ai_assisted" && "AI-suggested — usually applies"}
                {k === "needs_confirmation" && "confirm with the reviewer"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Key facts" icon={ClipboardList} count={report.key_facts.length}>
          {report.key_facts.map((r, i) => (
            <LineRow key={i} label={r.label} detail={r.detail} v={r.verification as V} source={r.source} />
          ))}
        </Section>

        <Section title="Agencies involved" icon={Building2} count={report.agencies.length}>
          {report.agencies.length ? (
            report.agencies.map((r, i) => (
              <LineRow key={i} label={r.label} detail={r.detail} v={r.verification as V} source={r.source} />
            ))
          ) : (
            <Empty text="Confirm your jurisdiction to populate agencies." />
          )}
        </Section>

        <Section title="Likely approvals" icon={ListChecks} count={report.likely_approvals.length}>
          {report.likely_approvals.map((r, i) => (
            <LineRow key={i} label={r.label} detail={r.detail} v={r.verification as V} source={r.source} />
          ))}
        </Section>

        <Section title="Required documents" icon={FileText} count={report.required_documents.length}>
          {report.required_documents.map((r, i) => (
            <LineRow key={i} label={r.label} detail={r.detail} v={r.verification as V} source={r.source} />
          ))}
        </Section>

        <Section title="Inspections" icon={Search} count={report.inspections.length}>
          {report.inspections.map((r, i) => (
            <LineRow key={i} label={r.label} detail={r.detail} v={r.verification as V} source={r.source} />
          ))}
        </Section>

        <Section title="Risks & watch-outs" icon={AlertTriangle} count={report.risks.length}>
          {report.risks.map((r, i) => (
            <LineRow key={i} label={r.label} detail={r.detail} v={r.verification as V} source={r.source} />
          ))}
        </Section>
      </div>

      <Section title="Recommended sequence" icon={ListChecks} count={report.sequencing.length}>
        <ol className="space-y-2">
          {report.sequencing
            .slice()
            .sort((a, b) => a.step - b.step)
            .map((s) => (
              <li
                key={s.step}
                className="flex items-start gap-3 py-2 border-b border-border/60 last:border-b-0"
              >
                <div className="text-[10px] font-mono text-muted-foreground w-6 pt-0.5">
                  {String(s.step).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.title}</div>
                  {s.detail && (
                    <div className="text-xs text-muted-foreground mt-0.5">{s.detail}</div>
                  )}
                </div>
                <VBadge v={s.verification as V} />
              </li>
            ))}
        </ol>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Open questions" icon={HelpCircle} count={report.open_questions.length}>
          {report.open_questions.length ? (
            <ul className="space-y-2">
              {report.open_questions.map((q, i) => (
                <li key={i} className="border-b border-border/60 last:border-b-0 pb-2 last:pb-0">
                  <div className="text-sm">{q.question}</div>
                  {q.why && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{q.why}</div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No open questions — nice." />
          )}
        </Section>

        <Section title="Next steps" icon={ArrowRight} count={report.next_steps.length}>
          <ol className="space-y-2">
            {report.next_steps.map((n, i) => (
              <li key={i} className="flex items-start gap-3 border-b border-border/60 last:border-b-0 pb-2 last:pb-0">
                <Badge className="bg-brand/10 text-brand border border-brand/30 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </Badge>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.detail && <div className="text-xs text-muted-foreground mt-0.5">{n.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground italic">{text}</div>;
}
