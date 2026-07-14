import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { findPortalDeepLinks, buildEntryFromMapping } from "@/lib/portalRegistry";
import { listPortalMappings } from "@/lib/portals.functions";

export function PortalDeepLinks({ jurisdiction, permitNumber, address }: { jurisdiction: string; permitNumber: string; address: string }) {
  const listFn = useServerFn(listPortalMappings);
  const mappingsQ = useQuery({ queryKey: ["portal-mappings"], queryFn: () => listFn(), staleTime: 60_000 });
  const extra = useMemo(
    () => (mappingsQ.data ?? []).filter((m) => m.is_active).map(buildEntryFromMapping),
    [mappingsQ.data],
  );
  const matches = useMemo(
    () => findPortalDeepLinks(jurisdiction, { permitNumber: permitNumber || undefined, address: address || undefined, limit: 4, extra }),
    [jurisdiction, permitNumber, address, extra],
  );
  if (matches.length === 0) return null;

  return (
    <div className="pt-2 border-t border-border">
      <p className="text-[10px] font-mono uppercase tracking-widest text-brand mb-1.5">DIRECT PORTAL DEEP LINKS</p>
      <div className="flex flex-wrap gap-1.5">
        {matches.map((m, i) => (
          <a
            key={`${m.entry.jurisdiction}-${i}`}
            href={m.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:border-brand"
            title={`${m.entry.platform} — ${m.linkKind === "permit" ? "permit# prefilled" : m.linkKind === "address" ? "address prefilled" : "portal home"}`}
          >
            <span className="font-medium">{m.entry.jurisdiction}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{m.entry.state}</span>
            {m.linkKind === "permit" && <span className="font-mono text-[10px] text-brand">#</span>}
            {m.linkKind === "address" && <span className="font-mono text-[10px] text-brand">@</span>}
          </a>
        ))}
        <Link
          to="/portals"
          search={{ q: jurisdiction, state: "", platform: "", address, permit: permitNumber }}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          More portals →
        </Link>
      </div>
    </div>
  );
}
