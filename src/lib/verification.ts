import { ShieldCheck, ShieldAlert, ShieldQuestion, Info } from "lucide-react";

// Shared verification-status display metadata, used by the Jurisdiction Library
// (list + detail pages) and the health/environmental agency directory. A single
// source of truth so badge styling stays consistent as the verification workflow
// grows to cover more record types.

export type VerificationStatus =
  | "verified"
  | "recently_verified"
  | "review_recommended"
  | "limited"
  | "unverified"
  | "source_unavailable"
  | "demo";

export function verifyMeta(status: string | null | undefined): { label: string; klass: string; icon: typeof ShieldCheck } {
  const s = (status || "unverified") as VerificationStatus;
  const map: Record<VerificationStatus, { label: string; klass: string; icon: typeof ShieldCheck }> = {
    verified:            { label: "Verified",            klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30", icon: ShieldCheck },
    recently_verified:   { label: "Recently verified",   klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30", icon: ShieldCheck },
    review_recommended:  { label: "Review recommended",  klass: "text-amber-400 bg-amber-500/10 ring-amber-500/30",       icon: ShieldAlert },
    limited:             { label: "Limited information", klass: "text-amber-400 bg-amber-500/10 ring-amber-500/30",       icon: ShieldAlert },
    unverified:          { label: "Unverified",          klass: "text-muted-foreground bg-muted/40 ring-border",           icon: ShieldQuestion },
    source_unavailable:  { label: "Source unavailable",  klass: "text-red-400 bg-red-500/10 ring-red-500/30",              icon: ShieldAlert },
    demo:                { label: "Demonstration data",  klass: "text-brand bg-brand/10 ring-brand/30",                    icon: Info },
  };
  return map[s] ?? map.unverified;
}
