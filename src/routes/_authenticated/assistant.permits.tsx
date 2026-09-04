import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Loader2, ShieldQuestion } from "lucide-react";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { findPermitRequirements } from "@/lib/permitFinder.functions";
import {
  DETERMINATION_LABEL,
  DETERMINATION_ORDER,
  PERMIT_GROUPS,
  VERIFICATION_LABEL,
  determinationClasses,
  type PermitFinderReport,
  type PermitGroup,
} from "@/lib/permitFinder";
import { FRIENDLY_PROJECT_TYPES } from "@/lib/projectTypeMap";

export const Route = createFileRoute("/_authenticated/assistant/permits")({
  head: () => ({
    meta: [
      { title: "Permit Requirement Finder — Permivio" },
      {
        name: "description",
        content:
          "Tell Permivio the jurisdiction and project type and get a complete permit requirement report across every permit category.",
      },
      { property: "og:title", content: "Permit Requirement Finder — Permivio" },
      {
        property: "og:description",
        content: "Full-coverage permit requirement research by jurisdiction and project type.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PermitFinderPage,
});

const field =
  "w-full rounded-lg bg-zinc-900 ring-1 ring-white/10 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-brand/50";
const label = "text-[11px] font-mono uppercase tracking-widest text-zinc-500";

function PermitFinderPage() {
  const run = useServerFn(findPermitRequirements);
  const [jurisdiction, setJurisdiction] = useState("");
  const [projectType, setProjectType] = useState("");
  const [scope, setScope] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [sqft, setSqft] = useState("");
  const [existing, setExisting] = useState<"yes" | "no" | "unknown">("unknown");
  const [changeOfUse, setChangeOfUse] = useState<"yes" | "no" | "unknown">("unknown");
  const [report, setReport] = useState<PermitFinderReport | null>(null);
  const [onlyApplicable, setOnlyApplicable] = useState(true);

  const mutation = useMutation({
    mutationFn: () =>
      run({
        data: {
          jurisdiction: jurisdiction.trim(),
          project_type: projectType.trim(),
          scope: scope.trim(),
          occupancy: occupancy.trim(),
          square_footage: sqft.trim(),
          existing_building: existing,
          change_of_use: changeOfUse,
        },
      }),
    onSuccess: (r) => {
      setReport(r);
      toast.success("Permit requirement report ready");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not build the report"),
  });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of report?.findings ?? []) map.set(f.determination, (map.get(f.determination) ?? 0) + 1);
    return map;
  }, [report]);

  const grouped = useMemo(() => {
    const out = new Map<PermitGroup, PermitFinderReport["findings"]>();
    for (const g of PERMIT_GROUPS) out.set(g, []);
    for (const f of report?.findings ?? []) {
      if (onlyApplicable && f.determination === "likely_not_required") continue;
      out.get(f.group)?.push(f);
    }
    return out;
  }, [report, onlyApplicable]);

  const canRun = jurisdiction.trim().length > 1 && projectType.trim().length > 1 && !mutation.isPending;

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <header className="px-6 py-4 border-b border-white/5">
          <PermivioPageHeader
            backTo="/assistant"
            eyebrow="AI Assist"
            title="Permit Requirement Finder"
            subtitle="Tell us the jurisdiction and project type. Every permit category is reported — nothing is left off the list."
          />
        </header>

        <div className="p-6 space-y-6">
          <section className="rounded-2xl bg-zinc-900 ring-1 ring-white/5 p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={label} htmlFor="pf-jur">
                  Jurisdiction *
                </label>
                <input
                  id="pf-jur"
                  className={field}
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  placeholder="City / county / state — e.g. Montgomery County, MD"
                />
              </div>
              <div className="space-y-1.5">
                <label className={label} htmlFor="pf-type">
                  Project type *
                </label>
                <input
                  id="pf-type"
                  className={field}
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                  placeholder="e.g. Open a restaurant in an existing shell"
                  list="pf-type-options"
                />
                <datalist id="pf-type-options">
                  {FRIENDLY_PROJECT_TYPES.map((t) => (
                    <option key={t.v} value={t.label} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {FRIENDLY_PROJECT_TYPES.slice(0, 6).map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() => setProjectType(t.label)}
                      className="rounded-full px-2.5 py-1 text-[11px] ring-1 ring-white/10 text-zinc-400 hover:text-zinc-100 hover:ring-brand/40 transition"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <details className="rounded-xl ring-1 ring-white/5 bg-zinc-950/40 p-4">
              <summary className="cursor-pointer text-sm text-zinc-300">
                Optional details — sharpen the report
              </summary>
              <div className="grid gap-4 sm:grid-cols-2 pt-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={label} htmlFor="pf-scope">
                    Scope of work
                  </label>
                  <textarea
                    id="pf-scope"
                    rows={3}
                    className={field}
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    placeholder="What is actually being built or changed?"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={label} htmlFor="pf-occ">
                    Occupancy / business type
                  </label>
                  <input id="pf-occ" className={field} value={occupancy} onChange={(e) => setOccupancy(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className={label} htmlFor="pf-sqft">
                    Approx. size
                  </label>
                  <input id="pf-sqft" className={field} value={sqft} onChange={(e) => setSqft(e.target.value)} placeholder="e.g. 3,200 sf" />
                </div>
                <div className="space-y-1.5">
                  <label className={label} htmlFor="pf-exist">
                    Existing building on site?
                  </label>
                  <select
                    id="pf-exist"
                    className={field}
                    value={existing}
                    onChange={(e) => setExisting(e.target.value as typeof existing)}
                  >
                    <option value="unknown">Not sure</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={label} htmlFor="pf-cou">
                    Change of use?
                  </label>
                  <select
                    id="pf-cou"
                    className={field}
                    value={changeOfUse}
                    onChange={(e) => setChangeOfUse(e.target.value as typeof changeOfUse)}
                  >
                    <option value="unknown">Not sure</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
            </details>

            <button
              onClick={() => mutation.mutate()}
              disabled={!canRun}
              className="inline-flex items-center gap-2 rounded-lg bg-brand text-brand-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />}
              {mutation.isPending ? "Researching every permit category…" : "Build permit report"}
            </button>
            <p className="text-xs text-zinc-500">
              Research and decision support only. Results are not a jurisdiction determination, a code-compliance
              approval, or a professional engineering or architectural opinion.
            </p>
          </section>

          {report && (
            <section className="space-y-5">
              <AhjBoundaryMap query={report.jurisdiction} title="Authority in control — map view" />
              <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-widest text-sky-300/80">
                      Coverage report
                    </div>
                    <h2 className="text-base font-semibold mt-1">
                      {report.project_type} — {report.jurisdiction}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      {report.findings.length} permit categories reviewed · {report.jurisdiction_data_on_file
                        ? "jurisdiction profile on file used as source"
                        : "no cached jurisdiction profile — confirm items with the agency"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={onlyApplicable}
                      onChange={(e) => setOnlyApplicable(e.target.checked)}
                      className="accent-[var(--brand,#3b82f6)]"
                    />
                    Hide categories marked likely not required
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {DETERMINATION_ORDER.map((d) => (
                    <span
                      key={d}
                      className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${determinationClasses(d)}`}
                    >
                      {DETERMINATION_LABEL[d]}: {counts.get(d) ?? 0}
                    </span>
                  ))}
                </div>
              </div>

              {report.assumptions.length > 0 && (
                <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/5 p-5">
                  <h3 className="text-sm font-semibold">Assumptions used</h3>
                  <ul className="mt-2 space-y-1 text-xs text-zinc-400 list-disc pl-4">
                    {report.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {PERMIT_GROUPS.map((g) => {
                const rows = grouped.get(g) ?? [];
                if (rows.length === 0) return null;
                return (
                  <div key={g} className="space-y-3">
                    <h3 className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">{g}</h3>
                    <div className="space-y-3">
                      {rows.map((f) => (
                        <article key={f.category_key} className="rounded-2xl bg-zinc-900 ring-1 ring-white/5 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">{f.category_label}</div>
                              <div className="text-xs text-zinc-400 mt-0.5">{f.agency}</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${determinationClasses(f.determination)}`}
                              >
                                {DETERMINATION_LABEL[f.determination]}
                              </span>
                              <span className="rounded-full px-2.5 py-1 text-[11px] ring-1 ring-white/10 text-zinc-400">
                                {VERIFICATION_LABEL[f.verification]}
                              </span>
                            </div>
                          </div>
                          {f.why && <p className="text-xs text-zinc-300 mt-3">{f.why}</p>}
                          {f.triggers && (
                            <p className="text-xs text-zinc-400 mt-2">
                              <span className="text-zinc-500">Applies when: </span>
                              {f.triggers}
                            </p>
                          )}
                          {f.typical_documents.length > 0 && (
                            <div className="mt-3">
                              <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
                                Typical submittal items
                              </div>
                              <ul className="mt-1 text-xs text-zinc-300 list-disc pl-4 space-y-0.5">
                                {f.typical_documents.map((d, i) => (
                                  <li key={i}>{d}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {f.sequence_note && (
                            <p className="text-xs text-zinc-400 mt-2">
                              <span className="text-zinc-500">Sequence: </span>
                              {f.sequence_note}
                            </p>
                          )}
                          {f.open_questions && (
                            <p className="text-xs text-sky-300/80 mt-2 flex gap-1.5">
                              <ShieldQuestion className="size-3.5 shrink-0 mt-0.5" />
                              {f.open_questions}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}

              {report.sequence.length > 0 && (
                <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/5 p-5">
                  <h3 className="text-sm font-semibold">Recommended sequence</h3>
                  <ol className="mt-3 space-y-2">
                    {report.sequence.map((s) => (
                      <li key={s.step} className="text-xs text-zinc-300 flex gap-3">
                        <span className="text-zinc-500 font-mono">{String(s.step).padStart(2, "0")}</span>
                        <span>
                          <span className="font-medium text-zinc-100">{s.stage}</span>
                          {s.depends_on && <span className="text-zinc-500"> · depends on {s.depends_on}</span>}
                          {s.note && <div className="text-zinc-400 mt-0.5">{s.note}</div>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {(report.missing_info.length > 0 || report.confirm_with_agency.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {report.missing_info.length > 0 && (
                    <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/5 p-5">
                      <h3 className="text-sm font-semibold">Missing information</h3>
                      <ul className="mt-2 text-xs text-zinc-400 list-disc pl-4 space-y-1">
                        {report.missing_info.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.confirm_with_agency.length > 0 && (
                    <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/5 p-5">
                      <h3 className="text-sm font-semibold">Confirm with the agency</h3>
                      <ul className="mt-2 text-xs text-zinc-400 list-disc pl-4 space-y-1">
                        {report.confirm_with_agency.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/5 p-5">
                <h3 className="text-sm font-semibold">Sources</h3>
                {report.sources.length === 0 ? (
                  <p className="text-xs text-zinc-400 mt-2">
                    No verified official source was available for this jurisdiction. Treat every item as needing agency
                    confirmation.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {report.sources.map((s, i) => (
                      <li key={i} className="text-xs">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 hover:text-sky-200 underline underline-offset-2"
                        >
                          {s.title || s.url}
                        </a>
                        {s.official && (
                          <span className="ml-2 inline-flex items-center gap-1 text-emerald-300/80">
                            <CheckCircle2 className="size-3" /> official
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
