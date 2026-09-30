import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, ShieldQuestion, ExternalLink, Landmark } from "lucide-react";
import { AgencyContactList } from "@/components/research/AgencyContactList";
import { AhjBoundaryMap } from "@/components/maps/AhjBoundaryMap";
import { lookupAhjContacts, type AhjContactsResult } from "@/lib/ahjContacts.functions";

type Ok = Extract<AhjContactsResult, { ok: true }>;

/**
 * The live "who controls this permit" panel: controlling authority resolved from
 * official boundary data, its boundary map, the published agency contacts and
 * the official online permit portals. Presentation only — every value shown was
 * returned by a government service or read off an agency page.
 */
export function AhjAuthorityPanel({
  query,
  title = "Controlling authority, contacts & portals",
  showMap = true,
  onResolved,
}: {
  query?: string | null;
  title?: string;
  showMap?: boolean;
  onResolved?: (result: Ok) => void;
}) {
  const lookup = useServerFn(lookupAhjContacts);
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
    lookup({ data: { query: q } })
      .then((raw) => {
        const res = raw as AhjContactsResult;
        if (cancelled) return;
        if (!res.ok) setError(res.error);
        else {
          setData(res);
          onResolved?.(res);
        }
      })
      .catch(() => !cancelled && setError("The official boundary and agency services could not be reached for this location."))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lookup]);

  if (q.length < 3) return null;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-foreground">
              <Landmark className="size-3.5 text-primary" /> {title}
            </h4>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              The authority below was read from U.S. Census Bureau boundary data at the site point — not from the mailing
              address. Contact details come from each agency's own official page.
            </p>
          </div>
          {busy && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        {error && <p className="mt-4 text-xs text-destructive">{error}</p>}

        {data && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Fact label="Controlling authority" value={data.authority} />
              <Fact label="County" value={data.county} />
              <Fact label="State" value={data.state} />
            </div>

            {data.determination_note && (
              <p className="flex items-start gap-2 rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                {data.authority ? (
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                ) : (
                  <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span>{data.determination_note}</span>
              </p>
            )}

            <div>
              <p className="mb-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Live agency contacts
              </p>
              <AgencyContactList contacts={data.contacts} />
            </div>

            {data.portals.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Official online permit portals
                </p>
                <ul className="space-y-1.5">
                  {data.portals.map((p) => (
                    <li key={p.url} className="text-xs">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <ExternalLink className="size-3.5" /> {p.label}
                      </a>
                      <span className="ml-2 break-all text-muted-foreground">{p.url}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.sources.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Sources ({data.sources.length})</summary>
                <ul className="mt-2 space-y-1">
                  {data.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {data.unavailable.length > 0 && (
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Not available on this run
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {data.unavailable.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {showMap && <AhjBoundaryMap query={q} />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value ?? "Not confirmed"}</p>
    </div>
  );
}
