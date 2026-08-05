import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, MapPin, Sparkles, ShieldQuestion } from "lucide-react";
import {
  MD_COUNTIES,
  VA_COUNTIES,
  VA_INDEPENDENT_CITIES,
  buildMdVaAuthorities,
  type GeneratedAuthority,
} from "@/lib/mdVaAuthorities";

export type CoverageLocality = {
  key: string;
  state: "MD" | "VA";
  /** Registry key passed to buildMdVaAuthorities */
  locality: string;
  /** Human label, e.g. "Anne Arundel County, MD" */
  label: string;
  kind: "county" | "city";
};

/** Every MD + VA locality Permivio resolves authorities for. */
export const MD_VA_LOCALITIES: CoverageLocality[] = [
  ...MD_COUNTIES.map((c) => ({
    key: `MD|${c}`,
    state: "MD" as const,
    locality: c,
    label: c === "Baltimore City" ? "Baltimore City, MD" : `${c} County, MD`,
    kind: c === "Baltimore City" ? ("city" as const) : ("county" as const),
  })),
  ...VA_COUNTIES.map((c) => ({
    key: `VA|county|${c}`,
    state: "VA" as const,
    locality: c,
    label: `${c} County, VA`,
    kind: "county" as const,
  })),
  ...VA_INDEPENDENT_CITIES.map((c) => ({
    key: `VA|city|${c}`,
    state: "VA" as const,
    locality: c,
    label: `City of ${c}, VA`,
    kind: "city" as const,
  })),
];

const ROLE_LABEL: Record<string, string> = {
  building: "Building",
  planning_zoning: "Planning & Zoning",
  fire: "Fire",
  health: "Health",
  public_works: "Public Works",
  site_development: "Site Development",
  environmental: "Environmental",
  transportation_row: "Transportation / ROW",
  utility_water: "Water",
  utility_sewer: "Sewer",
  utility_electric: "Electric",
  utility_gas: "Gas",
  stormwater: "Stormwater",
  historic: "Historic",
  floodplain: "Floodplain",
  other: "Other",
};

function verifChip(v: GeneratedAuthority["verification"]) {
  if (v === "verified") return { label: "Verified", klass: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30" };
  if (v === "ai_assisted") return { label: "AI Suggested", klass: "bg-blue-500/10 text-blue-400 ring-blue-500/30" };
  return { label: "Needs Confirmation", klass: "bg-amber-500/10 text-amber-400 ring-amber-500/30" };
}

export function MdVaCoverageSection({
  term,
  stateFilter,
  onResearch,
  researching,
}: {
  term: string;
  stateFilter: string;
  onResearch: (jurisdictionName: string) => void;
  researching?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    return MD_VA_LOCALITIES.filter((l) => {
      if (stateFilter && l.state !== stateFilter) return false;
      if (!t) return true;
      return l.label.toLowerCase().includes(t) || l.locality.toLowerCase().includes(t);
    });
  }, [term, stateFilter]);

  // Only surface when the user is actually looking at MD/VA (or searching for it).
  const relevant = stateFilter === "MD" || stateFilter === "VA" || (!!term.trim() && matches.length > 0);
  if (!relevant) return null;

  const visible = showAll ? matches : matches.slice(0, 24);

  return (
    <section id="coverage" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Maryland &amp; Virginia coverage
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {matches.length} localit{matches.length === 1 ? "y" : "ies"} with a resolvable authority stack — building,
            zoning, fire, health, public works, ROW and utility contacts.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-card ring-1 ring-border divide-y divide-border overflow-hidden">
        {visible.map((l) => {
          const open = expanded === l.key;
          return (
            <div key={l.key}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : l.key)}
                  className="flex-1 flex items-center gap-2 min-w-0 text-left"
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="size-3.5 text-brand shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <MapPin className="size-3.5 text-brand/80 shrink-0" />
                  <span className="text-sm font-medium truncate">{l.label}</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 shrink-0">
                    {l.kind}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onResearch(l.label.replace(/, (MD|VA)$/, ""))}
                  disabled={researching}
                  className="inline-flex items-center gap-1 rounded-md ring-1 ring-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:ring-brand/40 disabled:opacity-50 shrink-0"
                  title="Build a full jurisdiction profile from official sources"
                >
                  <Sparkles className="size-3" /> Research
                </button>
              </div>

              {open && <AuthorityStack state={l.state} locality={l.locality} />}
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No Maryland or Virginia locality matches that search.
          </div>
        )}
      </div>

      {matches.length > visible.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-brand hover:underline"
        >
          Show all {matches.length} localities
        </button>
      )}

      <p className="inline-flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <ShieldQuestion className="size-3.5 mt-px shrink-0" />
        Authority names and links are Permivio-generated starting points. Confirm with the agency before relying on them
        for submittal.
      </p>
    </section>
  );
}

function AuthorityStack({ state, locality }: { state: string; locality: string }) {
  const authorities = useMemo(() => buildMdVaAuthorities(state, locality), [state, locality]);
  return (
    <div className="bg-background/60 px-3 pb-3 pt-1">
      <div className="grid sm:grid-cols-2 gap-2">
        {authorities.map((a) => {
          const chip = verifChip(a.verification);
          return (
            <div key={`${a.role}-${a.official_name}`} className="rounded-lg ring-1 ring-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {ROLE_LABEL[a.role] ?? a.role}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 ring-1 text-[9px] font-medium ${chip.klass}`}>
                  {chip.label}
                </span>
              </div>
              <div className="text-xs font-medium mt-1">{a.official_name}</div>
              {a.department && <div className="text-[11px] text-muted-foreground">{a.department}</div>}
              <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{a.responsibility}</div>
              {(a.portal_url || a.website) && (
                <a
                  href={(a.portal_url || a.website) as string}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline mt-1.5"
                >
                  Open source <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
