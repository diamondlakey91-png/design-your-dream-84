// PERMIVIO — hybrid scope → permit/approval requirement engine (deterministic, no AI).
// Rules are jurisdiction-aware: each evaluates property facts + scope + configured sources.
// A rule never produces "Verified" unless it rests on a confirmed authoritative source.

import type { ScopeAttribute } from "./scope";
import type { CountyConfig, StateConfig, SourceRef } from "./coverage";
import type { Verification } from "./types";

export type RuleContext = {
  state: string | null;
  county: CountyConfig | null;
  stateCfg: StateConfig | null;
  incorporation: "incorporated" | "unincorporated" | "undetermined";
  scope: Set<ScopeAttribute>;
  flood: { sfha: boolean | null; zone: string | null; verification: Verification } | null;
  zoning: { code: string | null } | null;
  historic: boolean | null;
  waterProvider: string | null;
  wastewaterProvider: string | null;
  hasSepticDocument: boolean;
  /** Keys of official sources whose content was confirmed during Research & Verify. */
  confirmedSources: Set<string>;
};

export type Candidate = {
  key: string;
  name: string;
  category: string;
  agency: string;
  trigger: string;
  why: string;
  prerequisites: string[];
  source: SourceRef | null;
  verification: Verification;
  note?: string;
};

type Rule = (c: RuleContext) => Candidate | null;

const agency = (c: RuleContext, role: string) => c.county?.unincorporatedAgencies.find((a) => a.role === role);

const RULES: Rule[] = [
  // Building permit — new residential construction.
  (c) => {
    if (!c.scope.has("new_construction") && !c.scope.has("addition") && !c.scope.has("alteration")) return null;
    const bld = agency(c, "building");
    const statute = c.stateCfg?.buildingPermitStatute ?? null;
    const confirmed = !!statute && c.confirmedSources.has("building_permit_statute") && c.incorporation !== "undetermined" && !!bld;
    return {
      key: "building_permit",
      name: c.scope.has("residential") ? "Residential building permit" : "Building permit",
      category: "building",
      agency: bld?.name ?? "Building department (AHJ not resolved)",
      trigger: c.scope.has("new_construction") ? "Scope includes new construction" : "Scope includes construction work",
      why: statute ? "State law requires a building permit before constructing a building; the AHJ is resolved from boundary data." : "Construction work generally requires a building permit — no state source configured.",
      prerequisites: [],
      source: statute,
      verification: confirmed ? "verified" : "needs_verification",
    };
  },
  // Trade work — how trades are permitted varies by AHJ; never assume separate permits.
  ...(["electrical", "mechanical", "plumbing"] as const).map((t): Rule => (c) => {
    if (!c.scope.has(t)) return null;
    const bld = agency(c, "building");
    return {
      key: `${t}_trade`,
      name: `${t[0]!.toUpperCase()}${t.slice(1)} trade permit / approval`,
      category: t,
      agency: bld?.name ?? "Building department",
      trigger: `Scope includes ${t} work`,
      why: `The ${t} work must be permitted and inspected by a licensed contractor. Whether this AHJ issues a separate trade permit or covers it under the building permit was not confirmed from an official source.`,
      prerequisites: ["building_permit"],
      source: bld?.source ?? null,
      verification: "needs_verification",
    };
  }),
  // Floodplain — only from a mapped SFHA result, never assumed.
  (c) => {
    if (!c.flood || c.flood.sfha !== true) return null;
    return {
      key: "floodplain_review",
      name: "Floodplain development review / flood-resistant construction compliance",
      category: "site",
      agency: c.county ? `${c.county.name} floodplain administrator` : "Local floodplain administrator",
      trigger: `Property mapped in FEMA Special Flood Hazard Area (Zone ${c.flood.zone ?? "?"})`,
      why: "Development in a mapped SFHA triggers local floodplain management review and flood-resistant construction requirements (lowest floor elevation, elevation documentation).",
      prerequisites: [],
      source: c.county?.floodplain ?? null,
      verification: "needs_verification",
      note: c.flood.zone === "A" ? "Zone A has no published base flood elevation; a BFE may need to be established before design elevation is set." : undefined,
    };
  },
  (c) => {
    if (!c.flood || c.flood.sfha !== true) return null;
    return {
      key: "elevation_certificate",
      name: "FEMA Elevation Certificate (construction drawings / under construction / finished)",
      category: "site",
      agency: c.county ? `${c.county.name} floodplain administrator` : "Local floodplain administrator",
      trigger: "New construction in a mapped Special Flood Hazard Area",
      why: "Flood-hazard-area construction normally requires documented lowest-floor elevation; exact stages required are set by the local floodplain ordinance.",
      prerequisites: ["floodplain_review"],
      source: c.county?.floodplain ?? null,
      verification: "potential",
    };
  },
  // Onsite sewage — potential; conflicts with a mapped sewer service area are surfaced.
  (c) => {
    if (!c.scope.has("new_construction") || !c.scope.has("residential")) return null;
    if (!c.hasSepticDocument && !c.scope.has("septic")) return null;
    const h = agency(c, "health");
    return {
      key: "onsite_sewage",
      name: "Onsite sewage treatment and disposal system (septic) construction permit",
      category: "health",
      agency: h?.name ?? "State/county health authority",
      trigger: c.hasSepticDocument ? "A septic site plan is in the project documents" : "Scope mentions septic",
      why: "New dwellings served by an onsite system need an OSTDS construction permit before the building permit is issued in many Florida jurisdictions.",
      prerequisites: [],
      source: h?.source ?? null,
      verification: "potential",
      note: c.wastewaterProvider ? `County GIS places the parcel in the ${c.wastewaterProvider} wastewater service area — confirm whether central sewer is actually available at this lot or whether septic is required.` : undefined,
    };
  },
  // Zoning compliance.
  (c) => {
    if (!c.scope.has("new_construction")) return null;
    const pz = agency(c, "planning_zoning");
    return {
      key: "zoning_compliance",
      name: "Zoning compliance (use, setbacks, lot standards)",
      category: "zoning",
      agency: pz?.name ?? "Planning / zoning department",
      trigger: `New construction on a parcel zoned ${c.zoning?.code ?? "(zoning not resolved)"}`,
      why: "The dwelling must meet the district's permitted uses and dimensional standards; reviewed with the building permit or separately depending on the AHJ.",
      prerequisites: [],
      source: c.county?.zoningCode ?? null,
      verification: "needs_verification",
    };
  },
  // Product approvals (Florida-specific, from state config).
  (c) => {
    if (!c.stateCfg?.productApproval) return null;
    if (!c.scope.has("new_construction") && !c.scope.has("product_approvals")) return null;
    return {
      key: "product_approvals",
      name: "Florida product approvals for exterior envelope components",
      category: "building",
      agency: "Florida Building Commission (state or local product approval)",
      trigger: c.scope.has("product_approvals") ? "Scope lists product-approval documentation" : "New construction exterior envelope",
      why: "Windows, doors, roofing, soffit and other envelope products must carry Florida or local product approval matching the design wind pressures.",
      prerequisites: [],
      source: c.stateCfg.productApproval,
      verification: "needs_verification",
    };
  },
  // Energy compliance documentation.
  (c) => {
    if (!c.scope.has("new_construction") || !c.stateCfg) return null;
    const energy = c.stateCfg.codes.find((v) => v.discipline === "energy");
    if (!energy) return null;
    return {
      key: "energy_compliance",
      name: "Energy code compliance documentation",
      category: "building",
      agency: agency(c, "building")?.name ?? "Building department",
      trigger: "New conditioned building",
      why: `New buildings must show compliance with ${energy.family} ${energy.edition}.`,
      prerequisites: [],
      source: energy.source,
      verification: "needs_verification",
    };
  },
  // Historic — only if a mapped historic condition exists.
  (c) => {
    if (!c.historic) return null;
    return {
      key: "historic_review", name: "Historic preservation review", category: "other", agency: "Historic preservation authority",
      trigger: "Parcel intersects a mapped historic register site", why: "Mapped historic resources can require preservation review.",
      prerequisites: [], source: null, verification: "needs_verification",
    };
  },
  // Change of occupancy.
  (c) => {
    if (!c.scope.has("change_of_occupancy") && !c.scope.has("change_of_use")) return null;
    return {
      key: "change_of_occupancy", name: "Change of occupancy / use review (zoning, building, fire)", category: "building",
      agency: agency(c, "building")?.name ?? "Building department", trigger: "Scope implies a change of occupancy/use",
      why: "A change of occupancy can trigger zoning use approval, building code upgrades and fire review.", prerequisites: [],
      source: null, verification: "needs_verification",
    };
  },
];

export function evaluatePermitCandidates(ctx: RuleContext): Candidate[] {
  const out: Candidate[] = [];
  for (const r of RULES) {
    const c = r(ctx);
    if (c) out.push(c);
  }
  return out;
}

/** Match a candidate against existing roadmap items to avoid duplicates. */
export function findDuplicate(
  cand: { key: string; name: string; category: string },
  items: Array<{ id: string; name: string; category: string | null; regulatory_fact_key?: string | null }>,
): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(permit|approval|review|the|and|a)\b/g, " ").replace(/\s+/g, " ").trim();
  const n = norm(cand.name);
  for (const i of items) {
    if (i.regulatory_fact_key && i.regulatory_fact_key === cand.key) return i.id;
    const m = norm(i.name);
    if (!m) continue;
    if (m === n) return i.id;
    if ((i.category ?? "") === cand.category && (m.includes(n) || n.includes(m))) return i.id;
  }
  return null;
}
