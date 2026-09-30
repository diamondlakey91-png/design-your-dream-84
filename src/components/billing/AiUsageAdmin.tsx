import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { listAiUsageAdmin } from "@/lib/commerce.functions";

export function AiUsageAdmin() {
  const fn = useServerFn(listAiUsageAdmin);
  const q = useQuery({ queryKey: ["admin-ai-usage"], queryFn: () => fn() });
  if (q.isLoading) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (q.error) return <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground">{(q.error as Error).message}</p>;
  const rows = q.data ?? [];
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">AI usage (latest 200)</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No AI calls recorded yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>{["When", "Operation", "Model", "Result", "Tokens in/out", "Est. cost", "Credits", "Use"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="text-foreground">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">{r.operation.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.model ?? "—"}</td>
                  <td className={`py-2 pr-3 ${r.success ? "text-foreground" : "text-destructive"}`} title={r.error ?? undefined}>{r.success ? "Success" : "Failed"}</td>
                  <td className="py-2 pr-3">{r.input_tokens} / {r.output_tokens}</td>
                  <td className="py-2 pr-3">${Number(r.estimated_cost).toFixed(4)}</td>
                  <td className="py-2 pr-3">{r.credits_charged}{r.refunded ? " (restored)" : ""}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.internal_use ? "Internal" : "Billable"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
