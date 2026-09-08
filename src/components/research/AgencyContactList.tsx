import { Building2, Mail, MapPin, Clock, Phone, ExternalLink } from "lucide-react";
import type { AgencyContact } from "@/lib/agencyContacts";

/**
 * Real agency contact records retrieved from each authority's own official page.
 * Fields that were not published are simply absent — nothing is filled in.
 */
export function AgencyContactList({ contacts, className = "" }: { contacts: AgencyContact[]; className?: string }) {
  if (!contacts.length) {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        No published agency contact details were retrieved for this jurisdiction on this run. Confirm the reviewing
        office directly before relying on any contact information.
      </p>
    );
  }
  return (
    <ul className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      {contacts.map((c, i) => (
        <li key={i} className="rounded-xl border border-border bg-card/60 p-3.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-brand">{c.role_label}</p>
          <p className="mt-1 text-sm font-medium">{c.department ?? c.jurisdiction}</p>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {c.phone && (
              <p className="flex items-start gap-2">
                <Phone className="mt-0.5 size-3.5 shrink-0" />
                <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-foreground hover:text-brand">
                  {c.phone}
                </a>
              </p>
            )}
            {c.email && (
              <p className="flex items-start gap-2">
                <Mail className="mt-0.5 size-3.5 shrink-0" />
                <a href={`mailto:${c.email}`} className="text-foreground hover:text-brand break-all">
                  {c.email}
                </a>
              </p>
            )}
            {c.address && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                <span>{c.address}</span>
              </p>
            )}
            {c.hours && (
              <p className="flex items-start gap-2">
                <Clock className="mt-0.5 size-3.5 shrink-0" />
                <span>{c.hours}</span>
              </p>
            )}
            {c.portal_url && (
              <p className="flex items-start gap-2">
                <Building2 className="mt-0.5 size-3.5 shrink-0" />
                <a href={c.portal_url} target="_blank" rel="noreferrer" className="text-brand hover:underline break-all">
                  Online permit portal
                </a>
              </p>
            )}
            <p className="flex items-start gap-2 pt-0.5">
              <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
              <a href={c.source_url} target="_blank" rel="noreferrer" className="hover:underline break-all">
                {c.source_title}
              </a>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
