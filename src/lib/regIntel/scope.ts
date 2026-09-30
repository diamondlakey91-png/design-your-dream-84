// PERMIVIO — deterministic scope normalization (no AI). Original text is always preserved;
// derived attributes carry their origin and can be corrected by the customer.

export const SCOPE_ATTRIBUTES = [
  "residential", "commercial", "mixed_use", "new_construction", "addition", "alteration", "tenant_improvement",
  "change_of_use", "change_of_occupancy", "demolition", "structural", "electrical", "mechanical", "plumbing",
  "energy", "roofing", "site_civil", "signage", "fire_protection", "utility", "pool", "accessory_structure",
  "historic", "product_approvals", "single_family", "septic",
] as const;
export type ScopeAttribute = (typeof SCOPE_ATTRIBUTES)[number];

export const SCOPE_LABEL: Record<ScopeAttribute, string> = {
  residential: "Residential", commercial: "Commercial", mixed_use: "Mixed use", new_construction: "New construction",
  addition: "Addition", alteration: "Alteration", tenant_improvement: "Tenant improvement", change_of_use: "Change of use",
  change_of_occupancy: "Change of occupancy", demolition: "Demolition", structural: "Structural work",
  electrical: "Electrical work", mechanical: "Mechanical / HVAC", plumbing: "Plumbing work", energy: "Energy code",
  roofing: "Roofing", site_civil: "Site / civil", signage: "Signage", fire_protection: "Fire protection",
  utility: "Utility work", pool: "Pool", accessory_structure: "Accessory structure", historic: "Historic work",
  product_approvals: "Product approvals", single_family: "Single-family dwelling", septic: "Septic / onsite sewage",
};

const PATTERNS: Array<[ScopeAttribute, RegExp]> = [
  ["residential", /\b(residen|single[- ]family|dwelling|home|house|duplex|townhouse)/i],
  ["single_family", /\bsingle[- ]family\b|\bsfr\b/i],
  ["commercial", /\b(commercial|retail|office|restaurant|warehouse|industrial)\b/i],
  ["mixed_use", /\bmixed[- ]use\b/i],
  ["new_construction", /\bnew (construction|build|residence|home|building)|\bconstruct(ion)? of a new\b|\bground[- ]up\b/i],
  ["addition", /\baddition\b/i],
  ["alteration", /\b(alteration|remodel|renovat)/i],
  ["tenant_improvement", /\btenant improvement|\bbuild[- ]?out\b/i],
  ["change_of_use", /\bchange of use\b/i],
  ["change_of_occupancy", /\bchange of occupancy\b/i],
  ["demolition", /\bdemoli/i],
  ["structural", /\bstructural\b/i],
  ["electrical", /\belectrical\b/i],
  ["mechanical", /\b(mechanical|hvac)\b/i],
  ["plumbing", /\bplumbing\b/i],
  ["energy", /\benergy[- ]code|\benergy\b/i],
  ["roofing", /\broof(ing)?\b/i],
  ["site_civil", /\b(site work|civil|grading|driveway|paving)\b/i],
  ["signage", /\bsign(age|s)?\b/i],
  ["fire_protection", /\b(sprinkler|fire alarm|fire protection)\b/i],
  ["utility", /\butility|water service|sewer connection\b/i],
  ["pool", /\bpool\b/i],
  ["accessory_structure", /\b(accessory|shed|detached garage|carport)\b/i],
  ["historic", /\bhistoric\b/i],
  ["product_approvals", /\bproduct[- ]approval/i],
  ["septic", /\b(septic|onsite sewage|drainfield)\b/i],
];

export type DerivedAttribute = { key: ScopeAttribute; value: boolean; origin: "scope_text" | "work_type" | "project_type"; evidence: string };

export function normalizeScope(input: { scopeText: string | null; workType: string | null; projectType: string | null }): {
  original: string;
  attributes: DerivedAttribute[];
} {
  const original = input.scopeText ?? "";
  const out = new Map<ScopeAttribute, DerivedAttribute>();
  for (const [key, re] of PATTERNS) {
    const m = original.match(re);
    if (m) out.set(key, { key, value: true, origin: "scope_text", evidence: `Scope text mentions "${m[0]}"` });
  }
  const wt = (input.workType ?? "").toLowerCase();
  const wtMap: Record<string, ScopeAttribute> = {
    new_construction: "new_construction", addition: "addition", alteration: "alteration",
    tenant_improvement: "tenant_improvement", change_of_occupancy: "change_of_occupancy", demolition: "demolition",
  };
  if (wtMap[wt] && !out.has(wtMap[wt]!)) out.set(wtMap[wt]!, { key: wtMap[wt]!, value: true, origin: "work_type", evidence: `Work type is ${wt}` });
  const pt = (input.projectType ?? "").toLowerCase();
  if (/residential/.test(pt) && !out.has("residential")) out.set("residential", { key: "residential", value: true, origin: "project_type", evidence: `Project type "${input.projectType}"` });
  if (/single[- ]family/.test(pt) && !out.has("single_family")) out.set("single_family", { key: "single_family", value: true, origin: "project_type", evidence: `Project type "${input.projectType}"` });
  if (/commercial/.test(pt) && !out.has("commercial")) out.set("commercial", { key: "commercial", value: true, origin: "project_type", evidence: `Project type "${input.projectType}"` });
  return { original, attributes: [...out.values()] };
}

/** Customer corrections override derived values; returns the effective attribute set. */
export function effectiveScope(derived: DerivedAttribute[], corrections: Record<string, boolean>): Set<ScopeAttribute> {
  const s = new Set<ScopeAttribute>(derived.filter((d) => d.value).map((d) => d.key));
  for (const [k, v] of Object.entries(corrections)) {
    if (!(SCOPE_ATTRIBUTES as readonly string[]).includes(k)) continue;
    if (v) s.add(k as ScopeAttribute); else s.delete(k as ScopeAttribute);
  }
  return s;
}
