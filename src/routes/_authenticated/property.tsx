import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { analyzeProperty, type PropertyIntel, type ConfidenceTag } from "@/lib/property.functions";
import {
  MapPin, Search, Loader2, Building2, Landmark, Flame, Truck, TreePine, Droplets, Zap,
  Cable, CloudRain, ShieldCheck, ShieldAlert, ShieldQuestion, ExternalLink, FileText, ArrowRight, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/property")({
  head: () => ({
    meta: [
      { title: "Property Intelligence — Permivio" },
      { name: "description", content: "Get an instant property intelligence profile — jurisdiction, agencies, utilities, zoning, and permitting constraints for any U.S. address." },
    ],
  }),
  component: PropertyPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <AppShell>
        <div className="p-6 space-y-3">
          <h1 className="text-lg font-semibold">Property Intelligence unavailable</h1>
          <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
          <button
            className="rounded bg-brand px-3 py-2 text-brand-foreground text-sm"
            onClick={() => { reset(); router.invalidate(); }}
          >
            Retry
          </button>
        </div>
      </AppShell>
    );
  },
  notFoundComponent: () => (<AppShell><div className="p-6">Not found.</div></AppShell>),
});

const SAMPLE = "1603 Whetstone Way, Baltimore, MD 21230";

function PropertyPage() {
  const [address, setAddress] = useState("");
  const analyze = useServerFn(analyzeProperty);
  const mut = useMutation({
    mutationFn: (addr: string) => analyze({ data: { address: addr } }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim().length < 4) return;
    mut.mutate(address.trim());
  };

  return (
    <AppShell>
      <div className="px-4 py-6 lg:px-0 space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-brand">
            <Sparkles className="size-3" /> Property Intelligence
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Any address → a permit-ready profile.</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Enter a U.S. address. Permivio geocodes it, resolves the jurisdiction, and generates a jurisdiction-anchored
            summary of authorities, utilities, likely permits, and site constraints. Verified facts are marked; anything
            AI-inferred is flagged for you to confirm.
          </p>
        </header>

        {/* Search */}
        <form onSubmit={submit} className="rounded-2xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur">
          <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Address</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="1600 Pennsylvania Ave NW, Washington, DC 20500"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:border-brand"
                autoComplete="street-address"
              />
            </div>
            <button
              type="submit"
              disabled={mut.isPending || address.trim().length < 4}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-[0_6px_30px_-8px_oklch(0.66_0.19_258/0.6)] disabled:opacity-50"
            >
              {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {mut.isPending ? "Analyzing…" : "Analyze property"}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Try:</span>
            <button
              type="button"
              onClick={() => { setAddress(SAMPLE); mut.mutate(SAMPLE); }}
              className="rounded-full border border-border px-2 py-0.5 hover:border-brand"
            >
              {SAMPLE}
            </button>
          </div>
        </form>

        {/* Error */}
        {mut.isError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            {String((mut.error as Error)?.message ?? mut.error)}
          </div>
        )}

        {/* Empty state */}
        {!mut.data && !mut.isPending && !mut.isError && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Search an address to build its property intelligence profile.
          </div>
        )}

        {/* Loading skeleton */}
        {mut.isPending && (
          <div className="grid gap-4 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {mut.data && <Results intel={mut.data} />}
      </div>
    </AppShell>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-card/60 p-4 space-y-3">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-2/3 rounded bg-muted" />
    </div>
  );
}

function Results({ intel }: { intel: PropertyIntel }) {
  const g = intel.geocode;
  const j = intel.jurisdiction;
  const ai = intel.ai;

  return (
    <div className="space-y-4">
      {/* Header row: address + jurisdiction */}
      <div className="rounded-2xl border border-border bg-card/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-brand">Property</p>
            <h2 className="text-lg font-semibold">{g.formatted_address}</h2>
            <p className="text-xs font-mono text-muted-foreground">
              {g.lat.toFixed(6)}, {g.lng.toFixed(6)} · precision: {g.location_type}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Tag>{j.city || j.county || "—"}</Tag>
              {j.county && <Tag>{j.county}</Tag>}
              <Tag>{j.state}</Tag>
              {g.components.postal_code && <Tag>{g.components.postal_code}</Tag>}
              {j.has_cached_profile ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-emerald-300">
                  <ShieldCheck className="size-3" /> Cached jurisdiction profile
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-amber-300">
                  <ShieldQuestion className="size-3" /> No cached profile — AI inferred
                </span>
              )}
            </div>
          </div>
          <div className="w-full lg:w-[360px]">
            <PropertyMap lat={g.lat} lng={g.lng} label={g.formatted_address} />
          </div>
        </div>
      </div>

      {/* Summary */}
      <Card title="AI Summary" icon={<Sparkles className="size-4" />}>
        <p className="text-sm leading-relaxed">{ai.summary}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
          <MetaRow label="Likely use" value={ai.property.likely_use} confidence={ai.property.confidence} />
          <MetaRow label="Likely zoning" value={ai.property.likely_zoning} confidence={ai.property.confidence} />
          <MetaRow label="Lot context" value={ai.property.lot_context} confidence={ai.property.confidence} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Authorities */}
        <Card title="Permitting Authorities" icon={<Building2 className="size-4" />}>
          <ul className="space-y-2">
            {ai.authorities.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{a.role}</p>
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  {a.contact_hint && (
                    <p className="text-xs text-muted-foreground mt-0.5">{a.contact_hint}</p>
                  )}
                </div>
                <ConfidenceBadge value={a.confidence} />
              </li>
            ))}
            {j.portal_url && (
              <li>
                <a
                  href={j.portal_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
                >
                  Open jurisdiction portal <ExternalLink className="size-3" />
                </a>
              </li>
            )}
          </ul>
        </Card>

        {/* Utilities */}
        <Card title="Utility Coordination" icon={<Cable className="size-4" />}>
          <ul className="space-y-2">
            {ai.utilities.map((u, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-2.5">
                <div className="min-w-0 flex items-start gap-2">
                  <UtilityIcon kind={u.utility} />
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{u.utility}</p>
                    <p className="text-sm font-medium">{u.provider ?? "Unknown"}</p>
                    {u.notes && <p className="text-xs text-muted-foreground mt-0.5">{u.notes}</p>}
                  </div>
                </div>
                <ConfidenceBadge value={u.confidence} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Constraints */}
        <Card title="Site Constraints" icon={<TreePine className="size-4" />}>
          <ul className="space-y-2">
            {ai.constraints.map((c, i) => (
              <li key={i} className="rounded-lg border border-border/60 p-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <SeverityDot severity={c.severity} />
                      <p className="text-sm font-medium">{c.label}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                  <ConfidenceBadge value={c.confidence} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Likely permits */}
        <Card title="Likely Permits" icon={<FileText className="size-4" />}>
          <ul className="space-y-2">
            {ai.likely_permits.map((p, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.when_required}</p>
                </div>
                <ConfidenceBadge value={p.confidence} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Required Documents" icon={<FileText className="size-4" />}>
          <ul className="space-y-1.5 text-sm">
            {ai.required_documents.map((d, i) => (
              <li key={i} className="flex items-start gap-2"><ArrowRight className="mt-0.5 size-3.5 text-brand" />{d}</li>
            ))}
          </ul>
        </Card>
        <Card title="Recommended Next Steps" icon={<ArrowRight className="size-4" />}>
          <ul className="space-y-1.5 text-sm">
            {ai.next_steps.map((n, i) => (
              <li key={i} className="flex items-start gap-2"><ArrowRight className="mt-0.5 size-3.5 text-brand" />{n}</li>
            ))}
          </ul>
        </Card>
      </div>

      {ai.disclaimers.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200/90 space-y-1.5">
          <p className="font-mono uppercase tracking-widest text-[10px] text-amber-300">Disclaimers</p>
          {ai.disclaimers.map((d, i) => (<p key={i}>{d}</p>))}
        </div>
      )}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-brand">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border bg-background/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{children}</span>;
}

function MetaRow({ label, value, confidence }: { label: string; value?: string; confidence: ConfidenceTag }) {
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="truncate">{value || "—"}</p>
        <ConfidenceBadge value={confidence} compact />
      </div>
    </div>
  );
}

function ConfidenceBadge({ value, compact }: { value: ConfidenceTag; compact?: boolean }) {
  const map = {
    verified: { icon: <ShieldCheck className="size-3" />, label: "Verified", cls: "bg-emerald-500/10 text-emerald-300" },
    ai_assisted: { icon: <ShieldQuestion className="size-3" />, label: "AI-assisted", cls: "bg-sky-500/10 text-sky-300" },
    needs_confirmation: { icon: <ShieldAlert className="size-3" />, label: "Confirm", cls: "bg-amber-500/10 text-amber-300" },
  } as const;
  const m = map[value] ?? map.needs_confirmation;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest ${m.cls}`}>
      {m.icon}{!compact && m.label}
    </span>
  );
}

function SeverityDot({ severity }: { severity: "info" | "watch" | "risk" }) {
  const cls = severity === "risk" ? "bg-red-400" : severity === "watch" ? "bg-amber-400" : "bg-sky-400";
  return <span className={`size-2 rounded-full ${cls}`} aria-hidden />;
}

function UtilityIcon({ kind }: { kind: string }) {
  const c = "size-4 text-brand";
  if (kind === "Water") return <Droplets className={c} />;
  if (kind === "Sewer") return <Droplets className={c} />;
  if (kind === "Electric") return <Zap className={c} />;
  if (kind === "Gas") return <Flame className={c} />;
  if (kind === "Stormwater") return <CloudRain className={c} />;
  if (kind === "Telecom") return <Cable className={c} />;
  if (kind === "Trash") return <Truck className={c} />;
  return <Landmark className={c} />;
}

// ---- Map (Google Maps JS) ----
type GMapsGlobal = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
    Marker: new (opts: Record<string, unknown>) => unknown;
  };
};
declare global {
  interface Window {
    google?: GMapsGlobal;
    __permivioInitMap?: () => void;
    __permivioMapReady?: boolean;
  }
}

function loadMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.__permivioMapReady) return resolve();
    const existing = document.getElementById("permivio-gmaps") as HTMLScriptElement | null;
    if (existing) {
      const check = () => (window.__permivioMapReady ? resolve() : setTimeout(check, 60));
      check();
      return;
    }
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
    const channel = (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined) ?? "";
    if (!key) return reject(new Error("Google Maps browser key missing"));
    window.__permivioInitMap = () => { window.__permivioMapReady = true; resolve(); };
    const s = document.createElement("script");
    s.id = "permivio-gmaps";
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__permivioInitMap${channel ? `&channel=${channel}` : ""}`;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
}

function PropertyMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadMapsScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        const map = new window.google.maps.Map(ref.current, {
          center: { lat, lng },
          zoom: 18,
          mapTypeId: "hybrid",
          disableDefaultUI: true,
          zoomControl: true,
        });
        new window.google.maps.Marker({ position: { lat, lng }, map, title: label });
        void map;
      })
      .catch((e) => setErr((e as Error).message));
    return () => { cancelled = true; };
  }, [lat, lng, label]);

  if (err) {
    return (
      <div className="rounded-xl border border-border bg-background/40 p-3 text-xs text-muted-foreground">
        Map unavailable: {err}
      </div>
    );
  }
  return <div ref={ref} className="h-56 w-full rounded-xl border border-border overflow-hidden" />;
}
