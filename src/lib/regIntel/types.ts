// PERMIVIO — Phase 2C.1 Property, Jurisdiction & Regulatory Intelligence: shared types + rules.
// Pure module (no I/O) so the verification rules can be unit-tested.

export type Verification = "verified" | "needs_verification" | "potential";
export type FactType =
  | "property" | "jurisdiction" | "agency" | "flood" | "zoning" | "future_land_use" | "overlay"
  | "code" | "local_amendment" | "scope_attribute" | "permit_candidate" | "special_condition";

/**
 * Source hierarchy (lower = stronger).
 * 1 government GIS/API/database · 2 government code/adoption record · 3 official AHJ website/document
 * 4 official state/federal source · 5 Permivio human-verified structured data (current)
 * 6 reputable secondary source (discovery only) · 7 AI inference
 */
export const SOURCE_TIERS: Record<number, string> = {
  1: "Government GIS / database",
  2: "Government code adoption record",
  3: "Official AHJ website / document",
  4: "Official state / federal source",
  5: "Permivio human-verified record",
  6: "Secondary source (discovery only)",
  7: "Inference / rule (not authoritative)",
};

export const VERIFICATION_LABEL: Record<Verification, string> = {
  verified: "Verified",
  needs_verification: "Needs Verification",
  potential: "Potential",
};

export type Conflict = { source: string; says: string; url?: string | null };

export type Fact = {
  fact_type: FactType;
  fact_key: string;
  label: string;
  value: Record<string, unknown>;
  display_value: string | null;
  source_org: string | null;
  source_title: string | null;
  source_url: string | null;
  provider: string;
  source_tier: number;
  origin: "research" | "stored" | "user" | "human";
  verification: Verification;
  limitation?: string | null;
  conflicts?: Conflict[];
  retrieved_at?: string;
  source_updated_at?: string | null;
  effective_date?: string | null;
  recheck_after?: string | null;
  requirement_type?: string | null;
};

/**
 * The only way a researched fact may become Verified: authoritative tier (1–5), a real value,
 * no unresolved conflicts, not ambiguous. Tier 6/7 (secondary / inference) never verify,
 * however confident. Missing values are Needs Verification, never guessed.
 */
export function decideVerification(input: {
  tier: number;
  hasValue: boolean;
  conflicts?: Conflict[];
  ambiguous?: boolean;
  requestedPotential?: boolean;
}): Verification {
  if (input.requestedPotential) return "potential";
  if (!input.hasValue) return "needs_verification";
  if ((input.conflicts ?? []).length > 0) return "needs_verification";
  if (input.ambiguous) return "needs_verification";
  if (input.tier >= 6) return input.tier === 7 ? "potential" : "needs_verification";
  return "verified";
}

/** Default freshness windows (days) per fact type. */
export const RECHECK_DAYS: Record<FactType, number> = {
  property: 180, jurisdiction: 365, agency: 180, flood: 90, zoning: 90, future_land_use: 180, overlay: 90,
  code: 90, local_amendment: 90, scope_attribute: 3650, permit_candidate: 90, special_condition: 180,
};

export function recheckAfter(type: FactType, from = new Date()): string {
  return new Date(from.getTime() + RECHECK_DAYS[type] * 86400000).toISOString();
}

export function isStale(f: { recheck_after?: string | null }, now = new Date()): boolean {
  return !!f.recheck_after && new Date(f.recheck_after).getTime() < now.getTime();
}

/** Mailing city never establishes AHJ: the governing authority comes only from boundary data. */
export function resolveGoverningAuthority(input: {
  postalCity: string | null;
  incorporatedPlace: string | null;
  county: string | null;
  boundaryDataAvailable: boolean;
}): { authority: string | null; status: "incorporated" | "unincorporated" | "undetermined"; postalCityControls: boolean | null } {
  if (!input.boundaryDataAvailable) return { authority: null, status: "undetermined", postalCityControls: null };
  if (input.incorporatedPlace) {
    const same = !!input.postalCity && input.incorporatedPlace.toLowerCase().includes(input.postalCity.toLowerCase());
    return { authority: input.incorporatedPlace, status: "incorporated", postalCityControls: same };
  }
  return { authority: input.county ? `${input.county} (Unincorporated)` : null, status: "unincorporated", postalCityControls: false };
}
