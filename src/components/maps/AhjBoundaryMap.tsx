import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Map as MapIcon, ShieldCheck, ShieldQuestion, ExternalLink } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMapsLoader";
import { resolveAhjBoundary, type AhjBoundaryResult } from "@/lib/ahjBoundary.functions";

/**
 * Map view of the resolved AHJ boundary and the site point — the same
 * boundary determination the Permit Requirements and Plan QA/QC agents use.
 * Presentation only: every value shown comes from the government services.
 */

type Ok = Extract<AhjBoundaryResult, { ok: true }>;

const STATUS: Record<string, string> = {
  inside_municipal_limits: "Inside municipal limits",
  unincorporated_county: "Unincorporated county territory",
  different_municipality_than_postal_city: "Different municipality than the mailing city",
  undetermined: "Undetermined",
};

export function AhjBoundaryMap({ query, title = "AHJ boundary & site location" }: { query?: string | null; title?: string }) {
  const resolveFn = useServerFn(resolveAhjBoundary);
  const [data, setData] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = (query ?? "").trim();

  useEffect(() => {
    if (q.length < 3) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    resolveFn({ data: { query: q } })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) setError(res.error);
        else setData(res);
      })
      .catch(() => !cancelled && setError("The boundary services could not be reached for this location."))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [q, resolveFn]);

  if (q.length < 3) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-widest text-foreground">{title}</h4>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            The outlined area is the authority that actually controls permitting at this point, read from U.S. Census Bureau
            TIGER boundaries — not the mailing city. The pin is the geocoded site location.
          </p>
        </div>
        <MapIcon className="size-5 shrink-0 text-brand" />
      </div>

      {busy && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Resolving the controlling boundary…
        </p>
      )}

      {error && !busy && (
        <p className="mt-4 rounded border border-border bg-background/40 p-3 text-xs text-muted-foreground">{error}</p>
      )}

      {data && !busy && (
        <>
          <MapCanvas data={data} />

          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Authority in control", data.ahj.name],
              ["Corporate-limit status", STATUS[data.ahj.incorporation_status] ?? data.ahj.incorporation_status],
              ["County", data.county],
              ["State", data.state],
              ["FEMA effective flood zone", data.flood_zone],
              ["Boundary shown", data.boundary ? (data.ahj.level === "county" ? "County boundary" : "Municipal corporate limits") : "Not retrieved"],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-foreground">{v || "—"}</dd>
              </div>
            ))}
          </dl>

          <p
            className={`mt-4 flex items-start gap-2 rounded p-3 text-xs ${
              data.ahj.authoritative
                ? "border border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                : "border border-sky-500/30 bg-sky-500/5 text-sky-200"
            }`}
          >
            {data.ahj.authoritative ? <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> : <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />}
            <span>{data.ahj.note}</span>
          </p>

          {data.sources.length > 0 && (
            <ul className="mt-3 space-y-1">
              {data.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                  >
                    <ExternalLink className="size-3" /> {s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {data.unavailable.length > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Not reachable on this run: {data.unavailable.join(" · ")}. Confirm those items with the agency.
            </p>
          )}
        </>
      )}
    </section>
  );
}

type GMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
      data: { addGeoJson: (g: unknown) => unknown[]; setStyle: (s: unknown) => void };
      fitBounds: (b: unknown, p?: number) => void;
    };
    Marker: new (opts: Record<string, unknown>) => unknown;
    LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void };
  };
};

function MapCanvas({ data }: { data: Ok }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        const g = (window as unknown as { google?: GMaps }).google;
        if (cancelled || !ref.current || !g) return;
        const center = { lat: data.point?.lat ?? 0, lng: data.point?.lng ?? 0 };
        const map = new g.maps.Map(ref.current, {
          center,
          zoom: data.boundary ? 12 : 17,
          mapTypeId: "roadmap",
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: true,
        });

        if (data.boundary) {
          map.data.setStyle({ strokeColor: "#38bdf8", strokeWeight: 2, fillColor: "#38bdf8", fillOpacity: 0.12 });
          map.data.addGeoJson({ type: "Feature", geometry: data.boundary, properties: {} });
        }
        if (data.point) {
          new g.maps.Marker({ position: center, map, title: data.point.label });
        }
      })
      .catch((e) => !cancelled && setErr((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (err) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-background/40 p-3 text-xs text-muted-foreground">
        Map unavailable: {err}
      </div>
    );
  }
  return <div ref={ref} className="mt-4 h-64 w-full overflow-hidden rounded-xl border border-border sm:h-80" />;
}
