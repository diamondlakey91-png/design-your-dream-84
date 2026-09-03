import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { PermivioMark } from "@/components/PermivioMark";

/**
 * Centralized branded page header for every primary PERMIVIO module page.
 *
 * Brand hierarchy: PERMIVIO → page/module name → plain-language description.
 * The logo source stays centralized in PermivioMark — never re-create it inline.
 */
export function PermivioPageHeader({
  title,
  subtitle,
  eyebrow,
  context,
  actions,
  backTo,
  backLabel = "Back",
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small module label rendered next to the brand lockup. */
  eyebrow?: ReactNode;
  /** Project / record name shown above the page title on detail pages. */
  context?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {backTo ? (
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {backLabel}
          </Link>
        ) : null}
        <span className="inline-flex items-center gap-2">
          <PermivioMark className="size-5 shrink-0 sm:size-6" />
          <span className="bg-gradient-to-b from-white to-blue-300 bg-clip-text font-semibold uppercase tracking-[0.2em] text-transparent text-[13px] sm:text-sm">
            Permivio
          </span>
        </span>
        {eyebrow ? (
          <>
            <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </span>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          {context ? (
            <p className="truncate text-sm font-medium text-brand">{context}</p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
