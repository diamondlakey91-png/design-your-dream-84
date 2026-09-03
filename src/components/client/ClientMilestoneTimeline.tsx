import { useState } from "react";
import { Check, ChevronDown, Circle, Dot } from "lucide-react";

export type TimelineStep = { key: string; label: string; detail: string; done: boolean };

/** Friendly vertical milestone timeline; each step expands for a plain-language note. */
export function ClientMilestoneTimeline({
  steps,
  currentIndex,
}: {
  steps: TimelineStep[];
  currentIndex: number;
}) {
  const [open, setOpen] = useState<string | null>(steps[currentIndex]?.key ?? null);

  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const isCurrent = i === currentIndex && !s.done;
        const expanded = open === s.key;
        return (
          <li key={s.key} className="relative pl-9">
            {i < steps.length - 1 && (
              <span aria-hidden className={`absolute left-[13px] top-7 h-[calc(100%-12px)] w-px ${s.done ? "bg-[oklch(0.75_0.16_155)]/40" : "bg-border"}`} />
            )}
            <span
              aria-hidden
              className={`absolute left-0 top-2 grid size-7 place-items-center rounded-full border ${
                s.done
                  ? "border-[oklch(0.75_0.16_155)]/50 bg-[oklch(0.75_0.16_155)]/15 text-[oklch(0.82_0.15_155)]"
                  : isCurrent
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-secondary/50 text-muted-foreground"
              }`}
            >
              {s.done ? <Check className="size-3.5" /> : isCurrent ? <Dot className="size-5" /> : <Circle className="size-2.5" />}
            </span>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : s.key)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/40"
            >
              <span className="min-w-0">
                <span className={`block text-sm ${s.done || isCurrent ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {s.done ? "Done" : isCurrent ? "Happening now" : "Not started yet"}
                </span>
              </span>
              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && <p className="px-2 pb-3 text-xs text-muted-foreground">{s.detail}</p>}
          </li>
        );
      })}
    </ol>
  );
}
