// PERMIVIO Site Investigation Engine — shared configuration for the modular
// investigation planner, complexity profile, report depth products and risk matrix.
// Client-safe: no server-only imports.

export type ReportDepth =
  | "property_snapshot"
  | "project_feasibility"
  | "development_due_diligence"
  | "major_development_study";

export const REPORT_DEPTHS: Array<{
  id: ReportDepth;
  label: string;
  blurb: string;
  minLevel: number;
  maxLevel: number;
}> = [
  {
    id: "property_snapshot",
    label: "Property Snapshot",
    blurb: "A concise look at the property, jurisdiction and likely approvals for simpler questions.",
    minLevel: 1,
    maxLevel: 1,
  },
  {
    id: "project_feasibility",
    label: "Project Feasibility",
    blurb: "The standard comprehensive site investigation for tenant improvements and small commercial work.",
    minLevel: 2,
    maxLevel: 2,
  },
  {
    id: "development_due_diligence",
    label: "Development Due Diligence",
    blurb: "Deeper research for ground-up construction, additions and commercial development.",
    minLevel: 3,
    maxLevel: 4,
  },
  {
    id: "major_development_study",
    label: "Major Development Study",
    blurb: "Full study for large acreage, multi-parcel, mixed-use, subdivision or campus development.",
    minLevel: 5,
    maxLevel: 5,
  },
];

export function depthMeta(id: string) {
  return REPORT_DEPTHS.find((d) => d.id === id) ?? REPORT_DEPTHS[1];
}

export const COMPLEXITY_LEVELS: Array<{ level: number; label: string; examples: string }> = [
  { level: 1, label: "Simple", examples: "Deck, small residential addition, sign, minor interior renovation, equipment replacement" },
  { level: 2, label: "Standard", examples: "Restaurant or retail build-out, office renovation, medical tenant improvement" },
  { level: 3, label: "Enhanced", examples: "Ground-up restaurant or retail, commercial addition, small multifamily" },
  { level: 4, label: "Complex", examples: "Shopping center, multifamily, industrial or large commercial development, multiple buildings or parcels" },
  { level: 5, label: "Major development", examples: "Subdivision, mixed-use, large acreage, campus, master-planned or multi-phase development" },
];

export function complexityMeta(level: number) {
  return COMPLEXITY_LEVELS.find((c) => c.level === level) ?? COMPLEXITY_LEVELS[1];
}

/** Modular research modules. `minLevel` is the complexity at which the module turns on by default. */
export const SI_MODULES: Array<{
  id: string;
  code: string;
  label: string;
  clientLabel: string;
  minLevel: number;
  sections: string[];
}> = [
  { id: "property", code: "A", label: "Property Information", clientLabel: "Researching the property", minLevel: 1, sections: ["property_information", "parcel_summary"] },
  { id: "jurisdiction", code: "B", label: "Jurisdiction", clientLabel: "Confirming jurisdiction", minLevel: 1, sections: ["jurisdiction"] },
  { id: "land_use_zoning", code: "C", label: "Land Use & Zoning", clientLabel: "Reviewing zoning", minLevel: 1, sections: ["existing_land_use", "zoning", "proposed_use_analysis"] },
  { id: "development_standards", code: "D", label: "Development Standards", clientLabel: "Checking site requirements", minLevel: 2, sections: ["development_standards", "parking_analysis", "signage"] },
  { id: "site_constraints", code: "E", label: "Site Constraints", clientLabel: "Checking site constraints", minLevel: 2, sections: ["site_constraints", "environmental_review"] },
  { id: "civil", code: "F", label: "Civil / Land Development", clientLabel: "Reviewing site development", minLevel: 3, sections: ["site_development_requirements"] },
  { id: "utilities", code: "G", label: "Utilities", clientLabel: "Reviewing utilities", minLevel: 1, sections: ["utility_feasibility"] },
  { id: "building_permits", code: "H", label: "Building & Permitting", clientLabel: "Identifying approvals", minLevel: 1, sections: ["building_permit_requirements", "required_permits", "agency_matrix"] },
  { id: "entitlements", code: "I", label: "Entitlements", clientLabel: "Reviewing entitlements", minLevel: 3, sections: ["entitlements"] },
  { id: "fire_life_safety", code: "J", label: "Fire & Life Safety", clientLabel: "Reviewing fire and life safety", minLevel: 2, sections: ["fire_life_safety"] },
  { id: "health", code: "K", label: "Health", clientLabel: "Reviewing health requirements", minLevel: 2, sections: ["health_department"] },
  { id: "transportation", code: "L", label: "Transportation & Access", clientLabel: "Reviewing access", minLevel: 3, sections: ["transportation_access"] },
  { id: "timeline", code: "M", label: "Permit & Development Timeline", clientLabel: "Building the permit path", minLevel: 1, sections: ["permitting_sequence", "estimated_timeline", "development_sequence"] },
];

export function moduleMeta(id: string) {
  return SI_MODULES.find((m) => m.id === id);
}

export type ModuleStatus = "required" | "optional" | "pending" | "complete" | "needs_confirmation" | "skipped";

export type PlannedModule = {
  id: string;
  label: string;
  status: ModuleStatus;
  reason: string;
};

export const RISK_CATEGORIES = [
  { id: "land_use", label: "Land Use Risk" },
  { id: "zoning", label: "Zoning Risk" },
  { id: "entitlement", label: "Entitlement Risk" },
  { id: "site_development", label: "Site Development Risk" },
  { id: "utility", label: "Utility Risk" },
  { id: "environmental", label: "Environmental Risk" },
  { id: "flood", label: "Flood Risk" },
  { id: "transportation", label: "Transportation Risk" },
  { id: "building_permit", label: "Building Permit Risk" },
  { id: "fire_life_safety", label: "Fire / Life Safety Risk" },
  { id: "health", label: "Health Approval Risk" },
  { id: "schedule", label: "Schedule Risk" },
] as const;

export function riskCategoryLabel(id: string) {
  return RISK_CATEGORIES.find((r) => r.id === id)?.label ?? id.replace(/_/g, " ");
}

export const RISK_LEVELS = [
  { id: "low", label: "Low", klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30" },
  { id: "medium", label: "Medium", klass: "text-sky-400 bg-sky-500/10 ring-sky-500/30" },
  { id: "high", label: "High", klass: "text-red-400 bg-red-500/10 ring-red-500/30" },
  { id: "unknown", label: "Unknown", klass: "text-muted-foreground bg-muted/40 ring-border" },
] as const;

export function riskLevelMeta(id: string) {
  return RISK_LEVELS.find((r) => r.id === id) ?? RISK_LEVELS[3];
}

export const DUE_DILIGENCE_PRIORITIES = [
  { id: "before_purchase", label: "Before purchase" },
  { id: "before_lease", label: "Before lease" },
  { id: "before_design", label: "Before design" },
  { id: "before_permit", label: "Before permit submission" },
  { id: "before_construction", label: "Before construction" },
] as const;

export function ddPriorityLabel(id: string) {
  return DUE_DILIGENCE_PRIORITIES.find((p) => p.id === id)?.label ?? id.replace(/_/g, " ");
}

/** Client-facing progress steps (never expose backend job names). */
export const SI_PROGRESS_STEPS = [
  "Researching the property",
  "Confirming jurisdiction",
  "Reviewing zoning",
  "Checking site requirements",
  "Reviewing utilities",
  "Building the permit roadmap",
  "Preparing your report",
] as const;

export const NO_DEAL_KILLERS_TEXT =
  "No potential deal killers were identified from the information currently verified.";

export const CUSTOM_QUOTE_THRESHOLDS = {
  parcels: 4,
  acreage: 20,
  complexityLevel: 5,
} as const;

// ------------------------------------------------------------------ planner

const L5 = /subdivision|master.?plan|mixed.?use|campus|multi.?phase|phased|industrial park|business park|acre/i;
const L4 = /shopping center|multifamily|apartment|industrial|warehouse|distribution|hotel|multiple buildings|self.?storage|townhome/i;
const L3 = /ground.?up|new (building|construction)|addition|shell|core and shell|new restaurant|new retail|expansion/i;
const L1 = /deck|fence|sign\b|water heater|hvac replacement|equipment replacement|reroof|re-?roof|minor (interior )?(renovation|repair)|patio(?! bar)|shed|window replacement/i;
const SITE_WORK = /grading|site work|parking lot|paving|driveway|stormwater|drainage|utility|trench|land disturb|clearing|tree removal/i;
const HEALTH_USE = /restaurant|food|kitchen|grocery|cafe|coffee|bar\b|brewery|medical|dental|clinic|childcare|daycare|pool|spa|salon/i;
const ENTITLEMENT = /rezon|special (use|exception)|conditional use|variance|comprehensive plan|subdivision|site plan approval|drive.?thr/i;

export type PlannerInput = {
  projectTypeLabel: string;
  scopeText: string;
  parcelCount: number;
  acreage?: number | null;
  buildingSf?: number | null;
  existingUse?: string | null;
  proposedUse?: string | null;
};

export type InvestigationPlan = {
  complexity_level: number;
  complexity_label: string;
  recommended_depth: ReportDepth;
  ground_up: boolean;
  interior_only: boolean;
  site_work: boolean;
  entitlement_involvement: boolean;
  utility_involvement: boolean;
  environmental_involvement: boolean;
  health_involvement: boolean;
  multi_parcel: boolean;
  parcel_count: number;
  acreage: number | null;
  building_sf: number | null;
  existing_use: string | null;
  proposed_use: string | null;
  modules: PlannedModule[];
  missing_information: string[];
  followup_questions: string[];
  custom_quote_recommended: boolean;
  rationale: string;
};

const FOLLOWUP_LIBRARY: Array<{ id: string; question: string; when: (i: PlannerInput, p: Partial<InvestigationPlan>) => boolean }> = [
  { id: "new_or_existing", question: "Is this a new building or an existing building?", when: (i, p) => !p.ground_up && !/existing|tenant|fit.?out|interior|remodel/i.test(`${i.projectTypeLabel} ${i.scopeText}`) },
  { id: "drive_through", question: "Is a drive-through proposed?", when: (i) => HEALTH_USE.test(`${i.projectTypeLabel} ${i.scopeText}`) && !/drive.?thr/i.test(i.scopeText) },
  { id: "food_prep", question: "Will there be food preparation onsite?", when: (i) => /restaurant|cafe|food|kitchen|bar\b|brewery|grocery/i.test(`${i.projectTypeLabel} ${i.scopeText}`) === false && /retail|tenant|office/i.test(`${i.projectTypeLabel}`) },
  { id: "exterior_work", question: "Is exterior site work included?", when: (i, p) => !p.site_work },
  { id: "footprint", question: "Will the building footprint change?", when: (i, p) => !p.ground_up },
  { id: "utility_change", question: "Will water, sewer, electric, or gas service need to change?", when: () => true },
  { id: "multi_parcel", question: "Are multiple parcels included?", when: (i) => i.parcelCount <= 1 },
  { id: "opening_date", question: "Is the project dependent on a specific opening date?", when: () => true },
  { id: "control", question: "Is this property under contract, being considered for lease, or already owned?", when: () => true },
];

export function buildInvestigationPlan(input: PlannerInput): InvestigationPlan {
  const text = `${input.projectTypeLabel} ${input.scopeText}`.trim();
  const acreage = input.acreage ?? null;
  const buildingSf = input.buildingSf ?? null;

  let level = 2;
  if (L1.test(text)) level = 1;
  if (L3.test(text)) level = Math.max(level, 3);
  if (L4.test(text)) level = Math.max(level, 4);
  if (L5.test(text)) level = Math.max(level, 5);
  if (input.parcelCount > 1) level = Math.max(level, 4);
  if (input.parcelCount > 3) level = 5;
  if ((acreage ?? 0) >= 20) level = 5;
  else if ((acreage ?? 0) >= 5) level = Math.max(level, 4);
  if ((buildingSf ?? 0) >= 50000) level = Math.max(level, 4);
  if (/change of (use|occupancy)/i.test(text)) level = Math.max(level, 2);

  const groundUp = L3.test(text) || L4.test(text) || L5.test(text);
  const interiorOnly = /tenant|fit.?out|interior|remodel|build.?out/i.test(text) && !SITE_WORK.test(text) && !groundUp;
  const siteWork = SITE_WORK.test(text) || groundUp || level >= 4;
  const entitlement = ENTITLEMENT.test(text) || level >= 4;
  const health = HEALTH_USE.test(text);
  const environmental = level >= 3 || siteWork;

  const partial: Partial<InvestigationPlan> = { ground_up: groundUp, interior_only: interiorOnly, site_work: siteWork };

  const modules: PlannedModule[] = SI_MODULES.map((m) => {
    let status: ModuleStatus = m.minLevel <= level ? "required" : "skipped";
    let reason = m.minLevel <= level ? `Included at complexity level ${level}.` : "Not applicable to this project scope.";

    if (m.id === "entitlements") {
      status = entitlement ? "required" : level >= 3 ? "optional" : "skipped";
      reason = entitlement ? "Discretionary approvals appear possible for this use or development type." : "No entitlement trigger identified from the scope provided.";
    }
    if (m.id === "health") {
      status = health ? "required" : "skipped";
      reason = health ? "Proposed use appears to involve a health-regulated activity." : "No health-regulated use identified.";
    }
    if (m.id === "civil") {
      status = siteWork ? "required" : "skipped";
      reason = siteWork ? "Exterior or site work appears to be involved." : "Scope appears interior only.";
    }
    if (m.id === "site_constraints") {
      status = environmental ? "required" : level >= 2 ? "optional" : "skipped";
      reason = environmental ? "Site disturbance or development may trigger environmental and flood review." : "Limited exterior impact expected.";
    }
    if (m.id === "transportation") {
      status = siteWork || level >= 3 ? "required" : "skipped";
      reason = siteWork || level >= 3 ? "Access, driveway or right-of-way considerations appear relevant." : "No access change identified.";
    }
    if (m.id === "development_standards") {
      status = interiorOnly && level <= 2 ? "optional" : "required";
      reason = interiorOnly ? "Interior scope — limited development standards expected." : "Site and zoning standards apply to this scope.";
    }
    return { id: m.id, label: m.label, status, reason };
  });

  const missing: string[] = [];
  if (!acreage) missing.push("Site acreage not provided — will be researched or flagged for confirmation.");
  if (!buildingSf) missing.push("Building area not provided.");
  if (!input.existingUse) missing.push("Existing use of the property not provided.");
  if (!input.proposedUse) missing.push("Proposed use not stated explicitly.");

  const followups = FOLLOWUP_LIBRARY.filter((f) => {
    try {
      return f.when(input, partial);
    } catch {
      return false;
    }
  })
    .slice(0, 6)
    .map((f) => f.question);

  const recommended = (REPORT_DEPTHS.find((d) => level >= d.minLevel && level <= d.maxLevel) ?? REPORT_DEPTHS[1]).id;

  const customQuote =
    input.parcelCount > CUSTOM_QUOTE_THRESHOLDS.parcels ||
    (acreage ?? 0) > CUSTOM_QUOTE_THRESHOLDS.acreage ||
    level >= CUSTOM_QUOTE_THRESHOLDS.complexityLevel;

  return {
    complexity_level: level,
    complexity_label: complexityMeta(level).label,
    recommended_depth: recommended,
    ground_up: groundUp,
    interior_only: interiorOnly,
    site_work: siteWork,
    entitlement_involvement: entitlement,
    utility_involvement: true,
    environmental_involvement: environmental,
    health_involvement: health,
    multi_parcel: input.parcelCount > 1,
    parcel_count: input.parcelCount,
    acreage,
    building_sf: buildingSf,
    existing_use: input.existingUse ?? null,
    proposed_use: input.proposedUse ?? null,
    modules,
    missing_information: missing,
    followup_questions: followups,
    custom_quote_recommended: customQuote,
    rationale: `Classified as level ${level} (${complexityMeta(level).label}) from the proposed work${
      input.parcelCount > 1 ? `, ${input.parcelCount} parcels` : ""
    }${acreage ? `, ${acreage} acres` : ""}. ${
      modules.filter((m) => m.status === "required").length
    } research modules apply. ${depthMeta(recommended).label} is recommended.`,
  };
}

export function activeModuleIds(plan: InvestigationPlan | null | undefined): string[] {
  if (!plan?.modules?.length) return SI_MODULES.filter((m) => m.minLevel <= 2).map((m) => m.id);
  return plan.modules.filter((m) => m.status === "required" || m.status === "optional").map((m) => m.id);
}

/** Section keys the report should include, based on the active modules. */
export function activeSectionKeys(plan: InvestigationPlan | null | undefined): string[] {
  const ids = new Set(activeModuleIds(plan));
  const keys = new Set<string>(["executive_summary", "project_description"]);
  for (const m of SI_MODULES) if (ids.has(m.id)) m.sections.forEach((s) => keys.add(s));
  ["risk_matrix", "deal_killers", "outstanding_due_diligence", "recommended_next_steps", "official_sources", "assumptions_limitations", "feasibility_rating"].forEach((k) => keys.add(k));
  return [...keys];
}
