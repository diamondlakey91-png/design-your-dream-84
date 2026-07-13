import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PORTAL_REGISTRY, PORTAL_PLATFORMS, US_STATES, findPortalDeepLinks, type PortalEntry, type PortalPlatform } from "@/lib/portalRegistry";
import { ExternalLink, Search, Building2, FileText, MapPin, Hash, Info, Zap } from "lucide-react";

const portalsSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  state: fallback(z.string(), "").default(""),
  platform: fallback(z.string(), "").default(""),
  address: fallback(z.string(), "").default(""),
  permit: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/portals")({
  validateSearch: zodValidator(portalsSearchSchema),
  component: PortalsPage,
});

const PLATFORM_STYLES: Record<PortalPlatform, string> = {
  Accela: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  EnerGov: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  ProjectDox: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Momentum: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  OpenGov: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  CitizenServe: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  MyGovernmentOnline: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Cityworks: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  Custom: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

function PortalsPage() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/_authenticated/portals" });
  const [query, setQuery] = useState(sp.q);
  const [state, setState] = useState<string>(sp.state);
  const [platform, setPlatform] = useState<PortalPlatform | "">((sp.platform as PortalPlatform) || "");
  const [address, setAddress] = useState(sp.address);
  const [permitNo, setPermitNo] = useState(sp.permit);

  // Keep local state in sync when the URL changes (back/forward, deep link).
  useEffect(() => { setQuery(sp.q); setState(sp.state); setPlatform((sp.platform as PortalPlatform) || ""); setAddress(sp.address); setPermitNo(sp.permit); }, [sp.q, sp.state, sp.platform, sp.address, sp.permit]);

  // Push local state into URL (debounced) so the page is shareable.
  useEffect(() => {
    const t = setTimeout(() => {
      navigate({
        search: { q: query, state, platform: platform || "", address, permit: permitNo },
        replace: true,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query, state, platform, address, permitNo, navigate]);

  const availableStates = useMemo(() => {
    const s = new Set(PORTAL_REGISTRY.map((p) => p.state));
    return US_STATES.filter((x) => s.has(x));
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PORTAL_REGISTRY.filter((p) => {
      if (state && p.state !== state) return false;
      if (platform && p.platform !== platform) return false;
      if (q && !`${p.jurisdiction} ${p.state} ${p.platform}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction));
  }, [query, state, platform]);

  const counts = useMemo(() => {
    const m = new Map<PortalPlatform, number>();
    for (const p of PORTAL_REGISTRY) m.set(p.platform, (m.get(p.platform) ?? 0) + 1);
    return m;
  }, []);

  // Suggested direct deep links based on the query + permit#/address.
  const suggested = useMemo(() => {
    if (!query.trim() || (!permitNo.trim() && !address.trim())) return [];
    const jurisdictionHint = state ? `${query.trim()}, ${state}` : query.trim();
    return findPortalDeepLinks(jurisdictionHint, {
      permitNumber: permitNo.trim() || undefined,
      address: address.trim() || undefined,
      limit: 4,
    });
  }, [query, state, permitNo, address]);



  return (
    <AppShell>
      <div className="px-4 pt-6 space-y-5">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-brand">
            <Building2 className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Permit Portals</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Nationwide Portal Directory</h1>
          <p className="text-sm text-muted-foreground">
            Direct links to {PORTAL_REGISTRY.length}+ live municipal permit portals. Search by jurisdiction, filter by
            platform, or pre-fill any portal with an address or permit number.
          </p>
        </header>

        {/* Platform legend */}
        <div className="flex flex-wrap gap-2">
          {PORTAL_PLATFORMS.map((pf) => (
            <button
              key={pf}
              type="button"
              onClick={() => setPlatform(platform === pf ? "" : pf)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                platform === pf ? "ring-2 ring-brand" : ""
              } ${PLATFORM_STYLES[pf]}`}
            >
              {pf} · {counts.get(pf) ?? 0}
            </button>
          ))}
          {(platform || state || query) && (
            <button
              type="button"
              onClick={() => { setPlatform(""); setState(""); setQuery(""); }}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Search + state */}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search jurisdiction (e.g. Arlington, Denver, Fairfax)"
              className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand"
          >
            <option value="">All states</option>
            {availableStates.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Pre-fill helpers */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
            <Info className="size-3.5" /> Pre-fill portal searches
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
              <MapPin className="size-4 text-muted-foreground" />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
              <Hash className="size-4 text-muted-foreground" />
              <input
                value={permitNo}
                onChange={(e) => setPermitNo(e.target.value)}
                placeholder="Permit # (e.g. CTBO26-01812)"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Any value you enter here is injected into each portal's search URL below (when supported).
          </p>
        </div>

        {/* Results */}
        <div className="space-y-2 pb-8">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {results.length} portal{results.length === 1 ? "" : "s"}
          </div>
          {results.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No portals match. Try clearing filters — you can also open a portal by platform to browse manually.
            </div>
          )}
          {results.map((p, idx) => (
            <PortalCard key={`${p.jurisdiction}-${p.state}-${p.platform}-${idx}`} p={p} address={address} permitNo={permitNo} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function PortalCard({ p, address, permitNo }: { p: PortalEntry; address: string; permitNo: string }) {
  const addrUrl = address.trim() && p.addressSearch ? p.addressSearch(address) : null;
  const permitUrl = permitNo.trim() && p.permitSearch ? p.permitSearch(permitNo) : null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{p.jurisdiction}</span>
            <span className="rounded bg-background border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{p.state}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${PLATFORM_STYLES[p.platform]}`}>{p.platform}</span>
          </div>
          {p.notes && <p className="mt-1 text-[11px] text-muted-foreground">{p.notes}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <PortalLink href={p.url} icon={<ExternalLink className="size-3.5" />} label="Open portal" primary />
        {addrUrl && <PortalLink href={addrUrl} icon={<MapPin className="size-3.5" />} label="Search address" />}
        {permitUrl && <PortalLink href={permitUrl} icon={<Hash className="size-3.5" />} label="Search permit #" />}
        {p.planReviewUrl && <PortalLink href={p.planReviewUrl} icon={<FileText className="size-3.5" />} label="Plan review (ProjectDox)" />}
      </div>
    </div>
  );
}

function PortalLink({ href, icon, label, primary }: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
        primary
          ? "bg-brand text-brand-foreground hover:bg-brand/90"
          : "border border-border bg-background text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </a>
  );
}
