// Pure follow-up question rule table — no I/O.
// Client- and server-safe. Given the plain-language project type + free-text
// scope + prior answers, returns the ordered list of questions to ask.

import type { FriendlyProjectType } from "./projectTypeMap";
import { isRestaurant } from "./projectTypeMap";

export type AnswerChoice = "yes" | "no" | "unsure" | "later";

export type Question = {
  key: string;
  prompt: string;
  why: string;                 // shown when the user picks "Unsure"
  kind: "choice" | "text" | "date";
  section: "space" | "trades" | "fire" | "signage" | "food" | "site" | "utility" | "use" | "timeline";
  // Which "friendly" project types this question applies to. Omit to apply to all.
  applies?: (ctx: PickContext) => boolean;
};

export type PickContext = {
  friendly: FriendlyProjectType | null;
  scopeText: string;
  answers: Record<string, AnswerChoice | string | undefined>;
};

// Convenience predicates
const kw = (s: string, list: string[]) => {
  const t = (s ?? "").toLowerCase();
  return list.some((k) => t.includes(k));
};

const isCommercial = (f: FriendlyProjectType | null | undefined) =>
  !!f && f !== "new_residential" && f !== "home_addition" && f !== "kitchen_bath_reno" && f !== "deck_patio";

const isNewConstruction = (f: FriendlyProjectType | null | undefined) =>
  f === "new_commercial" || f === "new_residential";

const isTI = (f: FriendlyProjectType | null | undefined) =>
  f === "open_restaurant" || f === "remodel_restaurant" || f === "open_retail" ||
  f === "remodel_retail" || f === "office_renovation" || f === "medical_dental" ||
  f === "commercial_ti";

const foodContext = (ctx: PickContext) =>
  isRestaurant(ctx.friendly) ||
  kw(ctx.scopeText, ["restaurant", "kitchen", "cafe", "coffee", "bar", "bakery", "food"]);

const siteContext = (ctx: PickContext) =>
  ctx.friendly === "exterior_site_work" ||
  isNewConstruction(ctx.friendly) ||
  kw(ctx.scopeText, ["grading", "paving", "drainage", "sitework", "site work", "excavat"]);

// ---------------- Question catalog ----------------
export const QUESTIONS: Question[] = [
  {
    key: "new_or_existing",
    prompt: "Is this a brand-new building or an existing space?",
    why: "Different reviews apply to new construction vs. work in an existing building.",
    kind: "choice",
    section: "space",
    applies: () => true,
  },
  {
    key: "walls_change",
    prompt: "Will walls be added, removed, or relocated?",
    why: "Wall changes usually trigger building and life-safety review.",
    kind: "choice",
    section: "space",
    applies: (ctx) => !isNewConstruction(ctx.friendly) && ctx.friendly !== "sign_installation" && ctx.friendly !== "exterior_site_work",
  },
  {
    key: "structural_change",
    prompt: "Will structural parts of the building be changed?",
    why: "Structural work needs engineered drawings and structural review.",
    kind: "choice",
    section: "space",
    applies: (ctx) => isNewConstruction(ctx.friendly) || ctx.friendly === "home_addition" || ctx.answers.walls_change === "yes",
  },
  {
    key: "electrical_change",
    prompt: "Will electrical wiring, panels, or fixtures change?",
    why: "Electrical changes need a licensed electrical permit.",
    kind: "choice",
    section: "trades",
    applies: (ctx) => ctx.friendly !== "sign_installation" && ctx.friendly !== "deck_patio",
  },
  {
    key: "plumbing_change",
    prompt: "Will plumbing fixtures or piping change?",
    why: "Plumbing changes need a plumbing permit and fixture count review.",
    kind: "choice",
    section: "trades",
    applies: (ctx) => ctx.friendly !== "sign_installation" && ctx.friendly !== "deck_patio" && ctx.friendly !== "exterior_site_work",
  },
  {
    key: "hvac_change",
    prompt: "Will HVAC equipment or ductwork change?",
    why: "Mechanical changes need a mechanical permit and energy review.",
    kind: "choice",
    section: "trades",
    applies: (ctx) => ctx.friendly !== "sign_installation" && ctx.friendly !== "deck_patio" && ctx.friendly !== "exterior_site_work",
  },
  {
    key: "food_service",
    prompt: "Will food be prepared or served onsite?",
    why: "Food service triggers a health department plan review.",
    kind: "choice",
    section: "food",
    applies: (ctx) => isCommercial(ctx.friendly) && (foodContext(ctx) || ctx.friendly === "change_of_use" || ctx.friendly === "commercial_ti"),
  },
  {
    key: "commercial_cooking",
    prompt: "Will commercial cooking equipment be installed?",
    why: "Commercial cooking usually requires a Type I hood and fire-suppression review.",
    kind: "choice",
    section: "food",
    applies: (ctx) => ctx.answers.food_service === "yes" || isRestaurant(ctx.friendly),
  },
  {
    key: "hood_change",
    prompt: "Will a kitchen hood or fire-suppression system be installed or changed?",
    why: "Hood suppression systems need a separate fire permit.",
    kind: "choice",
    section: "fire",
    applies: (ctx) => ctx.answers.food_service === "yes" || isRestaurant(ctx.friendly),
  },
  {
    key: "fire_alarm_change",
    prompt: "Will the fire alarm system be changed?",
    why: "Alarm modifications need shop drawings and a fire permit.",
    kind: "choice",
    section: "fire",
    applies: (ctx) => isCommercial(ctx.friendly),
  },
  {
    key: "sprinkler_change",
    prompt: "Will sprinkler heads or piping be changed?",
    why: "Sprinkler changes need hydraulic calcs and a fire permit.",
    kind: "choice",
    section: "fire",
    applies: (ctx) => isCommercial(ctx.friendly),
  },
  {
    key: "exterior_signs",
    prompt: "Will exterior signs be installed?",
    why: "Signs need a separate sign permit and sometimes design review.",
    kind: "choice",
    section: "signage",
    applies: (ctx) => isCommercial(ctx.friendly) && ctx.friendly !== "exterior_site_work",
  },
  {
    key: "outdoor_seating",
    prompt: "Will outdoor seating be added?",
    why: "Outdoor seating can trigger zoning, health, and ROW review.",
    kind: "choice",
    section: "site",
    applies: (ctx) => isRestaurant(ctx.friendly) || ctx.answers.food_service === "yes",
  },
  {
    key: "site_work",
    prompt: "Will grading, paving, drainage, or exterior site work occur?",
    why: "Site work triggers grading, stormwater, and sometimes environmental review.",
    kind: "choice",
    section: "site",
    applies: (ctx) => siteContext(ctx) || isNewConstruction(ctx.friendly),
  },
  {
    key: "utility_change",
    prompt: "Will water, sewer, electric, gas, or telecommunications service change?",
    why: "Utility changes need provider coordination and sometimes their own permits.",
    kind: "choice",
    section: "utility",
    applies: (ctx) => isNewConstruction(ctx.friendly) || ctx.answers.site_work === "yes" || ctx.friendly === "home_addition" || ctx.friendly === "exterior_site_work",
  },
  {
    key: "use_change",
    prompt: "Is the way the space will be used changing?",
    why: "Change of use re-triggers egress, fixture count, fire separation, and accessibility.",
    kind: "choice",
    section: "use",
    applies: (ctx) => ctx.friendly === "change_of_use" || isTI(ctx.friendly),
  },
  {
    key: "existing_co",
    prompt: "Is there an existing Certificate of Occupancy?",
    why: "The existing CO tells us the current legal use of the space.",
    kind: "choice",
    section: "use",
    applies: (ctx) => isCommercial(ctx.friendly) && !isNewConstruction(ctx.friendly),
  },
  {
    key: "target_start",
    prompt: "Target construction start date (optional)",
    why: "Helps sequence permits and inspections.",
    kind: "date",
    section: "timeline",
    applies: () => true,
  },
  {
    key: "target_open",
    prompt: "Target opening or move-in date (optional)",
    why: "Helps plan for a Temporary or final Certificate of Occupancy.",
    kind: "date",
    section: "timeline",
    applies: () => true,
  },
];

export function pickQuestions(ctx: PickContext): Question[] {
  return QUESTIONS.filter((q) => !q.applies || q.applies(ctx));
}

// Convert follow-up answers into the internal `trades` shape consumed by the
// rule engine, plus the derived scope_of_work fields.
export function deriveScopeFromAnswers(
  friendly: FriendlyProjectType | null,
  answers: Record<string, AnswerChoice | string | undefined>,
): {
  trades: Record<string, { involved: "yes" | "no" | "unsure"; details?: Record<string, unknown> }>;
  occupancy_existing: string | null;
  occupancy_proposed: string | null;
  target_start_date: string | null;
  target_open_date: string | null;
} {
  const y = (k: string) => answers[k] === "yes";
  const n = (k: string) => answers[k] === "no";
  const asChoice = (k: string): "yes" | "no" | "unsure" =>
    y(k) ? "yes" : n(k) ? "no" : "unsure";

  const foodYes = y("food_service") || isRestaurant(friendly);
  const siteYes = y("site_work") || friendly === "exterior_site_work";
  const signYes = y("exterior_signs") || friendly === "sign_installation";

  const trades: Record<string, { involved: "yes" | "no" | "unsure"; details?: Record<string, unknown> }> = {
    interior: { involved: "unsure" },
    exterior: { involved: siteYes || signYes ? "yes" : "unsure" },
    structural: { involved: asChoice("structural_change") },
    electrical: { involved: asChoice("electrical_change") },
    mechanical: { involved: asChoice("hvac_change") },
    plumbing: { involved: asChoice("plumbing_change") },
    fire_alarm: { involved: asChoice("fire_alarm_change") },
    fire_sprinkler: { involved: asChoice("sprinkler_change") },
    food_service: {
      involved: foodYes ? "yes" : n("food_service") ? "no" : "unsure",
      details: {
        grease: y("commercial_cooking") ? "yes" : "no",
        hood: y("hood_change") ? "type_i" : undefined,
      },
    },
    signage: { involved: signYes ? "yes" : n("exterior_signs") ? "no" : "unsure" },
    site_dev: { involved: siteYes ? "yes" : n("site_work") ? "no" : "unsure" },
    grading: { involved: siteYes ? "yes" : "unsure" },
    stormwater: { involved: siteYes ? "yes" : "unsure" },
    row: { involved: y("outdoor_seating") ? "yes" : "unsure" },
    utility: { involved: asChoice("utility_change") },
  };

  return {
    trades,
    // Existing CO is a hint, not a classification — leave occupancy fields for AI to fill later.
    occupancy_existing: null,
    occupancy_proposed: null,
    target_start_date: (typeof answers.target_start === "string" && answers.target_start) || null,
    target_open_date: (typeof answers.target_open === "string" && answers.target_open) || null,
  };
}
