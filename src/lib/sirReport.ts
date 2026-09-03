// Shared (client + server safe) model for the full PERMIVIO Site Investigation
// Report built from a public SIR request's research record.
//
// The report is organised into the four published coverage sections. Modules are
// dynamic: a module only renders when the research actually produced content for
// it. Every finding carries a verification level and can be dispositioned by a
// reviewer (approve / modify / reject) — a report is only badged
// PROFESSIONALLY REVIEWED once every finding has been dispositioned and signed off.

export type SirVerification = "verified" | "ai_assisted" | "needs_confirmation";
export type ReviewDecision = "approved" | "modified" | "rejected";

export type SirFindingReview = {
  decision: ReviewDecision;
  note?: string | null;
  revised_text?: string | null;
  reviewer_id?: string | null;
  reviewed_at?: string | null;
};

export type SirFindingReviews = Record<string, SirFindingReview>;

export type SirFinding = {
  id: string;
  title: string;
  detail: string;
  meta: string[];
  verification: SirVerification;
  source?: string | null;
};

export type SirModule = {
  key: string;
  label: string;
  summary?: string;
  verification?: SirVerification;
  findings: SirFinding[];
};

export type SirCoverageSection = {
  key: "jurisdiction_land_use" | "permit_approval_path" | "site_infrastructure" | "risk_decision_support";
  no: number;
  title: string;
  intro: string;
  modules: SirModule[];
};

export const SIR_COVERAGE_SECTIONS: Array<{ key: SirCoverageSection["key"]; title: string; intro: string }> = [
  {
    key: "jurisdiction_land_use",
    title: "Jurisdiction & Land Use",
    intro:
      "Authority having jurisdiction identification, zoning and allowable-use research, planning and land-use requirements, setbacks and parking, entitlement and site-development requirements.",
  },
  {
    key: "permit_approval_path",
    title: "Permit & Approval Path",
    intro:
      "Permit and approval matrix, building / fire / health review paths, required pre-application meetings, agency contacts, published or agency-confirmed review timelines, and fee research where available.",
  },
  {
    key: "site_infrastructure",
    title: "Site & Infrastructure",
    intro:
      "Utility considerations and provider coordination points, right-of-way considerations, site constraints identified in agency records, and approval dependencies and sequencing.",
  },
  {
    key: "risk_decision_support",
    title: "Risk & Decision Support",
    intro:
      "Potential permitting constraints, outstanding due-diligence items, project-specific recommendations, and go / no-go decision support.",
  },
];

const asVerification = (v: unknown): SirVerification =>
  v === "verified" || v === "ai_assisted" ? v : "needs_confirmation";

const label = (s: unknown) => String(s ?? "").replace(/_/g, " ");

/**
 * Permivio's authority library falls back to a government site-search link so a
 * user can locate an office. That is a lookup aid, never a citation, so it is
 * not presented as a source on the report or in the PDF.
 */
const citableSource = (url: unknown): string | null => {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return null;
  return /(^https?:\/\/(www\.)?(google|bing|duckduckgo|yahoo)\.)|[?&]q=/i.test(u) ? null : u;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Build the four-section, dynamic-module report from a research record. */
export function buildSirReport(research: any): SirCoverageSection[] {
  if (!research) return [];

  const jurisdictionModules: SirModule[] = [];
  const authorities: any[] = research.jurisdiction?.authorities ?? [];
  if (authorities.length) {
    jurisdictionModules.push({
      key: "ahj",
      label: "Authority having jurisdiction",
      summary: research.jurisdiction?.ahj_summary ?? "",
      verification: asVerification(research.jurisdiction?.verification),
      findings: authorities.map((a, i) => ({
        id: `authority:${i}`,
        title: a.official_name ?? "Authority",
        detail: a.responsibility ?? "",
        meta: [a.role].filter(Boolean),
        verification: asVerification(a.verification),
        source: citableSource(a.website),
      })),
    });
  }
  if (research.zoning) {
    jurisdictionModules.push({
      key: "zoning",
      label: "Zoning & allowable use",
      summary: research.zoning.rationale ?? "",
      verification: asVerification(research.zoning.verification),
      findings: [
        {
          id: "zoning:conclusion",
          title: `District ${research.zoning.district ?? "not established"} — ${label(research.zoning.use_conclusion)}`,
          detail: research.zoning.rationale ?? "",
          meta: ["Zoning & allowable use"],
          verification: asVerification(research.zoning.verification),
          source: citableSource(research.zoning.source_url),
        },
        ...((research.zoning.items_to_confirm ?? []) as string[]).map((s, i) => ({
          id: `zoning:confirm:${i}`,
          title: s,
          detail: "Item to confirm with the zoning / planning office before relying on this scope.",
          meta: ["Needs agency confirmation"],
          verification: "needs_confirmation" as SirVerification,
        })),
      ],
    });
  }
  const entitlements = ((research.permits ?? []) as any[]).filter((p) =>
    /zoning|planning|entitlement|land use|site plan|variance|special|conditional/i.test(`${p.category} ${p.name}`),
  );
  if (entitlements.length) {
    jurisdictionModules.push({
      key: "entitlements",
      label: "Entitlement & site-development requirements",
      findings: entitlements.map((p, i) => ({
        id: `entitlement:${i}`,
        title: p.name,
        detail: p.notes ?? "",
        meta: [p.agency, label(p.likelihood)].filter(Boolean),
        verification: asVerification(p.verification),
        source: citableSource(p.source_url),
      })),
    });
  }

  const permitModules: SirModule[] = [];
  const permits: any[] = research.permits ?? [];
  if (permits.length) {
    permitModules.push({
      key: "permit_matrix",
      label: "Permit & approval matrix",
      findings: permits.map((p, i) => ({
        id: `permit:${i}`,
        title: p.name,
        detail: [p.notes, p.depends_on ? `Depends on: ${p.depends_on}` : null].filter(Boolean).join("\n"),
        meta: [p.agency, p.category, label(p.likelihood)].filter(Boolean),
        verification: asVerification(p.verification),
        source: citableSource(p.source_url),
      })),
    });
  }
  const reviewPaths = permits.filter((p) => /building|fire|health/i.test(`${p.category} ${p.agency} ${p.name}`));
  if (reviewPaths.length) {
    permitModules.push({
      key: "review_paths",
      label: "Building, fire & health review paths",
      findings: reviewPaths.map((p, i) => ({
        id: `reviewpath:${i}`,
        title: `${p.agency ?? "Agency"} — ${p.name}`,
        detail: p.notes ?? "",
        meta: [label(p.likelihood)],
        verification: asVerification(p.verification),
        source: citableSource(p.source_url),
      })),
    });
  }
  const codes: any[] = research.codes ?? [];
  if (codes.length) {
    permitModules.push({
      key: "adopted_codes",
      label: "Adopted codes governing this project",
      findings: codes.map((c, i) => ({
        id: `code:${i}`,
        title: `${c.discipline}: ${c.code_and_edition}`,
        detail: c.applies_because ?? "",
        meta: ["Adopted code research — not a compliance determination"],
        verification: asVerification(c.verification),
        source: citableSource(c.source_url),
      })),
    });
  }
  const fees: any[] = research.fees ?? [];
  if (fees.length) {
    permitModules.push({
      key: "fees",
      label: "Fees & cost exposure",
      findings: fees.map((f, i) => ({
        id: `fee:${i}`,
        title: f.item,
        detail: f.amount_or_basis ?? "",
        meta: [f.agency, "Confirm current schedule with the agency before budgeting"].filter(Boolean),
        verification: asVerification(f.verification),
        source: citableSource(f.source_url),
      })),
    });
  }
  const timeline: any[] = research.timeline ?? [];
  if (timeline.length) {
    permitModules.push({
      key: "review_timeline",
      label: "Review timeline & sequencing",
      summary: research.turnaround ? `Report turnaround: ${research.turnaround}` : undefined,
      findings: timeline.map((t, i) => ({
        id: `timeline:${i}`,
        title: `${t.phase} — ${t.duration || "duration not established"}`,
        detail: [
          t.depends_on ? `After: ${t.depends_on}` : null,
          t.critical_path ? "On the critical path." : null,
          t.long_lead ? "Long-lead item." : null,
        ]
          .filter(Boolean)
          .join(" "),
        meta: [t.critical_path ? "Critical path" : null, t.long_lead ? "Long lead" : null].filter(Boolean) as string[],
        verification: "needs_confirmation" as SirVerification,
      })),
    });
  }

  const siteModules: SirModule[] = [];
  const utilities: any[] = research.utilities ?? [];
  if (utilities.length) {
    siteModules.push({
      key: "utilities",
      label: "Utility considerations & provider coordination",
      findings: utilities.map((u, i) => ({
        id: `utility:${i}`,
        title: `${u.utility}${u.provider ? ` — ${u.provider}` : " — provider not established"}`,
        detail: u.coordination_required ?? "",
        meta: ["Capacity is never confirmed without a written availability letter"],
        verification: asVerification(u.verification),
        source: citableSource(u.source_url),
      })),
    });
  }
  const access: any[] = research.access ?? [];
  if (access.length) {
    siteModules.push({
      key: "access",
      label: "Transportation, access & right-of-way",
      findings: access.map((a, i) => ({
        id: `access:${i}`,
        title: a.item,
        detail: a.requirement ?? "",
        meta: [a.authority].filter(Boolean),
        verification: asVerification(a.verification),
        source: citableSource(a.source_url),
      })),
    });
  }
  const environmental: any[] = research.environmental ?? [];
  if (environmental.length) {
    siteModules.push({
      key: "environmental",
      label: "Environmental & site constraints",
      findings: environmental.map((e, i) => ({
        id: `environmental:${i}`,
        title: `${e.constraint} — ${label(e.status)}`,
        detail: e.implication ?? "",
        meta: [e.deal_killer ? "Potential deal-killer" : null].filter(Boolean) as string[],
        verification: asVerification(e.verification),
        source: citableSource(e.source_url),
      })),
    });
  }
  const dependencies = timeline.filter((t) => t.depends_on);
  if (dependencies.length) {
    siteModules.push({
      key: "dependencies",
      label: "Approval dependencies & sequencing",
      findings: dependencies.map((t, i) => ({
        id: `dependency:${i}`,
        title: `${t.phase} follows ${t.depends_on}`,
        detail: t.duration ? `Estimated duration: ${t.duration}` : "",
        meta: [t.critical_path ? "Critical path" : "Sequencing"],
        verification: "needs_confirmation" as SirVerification,
      })),
    });
  }
  const scope: string[] = research.research_scope ?? [];
  if (scope.length) {
    siteModules.push({
      key: "research_scope",
      label: "Research categories covered for this jurisdiction",
      findings: scope.map((s, i) => ({
        id: `scope:${i}`,
        title: s,
        detail: "",
        meta: [],
        verification: "ai_assisted" as SirVerification,
      })),
    });
  }

  const riskModules: SirModule[] = [];
  const risks: any[] = research.risks ?? [];
  if (risks.length) {
    riskModules.push({
      key: "risks",
      label: "Potential permitting constraints",
      findings: risks.map((r, i) => ({
        id: `risk:${i}`,
        title: r.title,
        detail: r.why ?? "",
        meta: [`${label(r.severity)} severity`],
        verification: "ai_assisted" as SirVerification,
      })),
    });
  }
  const questions: string[] = research.open_questions ?? [];
  if (questions.length) {
    riskModules.push({
      key: "due_diligence",
      label: "Outstanding due-diligence items",
      findings: questions.map((q, i) => ({
        id: `question:${i}`,
        title: q,
        detail: "",
        meta: ["Needs agency or professional confirmation"],
        verification: "needs_confirmation" as SirVerification,
      })),
    });
  }
  const steps: string[] = research.recommended_next_steps ?? [];
  if (steps.length) {
    riskModules.push({
      key: "recommendations",
      label: "Project-specific recommendations",
      findings: steps.map((s, i) => ({
        id: `nextstep:${i}`,
        title: s,
        detail: "",
        meta: [],
        verification: "ai_assisted" as SirVerification,
      })),
    });
  }

  const byKey: Record<SirCoverageSection["key"], SirModule[]> = {
    jurisdiction_land_use: jurisdictionModules,
    permit_approval_path: permitModules,
    site_infrastructure: siteModules,
    risk_decision_support: riskModules,
  };

  return SIR_COVERAGE_SECTIONS.map((s, i) => ({
    key: s.key,
    no: i + 1,
    title: s.title,
    intro: s.intro,
    modules: byKey[s.key],
  })).filter((s) => s.modules.length > 0);
}

/** Executive feasibility snapshot rows derived from the research record. */
export function buildSirSnapshot(research: any): Array<{ label: string; value: string }> {
  if (!research) return [];
  const permits: any[] = research.permits ?? [];
  const required = permits.filter((p) => p.likelihood === "required" || p.likelihood === "likely").length;
  const highRisks = ((research.risks ?? []) as any[]).filter((r) => r.severity === "high").length;
  return [
    { label: "Project classification", value: research.project_classification || "Not established" },
    { label: "Complexity", value: label(research.complexity) || "Not established" },
    { label: "Zoning / use position", value: label(research.zoning?.use_conclusion) || "needs confirmation" },
    { label: "Zoning district", value: research.zoning?.district || "Not established — confirm with zoning office" },
    { label: "Approvals identified", value: `${permits.length} total · ${required} required or likely` },
    { label: "Authorities identified", value: String((research.jurisdiction?.authorities ?? []).length) },
    { label: "High-severity risks", value: String(highRisks) },
    ...(((research.environmental ?? []) as any[]).some((e) => e.deal_killer)
      ? [{ label: "Potential deal-killers", value: ((research.environmental ?? []) as any[]).filter((e) => e.deal_killer).map((e) => e.constraint).join("; ") }]
      : []),
    ...(((research.codes ?? []) as any[]).length ? [{ label: "Adopted codes identified", value: String(((research.codes ?? []) as any[]).length) }] : []),
    { label: "Estimated turnaround", value: research.turnaround || "Not established" },
    {
      label: "Go / no-go position",
      value:
        highRisks > 0
          ? "Proceed with caution — high-severity constraints require confirmation before committing."
          : "No high-severity constraint identified in published material — confirm open items before committing.",
    },
  ];
}

export const SIR_RISK_LEVELS = ["high", "medium", "low"] as const;

/** Risk matrix grouped by severity level. */
export function buildSirRiskMatrix(research: any): Array<{ level: (typeof SIR_RISK_LEVELS)[number]; items: Array<{ id: string; title: string; why: string }> }> {
  const risks: any[] = research?.risks ?? [];
  return SIR_RISK_LEVELS.map((level) => ({
    level,
    items: risks
      .map((r, i) => ({ ...r, id: `risk:${i}` }))
      .filter((r) => r.severity === level)
      .map((r) => ({ id: r.id, title: r.title, why: r.why ?? "" })),
  })).filter((g) => g.items.length > 0);
}

/** Every finding id in the report, in order. */
export function allSirFindingIds(sections: SirCoverageSection[]): string[] {
  return sections.flatMap((s) => s.modules.flatMap((m) => m.findings.map((f) => f.id)));
}

export type SirReviewRollup = {
  total: number;
  approved: number;
  modified: number;
  rejected: number;
  undecided: number;
  allDecided: boolean;
};

export function rollupSirReview(sections: SirCoverageSection[], reviews: SirFindingReviews | null | undefined): SirReviewRollup {
  const ids = allSirFindingIds(sections);
  const r = reviews ?? {};
  const count = (d: ReviewDecision) => ids.filter((id) => r[id]?.decision === d).length;
  const approved = count("approved");
  const modified = count("modified");
  const rejected = count("rejected");
  const undecided = ids.length - approved - modified - rejected;
  return { total: ids.length, approved, modified, rejected, undecided, allDecided: ids.length > 0 && undecided === 0 };
}

/** Display text for a finding after reviewer modification. */
export function effectiveFindingText(finding: SirFinding, review?: SirFindingReview | null): string {
  if (review?.decision === "modified" && review.revised_text) return review.revised_text;
  return finding.detail;
}

export const SIR_REPORT_DISCLAIMER =
  "This Site Investigation Report is permitting research and decision support based on published agency material. It is not a jurisdiction determination, zoning verification, survey, engineering opinion, or legal advice. Items marked for agency confirmation must be verified with the authority having jurisdiction. Utility capacity is never confirmed without a written availability letter from the provider.";

export const SIR_AI_RESEARCH_DISCLAIMER =
  "This research was produced by Permivio's Lead Project Intelligence Agent, which coordinates specialist research agents over published agency and utility-provider material. A finding is only labelled verified when it cites an official source page retrieved during this research pass; anything the agents inferred is labelled AI assisted, and anything the record could not establish is labelled needs confirmation rather than filled in. No finding in this report is a jurisdiction determination.";

export const SIR_PROFESSIONAL_REVIEW_NOTE =
  "A Permivio reviewer has reviewed each finding in this report and recorded an approve, modify or reject decision. Professional review does not convert research into a jurisdiction determination, code-compliance certification, or engineering approval.";
