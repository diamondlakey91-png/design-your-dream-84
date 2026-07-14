import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { findHealthAgencyDeepLinks, buildHealthAgencyEntryFromMapping, type HealthAgencyServiceType } from "@/lib/healthAgencyRegistry";
import { listHealthPortalMappings } from "@/lib/healthPortals.functions";

export function HealthAgencyDeepLinks({
  jurisdiction, serviceType, permitNumber, address,
}: {
  jurisdiction: string;
  serviceType?: HealthAgencyServiceType;
  permitNumber?: string;
  address?: string;
}) {
  const listFn = useServerFn(listHealthPortalMappings);
  const mappingsQ = useQuery({ queryKey: ["health-portal-mappings"], queryFn: () => listFn(), staleTime: 60_000 });
  const extra = useMemo(
    () => (mappingsQ.data ?? []).filter((m) => m.is_active).map(buildHealthAgencyEntryFromMapping),
    [mappingsQ.data],
  );
  const matches = useMemo(
    () => findHealthAgencyDeepLinks(jurisdiction, {
      serviceType, permitNumber: permitNumber || undefined, address: address || undefined, limit: 4, extra,
    }),
    [jurisdiction, serviceType, permitNumber, address, extra],
  );
  if (matches.length === 0) return null;

  return (
    <div className="pt-2 border-t border-border">
      <p className="text-[10px] font-mono uppercase tracking-widest text-brand mb-1.5">HEALTH / ENVIRONMENTAL AGENCY LINKS</p>
      <div className="flex flex-wrap gap-1.5">
        {matches.map((m, i) => (
          <a
            key={`${m.entry.jurisdiction}-${i}`}
            href={m.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:border-brand"
            title={`${m.entry.agencyType} — ${m.linkKind === "permit" ? "permit# prefilled" : m.linkKind === "address" ? "address prefilled" : "agency home"}`}
          >
            <span className="font-medium">{m.entry.jurisdiction}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{m.entry.state}</span>
            {m.linkKind === "permit" && <span className="font-mono text-[10px] text-brand">#</span>}
            {m.linkKind === "address" && <span className="font-mono text-[10px] text-brand">@</span>}
          </a>
        ))}
        <Link
          to="/health-portals"
          search={{ q: jurisdiction, state: "", agencyType: "", serviceType: serviceType ?? "", address: address ?? "", permit: permitNumber ?? "" }}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          More agencies →
        </Link>
      </div>
    </div>
  );
}
