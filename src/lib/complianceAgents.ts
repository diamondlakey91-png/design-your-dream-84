// Preset "specialized agents" for the Compliance Report generator — matches the
// PermitNow-style project-type presets (client-safe, no server imports).

export type ComplianceAgent = {
  id: string;
  label: string;
  emoji: string;
  scope: string; // one-liner for UI
  // Focused expertise directives injected into the AI prompt so each agent
  // catches the requirements specific to that scope.
  focus: string[];
  // Departments that typically have authority for this scope.
  departments: Array<"Building" | "Health" | "Fire" | "Planning/Zoning" | "Public Works" | "Utilities" | "ADA" | "Environmental" | "Sign" | "Historic">;
};

export const COMPLIANCE_AGENTS: ComplianceAgent[] = [
  {
    id: "handwashing_sink",
    label: "Handwashing Sink Install",
    emoji: "🚰",
    scope: "Add/replace a dedicated handwashing sink (restaurant, retail food, medical).",
    focus: [
      "IPC 2021 §405.3.1 handwashing lavatory clearances and mounting height",
      "Backflow preventer required (separate from 3-comp sink) — verify local amendment",
      "Health department plan review + operating permit before use",
      "ADA/A117.1 §606 clear floor space, faucet operable parts, insulation of hot supply",
      "Hot water availability (100°F min, 110°F max at hand sinks per local health code)",
    ],
    departments: ["Building", "Health", "ADA", "Utilities"],
  },
  {
    id: "restaurant_ti",
    label: "Restaurant Tenant Improvement",
    emoji: "🍽️",
    scope: "Interior build-out or remodel of a restaurant/food service space.",
    focus: [
      "Health department plan review, grease interceptor sizing, hood/suppression (NFPA 96 / IMC)",
      "Type I hood + Ansul suppression permit through Fire Marshal",
      "Occupant load recalculation, egress width, exit signage (IBC Ch.10)",
      "Grease waste separation, indirect waste from food-prep sinks (IPC 802)",
      "Sign permit if signage changes; ABC license if alcohol",
    ],
    departments: ["Building", "Health", "Fire", "Planning/Zoning", "Sign", "ADA", "Public Works"],
  },
  {
    id: "sign_permit",
    label: "Sign Permit",
    emoji: "🪧",
    scope: "New or replacement wall/monument/pylon signage.",
    focus: [
      "Zoning sign ordinance — size, height, illumination, setback, count per frontage",
      "Master sign program or Comprehensive Sign Plan compliance (if applicable)",
      "Electrical permit for illuminated signage; UL listing required",
      "Structural attachment details, wind load per ASCE 7",
      "Historic district / design review approval where applicable",
    ],
    departments: ["Sign", "Planning/Zoning", "Building", "Historic"],
  },
  {
    id: "hvac_replacement",
    label: "HVAC Replacement / New Equipment",
    emoji: "❄️",
    scope: "Replace or add rooftop/split-system HVAC equipment.",
    focus: [
      "Mechanical permit (IMC 2021); structural check for RTU weight and curb",
      "IECC 2021 / ASHRAE 90.1-2019 equipment efficiency minimums",
      "Refrigerant type/quantity — EPA §608, local AQMD (e.g. SCAQMD 1415)",
      "Combustion air, condensate routing, seismic restraints (western states)",
      "Title 24 Part 6 compliance forms (CA); NYC MEA/BSA for equipment approvals",
    ],
    departments: ["Building", "Utilities", "Environmental"],
  },
  {
    id: "ada_upgrade",
    label: "ADA Path-of-Travel Upgrade",
    emoji: "♿",
    scope: "Accessibility improvements: parking, route, restroom, signage.",
    focus: [
      "ADA 2010 + ICC A117.1-2017: 20% path-of-travel rule when altering primary function area",
      "Van-accessible stall count, slope ≤2%, access aisle",
      "Restroom clearances, grab bars, mirror, dispenser reach ranges",
      "CA Title 24 Ch. 11B is stricter than ADA — dual compliance",
      "TX: TDLR/RAS third-party review over threshold construction cost",
    ],
    departments: ["Building", "ADA", "Public Works"],
  },
  {
    id: "commercial_new",
    label: "Commercial New Construction",
    emoji: "🏗️",
    scope: "Ground-up new commercial building.",
    focus: [
      "Site plan / zoning entitlement before building permit",
      "Foundation-only, grading, shoring/excavation as deferred/separate permits",
      "Full trade permits (E/M/P), fire alarm (NFPA 72), sprinkler (NFPA 13)",
      "Stormwater NPDES CGP (>1 acre disturbance), SWPPP, erosion control",
      "Utility taps, capacity fees, off-site improvements, TCO → CO",
    ],
    departments: ["Building", "Planning/Zoning", "Fire", "Public Works", "Utilities", "Environmental"],
  },
  {
    id: "commercial_ti",
    label: "Commercial Tenant Improvement",
    emoji: "🏢",
    scope: "Non-food commercial interior build-out.",
    focus: [
      "Occupancy classification — change of use triggers full CO",
      "Egress recalculation, exit signage, fire-rated demising walls",
      "Sprinkler/alarm modification permits",
      "Accessibility 20% path-of-travel rule",
      "Business license, tenant sign permit",
    ],
    departments: ["Building", "Fire", "Planning/Zoning", "ADA", "Sign"],
  },
  {
    id: "residential_addition",
    label: "Residential Addition / Alteration",
    emoji: "🏠",
    scope: "SFR addition, remodel, or ADU.",
    focus: [
      "IRC 2021 vs local amendments; ADU state laws (CA, OR, WA)",
      "Setbacks, FAR, lot coverage, height — planning/zoning check",
      "Egress windows, smoke/CO alarms (IRC R314/R315)",
      "Title 24 Part 6 (CA) energy compliance forms",
      "HOA / design review if applicable",
    ],
    departments: ["Building", "Planning/Zoning", "Utilities"],
  },
  {
    id: "generic",
    label: "Other / General Scope",
    emoji: "📋",
    scope: "AI will infer the applicable departments from the described scope.",
    focus: ["AI-driven multi-department triage from the free-text scope description."],
    departments: ["Building", "Planning/Zoning", "Fire", "Health", "ADA"],
  },
];

export function getAgent(id: string): ComplianceAgent {
  return COMPLIANCE_AGENTS.find((a) => a.id === id) ?? COMPLIANCE_AGENTS[COMPLIANCE_AGENTS.length - 1];
}
