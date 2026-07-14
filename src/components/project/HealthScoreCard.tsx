import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { computeProjectHealth } from "@/lib/projects.functions";

export function HealthScoreCard({ projectId }: { projectId: string }) {
  const healthFn = useServerFn(computeProjectHealth);
  const q = useQuery({
    queryKey: ["health", projectId],
    queryFn: () => healthFn({ data: { project_id: projectId } }),
    refetchInterval: 30000,
  });

  if (q.isLoading || !q.data) {
    return (
      <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Permit Health</p>
        <p className="text-sm text-muted-foreground mt-1">Calculating…</p>
      </section>
    );
  }
  const { score, risk, reasons } = q.data;
  const riskColor =
    risk === "low" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15" :
    risk === "medium" ? "text-amber-700 dark:text-amber-300 bg-amber-500/15" :
    "text-destructive bg-destructive/15";
  const scoreColor = score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-destructive";
  return (
    <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg viewBox="0 0 60 60" className="size-16 -rotate-90">
            <circle cx="30" cy="30" r="26" strokeWidth="6" className="stroke-muted" fill="none" />
            <circle
              cx="30" cy="30" r="26" strokeWidth="6" fill="none"
              strokeLinecap="round"
              className={scoreColor}
              stroke="currentColor"
              strokeDasharray={`${(score / 100) * 163.4} 163.4`}
            />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center text-xl font-bold ${scoreColor}`}>{score}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Permit Health</p>
            <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${riskColor}`}>
              {risk} risk
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {reasons.slice(0, 4).map((r, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {r}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
