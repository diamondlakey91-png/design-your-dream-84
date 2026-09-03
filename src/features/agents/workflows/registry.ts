// PERMIVIO agent framework — workflow registry.
//
// Each workflow declares its agents, execution order, parallel groups, required
// outputs, quality gates, review requirement and deliverable type. The
// orchestrator (Phase B) plans from these definitions; nothing is hard-coded in
// the runner.

import { getAgent } from "../registry";
import type { AgentKey, WorkflowDefinition, WorkflowKey, WorkflowStep } from "../types";

const CORE_GATES = [
  "correct_project",
  "correct_address",
  "parcel_confirmed_or_disclosed",
  "jurisdiction_confirmed_or_disclosed",
  "consistent_proposed_use",
  "required_tasks_complete",
  "material_findings_labeled",
  "no_fabricated_citations",
  "no_unsupported_fees",
  "no_unsupported_timelines",
  "no_assumed_utility_capacity",
  "no_professional_conclusions",
  "high_risks_in_summary",
  "deal_killers_in_recommendation",
  "missing_information_disclosed",
  "conflicts_resolved_or_disclosed",
  "calculations_correct",
  "internal_notes_excluded",
  "sections_agree",
  "review_label_accurate",
];

function step(parallelGroup: number, agents: AgentKey[], optionalAgents?: AgentKey[]): WorkflowStep {
  return optionalAgents ? { parallelGroup, agents, optionalAgents } : { parallelGroup, agents };
}

const DEFINITIONS: WorkflowDefinition[] = [
  {
    key: "property_snapshot",
    name: "Property Snapshot",
    version: "1.0.0",
    description: "Property, parcel and jurisdiction identification with a first look at zoning.",
    serviceProductKey: "property_snapshot",
    steps: [step(1, ["intake_scope"]), step(2, ["parcel_jurisdiction"]), step(3, ["zoning_entitlement"]), step(4, ["qaqc_validation"])],
    requiredOutputs: ["property", "jurisdictions", "zoning_summary"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: false,
    deliverableType: "report",
    active: true,
  },
  {
    key: "preliminary_site_screen",
    name: "Preliminary Site Screen",
    version: "1.0.0",
    description: "Fast screen for deal killers before committing to full due diligence.",
    serviceProductKey: "preliminary_site_screen",
    steps: [
      step(1, ["intake_scope"]),
      step(2, ["parcel_jurisdiction"]),
      step(3, ["zoning_entitlement", "utilities_infrastructure", "environmental_site_constraints"]),
      step(4, ["risk_feasibility"]),
      step(5, ["qaqc_validation"]),
    ],
    requiredOutputs: ["risk_matrix", "deal_killers"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: false,
    deliverableType: "report",
    active: true,
  },
  {
    key: "standard_sir",
    name: "Standard Site Investigation Report",
    version: "1.0.0",
    description: "Full site investigation: jurisdiction, zoning, permits, utilities, access, environment, fees, schedule and risk.",
    serviceProductKey: "site_investigation_report",
    steps: [
      step(1, ["intake_scope"]),
      step(2, ["parcel_jurisdiction"]),
      step(3, [
        "zoning_entitlement",
        "building_trades",
        "fire_life_safety",
        "health_licensing",
        "utilities_infrastructure",
        "transportation_row",
        "environmental_site_constraints",
      ], ["document_intelligence"]),
      step(4, ["site_fit"]),
      step(5, ["permit_strategy"]),
      step(6, ["fee_schedule"]),
      step(7, ["risk_feasibility"]),
      step(8, ["lead_project_intelligence"]),
      step(9, ["qaqc_validation"]),
    ],
    requiredOutputs: ["coverage_sections", "permit_matrix", "risk_matrix", "sources", "open_questions", "recommended_next_steps"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: true,
    deliverableType: "report",
    active: true,
  },
  {
    key: "comprehensive_feasibility",
    name: "Comprehensive Feasibility Report",
    version: "1.0.0",
    description: "Standard SIR plus deeper site fit, cost, schedule and entitlement path analysis.",
    serviceProductKey: "comprehensive_feasibility",
    steps: [
      step(1, ["intake_scope"]),
      step(2, ["parcel_jurisdiction"]),
      step(3, [
        "document_intelligence",
        "zoning_entitlement",
        "building_trades",
        "fire_life_safety",
        "health_licensing",
        "utilities_infrastructure",
        "transportation_row",
        "environmental_site_constraints",
      ]),
      step(4, ["site_fit"]),
      step(5, ["permit_strategy"]),
      step(6, ["fee_schedule"]),
      step(7, ["risk_feasibility", "estimate"]),
      step(8, ["lead_project_intelligence"]),
      step(9, ["qaqc_validation"]),
    ],
    requiredOutputs: ["coverage_sections", "permit_matrix", "risk_matrix", "feasibility_rating", "estimate_summary"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: true,
    deliverableType: "report",
    active: true,
  },
  {
    key: "permit_requirements_report",
    name: "Permit Requirements Report",
    version: "1.0.0",
    description: "Which permits and approvals this project type needs in this jurisdiction.",
    serviceProductKey: "permit_requirements",
    steps: [
      step(1, ["intake_scope"]),
      step(2, ["parcel_jurisdiction"]),
      step(3, ["building_trades", "fire_life_safety", "health_licensing", "transportation_row"]),
      step(4, ["permit_strategy"]),
      step(5, ["qaqc_validation"]),
    ],
    requiredOutputs: ["permit_matrix"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: false,
    deliverableType: "matrix",
    active: true,
  },
  {
    key: "permit_roadmap",
    name: "Permit Roadmap",
    version: "1.0.0",
    description: "Sequenced permitting pathway with dependencies, durations and owners.",
    serviceProductKey: "permit_roadmap",
    steps: [
      step(1, ["intake_scope"]),
      step(2, ["parcel_jurisdiction"]),
      step(3, ["permit_strategy"]),
      step(4, ["fee_schedule"]),
      step(5, ["qaqc_validation"]),
    ],
    requiredOutputs: ["permit_matrix", "sequence", "durations"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: false,
    deliverableType: "report",
    active: true,
  },
  {
    key: "plan_qaqc",
    name: "Plan QA/QC",
    version: "1.0.0",
    description: "Plan-set completeness, inventory gaps, internal conflicts and submission readiness.",
    serviceProductKey: "plan_qaqc",
    steps: [step(1, ["intake_scope"]), step(2, ["document_intelligence"]), step(3, ["plan_qaqc"]), step(4, ["qaqc_validation"])],
    requiredOutputs: ["drawing_inventory", "findings"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: true,
    deliverableType: "report",
    active: true,
  },
  {
    key: "correction_analysis",
    name: "Correction Analysis",
    version: "1.0.0",
    description: "Reviewer comments explained plainly with a response matrix and resubmission checklist.",
    serviceProductKey: "correction_analysis",
    steps: [step(1, ["intake_scope"]), step(2, ["document_intelligence"]), step(3, ["review_corrections"]), step(4, ["qaqc_validation"])],
    requiredOutputs: ["correction_matrix", "resubmission_checklist"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: true,
    deliverableType: "matrix",
    active: true,
  },
  {
    key: "utility_agency_screening",
    name: "Utility and Agency Screening",
    version: "1.0.0",
    description: "Identifies utility providers, agency coordination steps and unknown capacity questions.",
    serviceProductKey: "utility_screening",
    steps: [
      step(1, ["intake_scope"]),
      step(2, ["parcel_jurisdiction"]),
      step(3, ["utilities_infrastructure", "transportation_row"]),
      step(4, ["qaqc_validation"]),
    ],
    requiredOutputs: ["providers", "coordination_steps"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: false,
    deliverableType: "report",
    active: true,
  },
  {
    key: "closeout_readiness",
    name: "CO / Closeout Readiness",
    version: "1.0.0",
    description: "Inspection sequence and Certificate of Occupancy readiness gaps.",
    serviceProductKey: "closeout_readiness",
    steps: [step(1, ["intake_scope"]), step(2, ["inspection_closeout"]), step(3, ["qaqc_validation"])],
    requiredOutputs: ["readiness_gaps", "inspection_sequence"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: false,
    deliverableType: "report",
    active: true,
  },
  {
    key: "proposal_generation",
    name: "Proposal Generation",
    version: "1.0.0",
    description: "Draft service proposal built from the project record and permit strategy.",
    serviceProductKey: null,
    steps: [step(1, ["intake_scope"]), step(2, ["permit_strategy"]), step(3, ["proposal_scope"]), step(4, ["qaqc_validation"])],
    requiredOutputs: ["scope_of_services"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: true,
    deliverableType: "proposal",
    active: true,
  },
  {
    key: "estimate_generation",
    name: "Estimate Generation",
    version: "1.0.0",
    description: "Draft fee and effort estimate with assumptions disclosed.",
    serviceProductKey: null,
    steps: [step(1, ["intake_scope"]), step(2, ["permit_strategy"]), step(3, ["fee_schedule"]), step(4, ["estimate"]), step(5, ["qaqc_validation"])],
    requiredOutputs: ["estimate_summary", "assumptions"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: true,
    deliverableType: "estimate",
    active: true,
  },
  {
    key: "client_status_report",
    name: "Client Status Report",
    version: "1.0.0",
    description: "Plain-language status update on permits, inspections and next actions.",
    serviceProductKey: null,
    steps: [step(1, ["permit_tracking"]), step(2, ["client_reporting"]), step(3, ["qaqc_validation"])],
    requiredOutputs: ["status_summary", "next_actions"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: false,
    deliverableType: "status_update",
    active: true,
  },
  {
    key: "case_study",
    name: "Case Study",
    version: "1.0.0",
    description: "Anonymized case study drafted from delivered project outcomes.",
    serviceProductKey: null,
    steps: [step(1, ["case_study"]), step(2, ["qaqc_validation"])],
    requiredOutputs: ["case_study_draft"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: true,
    deliverableType: "case_study",
    active: true,
  },
  {
    key: "full_project_intelligence_refresh",
    name: "Full Project Intelligence Refresh",
    version: "1.0.0",
    description: "Re-runs the project record's research modules and refreshes source freshness.",
    serviceProductKey: null,
    steps: [
      step(1, ["intake_scope"]),
      step(2, ["parcel_jurisdiction"]),
      step(3, ["zoning_entitlement", "utilities_infrastructure", "transportation_row", "environmental_site_constraints", "permit_tracking"]),
      step(4, ["permit_strategy"]),
      step(5, ["risk_feasibility"]),
      step(6, ["lead_project_intelligence"]),
      step(7, ["qaqc_validation"]),
    ],
    requiredOutputs: ["refreshed_findings", "sources"],
    qualityGates: CORE_GATES,
    professionalReviewRequired: false,
    deliverableType: "record_refresh",
    active: true,
  },
];

export const WORKFLOW_REGISTRY: Readonly<Record<WorkflowKey, WorkflowDefinition>> = Object.freeze(
  Object.fromEntries(DEFINITIONS.map((w) => [w.key, Object.freeze(w)])) as Record<WorkflowKey, WorkflowDefinition>,
);

export function listWorkflows(opts?: { activeOnly?: boolean }) {
  const all = Object.values(WORKFLOW_REGISTRY);
  return opts?.activeOnly ? all.filter((w) => w.active) : all;
}

export function getWorkflow(key: WorkflowKey): WorkflowDefinition {
  const w = WORKFLOW_REGISTRY[key];
  if (!w) throw new Error(`Unknown workflow "${key}"`);
  return w;
}

export type PlannedTask = {
  agentKey: AgentKey;
  sequence: number;
  parallelGroup: number;
  optional: boolean;
  dependencies: AgentKey[];
  maxAttempts: number;
};

/**
 * Flatten a workflow into ordered tasks. Validates that every agent's registry
 * dependencies appear in an earlier parallel group — a workflow that would run a
 * downstream agent too early is a configuration error, not a runtime surprise.
 */
export function planWorkflow(key: WorkflowKey): PlannedTask[] {
  const wf = getWorkflow(key);
  const tasks: PlannedTask[] = [];
  const seenByGroup = new Map<AgentKey, number>();
  let sequence = 0;

  const groups = [...wf.steps].sort((a, b) => a.parallelGroup - b.parallelGroup);
  for (const g of groups) {
    const members: Array<{ k: AgentKey; optional: boolean }> = [
      ...g.agents.map((k) => ({ k, optional: false })),
      ...(g.optionalAgents ?? []).map((k) => ({ k, optional: true })),
    ];
    for (const { k, optional } of members) {
      const agent = getAgent(k);
      if (members.length > 1 && !agent.concurrencySafe) {
        throw new Error(`Workflow "${key}": agent "${k}" is not concurrency-safe but shares parallel group ${g.parallelGroup}`);
      }
      const inWorkflow = new Set(groups.flatMap((s) => [...s.agents, ...(s.optionalAgents ?? [])]));
      for (const dep of agent.dependencies) {
        if (!inWorkflow.has(dep)) continue; // dependency not part of this workflow's scope
        const depGroup = seenByGroup.get(dep);
        if (depGroup === undefined || depGroup >= g.parallelGroup) {
          throw new Error(`Workflow "${key}": "${k}" runs in group ${g.parallelGroup} before its dependency "${dep}"`);
        }
      }
      tasks.push({
        agentKey: k,
        sequence: sequence++,
        parallelGroup: g.parallelGroup,
        optional,
        dependencies: agent.dependencies.filter((d) => inWorkflow.has(d)),
        maxAttempts: agent.maxAttempts,
      });
    }
    for (const { k } of members) seenByGroup.set(k, g.parallelGroup);
  }
  return tasks;
}

/** Rows for the agent_workflows table. */
export function workflowDefinitionRows() {
  return listWorkflows().map((w) => ({
    workflow_key: w.key,
    name: w.name,
    version: w.version,
    service_product_key: w.serviceProductKey,
    active: w.active,
    configuration: w as unknown as Record<string, unknown>,
  }));
}
