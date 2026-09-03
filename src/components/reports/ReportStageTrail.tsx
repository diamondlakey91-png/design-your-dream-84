import { Check } from "lucide-react";
import type { ClientReportStage } from "@/lib/clientReports.functions";

export const STAGE_LABEL: Record<ClientReportStage, string> = {
  ordered: "Order received",
  in_research: "Research underway",
  in_review: "Professional review",
  ready: "Ready to view",
  delivered: "Delivered",
};

const ORDER: ClientReportStage[] = ["ordered", "in_research", "in_review", "ready", "delivered"];

/** Plain-language production progress for a purchased report. */
export function ReportStageTrail({ stage, className = "" }: { stage: ClientReportStage; className?: string }) {
  const current = ORDER.indexOf(stage);
  return (
    <ol className={`grid gap-2 sm:grid-cols-5 ${className}`}>
      {ORDER.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${
                done
                  ? "border-[oklch(0.75_0.16_155)]/50 bg-[oklch(0.75_0.16_155)]/15 text-[oklch(0.82_0.15_155)]"
                  : active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-secondary/50 text-muted-foreground"
              }`}
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={`text-[11px] ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {STAGE_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
