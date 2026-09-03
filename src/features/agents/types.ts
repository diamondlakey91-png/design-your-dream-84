// PERMIVIO agent framework — shared types.
//
// Phase A foundation: statuses, verification vocabulary, the agent registry
// contract, the standardized agent input context and the agent output contract.
// Nothing here talks to the network or the database.

/** Execution statuses for an agent run (workflow) and its individual tasks. */
export const RUN_STATUSES = [
  "draft",
  "queued",
  "planning",
  "waiting_for_dependency",
  "researching",
  "processing_documents",
  "analyzing",
  "waiting_for_client",
  "conflict_detected",
  "qaqc_pending",
  "qaqc_in_progress",
  "corrections_required",
  "professional_review_pending",
  "professional_review_in_progress",
  "approved",
  "delivered",
  "failed",
  "cancelled",
  "superseded",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const TERMINAL_RUN_STATUSES: RunStatus[] = ["delivered", "failed", "cancelled", "superseded"];

/** Client-safe stage labels. Never surface raw statuses, models or token counts. */
export const CLIENT_STAGE_LABELS: Record<RunStatus, string> = {
  draft: "Reviewing your project information",
  queued: "Reviewing your project information",
  planning: "Reviewing your project information",
  waiting_for_dependency: "Confirming the property",
  researching: "Identifying the responsible agencies",
  processing_documents: "Reviewing your documents",
  analyzing: "Reviewing zoning and site requirements",
  waiting_for_client: "Information needed from you",
  conflict_detected: "Reviewing conflicting information",
  qaqc_pending: "Quality review",
  qaqc_in_progress: "Quality review",
  corrections_required: "Quality review",
  professional_review_pending: "Professional review",
  professional_review_in_progress: "Professional review",
  approved: "Ready to view",
  delivered: "Ready to view",
  failed: "We hit a problem — our team is looking at it",
  cancelled: "Cancelled",
  superseded: "Replaced by a newer version",
};

/** Ordered client-facing journey used for progress display. */
export const CLIENT_PROGRESS_STAGES = [
  "Reviewing your project information",
  "Confirming the property",
  "Identifying the responsible agencies",
  "Reviewing zoning and site requirements",
  "Checking utilities and access",
  "Building the permit pathway",
  "Reviewing risks and timing",
  "Preparing your report",
  "Quality review",
  "Professional review",
  "Ready to view",
] as const;

export const TASK_STATUSES = [
  "pending",
  "waiting_for_dependency",
  "running",
  "waiting_for_client",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
  "needs_manual_review",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Verification status is evidence-based and never derived from confidence. */
export const VERIFICATION_STATUSES = [
  "verified",
  "preliminary_analysis",
  "pending_confirmation",
  "client_input_required",
  "not_available",
  "conflict_detected",
  "superseded",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  verified: "Verified",
  preliminary_analysis: "Preliminary Analysis",
  pending_confirmation: "Pending Confirmation",
  client_input_required: "Client Input Required",
  not_available: "Not Available",
  conflict_detected: "Conflict Detected",
  superseded: "Superseded",
};

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const RISK_LEVELS = ["critical", "high", "medium", "low", "none"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Source types in descending evidentiary priority. */
export const SOURCE_TYPES = [
  "adopted_ordinance_or_code",
  "official_gis_or_parcel_data",
  "official_zoning_map",
  "official_agency_instruction",
  "official_form",
  "official_fee_schedule",
  "official_utility_information",
  "written_agency_correspondence",
  "client_provided_document",
  "secondary_source",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Lower number = stronger evidence. Search snippets are not evidence at all. */
export const SOURCE_PRIORITY: Record<SourceType, number> = {
  adopted_ordinance_or_code: 1,
  official_gis_or_parcel_data: 2,
  official_zoning_map: 3,
  official_agency_instruction: 4,
  official_form: 5,
  official_fee_schedule: 6,
  official_utility_information: 7,
  written_agency_correspondence: 8,
  client_provided_document: 9,
  secondary_source: 10,
};

/** Only these source types may support a "verified" finding. */
export const VERIFIABLE_SOURCE_TYPES: SourceType[] = [
  "adopted_ordinance_or_code",
  "official_gis_or_parcel_data",
  "official_zoning_map",
  "official_agency_instruction",
  "official_form",
  "official_fee_schedule",
  "official_utility_information",
  "written_agency_correspondence",
];

export const AGENT_KEYS = [
  "intake_scope",
  "parcel_jurisdiction",
  "document_intelligence",
  "zoning_entitlement",
  "building_trades",
  "fire_life_safety",
  "health_licensing",
  "utilities_infrastructure",
  "transportation_row",
  "environmental_site_constraints",
  "site_fit",
  "permit_strategy",
  "fee_schedule",
  "permit_application",
  "permit_tracking",
  "review_corrections",
  "inspection_closeout",
  "plan_qaqc",
  "proposal_scope",
  "estimate",
  "client_reporting",
  "case_study",
  "risk_feasibility",
  "qaqc_validation",
  "lead_project_intelligence",
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const PROJECT_PHASES = [
  "intake",
  "feasibility",
  "design",
  "permitting",
  "construction",
  "closeout",
  "business_development",
] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const AGENT_TOOLS = [
  "web_research",
  "document_read",
  "geocode",
  "project_record_read",
  "jurisdiction_profile_read",
  "calculation",
] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

export type AgentDefinition = {
  key: AgentKey;
  name: string;
  version: string;
  description: string;
  phases: ProjectPhase[];
  serviceProducts: string[];
  requiredInputs: string[];
  optionalInputs: string[];
  /** Registry key of the zod output schema in schemas.ts (all agents share the output contract). */
  outputSchema: "agent_output_v1";
  dependencies: AgentKey[];
  toolsAllowed: AgentTool[];
  maxAttempts: number;
  timeoutMs: number;
  concurrencySafe: boolean;
  humanReviewRequired: boolean;
  clientVisibleOutputAllowed: boolean;
  promptVersion: string;
  model: { id: string; temperature?: number; maxOutputTokens?: number };
  active: boolean;
};

export const WORKFLOW_KEYS = [
  "property_snapshot",
  "preliminary_site_screen",
  "standard_sir",
  "comprehensive_feasibility",
  "permit_requirements_report",
  "permit_roadmap",
  "plan_qaqc",
  "correction_analysis",
  "utility_agency_screening",
  "closeout_readiness",
  "proposal_generation",
  "estimate_generation",
  "client_status_report",
  "case_study",
  "full_project_intelligence_refresh",
] as const;
export type WorkflowKey = (typeof WORKFLOW_KEYS)[number];

export type WorkflowStep = {
  /** Agents in one step run concurrently; steps run in order. */
  parallelGroup: number;
  agents: AgentKey[];
  optionalAgents?: AgentKey[];
};

export type WorkflowDefinition = {
  key: WorkflowKey;
  name: string;
  version: string;
  description: string;
  serviceProductKey: string | null;
  steps: WorkflowStep[];
  requiredOutputs: string[];
  qualityGates: string[];
  professionalReviewRequired: boolean;
  deliverableType: "report" | "matrix" | "proposal" | "estimate" | "status_update" | "case_study" | "record_refresh";
  active: boolean;
};

/** Standardized, authorization-scoped context handed to every agent. */
export type AgentContext = {
  organization: { id: string; name: string };
  project: { id: string | null; name: string | null; phase: ProjectPhase | null } | null;
  clientObjective: string;
  property: { address: string; formattedAddress?: string | null; lat?: number | null; lng?: number | null } | null;
  parcels: Array<{ parcel_id: string; source?: string | null }>;
  jurisdictions: Array<{ name: string; state?: string | null; role?: string | null }>;
  existingUse: string | null;
  proposedUse: string | null;
  projectType: string | null;
  scope: string;
  targetDates: { submission?: string | null; construction_start?: string | null; opening?: string | null } | null;
  uploadedDocuments: Array<{ id: string; name: string; kind?: string | null; pages?: number | null }>;
  existingVerifiedFindings: Array<{ finding_key: string; title: string; finding: string; module: string }>;
  existingConflicts: Array<{ id: string; description: string; severity: RiskLevel }>;
  serviceOrder: { id: string; product_key: string; tier?: string | null } | null;
  requestedDeliverable: string;
  priorRevisions: Array<{ id: string; version: number; created_at: string }>;
  agentInstructions: string | null;
};

export type UsageRecord = {
  model: string;
  inputUnits: number;
  outputUnits: number;
  researchCalls: number;
  documentPages: number;
  estimatedCost: number;
  creditsUsed: number;
};
