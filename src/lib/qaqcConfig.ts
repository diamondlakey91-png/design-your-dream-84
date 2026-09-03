// Reusable configuration for the Plan QA/QC module. Categories, disciplines,
// severities and readiness bands live here (not hardcoded into a screen) so the
// engine, the report view, the PDF export and the admin config screen all read
// the same source of truth.

export type QaQcSeverity = "critical" | "high" | "medium" | "low" | "informational";

export const QAQC_SEVERITIES: Array<{
  id: QaQcSeverity;
  label: string;
  definition: string;
  klass: string;
  weight: number;
}> = [
  { id: "critical", label: "Critical", definition: "Potential life-safety, jurisdiction rejection, or major design issue.", klass: "text-red-400 bg-red-500/10 ring-red-500/30", weight: 18 },
  { id: "high", label: "High", definition: "Likely to cause correction comments, redesign, or permit delay.", klass: "text-orange-400 bg-orange-500/10 ring-orange-500/30", weight: 9 },
  { id: "medium", label: "Medium", definition: "Coordination, completeness, or documentation issue.", klass: "text-amber-400 bg-amber-500/10 ring-amber-500/30", weight: 4 },
  { id: "low", label: "Low", definition: "Minor clarification or quality issue.", klass: "text-sky-400 bg-sky-500/10 ring-sky-500/30", weight: 1.5 },
  { id: "informational", label: "Informational", definition: "Recommendation or item for confirmation.", klass: "text-muted-foreground bg-muted/40 ring-border", weight: 0.5 },
];

export function severityMeta(id: string) {
  return QAQC_SEVERITIES.find((s) => s.id === id) ?? QAQC_SEVERITIES[2];
}

export type QaQcCategoryId =
  | "project_information"
  | "cover_code_analysis"
  | "life_safety"
  | "accessibility"
  | "architectural"
  | "structural"
  | "mechanical"
  | "electrical"
  | "plumbing"
  | "fire_protection"
  | "civil_site"
  | "cross_discipline";

export const QAQC_CATEGORIES: Array<{
  id: QaQcCategoryId;
  no: number;
  label: string;
  checks: string[];
}> = [
  { id: "project_information", no: 1, label: "Project Information", checks: ["project address", "owner", "tenant", "project name", "parcel", "scope of work", "construction value", "square footage", "number of stories", "occupancy", "construction type", "project description", "conflicting information across sheets"] },
  { id: "cover_code_analysis", no: 2, label: "Cover Sheet / Code Analysis", checks: ["applicable code editions", "occupancy classification", "construction classification", "allowable area", "height", "stories", "sprinkler status", "fire alarm status", "occupant load", "means of egress", "plumbing fixture calculations", "accessibility statement", "energy code information", "existing vs proposed", "project scope", "drawing index"] },
  { id: "life_safety", no: 3, label: "Life Safety", checks: ["egress", "exit count", "exit separation", "travel distance", "common path of travel", "dead-end corridors", "exit width", "door swing", "door hardware", "accessible exits", "exit signage", "emergency lighting", "occupant-load consistency", "fire-rated corridors", "fire barriers", "fire partitions", "smoke barriers", "fire-resistance continuity", "rated penetrations", "fire doors"] },
  { id: "accessibility", no: 4, label: "Accessibility", checks: ["accessible route", "entrances", "door clearances", "maneuvering clearances", "restrooms", "accessible fixtures", "grab bars", "turning radius", "knee clearance", "counter heights", "drinking fountains", "accessible seating", "parking", "van-accessible parking", "curb ramps", "slopes", "ramps", "handrails", "signage", "employee work areas"] },
  { id: "architectural", no: 5, label: "Architectural Coordination", checks: ["dimension conflicts", "door conflicts", "room naming", "wall types", "ceiling coordination", "detail references", "section references", "enlarged plans", "finish plans", "schedules", "missing details", "missing elevations", "demolition vs new work", "existing conditions"] },
  { id: "structural", no: 6, label: "Structural", checks: ["structural sheets", "framing plans", "foundation plans", "details", "calculations", "structural notes", "equipment loads", "openings", "roof modifications", "wall removals", "beams and headers", "structural references"] },
  { id: "mechanical", no: 7, label: "Mechanical", checks: ["equipment schedules", "HVAC equipment consistency", "duct layouts", "exhaust", "outside air", "kitchen ventilation", "hood exhaust", "makeup air", "roof equipment", "mechanical/electrical coordination", "condensate", "service clearances"] },
  { id: "electrical", no: 8, label: "Electrical", checks: ["service information", "panel schedules", "load calculations", "one-line diagrams", "equipment power", "emergency systems", "exit/emergency lighting", "fire alarm coordination", "mechanical equipment power", "kitchen equipment", "service size conflicts"] },
  { id: "plumbing", no: 9, label: "Plumbing", checks: ["fixture schedules", "fixture-count consistency", "water service", "sanitary layout", "venting", "grease waste", "grease interceptor", "backflow", "water heater", "risers", "kitchen fixtures", "accessible fixtures", "civil/plumbing coordination"] },
  { id: "fire_protection", no: 10, label: "Fire Protection", checks: ["sprinkler scope", "fire alarm scope", "kitchen suppression", "extinguishers", "rated assemblies", "fire department access", "fire service", "alarm devices", "sprinkler head conflicts", "ceiling coordination"] },
  { id: "civil_site", no: 11, label: "Civil / Site", checks: ["survey coordination", "property boundaries", "building location", "parking", "accessible parking", "site access", "fire access", "utilities", "grading", "drainage", "stormwater", "sidewalks", "curb ramps", "dumpster", "loading", "landscaping", "site lighting", "right-of-way work"] },
  { id: "cross_discipline", no: 12, label: "Cross-Discipline Coordination", checks: ["architectural equipment vs electrical power", "mechanical equipment vs electrical schedules", "plumbing fixtures vs architectural plans", "kitchen equipment vs plumbing/electrical/mechanical", "roof penetrations vs structural", "fire alarm vs reflected ceiling plan", "sprinkler layout vs ceilings", "civil utilities vs plumbing service", "structural openings vs ductwork", "door schedule vs floor plans", "room names across disciplines"] },
];

export function categoryLabel(id: string) {
  return QAQC_CATEGORIES.find((c) => c.id === id)?.label ?? id.replace(/_/g, " ");
}

export const QAQC_DISCIPLINES = [
  "architectural", "civil", "structural", "mechanical", "electrical", "plumbing",
  "fire_alarm", "fire_sprinkler", "fire_suppression", "life_safety", "accessibility",
  "energy", "landscape", "site", "survey", "utility", "food_service", "equipment",
  "sign", "demolition", "existing_conditions", "as_built", "photometric", "traffic",
  "general", "unknown",
] as const;

export type QaQcDiscipline = (typeof QAQC_DISCIPLINES)[number];

export function disciplineLabel(id: string) {
  return (id || "unknown").replace(/_/g, " ");
}

export const SEAL_STATUSES = ["sealed_signed", "sealed_unsigned", "not_visible", "illegible"] as const;
export const INDEX_STATES = ["present", "missing_from_upload", "not_indexed", "duplicate", "superseded"] as const;

export function indexStateLabel(s: string) {
  const map: Record<string, string> = {
    present: "On index and uploaded",
    missing_from_upload: "On index, not uploaded",
    not_indexed: "Uploaded, not on index",
    duplicate: "Duplicate sheet number",
    superseded: "Apparently superseded",
  };
  return map[s] ?? s.replace(/_/g, " ");
}

export type ReadinessCategory = "not_ready" | "needs_corrections" | "substantially_ready" | "ready_for_human_final_review";

export const READINESS_BANDS: Array<{
  id: ReadinessCategory;
  label: string;
  definition: string;
  minScore: number;
  klass: string;
}> = [
  { id: "not_ready", label: "Not Ready", definition: "Major items appear incomplete.", minScore: 0, klass: "text-red-400 bg-red-500/10 ring-red-500/30" },
  { id: "needs_corrections", label: "Needs Corrections", definition: "Meaningful QA/QC items remain.", minScore: 55, klass: "text-orange-400 bg-orange-500/10 ring-orange-500/30" },
  { id: "substantially_ready", label: "Substantially Ready", definition: "Minor or confirmatory items remain.", minScore: 78, klass: "text-amber-400 bg-amber-500/10 ring-amber-500/30" },
  { id: "ready_for_human_final_review", label: "Ready for Human Final Review", definition: "No major AI-identified issues remain.", minScore: 92, klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30" },
];

export function readinessMeta(id: string) {
  return READINESS_BANDS.find((b) => b.id === id) ?? READINESS_BANDS[0];
}

/** Deterministic readiness score from findings + inventory gaps. Never "code compliant". */
export function computeReadiness(
  findings: Array<{ severity: string; resolved?: boolean }>,
  gaps: { missingSheets: number; duplicateSheets: number; missingDocuments: number },
): { score: number; category: ReadinessCategory } {
  let penalty = 0;
  for (const f of findings) {
    if (f.resolved) continue;
    penalty += severityMeta(f.severity).weight;
  }
  penalty += gaps.missingSheets * 6;
  penalty += gaps.duplicateSheets * 3;
  penalty += gaps.missingDocuments * 5;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const hasCritical = findings.some((f) => !f.resolved && f.severity === "critical");
  let category: ReadinessCategory = "not_ready";
  for (const band of READINESS_BANDS) if (score >= band.minScore) category = band.id;
  if (hasCritical && category !== "not_ready") category = "needs_corrections";
  return { score, category };
}

export const QAQC_VERIFICATION_LABELS = [
  { id: "verified_requirement", label: "Verified jurisdiction requirement", klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30" },
  { id: "ai_suggested", label: "AI-identified potential issue", klass: "text-sky-400 bg-sky-500/10 ring-sky-500/30" },
  { id: "coordination_issue", label: "Design coordination issue", klass: "text-violet-400 bg-violet-500/10 ring-violet-500/30" },
  { id: "missing_information", label: "Missing information", klass: "text-amber-400 bg-amber-500/10 ring-amber-500/30" },
  { id: "human_review_recommended", label: "Human professional review recommended", klass: "text-orange-400 bg-orange-500/10 ring-orange-500/30" },
  { id: "agency_confirmation_required", label: "Agency confirmation required", klass: "text-muted-foreground bg-muted/40 ring-border" },
] as const;

export function qaqcVerificationMeta(id: string) {
  return QAQC_VERIFICATION_LABELS.find((v) => v.id === id) ?? QAQC_VERIFICATION_LABELS[1];
}

export const PERMIVIO_PROFESSIONAL_DISCLAIMER =
  "PERMIVIO provides pre-submission quality control and permitting intelligence. Findings should be reviewed by the appropriate licensed design professional and authority having jurisdiction where required.";

/** Phrases PERMIVIO must never assert about a plan set or a project. */
export const PROHIBITED_ASSERTIONS = [
  "plans approved",
  "code certified",
  "engineering approved",
  "guaranteed feasible",
  "code compliant",
];

export function containsProhibitedAssertion(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return PROHIBITED_ASSERTIONS.some((p) => t.includes(p));
}
