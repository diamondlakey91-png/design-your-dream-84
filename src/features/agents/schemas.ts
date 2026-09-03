// PERMIVIO agent framework — output contract schemas.
//
// Every agent must return schema-validated JSON. Malformed output is rejected;
// it is never silently accepted or patched with invented values.

import { z } from "zod";
import { AGENT_KEYS, CONFIDENCE_LEVELS, RISK_LEVELS, SOURCE_TYPES, VERIFIABLE_SOURCE_TYPES, VERIFICATION_STATUSES } from "./types";

export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);
export const riskLevelSchema = z.enum(RISK_LEVELS);
export const sourceTypeSchema = z.enum(SOURCE_TYPES);

export const agentSourceSchema = z.object({
  source_key: z.string(),
  source_type: sourceTypeSchema,
  title: z.string(),
  publisher: z.string(),
  url: z.string().nullable().default(null),
  uploaded_document_id: z.string().nullable().default(null),
  code_section: z.string().nullable().default(null),
  page_reference: z.string().nullable().default(null),
  map_layer: z.string().nullable().default(null),
  effective_date: z.string().nullable().default(null),
  accessed_at: z.string().nullable().default(null),
  geographic_scope: z.string().nullable().default(null),
  authority_level: z.enum(["federal", "state", "county", "municipal", "utility", "private", "unknown"]).default("unknown"),
  /** True only when the framework actually retrieved the document/page. */
  retrieved: z.boolean().default(false),
});
export type AgentSourceOutput = z.infer<typeof agentSourceSchema>;

export const findingSourceRefSchema = z.object({
  source_key: z.string(),
  supporting_excerpt: z.string().nullable().default(null),
  support_description: z.string().nullable().default(null),
  primary_source: z.boolean().default(false),
});

export const agentFindingSchema = z.object({
  finding_key: z.string(),
  module: z.string(),
  category: z.string(),
  title: z.string(),
  finding: z.string(),
  /** Plain-language explanation for someone with no permitting experience. */
  analysis: z.string(),
  applicability: z.string(),
  verification_status: verificationStatusSchema,
  confidence: confidenceSchema,
  source_refs: z.array(findingSourceRefSchema).default([]),
  agency: z.string().nullable().default(null),
  geographic_scope: z.string().nullable().default(null),
  risk_level: riskLevelSchema.default("none"),
  cost_impact: z.string().nullable().default(null),
  schedule_impact: z.string().nullable().default(null),
  recommendation: z.string().nullable().default(null),
  confirmation_required: z.boolean().default(true),
  responsible_party: z.string().nullable().default(null),
  client_visible: z.boolean().default(true),
});
export type AgentFindingOutput = z.infer<typeof agentFindingSchema>;

export const agentConflictSchema = z.object({
  conflict_type: z.string(),
  description: z.string(),
  finding_keys: z.array(z.string()).default([]),
  source_keys: z.array(z.string()).default([]),
  severity: riskLevelSchema.default("medium"),
  affects: z.array(z.enum(["feasibility", "fees", "schedule", "permit_strategy", "other"])).default([]),
});

export const clientQuestionSchema = z.object({
  question_key: z.string(),
  /** Plain language only — no code jargon such as "occupancy classification". */
  question: z.string(),
  why_it_matters: z.string(),
  blocking: z.boolean().default(false),
  who_can_answer: z.string().nullable().default(null),
});

export const agentOutputSchema = z.object({
  agent_key: z.enum(AGENT_KEYS),
  agent_version: z.string(),
  task_summary: z.string(),
  status: z.enum(["complete", "partial", "needs_client_input", "failed"]),
  findings: z.array(agentFindingSchema).default([]),
  sources: z.array(agentSourceSchema).default([]),
  missing_information: z.array(z.string()).default([]),
  conflicts: z.array(agentConflictSchema).default([]),
  risks: z.array(z.object({ title: z.string(), severity: riskLevelSchema, why: z.string() })).default([]),
  recommended_actions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  professional_confirmation_required: z.boolean(),
  client_questions: z.array(clientQuestionSchema).default([]),
  completion_summary: z.string(),
});
export type AgentOutput = z.infer<typeof agentOutputSchema>;

export type AgentOutputParse =
  | { ok: true; output: AgentOutput }
  | { ok: false; issues: string[] };

/** Validate raw agent output. Missing required fields are a hard rejection. */
export function parseAgentOutput(raw: unknown): AgentOutputParse {
  const res = agentOutputSchema.safeParse(raw);
  if (res.success) {
    const issues = structuralIssues(res.data);
    if (issues.length) return { ok: false, issues };
    return { ok: true, output: res.data };
  }
  return { ok: false, issues: res.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}

/** Contract rules that zod cannot express: dangling source refs, unsupported verified claims. */
function structuralIssues(o: AgentOutput): string[] {
  const issues: string[] = [];
  const sourceKeys = new Set(o.sources.map((s) => s.source_key));
  const byKey = new Map(o.sources.map((s) => [s.source_key, s]));
  const findingKeys = new Set<string>();
  for (const f of o.findings) {
    if (findingKeys.has(f.finding_key)) issues.push(`findings: duplicate finding_key "${f.finding_key}"`);
    findingKeys.add(f.finding_key);
    for (const ref of f.source_refs) {
      if (!sourceKeys.has(ref.source_key)) {
        issues.push(`findings.${f.finding_key}: source_ref "${ref.source_key}" is not in sources`);
      }
    }
    if (f.verification_status === "verified") {
      if (f.source_refs.length === 0) {
        issues.push(`findings.${f.finding_key}: verified finding has no source reference`);
      } else {
        const supporting = f.source_refs
          .map((r) => byKey.get(r.source_key))
          .filter((s): s is AgentSourceOutput => Boolean(s))
          .filter((s) => s.retrieved && VERIFIABLE_SOURCE_TYPES.includes(s.source_type));
        if (supporting.length === 0) {
          issues.push(
            `findings.${f.finding_key}: verified finding is not supported by a retrieved official source`,
          );
        }
      }
    }
  }
  for (const c of o.conflicts) {
    for (const k of c.finding_keys) if (!findingKeys.has(k)) issues.push(`conflicts: unknown finding_key "${k}"`);
    for (const k of c.source_keys) if (!sourceKeys.has(k)) issues.push(`conflicts: unknown source_key "${k}"`);
  }
  return issues;
}
