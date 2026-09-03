// PERMIVIO agent framework — agent registry.
//
// Every agent is registered here independently, with its own inputs,
// dependencies, tools, retry policy, review requirement and prompt version.
// New agents can be added without restructuring the database: agent_definitions
// stores the same shape in a jsonb configuration column.

import { PROMPT_VERSIONS } from "./prompts/system";
import type { AgentDefinition, AgentKey } from "./types";

const DEFAULT_MODEL = { id: "google/gemini-2.5-pro", temperature: 0.2, maxOutputTokens: 12000 };
const FAST_MODEL = { id: "google/gemini-2.5-flash", temperature: 0.2, maxOutputTokens: 8000 };

type Partial_ = Partial<AgentDefinition> & Pick<AgentDefinition, "key" | "name" | "description">;

function def(a: Partial_): AgentDefinition {
  return {
    version: "1.0.0",
    phases: ["feasibility", "permitting"],
    serviceProducts: [],
    requiredInputs: ["organization", "clientObjective", "scope"],
    optionalInputs: ["uploadedDocuments", "targetDates", "agentInstructions"],
    outputSchema: "agent_output_v1",
    dependencies: [],
    toolsAllowed: ["web_research", "project_record_read"],
    maxAttempts: 3,
    timeoutMs: 120_000,
    concurrencySafe: true,
    humanReviewRequired: false,
    clientVisibleOutputAllowed: true,
    promptVersion: PROMPT_VERSIONS.agent,
    model: DEFAULT_MODEL,
    active: true,
    ...a,
  } as AgentDefinition;
}

const DEFINITIONS: AgentDefinition[] = [
  def({
    key: "intake_scope",
    name: "Intake & Scope",
    description: "Normalizes the client brief into a structured project scope, project type and requested outcome.",
    phases: ["intake", "feasibility"],
    requiredInputs: ["organization", "clientObjective", "scope"],
    toolsAllowed: ["project_record_read"],
    model: FAST_MODEL,
    timeoutMs: 60_000,
  }),
  def({
    key: "parcel_jurisdiction",
    name: "Parcel & Jurisdiction Resolution",
    description: "Resolves the site address to parcels and identifies every authority having jurisdiction.",
    dependencies: ["intake_scope"],
    requiredInputs: ["property"],
    toolsAllowed: ["geocode", "web_research", "jurisdiction_profile_read"],
  }),
  def({
    key: "document_intelligence",
    name: "Document Intelligence",
    description: "Classifies uploaded plans, surveys, letters and reports and extracts project facts from them.",
    dependencies: ["intake_scope"],
    requiredInputs: ["uploadedDocuments"],
    toolsAllowed: ["document_read"],
    timeoutMs: 300_000,
  }),
  def({
    key: "zoning_entitlement",
    name: "Zoning & Entitlement",
    description: "Identifies zoning district, use permissions, dimensional standards and entitlement path.",
    dependencies: ["parcel_jurisdiction"],
  }),
  def({
    key: "building_trades",
    name: "Building & Trade Permits",
    description: "Identifies building, electrical, mechanical and plumbing permit requirements and submittal items.",
    dependencies: ["parcel_jurisdiction"],
  }),
  def({
    key: "fire_life_safety",
    name: "Fire & Life Safety",
    description: "Identifies fire marshal review, suppression, alarm and life-safety permit requirements.",
    dependencies: ["parcel_jurisdiction"],
  }),
  def({
    key: "health_licensing",
    name: "Health & Licensing",
    description: "Identifies health department plan review, food/pool/childcare licensing and operating approvals.",
    dependencies: ["parcel_jurisdiction"],
  }),
  def({
    key: "utilities_infrastructure",
    name: "Utilities & Infrastructure",
    description: "Identifies water, sewer, gas, electric and telecom providers, connection processes and unknowns.",
    dependencies: ["parcel_jurisdiction"],
  }),
  def({
    key: "transportation_row",
    name: "Transportation & Right-of-Way",
    description: "Identifies access, ROW, DOT and encroachment permitting authority and requirements.",
    dependencies: ["parcel_jurisdiction"],
  }),
  def({
    key: "environmental_site_constraints",
    name: "Environmental & Site Constraints",
    description: "Identifies floodplain, wetlands, stormwater, erosion, historic and other site constraints.",
    dependencies: ["parcel_jurisdiction"],
  }),
  def({
    key: "site_fit",
    name: "Site Fit",
    description: "Tests the proposed program against site, parking, dimensional and infrastructure constraints.",
    dependencies: ["zoning_entitlement", "utilities_infrastructure", "environmental_site_constraints"],
    toolsAllowed: ["calculation", "project_record_read"],
  }),
  def({
    key: "permit_strategy",
    name: "Permit Strategy",
    description: "Builds the permit and approval matrix, sequencing and submission strategy.",
    dependencies: ["building_trades", "fire_life_safety", "health_licensing", "transportation_row", "zoning_entitlement"],
  }),
  def({
    key: "fee_schedule",
    name: "Fees & Schedule",
    description: "Compiles published fees and realistic review durations, disclosing anything unpublished.",
    dependencies: ["permit_strategy"],
    toolsAllowed: ["web_research", "calculation"],
  }),
  def({
    key: "permit_application",
    name: "Permit Application Preparation",
    description: "Assembles application forms, submittal checklists and applicant information requirements.",
    phases: ["permitting"],
    dependencies: ["permit_strategy"],
  }),
  def({
    key: "permit_tracking",
    name: "Permit Tracking",
    description: "Interprets permit status records and identifies the next required action and owner.",
    phases: ["permitting", "construction"],
    toolsAllowed: ["project_record_read", "web_research"],
    model: FAST_MODEL,
  }),
  def({
    key: "review_corrections",
    name: "Reviewer Comment & Correction Analysis",
    description: "Explains reviewer comments in plain language and builds a correction/response matrix.",
    phases: ["permitting"],
    dependencies: ["document_intelligence"],
    toolsAllowed: ["document_read", "web_research"],
  }),
  def({
    key: "inspection_closeout",
    name: "Inspection & Closeout Readiness",
    description: "Assesses inspection sequence and Certificate of Occupancy readiness gaps.",
    phases: ["construction", "closeout"],
    toolsAllowed: ["project_record_read", "web_research"],
  }),
  def({
    key: "plan_qaqc",
    name: "Plan QA/QC",
    description: "Reviews plan sets for completeness, inventory gaps, internal conflicts and submission risks.",
    phases: ["design", "permitting"],
    dependencies: ["document_intelligence"],
    toolsAllowed: ["document_read", "web_research"],
    timeoutMs: 300_000,
    humanReviewRequired: true,
  }),
  def({
    key: "proposal_scope",
    name: "Proposal & Scope Drafting",
    description: "Drafts a service proposal scope from the project record and permit strategy.",
    phases: ["business_development"],
    dependencies: ["permit_strategy"],
    clientVisibleOutputAllowed: true,
  }),
  def({
    key: "estimate",
    name: "Estimate",
    description: "Drafts fee and effort estimates from published fees and recorded scope, flagging assumptions.",
    phases: ["business_development"],
    dependencies: ["fee_schedule"],
    toolsAllowed: ["calculation", "project_record_read"],
  }),
  def({
    key: "client_reporting",
    name: "Client Reporting",
    description: "Composes plain-language client status reports from the project record.",
    phases: ["permitting", "construction"],
    toolsAllowed: ["project_record_read"],
    model: FAST_MODEL,
  }),
  def({
    key: "case_study",
    name: "Case Study",
    description: "Drafts an anonymized project case study from delivered outcomes.",
    phases: ["business_development"],
    toolsAllowed: ["project_record_read"],
    model: FAST_MODEL,
  }),
  def({
    key: "risk_feasibility",
    name: "Risk & Feasibility",
    description: "Builds the risk matrix, deal-killer list and overall feasibility rating.",
    dependencies: ["site_fit", "permit_strategy", "fee_schedule"],
    toolsAllowed: ["project_record_read", "calculation"],
  }),
  def({
    key: "qaqc_validation",
    name: "QA/QC Validation",
    description: "Runs the deliverable quality gates and blocks delivery on critical failures.",
    dependencies: ["risk_feasibility"],
    toolsAllowed: ["project_record_read"],
    concurrencySafe: false,
    clientVisibleOutputAllowed: false,
  }),
  def({
    key: "lead_project_intelligence",
    name: "Lead Project Intelligence",
    description: "Plans the workflow, compiles specialist output into the deliverable and routes it for review.",
    phases: ["intake", "feasibility", "permitting", "construction", "closeout", "business_development"],
    dependencies: [],
    toolsAllowed: ["project_record_read", "calculation"],
    concurrencySafe: false,
    clientVisibleOutputAllowed: false,
    maxAttempts: 2,
  }),
];

export const AGENT_REGISTRY: Readonly<Record<AgentKey, AgentDefinition>> = Object.freeze(
  Object.fromEntries(DEFINITIONS.map((d) => [d.key, Object.freeze(d)])) as Record<AgentKey, AgentDefinition>,
);

export function listAgents(opts?: { activeOnly?: boolean }) {
  const all = Object.values(AGENT_REGISTRY);
  return opts?.activeOnly ? all.filter((a) => a.active) : all;
}

export function getAgent(key: AgentKey): AgentDefinition {
  const a = AGENT_REGISTRY[key];
  if (!a) throw new Error(`Unknown agent "${key}"`);
  return a;
}

export function agentsForPhase(phase: AgentDefinition["phases"][number]) {
  return listAgents({ activeOnly: true }).filter((a) => a.phases.includes(phase));
}

/** Rows for the agent_definitions table — the registry stays the source of truth. */
export function agentDefinitionRows() {
  return listAgents().map((a) => ({
    agent_key: a.key,
    name: a.name,
    description: a.description,
    version: a.version,
    prompt_version: a.promptVersion,
    active: a.active,
    configuration: a as unknown as Record<string, unknown>,
  }));
}
