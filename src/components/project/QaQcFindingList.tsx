import { useState } from "react";
import { ExternalLink, Check } from "lucide-react";
import { QAQC_CATEGORIES, categoryLabel, disciplineLabel, qaqcVerificationMeta, severityMeta } from "@/lib/qaqcConfig";

export type QaQcFindingRow = {
  id: string;
  finding_no: number;
  severity: string;
  category: string;
  discipline: string;
  sheet_number: string | null;
  sheet_title: string | null;
  location: string | null;
  summary: string;
  plain_language: string | null;
  why_it_matters: string | null;
  code_basis: string | null;
  jurisdiction_source_url: string | null;
  recommended_action: string | null;
  responsible_discipline: string | null;
  verification: string;
  resolved: boolean;
};

export function QaQcFindingList({
  findings,
  onToggleResolved,
}: {
  findings: QaQcFindingRow[];
  onToggleResolved: (id: string, resolved: boolean) => void;
}) {
  const [cat, setCat] = useState<string>("all");
  const [sev, setSev] = useState<string>("all");
  const [hideResolved, setHideResolved] = useState(false);

  const visible = findings.filter(
    (f) => (cat === "all" || f.category === cat) && (sev === "all" || f.severity === sev) && (!hideResolved || !f.resolved),
  );

  const counts = (id: string) => findings.filter((f) => f.category === id).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider"
        >
          <option value="all">All categories ({findings.length})</option>
          {QAQC_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.no}. {c.label} ({counts(c.id)})
            </option>
          ))}
        </select>
        <select
          value={sev}
          onChange={(e) => setSev(e.target.value)}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider"
        >
          <option value="all">All severities</option>
          {["critical", "high", "medium", "low", "informational"].map((s) => (
            <option key={s} value={s}>
              {s} ({findings.filter((f) => f.severity === s).length})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          <input type="checkbox" checked={hideResolved} onChange={(e) => setHideResolved(e.target.checked)} /> Hide resolved
        </label>
      </div>

      {visible.length === 0 && <p className="text-sm text-muted-foreground">No findings match this filter.</p>}

      <div className="space-y-2">
        {visible.map((f) => {
          const sm = severityMeta(f.severity);
          const vm = qaqcVerificationMeta(f.verification);
          return (
            <div key={f.id} className={`rounded-xl border border-border bg-card/60 p-3 ${f.resolved ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ring-1 ${sm.klass}`}>{sm.label}</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                      {categoryLabel(f.category)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ring-1 ${vm.klass}`}>{vm.label}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium">
                    #{f.finding_no} {f.summary}
                  </p>
                  <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    {f.sheet_number ? `${f.sheet_number}${f.sheet_title ? ` · ${f.sheet_title}` : ""}` : "Set-wide"} · {disciplineLabel(f.discipline)}
                    {f.location ? ` · ${f.location}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => onToggleResolved(f.id, !f.resolved)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider ${
                    f.resolved ? "border-emerald-500/40 text-emerald-400" : "border-border hover:border-brand hover:text-brand"
                  }`}
                >
                  <Check className="size-3.5" /> {f.resolved ? "Resolved" : "Mark resolved"}
                </button>
              </div>

              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {f.plain_language && <p><span className="text-foreground">What it means: </span>{f.plain_language}</p>}
                {f.why_it_matters && <p><span className="text-foreground">Why it matters: </span>{f.why_it_matters}</p>}
                {f.code_basis && <p><span className="text-foreground">Potential basis: </span>{f.code_basis}</p>}
                {f.recommended_action && <p><span className="text-foreground">Recommended action: </span>{f.recommended_action}</p>}
                <p>
                  <span className="text-foreground">Responsible: </span>
                  {disciplineLabel(f.responsible_discipline || f.discipline)}
                  {f.jurisdiction_source_url && (
                    <a
                      href={f.jurisdiction_source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      Source <ExternalLink className="size-3" />
                    </a>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
