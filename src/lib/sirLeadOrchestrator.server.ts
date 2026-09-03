// Lead SIR Agent — compilation & QA/QC gate.
//
// The Lead Project Intelligence Agent (sirLeadAgent.server.ts) runs the
// specialist research modules. This module is the second half of the same lead
// role: it compiles the specialist output into the final Site Investigation
// Report draft, runs a deterministic QA/QC gate over it, and queues the draft
// for internal professional review.
//
// The gate is deliberately deterministic (no model call): every check is a
// verifiable property of the compiled record, so a pass/fail is auditable and
// reproducible. It never converts research into a jurisdiction determination —
// clearing QA/QC only means the draft is complete and internally consistent
// enough for a human professional to review.

import {
  buildSirReport,
  buildSirRiskMatrix,
  buildSirSnapshot,
  SIR_COVERAGE_SECTIONS,
  type SirCoverageSection,
} from "@/lib/sirReport";

export const SIR_QA_VERSION = "sir-lead-qa-1";

export type SirQaSeverity = "blocker" | "warning" | "info";

export type SirQaCheck = {
  id: string;
  label: string;
  status: "pass" | "fail";
  severity: SirQaSeverity;
  detail: string;
};

export type SirQaReport = {
  version: string;
  checked_at: string;
  status: "passed" | "passed_with_warnings" | "blocked";
  blockers: number;
  warnings: number;
  checks: SirQaCheck[];
};

export type SirCompiledReport = {
  version: string;
  compiled_at: string;
  snapshot: Array<{ label: string; value: string }>;
  sections: Array<{
    key: SirCoverageSection["key"];
    no: number;
    title: string;
    modules: number;
    findings: number;
    verified: number;
    ai_assisted: number;
    needs_confirmation: number;
  }>;
  totals: {
    modules: number;
    findings: number;
    verified: number;
    ai_assisted: number;
    needs_confirmation: number;
    cited_findings: number;
    risks: { high: number; medium: number; low: number };
  };
  open_questions: string[];
  recommended_next_steps: string[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/** Compile the specialist research into the final SIR draft summary record. */
export function compileSirReport(research: any, audit?: any): SirCompiledReport {
  const sections = buildSirReport(research);
  const matrix = buildSirRiskMatrix(research);
  const byLevel = (lvl: string) => matrix.find((m) => m.level === lvl)?.items.length ?? 0;

  const sectionStats = sections.map((s) => {
    const findings = s.modules.flatMap((m) => m.findings);
    return {
      key: s.key,
      no: s.no,
      title: s.title,
      modules: s.modules.length,
      findings: findings.length,
      verified: findings.filter((f) => f.verification === "verified").length,
      ai_assisted: findings.filter((f) => f.verification === "ai_assisted").length,
      needs_confirmation: findings.filter((f) => f.verification === "needs_confirmation").length,
    };
  });

  const allFindings = sections.flatMap((s) => s.modules.flatMap((m) => m.findings));

  return {
    version: SIR_QA_VERSION,
    compiled_at: new Date().toISOString(),
    snapshot: buildSirSnapshot(research),
    sections: sectionStats,
    totals: {
      modules: sections.reduce((n, s) => n + s.modules.length, 0),
      findings: allFindings.length,
      verified: allFindings.filter((f) => f.verification === "verified").length,
      ai_assisted: allFindings.filter((f) => f.verification === "ai_assisted").length,
      needs_confirmation: allFindings.filter((f) => f.verification === "needs_confirmation").length,
      cited_findings: allFindings.filter((f) => !!f.source).length,
      risks: { high: byLevel("high"), medium: byLevel("medium"), low: byLevel("low") },
    },
    open_questions: list(research?.open_questions).slice(0, 20),
    recommended_next_steps: list(research?.recommended_next_steps).slice(0, 20),
    // audit is persisted separately; referencing it here keeps the signature
    // stable for callers that pass it for future compile-time checks.
    ...(audit ? {} : {}),
  };
}

const BANNED_CLAIMS = [
  "code compliant",
  "code-compliant",
  "fully compliant",
  "engineering approved",
  "approved by the",
  "guaranteed",
  "permit is approved",
  "certified compliant",
];

/** Run the deterministic QA/QC gate over a compiled SIR draft. */
export function runSirQaGate(
  research: any,
  compiled: SirCompiledReport,
  opts: { sources?: unknown; audit?: any } = {},
): SirQaReport {
  const checks: SirQaCheck[] = [];
  const add = (c: SirQaCheck) => checks.push(c);

  const sections = buildSirReport(research);
  const allFindings = sections.flatMap((s) => s.modules.flatMap((m) => m.findings));
  const sources = Array.isArray(opts.sources) ? (opts.sources as Array<{ url?: string }>) : [];
  const audit = opts.audit ?? null;

  // 1. Every coverage section produced content.
  const empty = SIR_COVERAGE_SECTIONS.filter((s) => {
    const stat = compiled.sections.find((x) => x.key === s.key);
    return !stat || stat.findings === 0;
  });
  add({
    id: "coverage_sections",
    label: "All four coverage sections populated",
    status: empty.length === 0 ? "pass" : "fail",
    severity: "blocker",
    detail: empty.length === 0 ? "Jurisdiction, permit path, site/infrastructure and risk sections all produced findings." : `No findings for: ${empty.map((s) => s.title).join(", ")}.`,
  });

  // 2. Jurisdiction resolved.
  const jurisdictionOk = !!research?.ahj_summary && list(research?.authorities).length !== 0
    ? true
    : Array.isArray(research?.authorities) && research.authorities.length > 0;
  add({
    id: "jurisdiction_resolved",
    label: "Authority having jurisdiction identified",
    status: jurisdictionOk ? "pass" : "fail",
    severity: "blocker",
    detail: jurisdictionOk ? "At least one controlling agency is named for the site." : "No controlling agency was resolved — the draft cannot go to review.",
  });

  // 3. Permit matrix is not empty.
  const permits = Array.isArray(research?.permits) ? research.permits.length : 0;
  add({
    id: "permit_matrix",
    label: "Permit & approval matrix built",
    status: permits > 0 ? "pass" : "fail",
    severity: "blocker",
    detail: permits > 0 ? `${permits} permit / approval items compiled.` : "The permit matrix is empty.",
  });

  // 4. Official evidence was actually retrieved.
  add({
    id: "official_evidence",
    label: "Official source evidence retrieved",
    status: sources.length > 0 ? "pass" : "fail",
    severity: "blocker",
    detail: sources.length > 0 ? `${sources.length} official / provider sources harvested.` : "No official sources were retrieved for this assignment.",
  });

  // 5. Nothing labelled verified without a citation.
  const uncited = allFindings.filter((f) => f.verification === "verified" && !f.source);
  add({
    id: "verified_citations",
    label: "Every verified finding carries a citation",
    status: uncited.length === 0 ? "pass" : "fail",
    severity: "blocker",
    detail: uncited.length === 0 ? "No verified label is unsupported." : `${uncited.length} finding(s) labelled verified without a source URL: ${uncited.slice(0, 3).map((f) => f.title).join("; ")}.`,
  });

  // 6. No absolute compliance / approval language.
  const offenders = allFindings.filter((f) => {
    const t = `${f.title} ${f.detail}`.toLowerCase();
    return BANNED_CLAIMS.some((p) => t.includes(p));
  });
  add({
    id: "no_absolute_claims",
    label: "No compliance or approval claims",
    status: offenders.length === 0 ? "pass" : "fail",
    severity: "blocker",
    detail: offenders.length === 0 ? "No finding asserts code compliance, approval or a guarantee." : `${offenders.length} finding(s) use compliance/approval language and must be reworded: ${offenders.slice(0, 3).map((f) => f.title).join("; ")}.`,
  });

  // 7. Specialist agents all completed.
  const agents = Array.isArray(audit?.agents) ? (audit.agents as Array<{ agent: string; status: string }>) : [];
  const failedAgents = agents.filter((a) => a.status !== "complete");
  add({
    id: "agents_complete",
    label: "All research agents completed",
    status: agents.length > 0 && failedAgents.length === 0 ? "pass" : "fail",
    severity: agents.length === 0 ? "warning" : "blocker",
    detail: agents.length === 0
      ? "No agent audit trail was recorded for this research pass."
      : failedAgents.length === 0
        ? `${agents.length} agents completed.`
        : `Incomplete agents: ${failedAgents.map((a) => a.agent).join(", ")}.`,
  });

  // 8. Coverage gaps flagged for the reviewer (warning, not a blocker).
  const gaps = list(audit?.coverage_gaps);
  add({
    id: "coverage_gaps",
    label: "Coverage gaps recorded for reviewer",
    status: gaps.length === 0 ? "pass" : "fail",
    severity: "warning",
    detail: gaps.length === 0 ? "The agents reported no coverage gaps." : `${gaps.length} coverage gap(s) need reviewer attention: ${gaps.slice(0, 3).join("; ")}.`,
  });

  // 9. Citation downgrades surfaced (warning).
  const downgrades = Array.isArray(audit?.citation_downgrades) ? audit.citation_downgrades.length : 0;
  add({
    id: "citation_downgrades",
    label: "Citation gate downgrades reviewed",
    status: downgrades === 0 ? "pass" : "fail",
    severity: "warning",
    detail: downgrades === 0 ? "No claim needed downgrading for a missing citation." : `${downgrades} claim(s) were downgraded to AI-identified for lack of an official citation.`,
  });

  // 10. Outstanding due-diligence items exist — a report with none is suspicious.
  add({
    id: "open_items",
    label: "Outstanding items and next steps present",
    status: compiled.open_questions.length + compiled.recommended_next_steps.length > 0 ? "pass" : "fail",
    severity: "warning",
    detail: compiled.open_questions.length + compiled.recommended_next_steps.length > 0
      ? `${compiled.open_questions.length} open question(s), ${compiled.recommended_next_steps.length} recommended next step(s).`
      : "No open questions or next steps were produced — confirm the research was complete.",
  });

  const blockers = checks.filter((c) => c.status === "fail" && c.severity === "blocker").length;
  const warnings = checks.filter((c) => c.status === "fail" && c.severity === "warning").length;

  return {
    version: SIR_QA_VERSION,
    checked_at: new Date().toISOString(),
    status: blockers > 0 ? "blocked" : warnings > 0 ? "passed_with_warnings" : "passed",
    blockers,
    warnings,
    checks,
  };
}

export type SirLeadCompileResult = {
  compiled: SirCompiledReport;
  qa: SirQaReport;
  review_stage: "qa_blocked" | "professional_review_pending";
};

/**
 * Lead SIR Agent: compile the final draft, run QA/QC and decide whether the
 * draft may be submitted for internal professional review.
 */
export function leadCompileAndGate(research: any, opts: { sources?: unknown; audit?: any } = {}): SirLeadCompileResult {
  const compiled = compileSirReport(research, opts.audit);
  const qa = runSirQaGate(research, compiled, opts);
  return {
    compiled,
    qa,
    review_stage: qa.status === "blocked" ? "qa_blocked" : "professional_review_pending",
  };
}
