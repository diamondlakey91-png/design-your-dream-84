// Deterministic Permit Roadmap rule engine (Phase 2).
// Pure functions — no I/O. Client- and server-safe.

export type Verification = "verified" | "ai_assisted" | "needs_agency_confirmation";
export type Likelihood = "required" | "likely" | "conditional" | "not_required";
export type AuthorityLevel = "city" | "county" | "state" | "federal" | "utility" | "special_district";
export type PermitCategory =
  | "zoning" | "building" | "electrical" | "mechanical" | "plumbing" | "fire"
  | "health" | "site" | "environmental" | "row" | "utility" | "business_license"
  | "sign" | "tco" | "co" | "other";

export type TradeVal = { involved: "yes" | "no" | "unsure"; details?: Record<string, unknown> };

/**
 * Confirmed jurisdiction context. When present, the rule engine uses exact
 * agency names and may raise verification to "ai_assisted". When absent (or
 * `confirmed: false`), every agency label is marked "needs confirmation" and
 * every permit verification is downgraded to "needs_agency_confirmation".
 */
export type JurisdictionContext = {
  municipality: string | null;
  county: string;
  state: string;
  incorporated: boolean;
  confirmed: boolean;
  authorities?: Array<{ role: string; official_name: string }>;
};

export type ScopeInputForRules = {
  address?: string | null;
  residential_or_commercial?: "residential" | "commercial" | "mixed_use" | null;
  occupancy_existing?: string | null;
  occupancy_proposed?: string | null;
  project_type?: string | null;
  construction_type?: string | null;
  dwelling_units?: number | null;
  construction_value_cents?: number | null;
  sq_ft_gross?: number | null;
  sq_ft_affected?: number | null;
  scope_text?: string | null;
  trades?: Record<string, TradeVal> | null;
  target_start_date?: string | null;
  target_open_date?: string | null;
  jurisdiction_context?: JurisdictionContext | null;
};

export type DraftPermit = {
  key: string; // stable client key used for depends_on references
  name: string;
  agency: string;
  level: AuthorityLevel;
  category: PermitCategory;
  likelihood: Likelihood;
  verification: Verification;
  review_days_min: number | null;
  review_days_max: number | null;
  sequence_order: number;
  depends_on: string[]; // permit keys
  concurrent_with: string[];
  critical_path: boolean;
  notes?: string;
};

export type DraftDocument = { name: string; description?: string; required: boolean; verification: Verification; permit_key?: string };
export type DraftAgency = { name: string; level: AuthorityLevel; jurisdiction?: string; role?: string; verification: Verification };
export type DraftRisk = { severity: "low" | "medium" | "high"; category?: string; message: string; mitigation?: string };
export type DraftFollowup = { question: string; field_hint?: string };

export type RoadmapDraft = {
  summary: string;
  authority_stack: { city?: string; county?: string; state?: string };
  permits: DraftPermit[];
  documents: DraftDocument[];
  agencies: DraftAgency[];
  risks: DraftRisk[];
  followups: DraftFollowup[];
  confidence: number;
  health_score: number;
};

const AI = "ai_assisted" as const;
const NEEDS = "needs_agency_confirmation" as const;

/**
 * Legacy free-text parser retained ONLY as a defensive last resort.
 * It refuses any token that looks like a ZIP code, a state-code+digits combo,
 * or a bare 2-letter state — so a raw string like "MD 21401" NEVER becomes a
 * city or county label. The primary path is `jurisdiction_context`.
 */
function parseAddress(addr?: string | null): { city?: string; county?: string; state?: string } {
  if (!addr) return {};
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  const looksLikeZipOrCode = (s: string) =>
    /^\d/.test(s) || /^[A-Z]{2}\s*\d/i.test(s) || /^[A-Z]{2}$/i.test(s) || /\b\d{5}(?:-\d{4})?\b/.test(s);
  const isCityish = (s: string) => /^[A-Za-z][A-Za-z\s.'\-]{1,60}$/.test(s) && !looksLikeZipOrCode(s);

  let state: string | undefined;
  let city: string | undefined;
  let county: string | undefined;
  const last = parts[parts.length - 1];
  if (last) {
    const m = last.match(/\b([A-Z]{2})\b/);
    if (m) state = m[1];
  }
  const cityCandidate = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  if (cityCandidate && isCityish(cityCandidate)) {
    if (/county/i.test(cityCandidate)) county = cityCandidate.replace(/\s+county/i, "").trim();
    else city = cityCandidate;
  }
  return { city, county, state };
}

function trade(scope: ScopeInputForRules, key: string): TradeVal["involved"] {
  return scope.trades?.[key]?.involved ?? "unsure";
}

function fromContext(ctx: JurisdictionContext | null | undefined) {
  if (!ctx) {
    return {
      cityLabel: "Local jurisdiction (needs confirmation)",
      countyLabel: "County (needs confirmation)",
      stateLabel: "State (needs confirmation)",
      confirmed: false,
    };
  }
  const stateLabel = ctx.state;
  const countyLabel = `${ctx.county} County, ${ctx.state}`;
  const cityLabel = ctx.incorporated && ctx.municipality ? `${ctx.municipality}, ${ctx.state}` : countyLabel;
  return { cityLabel, countyLabel, stateLabel, confirmed: !!ctx.confirmed };
}

/** Prefer the confirmed authority's official name; else a safe generic label. */
function agencyName(ctx: JurisdictionContext | null | undefined, role: string, fallback: string): string {
  const exact = ctx?.authorities?.find((a) => a.role === role)?.official_name;
  if (exact) return exact;
  if (!ctx) return `${fallback} — exact authority needs confirmation`;
  return fallback;
}

export function buildRoadmapDraft(scope: ScopeInputForRules): RoadmapDraft {
  const ctx = scope.jurisdiction_context ?? null;
  const legacy = ctx ? null : parseAddress(scope.address);
  const { cityLabel, countyLabel, stateLabel, confirmed } = fromContext(
    ctx ??
      (legacy && (legacy.city || legacy.county || legacy.state)
        ? { municipality: legacy.city ?? null, county: legacy.county ?? "Unknown", state: legacy.state ?? "??", incorporated: !!legacy.city, confirmed: false }
        : null),
  );
  // When jurisdiction is not confirmed, every verification is downgraded so
  // the UI can never present unresolved agencies as authoritative.
  const baseline: Verification = confirmed ? AI : NEEDS;


  const isCommercial = scope.residential_or_commercial === "commercial" || scope.residential_or_commercial === "mixed_use";
  const isResidential = scope.residential_or_commercial === "residential";
  const pt = scope.project_type ?? "";
  const newConstruction = pt === "new_construction" || pt === "shell" || pt === "core_and_shell";
  const coc = pt === "change_of_occupancy";
  const alteration = pt === "alteration" || pt === "tenant_improvement" || pt === "addition" || pt === "repair";
  const demo = pt === "demolition";

  const permits: DraftPermit[] = [];
  const documents: DraftDocument[] = [];
  const risks: DraftRisk[] = [];
  const followups: DraftFollowup[] = [];

  let seq = 10;
  const nextSeq = () => (seq += 10);

  const add = (p: Omit<DraftPermit, "sequence_order" | "concurrent_with" | "critical_path" | "depends_on"> & Partial<Pick<DraftPermit, "depends_on" | "concurrent_with" | "critical_path" | "sequence_order">>) => {
    permits.push({
      concurrent_with: [],
      critical_path: false,
      depends_on: [],
      sequence_order: nextSeq(),
      ...p,
    } as DraftPermit);
  };

  // 1. Zoning (always applicable, verification-only for repairs)
  if (!demo && !alteration) {
    add({
      key: "zoning",
      name: "Zoning compliance / use approval",
      agency: `${cityLabel} — Planning & Zoning`,
      level: "city",
      category: "zoning",
      likelihood: coc || newConstruction ? "required" : "likely",
      verification: NEEDS,
      review_days_min: 5,
      review_days_max: 30,
      notes: "Confirm proposed use is permitted; may require zoning verification letter or use permit.",
    });
  }

  // 2. Building (nearly always for anything beyond cosmetic repair)
  const bldgLikelihood: Likelihood = demo ? "conditional" : (alteration || newConstruction || coc ? "required" : "likely");
  add({
    key: "building",
    name: newConstruction ? "Building permit (new construction)" : coc ? "Building permit — change of occupancy" : "Building permit",
    agency: `${cityLabel} — Building Department`,
    level: "city",
    category: "building",
    likelihood: bldgLikelihood,
    verification: AI,
    review_days_min: newConstruction ? 20 : 10,
    review_days_max: newConstruction ? 60 : 30,
    depends_on: permits.find((p) => p.key === "zoning") ? ["zoning"] : [],
    critical_path: true,
    notes: isResidential && !newConstruction ? "IRC applies. Check thresholds for over-the-counter vs. plan review." : "IBC applies; plans typically require licensed design professional stamp when value or sq ft exceeds jurisdiction threshold.",
  });

  // 3. Trade permits — parallel to building
  const tradeMap: Array<{ key: string; scopeKey: string; name: string; category: PermitCategory }> = [
    { key: "electrical", scopeKey: "electrical", name: "Electrical permit", category: "electrical" },
    { key: "mechanical", scopeKey: "mechanical", name: "Mechanical / HVAC permit", category: "mechanical" },
    { key: "plumbing", scopeKey: "plumbing", name: "Plumbing permit", category: "plumbing" },
  ];
  for (const t of tradeMap) {
    const v = trade(scope, t.scopeKey);
    if (v === "no") continue;
    add({
      key: t.key,
      name: t.name,
      agency: `${cityLabel} — Building Department`,
      level: "city",
      category: t.category,
      likelihood: v === "yes" ? "required" : "conditional",
      verification: AI,
      review_days_min: 5,
      review_days_max: 15,
      depends_on: ["building"],
      concurrent_with: [],
      notes: "Typically filed by licensed trade contractor; can often run concurrent with building review.",
    });
  }
  // Mark trades concurrent with each other
  const tradeKeys = permits.filter((p) => ["electrical", "mechanical", "plumbing"].includes(p.key)).map((p) => p.key);
  for (const k of tradeKeys) {
    const perm = permits.find((p) => p.key === k)!;
    perm.concurrent_with = tradeKeys.filter((x) => x !== k);
  }

  // 4. Fire alarm & sprinkler
  if (trade(scope, "fire_alarm") !== "no") {
    add({
      key: "fire_alarm",
      name: "Fire alarm permit",
      agency: isCommercial ? `${cityLabel} — Fire Marshal` : `${countyLabel} — Fire Marshal`,
      level: isCommercial ? "city" : "county",
      category: "fire",
      likelihood: trade(scope, "fire_alarm") === "yes" ? "required" : "conditional",
      verification: AI,
      review_days_min: 10,
      review_days_max: 30,
      depends_on: ["building"],
      notes: "NFPA 72 compliance; shop drawings by licensed fire alarm designer.",
    });
  }
  if (trade(scope, "fire_sprinkler") !== "no") {
    add({
      key: "fire_sprinkler",
      name: "Fire sprinkler / suppression permit",
      agency: isCommercial ? `${cityLabel} — Fire Marshal` : `${countyLabel} — Fire Marshal`,
      level: isCommercial ? "city" : "county",
      category: "fire",
      likelihood: trade(scope, "fire_sprinkler") === "yes" ? "required" : "conditional",
      verification: AI,
      review_days_min: 10,
      review_days_max: 30,
      depends_on: ["building"],
      notes: "NFPA 13 / 13R / 13D depending on occupancy; hydraulic calcs required for new systems.",
    });
  }

  // 5. Health (food service)
  if (isCommercial && trade(scope, "food_service") !== "no") {
    add({
      key: "health",
      name: "Health department plan review & food service permit",
      agency: `${countyLabel} — Health Department`,
      level: "county",
      category: "health",
      likelihood: trade(scope, "food_service") === "yes" ? "required" : "conditional",
      verification: NEEDS,
      review_days_min: 15,
      review_days_max: 45,
      concurrent_with: ["building"],
      notes: "Kitchen equipment layout, finish schedule, hood/grease interceptor sizing required.",
    });
    documents.push({ name: "Kitchen equipment schedule", required: true, verification: AI, permit_key: "health" });
    documents.push({ name: "Finish schedule (FRP walls, coved base, floor drains)", required: true, verification: AI, permit_key: "health" });
    if (String(scope.trades?.food_service?.details?.grease ?? "") === "yes") {
      documents.push({ name: "Grease interceptor sizing calculation", required: true, verification: AI, permit_key: "health" });
    }
  }

  // 6. Signage
  if (isCommercial && trade(scope, "signage") !== "no") {
    add({
      key: "sign",
      name: "Sign permit",
      agency: `${cityLabel} — Planning & Zoning`,
      level: "city",
      category: "sign",
      likelihood: trade(scope, "signage") === "yes" ? "required" : "conditional",
      verification: AI,
      review_days_min: 5,
      review_days_max: 20,
      notes: "Wall vs. freestanding, illuminated, and historic district rules apply.",
    });
    if (String(scope.trades?.signage?.details?.historic ?? "") === "yes") {
      risks.push({ severity: "medium", category: "signage", message: "Historic district — separate design review required.", mitigation: "Submit sign design to Historic Preservation Commission early." });
    }
  }

  // 7. Site / grading / stormwater
  const disturbed = Number(scope.trades?.site_dev?.details?.disturbed_sqft ?? 0);
  const siteInvolved = ["site_dev", "grading", "stormwater"].some((k) => trade(scope, k) === "yes");
  if (siteInvolved || newConstruction) {
    add({
      key: "site",
      name: "Site development / grading permit",
      agency: `${cityLabel} — Public Works / DPW`,
      level: "city",
      category: "site",
      likelihood: siteInvolved ? "required" : "conditional",
      verification: NEEDS,
      review_days_min: 20,
      review_days_max: 60,
      concurrent_with: ["building"],
      notes: "Erosion & sediment control plan; grading & drainage plan required.",
    });
    if (disturbed >= 5000 || newConstruction) {
      add({
        key: "environmental",
        name: "Stormwater management / SWPPP",
        agency: `${stateLabel} — Department of the Environment`,
        level: "state",
        category: "environmental",
        likelihood: disturbed >= 5000 ? "required" : "likely",
        verification: NEEDS,
        review_days_min: 15,
        review_days_max: 45,
        concurrent_with: ["site"],
        notes: "Disturbance ≥ 5,000 sf triggers state SWM/SWPPP review in most jurisdictions.",
      });
    }
  }

  // 8. Right-of-way
  if (trade(scope, "row") === "yes") {
    add({
      key: "row",
      name: "Right-of-way / encroachment permit",
      agency: `${cityLabel} — Department of Transportation`,
      level: "city",
      category: "row",
      likelihood: "required",
      verification: NEEDS,
      review_days_min: 5,
      review_days_max: 20,
      notes: "Sidewalk, curb cut, lane closure, or ROW encroachment. State DOT if on state road.",
    });
  }

  // 9. Utility
  if (trade(scope, "utility") === "yes") {
    add({
      key: "utility",
      name: "Utility service coordination",
      agency: "Local utility providers (water, sewer, gas, electric, telecom)",
      level: "utility",
      category: "utility",
      likelihood: "required",
      verification: NEEDS,
      review_days_min: 10,
      review_days_max: 60,
      notes: "Contact each utility for service application, tap fees, and easements. 811 locate required before any excavation.",
    });
  }

  // 10. Business license (commercial only)
  if (isCommercial && (newConstruction || coc || pt === "tenant_improvement")) {
    add({
      key: "business_license",
      name: "Business license / occupational license",
      agency: `${cityLabel} — Finance / Business Licensing`,
      level: "city",
      category: "business_license",
      likelihood: "required",
      verification: NEEDS,
      review_days_min: 3,
      review_days_max: 14,
      notes: "Required prior to Certificate of Occupancy or business operation.",
    });
  }

  // 11. Inspections → TCO → CO — always mandatory final chain
  const buildingKey = "building";
  const inspectionDeps = [buildingKey];
  ["electrical", "mechanical", "plumbing", "fire_alarm", "fire_sprinkler"].forEach((k) => {
    if (permits.find((p) => p.key === k)) inspectionDeps.push(k);
  });

  if (isCommercial && scope.target_open_date) {
    add({
      key: "tco",
      name: "Temporary Certificate of Occupancy (TCO)",
      agency: `${cityLabel} — Building Department`,
      level: "city",
      category: "tco",
      likelihood: "conditional",
      verification: AI,
      review_days_min: 3,
      review_days_max: 10,
      depends_on: inspectionDeps,
      critical_path: true,
      notes: "Optional — allows limited occupancy pending final punch-list items.",
    });
  }

  add({
    key: "co",
    name: "Certificate of Occupancy (final)",
    agency: `${cityLabel} — Building Department`,
    level: "city",
    category: "co",
    likelihood: "required",
    verification: AI,
    review_days_min: 3,
    review_days_max: 14,
    depends_on: [...inspectionDeps, ...(permits.find((p) => p.key === "business_license") ? ["business_license"] : []), ...(permits.find((p) => p.key === "health") ? ["health"] : [])],
    critical_path: true,
    notes: demo ? "Not applicable for pure demolition — verify with jurisdiction." : "Required before occupancy. Final building, MEP, fire, and health sign-offs required.",
  });

  // ==== Documents (baseline) ====
  documents.push({ name: "Completed permit application", required: true, verification: AI, permit_key: "building" });
  documents.push({ name: "Site plan / plot plan", required: true, verification: AI, permit_key: "building" });
  if (!demo) {
    documents.push({ name: "Architectural drawings (stamped)", required: isCommercial || newConstruction, verification: AI, permit_key: "building" });
  }
  if (trade(scope, "structural") === "yes" || newConstruction) {
    documents.push({ name: "Structural drawings & calculations (PE stamped)", required: true, verification: AI, permit_key: "building" });
  }
  if (["electrical", "mechanical", "plumbing"].some((k) => trade(scope, k) === "yes")) {
    documents.push({ name: "MEP drawings (per involved trade)", required: true, verification: AI });
  }
  if (isCommercial) {
    documents.push({ name: "Energy code compliance form (IECC / ComCheck)", required: true, verification: AI, permit_key: "building" });
    documents.push({ name: "Accessibility compliance statement (ADA / ANSI A117.1)", required: true, verification: AI, permit_key: "building" });
  }
  if (coc) {
    documents.push({ name: "Change-of-occupancy analysis (egress, fixture count, fire separation)", required: true, verification: AI, permit_key: "building" });
  }

  // ==== Agencies ====
  const agencies: DraftAgency[] = [
    { name: `${cityLabel} — Building Department`, level: "city", jurisdiction: cityLabel, role: "Primary AHJ for building permits & inspections", verification: NEEDS },
    { name: `${cityLabel} — Planning & Zoning`, level: "city", jurisdiction: cityLabel, role: "Zoning verification, use approvals, signage", verification: NEEDS },
    { name: `${cityLabel} — Fire Marshal`, level: "city", jurisdiction: cityLabel, role: "Fire & life-safety review", verification: NEEDS },
  ];
  if (isCommercial && trade(scope, "food_service") !== "no") {
    agencies.push({ name: `${countyLabel} — Health Department`, level: "county", jurisdiction: countyLabel, role: "Food service plan review", verification: NEEDS });
  }
  if (siteInvolved || newConstruction) {
    agencies.push({ name: `${cityLabel} — Public Works / DPW`, level: "city", jurisdiction: cityLabel, role: "Site & grading review", verification: NEEDS });
    if (disturbed >= 5000 || newConstruction) {
      agencies.push({ name: `${stateLabel} — Department of the Environment`, level: "state", jurisdiction: stateLabel, role: "Stormwater / SWPPP", verification: NEEDS });
    }
  }
  if (trade(scope, "utility") === "yes") {
    agencies.push({ name: "Local utility providers", level: "utility", jurisdiction: cityLabel, role: "Water/sewer/gas/electric/telecom service coordination", verification: NEEDS });
  }

  // ==== Risks ====
  if (scope.target_open_date && scope.target_start_date) {
    const start = new Date(scope.target_start_date).getTime();
    const open = new Date(scope.target_open_date).getTime();
    // Estimate total days: max review path + construction rough estimate
    const permitDays = permits.reduce((m, p) => Math.max(m, (p.review_days_max ?? 0)), 0);
    const constructionRough = Math.max(60, Math.round(((scope.sq_ft_affected ?? scope.sq_ft_gross ?? 2000) / 50)));
    const requiredDays = permitDays + constructionRough + 14; // buffer
    const availableDays = Math.round((open - start) / (1000 * 60 * 60 * 24));
    if (availableDays > 0 && availableDays < requiredDays) {
      risks.push({
        severity: "high",
        category: "schedule",
        message: `Target opening ${Math.max(0, requiredDays - availableDays)} days beyond typical timeline (need ~${requiredDays}d, have ${availableDays}d).`,
        mitigation: "Consider expedited review, parallel filings, or adjust opening date.",
      });
    }
  }
  if (!scope.construction_type && isCommercial) {
    risks.push({ severity: "low", category: "documentation", message: "IBC construction classification not specified.", mitigation: "Have design professional confirm construction type (I-A through V-B)." });
  }
  const value = (scope.construction_value_cents ?? 0) / 100;
  if (isCommercial && value >= 500000 && !scope.construction_type) {
    risks.push({ severity: "medium", category: "review", message: "Project value ≥ $500K typically requires design-professional stamped drawings.", mitigation: "Confirm PE/RA stamp requirement with jurisdiction." });
  }
  if (coc) {
    risks.push({ severity: "medium", category: "code", message: "Change of occupancy re-triggers egress, fixture count, fire separation, and accessibility review.", mitigation: "Prepare change-of-occupancy analysis narrative." });
  }

  // ==== Follow-ups ====
  if (!scope.construction_type && isCommercial) followups.push({ question: "What is the IBC construction type (I-A through V-B)?", field_hint: "construction_type" });
  if (!scope.occupancy_proposed) followups.push({ question: "What is the proposed occupancy classification?", field_hint: "occupancy_proposed" });
  if (isCommercial && trade(scope, "food_service") === "unsure") followups.push({ question: "Will the space have food preparation or service?", field_hint: "trades.food_service" });
  if (!scope.construction_value_cents) followups.push({ question: "What is the estimated construction value?", field_hint: "construction_value_cents" });
  if (!scope.sq_ft_affected && !scope.sq_ft_gross) followups.push({ question: "What is the square footage of the affected area?", field_hint: "sq_ft_affected" });

  // ==== Verification downgrade when jurisdiction is not confirmed ====
  // A ZIP or an unresolved municipality can never be treated as an authority.
  // Force every permit, document, and agency to "needs_agency_confirmation" so
  // the UI cannot present unresolved reviewers as AI-assisted or verified.
  if (!confirmed) {
    for (const p of permits) p.verification = NEEDS;
    for (const d of documents) d.verification = NEEDS;
  }
  // Merge exact agency names when the caller supplied them via ctx.authorities.
  if (ctx?.authorities?.length) {
    const roleMap: Record<string, string> = {};
    for (const a of ctx.authorities) roleMap[a.role] = a.official_name;
    const roleForCategory = (c: PermitCategory): string | null => {
      switch (c) {
        case "building": case "electrical": case "mechanical": case "plumbing": return "building";
        case "zoning": case "sign": return "planning_zoning";
        case "fire": return "fire";
        case "health": return "health";
        case "site": return "public_works";
        case "row": return "transportation_row";
        case "environmental": return "environmental";
        case "co": case "tco": return "building";
        default: return null;
      }
    };
    for (const p of permits) {
      const role = roleForCategory(p.category);
      if (role && roleMap[role]) p.agency = roleMap[role];
    }
    for (const a of agencies) {
      const role = /building/i.test(a.role ?? "") ? "building"
        : /zoning|planning|sign/i.test(a.role ?? "") ? "planning_zoning"
        : /fire/i.test(a.role ?? "") ? "fire"
        : /health|food/i.test(a.role ?? "") ? "health"
        : /site|public works|grading/i.test(a.role ?? "") ? "public_works"
        : null;
      if (role && roleMap[role]) a.name = roleMap[role];
    }
  }

  // Confidence heuristic
  const filled = [

    scope.address, scope.residential_or_commercial, scope.project_type, scope.occupancy_proposed,
    scope.construction_value_cents, scope.sq_ft_affected ?? scope.sq_ft_gross, scope.scope_text,
  ].filter((x) => x != null && x !== "").length;
  const confidence = Math.min(0.95, 0.4 + filled * 0.07);
  const health_score = Math.round(confidence * 100 - risks.filter((r) => r.severity === "high").length * 10 - risks.filter((r) => r.severity === "medium").length * 4);

  const summary = [
    `${cityLabel} — ${pt ? pt.replace(/_/g, " ") : "project"}.`,
    `${permits.length} permit(s) identified with a mandatory Certificate of Occupancy at the end of the chain.`,
    followups.length ? `${followups.length} follow-up question(s) needed to sharpen the roadmap.` : "Core scope is well-defined.",
  ].join(" ");

  return {
    summary,
    authority_stack: {
      city: ctx?.incorporated ? ctx.municipality ?? undefined : undefined,
      county: ctx?.county,
      state: ctx?.state,
    },

    permits,
    documents,
    agencies,
    risks,
    followups,
    confidence,
    health_score,
  };
}
