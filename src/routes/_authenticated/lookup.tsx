import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { lookupPermitsByAddress, lookupUtilityCoordination } from "@/lib/permits.functions";
import { MapPin, Search, ExternalLink, Building2, Loader2, AlertCircle, ShieldCheck, ShieldAlert, ShieldQuestion, Info, Droplets, Flame, Zap, Cable, PhoneCall, CloudRain } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lookup")({
  component: LookupPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <AppShell>
        <div className="p-6 space-y-3">
          <h1 className="text-lg font-semibold">Lookup unavailable</h1>
          <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
          <button className="rounded bg-brand px-3 py-2 text-brand-foreground text-sm" onClick={() => router.invalidate()}>Retry</button>
        </div>
      </AppShell>
    );
  },
  notFoundComponent: () => (
    <AppShell><div className="p-6">Not found.</div></AppShell>
  ),
});

type LookupResult = Awaited<ReturnType<typeof lookupPermitsByAddress>>;
type UtilityResult = Awaited<ReturnType<typeof lookupUtilityCoordination>>;

const KNOWN_JURISDICTIONS: string[] = [
  "Baltimore City, MD", "Baltimore County, MD", "Montgomery County, MD", "Prince George's County, MD", "Howard County, MD", "Anne Arundel County, MD",
  "Washington, DC",
  "Arlington County, VA", "Fairfax County, VA", "Loudoun County, VA", "Prince William County, VA", "Alexandria, VA", "Richmond, VA", "Virginia Beach, VA", "Henrico County, VA", "Chesterfield County, VA",
  "New York, NY", "Newark, NJ", "Jersey City, NJ", "Hartford, CT",
  "Philadelphia, PA", "Pittsburgh, PA",
  "Los Angeles, CA", "San Diego, CA", "San Francisco, CA", "San Jose, CA", "Oakland, CA", "Sacramento, CA", "Long Beach, CA", "Anaheim, CA", "Riverside, CA", "Fresno, CA",
  "Chicago, IL", "Minneapolis, MN", "Milwaukee, WI", "Detroit, MI", "Columbus, OH", "Cleveland, OH", "Cincinnati, OH", "Indianapolis, IN", "St. Louis, MO", "Kansas City, MO",
  "Seattle, WA", "Tacoma, WA", "King County, WA", "Portland, OR", "Eugene, OR", "Boise, ID",
  "Boston, MA", "Cambridge, MA", "Providence, RI", "Portland, ME",
  "Austin, TX", "Houston, TX", "Dallas, TX", "San Antonio, TX", "Fort Worth, TX", "El Paso, TX", "Plano, TX", "Arlington, TX",
  "Phoenix, AZ", "Tucson, AZ", "Mesa, AZ", "Denver, CO", "Salt Lake City, UT", "Albuquerque, NM", "Las Vegas, NV", "Reno, NV",
  "Miami, FL", "Miami-Dade, FL", "Orlando, FL", "Tampa, FL", "Jacksonville, FL", "Fort Lauderdale, FL",
  "Atlanta, GA", "Savannah, GA", "Charlotte, NC", "Raleigh, NC", "Durham, NC", "Charleston, SC", "Columbia, SC", "Nashville, TN", "Memphis, TN", "Knoxville, TN", "Birmingham, AL", "New Orleans, LA", "Louisville, KY",
  "Anchorage, AK", "Honolulu, HI",
];

function LookupPage() {
  const [address, setAddress] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [utility, setUtility] = useState<UtilityResult | null>(null);

  const lookupFn = useServerFn(lookupPermitsByAddress);
  const utilityFn = useServerFn(lookupUtilityCoordination);

  const mutation = useMutation({
    mutationFn: async (vars: { address: string; jurisdiction: string }) => {
      const [permits, util] = await Promise.all([
        lookupFn({ data: vars }),
        utilityFn({ data: vars }).catch(() => null),
      ]);
      return { permits, util };
    },
    onSuccess: (d) => { setResult(d.permits); setUtility(d.util); },
  });


  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    setResult(null); setUtility(null);
    mutation.mutate({ address: address.trim(), jurisdiction: jurisdiction.trim() });
  };

  return (
    <AppShell>
      <div className="px-5 pt-6 pb-8 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-brand">
            <MapPin className="size-4" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Live Address Lookup</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Pull live permits by address</h1>
          <p className="text-sm text-muted-foreground">
            Enter any US address. Permivio finds the jurisdiction's official permit portal and pulls live records tied to that address.
          </p>
          <a
            href="/portals"
            className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
          >
            <Building2 className="size-3.5" /> Browse the nationwide portal directory →
          </a>
        </header>

        <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, City, ST 00000"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={300}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Jurisdiction
            </label>
            <select
              value={KNOWN_JURISDICTIONS.includes(jurisdiction) ? jurisdiction : jurisdiction ? "__custom" : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom") setJurisdiction(jurisdiction || " ");
                else setJurisdiction(v);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Auto-detect from address</option>
              {KNOWN_JURISDICTIONS.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
              <option value="__custom">Custom…</option>
            </select>
            {(jurisdiction && !KNOWN_JURISDICTIONS.includes(jurisdiction)) && (
              <input
                value={jurisdiction.trim()}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="e.g. Cambridge, MA"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={200}
                autoFocus
              />
            )}
            <p className="font-mono text-[10px] text-muted-foreground">
              Override auto-detection when the address city differs from the permitting authority.
            </p>
          </div>
          <button
            type="submit"
            disabled={mutation.isPending || !address.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {mutation.isPending ? "Searching live portals…" : "Pull live permits"}
          </button>
          {mutation.isError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{(mutation.error as Error).message}</span>
            </div>
          )}
        </form>

        {result && <Results result={result} />}
        {utility && <UtilityPanel utility={utility} />}

      </div>
    </AppShell>
  );
}

function confidenceStyle(c: string) {
  switch (c) {
    case "high": return { bg: "bg-emerald-500/10", fg: "text-emerald-500", border: "border-emerald-500/30", label: "High confidence", Icon: ShieldCheck };
    case "medium": return { bg: "bg-brand/10", fg: "text-brand", border: "border-brand/30", label: "Medium confidence", Icon: ShieldQuestion };
    case "low": return { bg: "bg-amber-500/10", fg: "text-amber-500", border: "border-amber-500/30", label: "Low confidence", Icon: ShieldAlert };
    default: return { bg: "bg-muted", fg: "text-muted-foreground", border: "border-border", label: "No match", Icon: ShieldAlert };
  }
}

function Results({ result }: { result: LookupResult }) {
  const overall = confidenceStyle(result.overall_confidence || (result.findings.length ? "medium" : "none"));
  const src = result.sources_scanned;
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="size-3.5" />
            <span className="font-mono uppercase tracking-widest">{result.jurisdiction}</span>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border ${overall.border} ${overall.bg} ${overall.fg} px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider`}>
            <overall.Icon className="size-3" />
            {overall.label}
          </span>
        </div>
        <p className="text-sm">{result.summary}</p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <SourceChip active={src?.official_portal} label="Official portal" />
          <SourceChip active={src?.direct_portal_search} label="Direct portal search" />
          <SourceChip active={src?.web_search} label="Web search" />
        </div>

        {result.no_match_reason && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-600 dark:text-amber-400">
            <Info className="size-3.5 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Why matches are limited</div>
              <p className="mt-0.5 text-amber-700/90 dark:text-amber-300/90">{result.no_match_reason}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {result.portal_url && (
            <a href={result.portal_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
              <ExternalLink className="size-3" />
              {result.portal_name || "Official portal"}
            </a>
          )}
          {result.search_url && result.search_url !== result.portal_url && (
            <a href={result.search_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
              <Search className="size-3" />
              Search by address
            </a>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Live records ({result.findings.length})
        </h2>
        {result.findings.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No permit records matched this exact address in the sources scanned. Use the portal link above to search directly.
          </div>
        )}
        {result.findings.map((f, i) => {
          const conf = confidenceStyle(f.match_confidence);
          return (
            <div key={i} className={`rounded-lg border ${conf.border} bg-card p-3 space-y-1.5`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{f.permit_type || "Permit"}</div>
                  {f.permit_number && (
                    <div className="font-mono text-xs text-muted-foreground">#{f.permit_number}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-brand">
                    {f.status}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full ${conf.bg} ${conf.fg} px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider`}>
                    <conf.Icon className="size-3" />
                    {f.match_confidence} · {f.match_score}
                  </span>
                </div>
              </div>
              {f.address && <div className="text-xs text-muted-foreground">{f.address}</div>}
              {f.description && <p className="text-xs">{f.description}</p>}
              {f.match_reason && (
                <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                  <Info className="size-3 shrink-0 mt-0.5" />
                  <span><span className="font-medium text-foreground">Match:</span> {f.match_reason}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {f.applicant && <span>Applicant: {f.applicant}</span>}
                {f.filed_date && <span>Filed: {f.filed_date}</span>}
                {f.updated_date && <span>Updated: {f.updated_date}</span>}
              </div>
              {f.source_url && (
                <a href={f.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
                  <ExternalLink className="size-3" /> Source
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SourceChip({ active, label }: { active?: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-border bg-muted text-muted-foreground line-through opacity-60"}`}>
      {active ? "✓" : "—"} {label}
    </span>
  );
}

const UTILITY_META = {
  one_call: { label: "811 One-Call", Icon: PhoneCall, tone: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  water_sewer: { label: "Water / Sewer", Icon: Droplets, tone: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
  gas: { label: "Natural Gas", Icon: Flame, tone: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  electric: { label: "Electric", Icon: Zap, tone: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
  telecom: { label: "Telecom / Fiber", Icon: Cable, tone: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
  stormwater: { label: "Stormwater", Icon: CloudRain, tone: "text-teal-400 border-teal-500/30 bg-teal-500/10" },
} as const;

function UtilityPanel({ utility }: { utility: UtilityResult }) {
  const groups = utility.contacts.reduce<Record<string, typeof utility.contacts>>((acc, c) => {
    (acc[c.category] ||= []).push(c);
    return acc;
  }, {});
  const order: (keyof typeof UTILITY_META)[] = ["one_call", "water_sewer", "gas", "electric", "telecom", "stormwater"];
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-brand">
          <Droplets className="size-4" />
          <span className="font-mono text-[10px] uppercase tracking-widest">Utility Coordination</span>
        </div>
        <h2 className="text-lg font-semibold">Water · sewer · gas · electric · telecom · 811</h2>
        <p className="text-xs text-muted-foreground">Service providers and one-call locates for {utility.jurisdiction}. Always file 811 tickets before excavation.</p>
      </div>

      {utility.steps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Recommended sequence</div>
          <ol className="space-y-2">
            {utility.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-brand/15 text-[10px] font-mono text-brand">{i + 1}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.step}</div>
                  <div className="text-[11px] text-muted-foreground">{s.owner} · {s.timing}</div>
                  {s.notes && <div className="text-[11px] mt-0.5">{s.notes}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid gap-2">
        {order.filter((k) => groups[k]?.length).map((k) => {
          const meta = UTILITY_META[k];
          return (
            <div key={k} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className={`flex items-center gap-2 px-3 py-2 border-b border-border ${meta.tone}`}>
                <meta.Icon className="size-4" />
                <span className="font-mono text-[10px] uppercase tracking-widest">{meta.label}</span>
              </div>
              <div className="divide-y divide-border">
                {groups[k].map((c, i) => (
                  <div key={i} className="p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{c.name}</div>
                      {c.phone && <span className="font-mono text-[11px] text-muted-foreground">{c.phone}</span>}
                    </div>
                    {c.notes && <p className="text-[11px] text-muted-foreground">{c.notes}</p>}
                    <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
                      <ExternalLink className="size-3" /> Open
                    </a>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

