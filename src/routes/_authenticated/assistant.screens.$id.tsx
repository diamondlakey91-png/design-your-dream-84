import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Layers, ShieldAlert, ListChecks, ArrowUpRight, X, Rocket, Loader2,
} from "lucide-react";
import { getScreenSet, listScreenSetAnalyses, removeAnalysisFromScreenSet } from "@/lib/screenSets.functions";
import { promoteAnalysisToProject } from "@/lib/permitAnalysis.functions";

export const Route = createFileRoute("/_authenticated/assistant/screens/$id")({
  head: () => ({ meta: [{ title: "Compare Sites — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: ScreenSetDetail,
});

type Analysis = {
  permits?: Array<Record<string, string>>;
  risks?: Array<Record<string, string>>;
  next_actions?: Array<Record<string, string>>;
  sources?: Array<Record<string, unknown>>;
};
type AnalysisRow = {
  id: string;
  title: string;
  jurisdiction: string | null;
  project_id: string | null;
  analysis: Analysis;
  created_at: string;
};

function severityDot(s: string | undefined) {
  const v = (s || "").toLowerCase();
  if (v === "red") return "bg-red-400";
  if (v === "amber") return "bg-amber-400";
  return "bg-sky-400";
}

function ScreenSetDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const setFn = useServerFn(getScreenSet);
  const analysesFn = useServerFn(listScreenSetAnalyses);
  const removeFn = useServerFn(removeAnalysisFromScreenSet);
  const promoteFn = useServerFn(promoteAnalysisToProject);

  const setQ = useQuery({ queryKey: ["screen-set", id], queryFn: () => setFn({ data: { id } }) });
  const analysesQ = useQuery({
    queryKey: ["screen-set-analyses", id],
    queryFn: () => analysesFn({ data: { screen_set_id: id } }),
  });

  const remove = useMutation({
    mutationFn: (analysis_id: string) => removeFn({ data: { analysis_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screen-set-analyses", id] });
      qc.invalidateQueries({ queryKey: ["screen-sets"] });
      toast.success("Removed from comparison");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const promote = useMutation({
    mutationFn: (analysis_id: string) => promoteFn({ data: { analysis_id } }),
    onSuccess: (project) => {
      toast.success(`Project "${project.name}" created`);
      navigate({ to: "/projects/$id", params: { id: project.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const set = setQ.data;
  const analyses = (analysesQ.data ?? []) as AnalysisRow[];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#05070d] via-[#080b16] to-[#0a0f22] text-zinc-100">
      <header className="border-b border-white/5 backdrop-blur bg-black/30 sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/assistant/screens" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" /> Comparisons
          </Link>
          <Link
            to="/assistant/analysis"
            search={{ screen_set_id: id, open: "" }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-violet-600 hover:opacity-90 text-white text-sm font-medium px-3 py-1.5"
          >
            <Plus className="size-4" /> Add candidate
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-4">
        <div>
          <div className="flex items-center gap-2 text-sky-300/80">
            <Layers className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Site Screening</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{set?.name ?? "Loading…"}</h1>
          {set?.notes && <p className="text-sm text-zinc-400 mt-1">{set.notes}</p>}
          <p className="text-xs font-mono text-zinc-500 mt-1">
            {analyses.length} candidate{analyses.length === 1 ? "" : "s"}
          </p>
        </div>

        {analysesQ.isLoading && <div className="text-sm text-zinc-400">Loading…</div>}

        {!analysesQ.isLoading && analyses.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <p className="text-sm text-zinc-400">No candidates yet.</p>
            <Link
              to="/assistant/analysis"
              search={{ screen_set_id: id, open: "" }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10 px-3 py-1.5 text-sm"
            >
              <Plus className="size-4" /> Add the first candidate
            </Link>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {analyses.map((a) => {
            const permits = a.analysis?.permits ?? [];
            const risks = a.analysis?.risks ?? [];
            const nextAction = a.analysis?.next_actions?.[0];
            const sources = a.analysis?.sources ?? [];
            const riskCounts = { red: 0, amber: 0, info: 0 } as Record<string, number>;
            risks.forEach((r) => {
              const s = (r.severity || "info").toLowerCase();
              riskCounts[s] = (riskCounts[s] ?? 0) + 1;
            });
            const requiredPermits = permits.filter((p) =>
              (p.verification_status || "").includes("required") || p.priority === "critical",
            ).length;

            return (
              <div key={a.id} className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-4 flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{a.jurisdiction || "Jurisdiction unspecified"}</p>
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="size-3.5" /> {permits.length} permits ({requiredPermits} required)
                  </span>
                </div>

                {risks.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldAlert className="size-3.5 text-zinc-400" />
                    {(["red", "amber", "info"] as const).map((sev) =>
                      riskCounts[sev] > 0 ? (
                        <span key={sev} className="inline-flex items-center gap-1">
                          <span className={`size-1.5 rounded-full ${severityDot(sev)}`} /> {riskCounts[sev]}
                        </span>
                      ) : null,
                    )}
                    <span className="text-zinc-500">{risks.length} risk{risks.length === 1 ? "" : "s"} flagged</span>
                  </div>
                )}

                {nextAction && (
                  <div className="text-xs text-zinc-400 line-clamp-2">
                    <span className="font-mono uppercase tracking-widest text-zinc-500 text-[10px]">Next: </span>
                    {nextAction.action}
                  </div>
                )}

                <div className="text-[11px] font-mono text-zinc-500">
                  {sources.length} source{sources.length === 1 ? "" : "s"} · {new Date(a.created_at).toLocaleDateString()}
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                  <Link
                    to="/assistant/analysis"
                    search={{ screen_set_id: "", open: a.id }}
                    className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline"
                  >
                    View full analysis <ArrowUpRight className="size-3" />
                  </Link>
                  <button
                    onClick={() => promote.mutate(a.id)}
                    disabled={promote.isPending || !!a.project_id}
                    title={a.project_id ? "Already promoted to a project" : "Create a tracked project from this candidate"}
                    className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 px-2 py-1 text-[11px] hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    {promote.isPending ? <Loader2 className="size-3 animate-spin" /> : <Rocket className="size-3" />}
                    {a.project_id ? "Promoted" : "Promote to project"}
                  </button>
                  <button
                    onClick={() => remove.mutate(a.id)}
                    disabled={remove.isPending}
                    title="Remove from comparison"
                    className="inline-flex items-center justify-center rounded-md p-1 text-zinc-500 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
