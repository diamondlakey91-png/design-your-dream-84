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
  /** Nationwide: governing jurisdiction name and its discovered building/permits page. */
  ahjName?: string | null;
  ahjSource?: { url: string; title: string } | null;
};

const tiLike = (c: RuleContext) => c.scope.has("tenant_improvement") || c.scope.has("alteration") || c.scope.has("addition");
const commercial = (c: RuleContext) => c.scope.has("commercial") || c.scope.has("mixed_use");

/**
 * Regulatory requirement types — kept distinct so the roadmap never turns a supporting document
 * or an automatically generated sub-permit into a stand-alone "permit".
 */
export type RequirementType = "permit" | "approval" | "prerequisite" | "supporting_document" | "inspection" | "associated" | "potential";
export const REQUIREMENT_TYPE_LABEL: Record<RequirementType, string> = {
  permit: "Separate permit / application",
  approval: "Approval / review",
  prerequisite: "Prerequisite",
  supporting_document: "Required supporting document",
  inspection: "Inspection-related requirement",
  associated: "Handled under the main permit (confirm)",
  potential: "Potential requirement",
};

export type Candidate = {
  key: string;
  requirement_type: RequirementType;
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

const agency = (c: RuleContext, role: string): { name: string; source: SourceRef } | undefined => {
  const known = c.county?.unincorporatedAgencies.find((a) => a.role === role);
  if (known) return known;
  if (!c.ahjName || (role !== "building" && role !== "planning_zoning")) return undefined;
  return { name: `${c.ahjName} ${role === "building" ? "building department" : "planning / zoning"}`, source: c.ahjSource ? { org: c.ahjName, title: c.ahjSource.title, url: c.ahjSource.url, tier: 3 } : { org: c.ahjName, title: "Governing jurisdiction", url: "", tier: 4 } };
};

const RULES: Rule[] = [
  // Building permit — new residential construction.
  (c) => {
    if (!c.scope.has("new_construction") && !tiLike(c)) return null;
    const bld = agency(c, "building");
    const statute = c.stateCfg?.buildingPermitStatute ?? null;
    const confirmed = !!statute && c.confirmedSources.has("building_permit_statute") && c.incorporation !== "undetermined" && !!bld;
    return {
      key: "building_permit",
      requirement_type: "permit",
      name: c.scope.has("tenant_improvement") ? "Commercial alteration (tenant improvement) building permit" : c.scope.has("residential") && c.scope.has("new_construction") ? "Residential building permit — new dwelling" : "Building permit",
      category: "building",
      agency: bld?.name ?? "Building department (AHJ not resolved)",
      trigger: c.scope.has("new_construction") ? "Scope includes new construction" : "Scope includes work on an existing building",
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
      requirement_type: "associated",
      name: `${t[0]!.toUpperCase()}${t.slice(1)} scope (trade permit or sub-permit)`,
      category: t,
      agency: bld?.name ?? "Building department",
      trigger: `Scope includes ${t} work`,
      why: `The ${t} work is permitted and inspected by the building authority. Whether it is a separate trade permit or a sub-permit generated under the main building permit was not confirmed from an official ${bld ? bld.name : "AHJ"} source, so it is not listed as a separate permit.`,
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
      requirement_type: "approval",
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
      requirement_type: "inspection",
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
      requirement_type: "permit",
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
    if (!c.scope.has("new_construction") && !(commercial(c) && tiLike(c))) return null;
    const pz = agency(c, "planning_zoning");
    return {
      key: "zoning_compliance",
      requirement_type: "approval",
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
      requirement_type: "supporting_document",
      name: "Florida product approvals for exterior envelope components (submittal documents)",
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
    if ((!c.scope.has("new_construction") && !tiLike(c)) || !c.stateCfg) return null;
    const energy = c.stateCfg.codes.find((v) => v.discipline === "energy");
    if (!energy) return null;
    return {
      key: "energy_compliance",
      requirement_type: "supporting_document",
      name: "Energy code compliance calculations / forms (submittal documents)",
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
      key: "historic_review", requirement_type: "approval", name: "Historic preservation review", category: "other", agency: "Historic preservation authority",
      trigger: "Parcel intersects a mapped historic register site", why: "Mapped historic resources can require preservation review.",
      prerequisites: [], source: null, verification: "needs_verification",
    };
  },
  // Change of occupancy.
  (c) => {
    if (!c.scope.has("change_of_occupancy") && !c.scope.has("change_of_use")) return null;
    return {
      key: "change_of_occupancy", requirement_type: "approval", name: "Change of occupancy / use review (zoning, building, fire)", category: "building",
      agency: agency(c, "building")?.name ?? "Building department", trigger: "Scope implies a change of occupancy/use",
      why: "A change of occupancy can trigger zoning use approval, building code upgrades and fire review.", prerequisites: [],
      source: null, verification: "needs_verification",
    };
  },
  // Notice of Commencement — statewide lien-law prerequisite; applicability depends on contract value.
  (c) => {
    const noc = c.stateCfg?.noticeOfCommencement;
    if (!noc || (!c.scope.has("new_construction") && !tiLike(c))) return null;
    return {
      key: "notice_of_commencement", requirement_type: "prerequisite",
      name: "Recorded Notice of Commencement (before the first inspection)", category: "other",
      agency: "County Clerk of Court (recording) → building department",
      trigger: "Improvement to real property", why: "Florida's construction lien law requires a recorded Notice of Commencement to be filed with the building department before the first inspection when the improvement exceeds the statutory value threshold.",
      prerequisites: ["building_permit"], source: noc,
      verification: "needs_verification",
      note: c.confirmedSources.has("notice_of_commencement") ? "Statute text confirmed from the official source; applicability depends on the contract value, which is not in the project record." : "Statute text was not confirmed during this run.",
    };
  },
  // Stormwater / lot grading — never assumed; flagged for new construction only.
  (c) => {
    if (!c.scope.has("new_construction")) return null;
    return {
      key: "stormwater_grading", requirement_type: "potential",
      name: "Stormwater / lot grading plan", category: "site",
      agency: c.county ? `${c.county.name} (development review)` : "Local development review",
      trigger: "New construction adds impervious area", why: "Many jurisdictions require a lot grading / drainage plan with a new dwelling. This jurisdiction's specific requirement was not confirmed from an official source.",
      prerequisites: [], source: c.county?.zoningCode ?? null, verification: "potential",
    };
  },
  // Commercial fire review.
  (c) => {
    if (!commercial(c) || (!tiLike(c) && !c.scope.has("new_construction"))) return null;
    const f = agency(c, "fire");
    return {
      key: "fire_review", requirement_type: "approval",
      name: "Fire plan review (Florida Fire Prevention Code)", category: "fire",
      agency: f?.name ?? "Local fire marshal",
      trigger: "Commercial occupancy work", why: "Commercial work is reviewed against the Florida Fire Prevention Code; whether review is part of the building permit or separate depends on the AHJ.",
      prerequisites: [], source: c.stateCfg?.codes.find((v) => v.discipline === "fire")?.source ?? null, verification: "needs_verification",
    };
  },
  // Accessibility documentation for commercial alterations.
  (c) => {
    if (!commercial(c) || !tiLike(c)) return null;
    return {
      key: "accessibility_compliance", requirement_type: "supporting_document",
      name: "Accessibility compliance (FBC–Accessibility) on the drawings", category: "building",
      agency: agency(c, "building")?.name ?? "Building department",
      trigger: "Alteration of a commercial space", why: "Alterations to public accommodations must comply with FBC–Accessibility, including path-of-travel provisions where they apply.",
      prerequisites: [], source: c.stateCfg?.codes.find((v) => v.discipline === "accessibility")?.source ?? null, verification: "needs_verification",
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
