import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { lookupPermitsByAddress } from "@/lib/permits.functions";
import { MapPin, Search, ExternalLink, Building2, Loader2, AlertCircle, ShieldCheck, ShieldAlert, ShieldQuestion, Info } from "lucide-react";

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

const KNOWN_JURISDICTIONS: string[] = [
  "Baltimore City, MD",
  "Baltimore County, MD",
  "Washington, DC",
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "San Francisco, CA",
  "Seattle, WA",
  "Boston, MA",
  "Austin, TX",
  "Miami, FL",
  "Philadelphia, PA",
];

function LookupPage() {
  const [address, setAddress] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);

  const lookupFn = useServerFn(lookupPermitsByAddress);
  const mutation = useMutation({
    mutationFn: (vars: { address: string; jurisdiction: string }) => lookupFn({ data: vars }),
    onSuccess: (data) => setResult(data),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    setResult(null);
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
      </div>
    </AppShell>
  );
}

function Results({ result }: { result: LookupResult }) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="size-3.5" />
          <span className="font-mono uppercase tracking-widest">{result.jurisdiction}</span>
        </div>
        <p className="text-sm">{result.summary}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {result.portal_url && (
            <a
              href={result.portal_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
            >
              <ExternalLink className="size-3" />
              {result.portal_name || "Official portal"}
            </a>
          )}
          {result.search_url && result.search_url !== result.portal_url && (
            <a
              href={result.search_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
            >
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
        {result.findings.map((f, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{f.permit_type || "Permit"}</div>
                {f.permit_number && (
                  <div className="font-mono text-xs text-muted-foreground">#{f.permit_number}</div>
                )}
              </div>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-brand">
                {f.status}
              </span>
            </div>
            {f.address && <div className="text-xs text-muted-foreground">{f.address}</div>}
            {f.description && <p className="text-xs">{f.description}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {f.applicant && <span>Applicant: {f.applicant}</span>}
              {f.filed_date && <span>Filed: {f.filed_date}</span>}
              {f.updated_date && <span>Updated: {f.updated_date}</span>}
            </div>
            {f.source_url && (
              <a
                href={f.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
              >
                <ExternalLink className="size-3" /> Source
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
