import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Building2, Landmark, Sparkles, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow } from "date-fns";
import { advanceStage } from "@/lib/projects.functions";
import { summarizeProjectNextSteps } from "@/lib/chat.functions";
import { HealthScoreCard } from "@/components/project/HealthScoreCard";
import { PermitRoadmap } from "@/components/project/PermitRoadmap";
import { LivePermitCard } from "@/components/project/LivePermitCard";
import { LiveJurisdictionSync } from "@/components/project/LiveJurisdictionSync";
import { AiCopilotPanel } from "@/components/project/AiCopilotPanel";
import { MetaCard } from "@/components/project/MetaCard";
import { ProjectTypeBadge } from "@/components/project-type/ProjectTypeBadge";

export function OverviewTab({
  project, stage, activity, onChange,
}: {
  project: { id: string; user_id: string; name: string; project_type: string; location: string; jurisdiction: string; current_stage: number; permit_count: number; permits_issued: number; linked_permit_number?: string | null; linked_permit_url?: string | null; linked_permit_data?: unknown; linked_permit_synced_at?: string | null };
  stage: number;
  activity: Array<{ id: string; description: string; created_at: string }>;
  onChange: () => void;
}) {
  const advanceFn = useServerFn(advanceStage);
  const summarizeFn = useServerFn(summarizeProjectNextSteps);
  const qc = useQueryClient();

  const advance = useMutation({
    mutationFn: () => advanceFn({ data: { id: project.id } }),
    onSuccess: () => { onChange(); qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Stage advanced"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const summary = useMutation({
    mutationFn: () => summarizeFn({ data: { id: project.id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <HealthScoreCard projectId={project.id} />
      <PermitRoadmap
        projectId={project.id}
        userId={project.user_id}
        stage={stage}
        onAdvance={() => advance.mutate()}
        advancing={advance.isPending}
      />


      {/* Live jurisdiction tracking */}
      <LivePermitCard project={project} onChange={onChange} />

      {/* Live jurisdiction tracking */}
      <LiveJurisdictionSync projectId={project.id} jurisdiction={project.jurisdiction} />

      {/* AI Copilot */}
      <AiCopilotPanel projectId={project.id} />




      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI_NEXT_STEPS</p>
          <button
            onClick={() => summary.mutate()}
            disabled={summary.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
          >
            {summary.data ? <RefreshCw className="size-3" /> : <Sparkles className="size-3" />}
            {summary.isPending ? "Thinking…" : summary.data ? "Regenerate" : "Generate"}
          </button>
        </div>
        {summary.data ? (
          <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
            <div className="text-sm text-foreground leading-relaxed
              [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
              [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5
              [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5
              [&_li]:marker:text-brand
              [&_strong]:text-foreground [&_strong]:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.data.summary}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl text-sm text-muted-foreground">
            Generate an AI summary of the next concrete steps for this project.
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3">
        <MetaCard icon={<MapPin className="size-4" />} label="Location" value={project.location || "—"} />
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl flex items-start gap-3">
          <Building2 className="size-4 text-brand mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Project Type</p>
            <ProjectTypeBadge
              primaryId={(project as any).primary_project_type_id ?? null}
              additionalIds={(project as any).additional_project_type_ids ?? []}
              fallbackText={project.project_type}
            />
          </div>
        </div>
        <MetaCard icon={<Landmark className="size-4" />} label="Jurisdiction" value={project.jurisdiction || "—"} />
      </section>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">RECENT_ACTIVITY</p>
        {activity.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center rounded-xl border border-dashed border-border">No activity yet.</div>
        ) : (
          <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl divide-y divide-border">
            {activity.map((a) => (
              <div key={a.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                <div className="size-2 mt-1.5 rounded-full bg-brand shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{a.description}</p>
                  <p className="text-[11px] font-mono uppercase text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
