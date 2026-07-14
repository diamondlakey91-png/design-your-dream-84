import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { draftClientUpdate, generateMeetingAgenda } from "@/lib/chat.functions";
import { summarizeReviewerComments, flagScheduleRisks } from "@/lib/planReview.functions";

type CopilotTool = "update" | "review" | "agenda" | "risk";

export function AiCopilotPanel({ projectId }: { projectId: string }) {
  const [tool, setTool] = useState<CopilotTool | null>(null);
  const [tone, setTone] = useState<"formal" | "friendly" | "brief">("friendly");
  const [meetingType, setMeetingType] = useState<"kickoff" | "weekly_status" | "pre_submittal" | "review_response" | "inspection_prep">("weekly_status");

  const draftFn = useServerFn(draftClientUpdate);
  const reviewFn = useServerFn(summarizeReviewerComments);
  const agendaFn = useServerFn(generateMeetingAgenda);
  const riskFn = useServerFn(flagScheduleRisks);

  const draft = useMutation({ mutationFn: () => draftFn({ data: { project_id: projectId, tone, audience: "Client / owner" } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const review = useMutation({ mutationFn: () => reviewFn({ data: { project_id: projectId } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const agenda = useMutation({ mutationFn: () => agendaFn({ data: { project_id: projectId, meeting_type: meetingType } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const risk = useMutation({ mutationFn: () => riskFn({ data: { project_id: projectId } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); };

  const tools: Array<{ id: CopilotTool; label: string; desc: string }> = [
    { id: "update", label: "Client update", desc: "Draft status email" },
    { id: "review", label: "Reviewer summary", desc: "Group comments by discipline" },
    { id: "agenda", label: "Meeting agenda", desc: "Generate a tight agenda" },
    { id: "risk", label: "Schedule risks", desc: "Flag delays & bottlenecks" },
  ];

  return (
    <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid size-7 place-items-center rounded-md bg-brand/15 text-brand">
          <Sparkles className="size-4" />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI_COPILOT</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(tool === t.id ? null : t.id)}
            className={`text-left rounded-lg p-3 ring-1 transition ${tool === t.id ? "ring-brand bg-brand/5" : "ring-black/5 bg-background hover:ring-brand/40"}`}
          >
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
          </button>
        ))}
      </div>

      {tool === "update" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Tone:</span>
            {(["friendly", "formal", "brief"] as const).map((t) => (
              <button key={t} onClick={() => setTone(t)} className={`px-2 py-1 rounded font-mono uppercase text-[10px] tracking-wider ${tone === t ? "bg-brand text-brand-foreground" : "bg-muted"}`}>{t}</button>
            ))}
            <button onClick={() => draft.mutate()} disabled={draft.isPending} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50">
              {draft.isPending ? "Drafting…" : draft.data ? <><RefreshCw className="size-3" /> Regenerate</> : <><Sparkles className="size-3" /> Generate</>}
            </button>
          </div>
          {draft.data && (
            <div className="p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-2">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Subject</div>
              <div className="text-sm font-medium">{draft.data.subject}</div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground pt-2">Body</div>
              <div className="text-sm prose-sm [&_p]:my-2 [&_ul]:pl-5 [&_ul]:list-disc"><ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.data.body_markdown}</ReactMarkdown></div>
              <button onClick={() => copy(`${draft.data!.subject}\n\n${draft.data!.body_markdown}`)} className="text-[11px] font-mono uppercase tracking-wider text-brand">Copy</button>
            </div>
          )}
        </div>
      )}

      {tool === "review" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Consolidate reviewer comments from analyzed docs</span>
            <button onClick={() => review.mutate()} disabled={review.isPending} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand disabled:opacity-50">
              {review.isPending ? "Thinking…" : review.data ? <><RefreshCw className="size-3" /> Regenerate</> : <><Sparkles className="size-3" /> Generate</>}
            </button>
          </div>
          {review.data && (
            <div className="p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-3 text-sm">
              {(review.data.top_themes ?? []).length > 0 && (
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Top themes</div>
                  <ul className="list-disc pl-5 space-y-0.5">{(review.data.top_themes ?? []).map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
              )}
              {(review.data.by_discipline ?? []).map((d, i) => (
                <div key={i}>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">{d.discipline}</div>
                  <ul className="list-disc pl-5 space-y-0.5">{(d.items ?? []).map((it, j) => <li key={j}>{it}</li>)}</ul>
                </div>
              ))}
              {(review.data.suggested_response_order ?? []).length > 0 && (
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Suggested response order</div>
                  <ol className="list-decimal pl-5 space-y-0.5">{(review.data.suggested_response_order ?? []).map((t, i) => <li key={i}>{t}</li>)}</ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tool === "agenda" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-muted-foreground">Type:</span>
            {(["weekly_status", "kickoff", "pre_submittal", "review_response", "inspection_prep"] as const).map((t) => (
              <button key={t} onClick={() => setMeetingType(t)} className={`px-2 py-1 rounded font-mono uppercase text-[10px] tracking-wider ${meetingType === t ? "bg-brand text-brand-foreground" : "bg-muted"}`}>{t.replace(/_/g, " ")}</button>
            ))}
            <button onClick={() => agenda.mutate()} disabled={agenda.isPending} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand disabled:opacity-50">
              {agenda.isPending ? "Building…" : agenda.data ? <><RefreshCw className="size-3" /> Regenerate</> : <><Sparkles className="size-3" /> Generate</>}
            </button>
          </div>
          {agenda.data && (
            <div className="p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-2 text-sm">
              <div className="font-semibold">{agenda.data.title} <span className="text-xs text-muted-foreground font-normal">· {agenda.data.duration_minutes} min</span></div>
              {(agenda.data.attendees_suggested ?? []).length > 0 && (
                <div className="text-xs text-muted-foreground">Attendees: {(agenda.data.attendees_suggested ?? []).join(", ")}</div>
              )}
              <ol className="space-y-1.5 mt-2">
                {(agenda.data.agenda ?? []).map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-mono text-xs text-muted-foreground w-10 shrink-0 pt-0.5">{a.minutes}m</span>
                    <div>
                      <div>{a.topic}</div>
                      {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              {(agenda.data.decisions_needed ?? []).length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Decisions needed</div>
                  <ul className="list-disc pl-5 space-y-0.5">{(agenda.data.decisions_needed ?? []).map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tool === "risk" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Analyze deadlines, permits, and inspections for risks</span>
            <button onClick={() => risk.mutate()} disabled={risk.isPending} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand disabled:opacity-50">
              {risk.isPending ? "Analyzing…" : risk.data ? <><RefreshCw className="size-3" /> Rerun</> : <><Sparkles className="size-3" /> Analyze</>}
            </button>
          </div>
          {risk.data && (
            <div className="p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Overall risk</span>
                <span className={`text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded ${risk.data.overall_risk === "high" ? "bg-red-500/15 text-red-600" : risk.data.overall_risk === "medium" ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700"}`}>{risk.data.overall_risk}</span>
              </div>
              {(risk.data.risks ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground">No risks detected from current data.</div>
              ) : (
                <ul className="space-y-2">
                  {(risk.data.risks ?? []).map((r, i) => (
                    <li key={i} className="p-2 rounded bg-card ring-1 ring-black/5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${r.severity === "high" ? "bg-red-500/15 text-red-600" : r.severity === "medium" ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700"}`}>{r.severity}</span>
                        <div className="font-medium">{r.title}</div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{r.detail}</div>
                      {r.mitigation && <div className="text-xs mt-1"><span className="text-muted-foreground">Mitigation:</span> {r.mitigation}</div>}
                      {r.related && <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">{r.related}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
