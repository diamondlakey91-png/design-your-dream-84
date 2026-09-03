import { Link } from "@tanstack/react-router";
import { CheckCircle2, Upload, FileSignature, CreditCard, Eye, ClipboardCheck, CalendarClock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { TONE_CLASSES, type AttentionItem, type AttentionActionKind } from "@/lib/clientView";

const ICON: Record<AttentionActionKind, React.ReactNode> = {
  upload: <Upload className="size-4" />,
  confirm: <FileSignature className="size-4" />,
  pay: <CreditCard className="size-4" />,
  review: <ClipboardCheck className="size-4" />,
  view: <Eye className="size-4" />,
};

/** "Items Needed From You" — everything PERMIVIO is waiting on from the client. */
export function ClientAttentionList({
  items,
  showProject = true,
  compact = false,
}: { items: AttentionItem[]; showProject?: boolean; compact?: boolean }) {
  if (items.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-3xl border border-border bg-card p-5">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[oklch(0.82_0.15_155)]" />
        <div>
          <p className="text-sm font-medium text-foreground">Nothing needed from you right now.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Permivio is handling the next steps. Anything we need will show up here first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className={compact ? "divide-y divide-border" : "space-y-3"}>
      {items.map((a) => {
        const tone = TONE_CLASSES[a.tone];
        return (
          <li key={a.id} className={compact ? "py-3 first:pt-0 last:pb-0" : "rounded-3xl border border-border bg-card p-4 sm:p-5"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {showProject && (
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-primary">{a.projectName}</p>
                )}
                <p className="mt-1 text-sm font-semibold text-foreground">{a.whatIsNeeded}</p>
                <p className="mt-1 text-sm text-muted-foreground">{a.why}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                    <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} />
                    {a.tone === "red" ? "Time sensitive" : "Waiting on you"}
                  </span>
                  {a.dueDate && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarClock className="size-3.5" /> Needed by {safeDate(a.dueDate)}
                    </span>
                  )}
                </div>
              </div>
              <Link
                to="/projects/$id"
                params={{ id: a.projectId }}
                search={{ tab: a.tab as never }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                {ICON[a.action]} {a.actionLabel}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function safeDate(iso: string) {
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}
