import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import {
  HEALTH_AGENCY_REGISTRY, HEALTH_AGENCY_TYPES, HEALTH_AGENCY_SERVICE_TYPES,
  findHealthAgencyDeepLinks, buildHealthAgencyEntryFromMapping,
  type HealthAgencyEntry, type HealthAgencyType, type HealthAgencyServiceType,
} from "@/lib/healthAgencyRegistry";
import { US_STATES } from "@/lib/portalRegistry";
import { listHealthPortalMappings } from "@/lib/healthPortals.functions";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { verifyMeta } from "@/lib/verification";
import { ExternalLink, Search, HeartPulse, FileText, MapPin, Hash, Info, Zap, ShieldAlert } from "lucide-react";

const healthPortalsSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  state: fallback(z.string(), "").default(""),
  agencyType: fallback(z.string(), "").default(""),
  serviceType: fallback(z.string(), "").default(""),
  address: fallback(z.string(), "").default(""),
  permit: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/health-portals")({
  validateSearch: zodValidator(healthPortalsSearchSchema),
  component: HealthPortalsPage,
});

const AGENCY_TYPE_STYLES: Record<HealthAgencyType, string> = {
  county_health_department: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  municipal_health_department: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  state_health_department: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  state_environmental_agency: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

function HealthPortalsPage() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/_authenticated/health-portals" });
  const [query, setQuery] = useState(sp.q);
  const [state, setState] = useState<string>(sp.state);
  const [agencyType, setAgencyType] = useState<HealthAgencyType | "">((sp.agencyType as HealthAgencyType) || "");
  const [serviceType, setServiceType] = useState<HealthAgencyServiceType | "">((sp.serviceType as HealthAgencyServiceType) || "");
  const [address, setAddress] = useState(sp.address);
  const [permitNo, setPermitNo] = useState(sp.permit);

  const adminQ = useIsAdmin();
  const listFn = useServerFn(listHealthPortalMappings);
  const mappingsQ = useQuery({
    queryKey: ["health-portal-mappings"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  // Merge: DB entries override built-ins by (jurisdiction+state+agencyType).
  const allEntries = useMemo<HealthAgencyEntry[]>(() => {
    const dbEntries = (mappingsQ.data ?? [])
      .filter((m) => m.is_active)
      .map((m) => buildHealthAgencyEntryFromMapping(m));
    const key = (e: HealthAgencyEntry) => `${e.jurisdiction.toLowerCase()}|${e.state}|${e.agencyType}`;
    const byKey = new Map<string, HealthAgencyEntry>();
    for (const e of HEALTH_AGENCY_REGISTRY) byKey.set(key(e), e);
    for (const e of dbEntries) byKey.set(key(e), e);
    return Array.from(byKey.values());
  }, [mappingsQ.data]);

  useEffect(() => {
    setQuery(sp.q); setState(sp.state);
    setAgencyType((sp.agencyType as HealthAgencyType) || "");
    setServiceType((sp.serviceType as HealthAgencyServiceType) || "");
    setAddress(sp.address); setPermitNo(sp.permit);
  }, [sp.q, sp.state, sp.agencyType, sp.serviceType, sp.address, sp.permit]);

  useEffect(() => {
    const t = setTimeout(() => {
      navigate({
        search: { q: query, state, agencyType: agencyType || "", serviceType: serviceType || "", address, permit: permitNo },
        replace: true,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query, state, agencyType, serviceType, address, permitNo, navigate]);

  const availableStates = useMemo(() => {
    const s = new Set(allEntries.map((p) => p.state));
    return US_STATES.filter((x) => s.has(x));
  }, [allEntries]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEntries.filter((p) => {
      if (state && p.state !== state) return false;
      if (agencyType && p.agencyType !== agencyType) return false;
      if (serviceType && !p.serviceTypes.includes(serviceType)) return false;
      if (q && !`${p.jurisdiction} ${p.state} ${p.agencyType}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction));
  }, [query, state, agencyType, serviceType, allEntries]);

  const counts = useMemo(() => {
    const m = new Map<HealthAgencyType, number>();
    for (const p of allEntries) m.set(p.agencyType, (m.get(p.agencyType) ?? 0) + 1);
    return m;
  }, [allEntries]);

  const extraEntries = useMemo(
    () => (mappingsQ.data ?? []).filter((m) => m.is_active).map(buildHealthAgencyEntryFromMapping),
    [mappingsQ.data],
  );
  const suggested = useMemo(() => {
    if (!query.trim() || (!permitNo.trim() && !address.trim())) return [];
    const jurisdictionHint = state ? `${query.trim()}, ${state}` : query.trim();
    return findHealthAgencyDeepLinks(jurisdictionHint, {
      serviceType: serviceType || undefined,
      permitNumber: permitNo.trim() || undefined,
      address: address.trim() || undefined,
      limit: 4,
      extra: extraEntries,
    });
  }, [query, state, serviceType, permitNo, address, extraEntries]);

  return (
    <AppShell>
      <div className="px-4 pt-6 space-y-5">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-brand">
            <HeartPulse className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Health &amp; Environmental Agencies</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Health / Environmental Agency Directory</h1>
            {adminQ.data === true && (
              <Link
                to="/admin/health-portals"
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-[11px] font-medium text-brand hover:bg-brand/20"
              >
                <ShieldAlert className="size-3.5" /> Manage mappings
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Septic/OSSF, well permitting, food-service plan review, and wetlands/stormwater agencies —
            {" "}{allEntries.length} entries, separate from the building-permit portal directory.
          </p>
        </header>

        {/* Agency type legend */}
        <div className="flex flex-wrap gap-2">
          {HEALTH_AGENCY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAgencyType(agencyType === t ? "" : t)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                agencyType === t ? "ring-2 ring-brand" : ""
              } ${AGENCY_TYPE_STYLES[t]}`}
            >
              {t} · {counts.get(t) ?? 0}
            </button>
          ))}
          {(agencyType || state || query || serviceType) && (
            <button
              type="button"
              onClick={() => { setAgencyType(""); setState(""); setQuery(""); setServiceType(""); }}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Service type filter */}
        <div className="flex flex-wrap gap-2">
          {HEALTH_AGENCY_SERVICE_TYPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setServiceType(serviceType === s ? "" : s)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                serviceType === s ? "border-brand bg-brand/10 text-brand" : "border-border bg-background text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Search + state */}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search jurisdiction (e.g. Arlington, Hillsborough, Cook County)"
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
            <Info className="size-3.5" /> Pre-fill agency searches
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
                placeholder="Permit # (if the agency has one)"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Most health/environmental agencies don't expose a searchable public database the way building-permit portals do —
            pre-fill only applies where a mapping supports it.
          </p>
        </div>

        {/* Suggested direct deep links */}
        {suggested.length > 0 && (
          <div className="rounded-lg border border-brand/40 bg-brand/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-brand">
              <Zap className="size-3.5" /> Direct links {permitNo.trim() ? `for permit #${permitNo.trim()}` : `for "${query.trim()}"`}
            </div>
            <div className="grid gap-1.5">
              {suggested.map((m, i) => (
                <a
                  key={`${m.entry.jurisdiction}-${i}`}
                  href={m.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-brand"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{m.entry.jurisdiction}</span>
                      <span className="rounded bg-card border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{m.entry.state}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${AGENCY_TYPE_STYLES[m.entry.agencyType]}`}>{m.entry.agencyType}</span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-brand">
                        {m.linkKind === "permit" ? "permit# prefilled" : m.linkKind === "address" ? "address prefilled" : "agency home"}
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="size-4 text-brand shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 pb-8">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {results.length} agenc{results.length === 1 ? "y" : "ies"}
          </div>
          {results.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No agencies match. Try clearing filters.
            </div>
          )}
          {results.map((p, idx) => (
            <HealthAgencyCard key={`${p.jurisdiction}-${p.state}-${p.agencyType}-${idx}`} p={p} address={address} permitNo={permitNo} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function HealthAgencyCard({ p, address, permitNo }: { p: HealthAgencyEntry; address: string; permitNo: string }) {
  const addrUrl = address.trim() && p.addressSearch ? p.addressSearch(address) : null;
  const permitUrl = permitNo.trim() && p.permitSearch ? p.permitSearch(permitNo) : null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{p.jurisdiction}</span>
            <span className="rounded bg-background border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{p.state}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${AGENCY_TYPE_STYLES[p.agencyType]}`}>{p.agencyType}</span>
            {p.serviceTypes.map((s) => (
              <span key={s} className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{s}</span>
            ))}
            {p.id && (() => {
              const m = verifyMeta(p.verificationStatus);
              const MIcon = m.icon;
              return (
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ring-1 text-[10px] ${m.klass}`}>
                  <MIcon className="size-3" /> {m.label}
                </span>
              );
            })()}
          </div>
          {p.notes && <p className="mt-1 text-[11px] text-muted-foreground">{p.notes}</p>}
          {p.verifiedBy && p.lastVerifiedDate && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Verified by {p.verifiedBy} on {new Date(p.lastVerifiedDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <HealthAgencyLink href={p.url} icon={<ExternalLink className="size-3.5" />} label="Open agency site" primary />
        {addrUrl && <HealthAgencyLink href={addrUrl} icon={<MapPin className="size-3.5" />} label="Search address" />}
        {permitUrl && <HealthAgencyLink href={permitUrl} icon={<Hash className="size-3.5" />} label="Search permit #" />}
        {p.planReviewUrl && <HealthAgencyLink href={p.planReviewUrl} icon={<FileText className="size-3.5" />} label="Plan review" />}
      </div>
    </div>
  );
}

function HealthAgencyLink({ href, icon, label, primary }: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) {
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
