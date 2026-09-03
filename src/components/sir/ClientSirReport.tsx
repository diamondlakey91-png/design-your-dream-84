import { useMemo } from "react";
import { BadgeCheck, ExternalLink } from "lucide-react";
import {
  buildSirReport,
  buildSirRiskMatrix,
  buildSirSnapshot,
  effectiveFindingText,
  SIR_REPORT_DISCLAIMER,
  type SirFindingReviews,
} from "@/lib/sirReport";
import { ratingMeta } from "@/lib/siteInvestigationConfig";

const VERIFICATION_STYLE: Record<string, string> = {
  verified: "border-green-500/30 bg-green-500/10 text-green-300",
  ai_assisted: "border-blue-500/30 bg-blue-500/10 text-blue-200",
  needs_confirmation: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

const RISK_STYLE: Record<string, string> = {
  high: "border-red-500/30 bg-red-500/5 text-red-200",
  medium: "border-blue-500/30 bg-blue-500/5 text-blue-200",
  low: "border-white/10 bg-white/[0.02] text-slate-300",
};

/**
 * Read-only client presentation of a released Site Investigation Report. It
 * renders the reviewer's effective wording, keeps every verification label
 * visible and drops findings the reviewer rejected.
 */
export function ClientSirReport({
  research,
  sources,
  findingReviews,
  reviewer,
  title = "Site Investigation Report",
}: {
  research: unknown;
  title?: string;
  sources: Array<{ title?: string | null; url: string }> | null;
  findingReviews: SirFindingReviews | null;
  reviewer: { name?: string | null; credential?: string | null; summary?: string | null; reviewed_at?: string | null };
}) {
  const sections = useMemo(() => buildSirReport(research), [research]);
  const snapshot = useMemo(() => buildSirSnapshot(research), [research]);
  const matrix = useMemo(() => buildSirRiskMatrix(research), [research]);
  const reviews = findingReviews ?? {};
  const verdict = (research as { feasibility?: { rating: string; recommendation: string; rationale: string; deal_killers?: Array<{ title: string; why: string; verification: string }>; conditions_to_proceed?: string[]; cost_schedule_exposure?: string[] } } | null)?.feasibility;

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-green-500/25 bg-green-500/[0.06] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-green-300">
            <BadgeCheck className="size-3" /> PROFESSIONALLY REVIEWED
          </span>
        </div>
        {reviewer.name && (
          <p className="mt-2 text-xs text-green-300/80">
            Reviewed by {reviewer.name}
            {reviewer.credential ? ` · ${reviewer.credential}` : ""}
            {reviewer.reviewed_at ? ` · ${new Date(reviewer.reviewed_at).toLocaleDateString()}` : ""}
          </p>
        )}
        {reviewer.summary && <p className="mt-2 text-sm text-slate-200">{reviewer.summary}</p>}
      </div>

      {verdict && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-white">Feasibility verdict</h4>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${ratingMeta(verdict.rating).klass}`}>
              {ratingMeta(verdict.rating).label}
            </span>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-200">
              {verdict.recommendation.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{verdict.rationale}</p>
          {!!verdict.deal_killers?.length && (
            <div className="mt-3">
              <p className="text-xs font-medium text-white">Potential deal-killers</p>
              <ul className="mt-1 grid gap-1">
                {verdict.deal_killers.map((d) => (
                  <li key={d.title} className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-2 text-xs text-slate-300">
                    <span className="font-medium text-red-200">{d.title}</span>
                    <span className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] ${VERIFICATION_STYLE[d.verification] ?? VERIFICATION_STYLE.needs_confirmation}`}>
                      {d.verification.replace(/_/g, " ")}
                    </span>
                    <p className="mt-1">{d.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!verdict.conditions_to_proceed?.length && (
            <div className="mt-3">
              <p className="text-xs font-medium text-white">Conditions to proceed</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-300">
                {verdict.conditions_to_proceed.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {!!verdict.cost_schedule_exposure?.length && (
            <div className="mt-3">
              <p className="text-xs font-medium text-white">Cost & schedule exposure</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-300">
                {verdict.cost_schedule_exposure.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}



      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h4 className="text-sm font-semibold text-white">Executive feasibility snapshot</h4>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.map((s) => (
            <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</dt>
              <dd className="mt-1 text-sm text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {matrix.some((m) => m.items.length > 0) && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Risk matrix</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {matrix.map((band) => (
              <div key={band.level} className={`rounded-lg border p-3 ${RISK_STYLE[band.level]}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide">{band.level} severity</p>
                <ul className="mt-2 grid gap-2">
                  {band.items.length === 0 && <li className="text-xs opacity-70">None identified</li>}
                  {band.items.map((i) => (
                    <li key={i.id} className="text-xs">
                      <span className="font-medium text-white">{i.title}</span>
                      <span className="block opacity-80">{i.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.key} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">
            {section.no}. {section.title}
          </h4>
          <p className="mt-1 text-xs text-slate-400">{section.intro}</p>
          <div className="mt-3 grid gap-4">
            {section.modules.map((mod) => (
              <div key={mod.key}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{mod.label}</p>
                {mod.summary && <p className="mt-1 text-sm text-slate-300">{mod.summary}</p>}
                <ul className="mt-2 grid gap-2">
                  {mod.findings
                    .filter((f) => reviews[f.id]?.decision !== "rejected")
                    .map((f) => (
                      <li key={f.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-white">{f.title}</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                              VERIFICATION_STYLE[f.verification] ?? VERIFICATION_STYLE.needs_confirmation
                            }`}
                          >
                            {f.verification.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-300">{effectiveFindingText(f, reviews[f.id])}</p>
                        {f.source && (
                          <a
                            href={f.source}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 break-all text-[11px] text-blue-300 hover:text-blue-200"
                          >
                            <ExternalLink className="size-3 shrink-0" /> {f.source}
                          </a>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      {sources && sources.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Official sources reviewed</h4>
          <ul className="mt-2 grid gap-1">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-xs text-blue-300 hover:text-blue-200">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-400">
        {SIR_REPORT_DISCLAIMER}
      </p>
    </div>
  );
}
