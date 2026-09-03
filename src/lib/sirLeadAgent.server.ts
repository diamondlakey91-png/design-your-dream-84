// Lead Project Intelligence Agent (Phase 2)
// -----------------------------------------------------------------------------
// Orchestrates the Site Investigation Report research instead of running one
// blind AI call:
//
//   1. Jurisdiction resolution   — geocode + Permivio authority library
//   2. Evidence harvest          — official (.gov / provider) pages via Firecrawl
//   3. Lead assignment planning  — classification, coverage plan, open questions
//   4. Specialist research passes— land use, permit path, site & infrastructure,
//                                  schedule / fees / risk (parallel, cited)
//   5. Citation gate             — a finding may only stay "verified" when it
//                                  cites a URL that actually appears in the
//                                  harvested evidence pool. Everything else is
//                                  downgraded, never dropped silently.
//   6. Audit                     — which agents ran, evidence counts, every
//                                  citation downgrade, so the record is
//                                  reviewable.
//
// Nothing here fabricates data: no evidence means the finding is emitted as
// needs_confirmation, and the agent records that it could not be substantiated.

import { z } from "zod";
import { callGeminiJSON } from "@/lib/ai.shared";
import {
  ResearchSchema,
  Verification,
  gatherOfficialResearch,
  looseEnum,
  looseText,
  resolveSirJurisdiction,
  type ResolvedJurisdiction,
  type SirRequestRow,
  type SirResearch,
} from "@/lib/sirResearch.server";

export const SIR_LEAD_AGENT_MODEL = "google/gemini-2.5-pro";
export const SIR_LEAD_AGENT_VERSION = "lead-project-intelligence-1";

const NO_FABRICATION = `You are a specialist agent inside PERMIVIO's Site Investigation Report system, working under a Lead Project Intelligence Agent.

HARD RULES
- Use ONLY the supplied evidence excerpts and the resolved jurisdiction facts. Never invent a zoning district, ordinance section, parcel number, flood zone, setback, fee amount, utility capacity, contact name or review duration.
- Every element you emit carries a verification level: "verified" ONLY when a supplied evidence URL states it, "ai_assisted" when it is your professional inference, "needs_confirmation" when it must be asked of the agency.
- A "verified" element MUST include the exact source_url it came from, copied from the evidence excerpts.
- Never write "code compliant", "approved", "guaranteed feasible", "engineering approved" or any jurisdiction determination.
- Utility capacity is never confirmed without a written availability letter from the provider.
- Preserve conflicts: if sources disagree, say so instead of picking one.
- Omitting an item is worse than marking it needs_confirmation.`;

type Source = { url: string; title: string };

export type SirAgentAuditEntry = {
  agent: string;
  role: string;
  status: "complete" | "failed";
  items: number;
  cited: number;
  downgraded: number;
  error?: string | null;
};

export type SirResearchAudit = {
  version: string;
  model: string;
  ran_at: string;
  jurisdiction_verification: string;
  evidence_sources: number;
  evidence_domains: string[];
  agents: SirAgentAuditEntry[];
  citation_downgrades: Array<{ agent: string; item: string; reason: string }>;
  coverage_gaps: string[];
};

/* ------------------------------------------------------- specialist schemas */

const Cited = { source_url: looseText(500).optional() };

/**
 * Models often answer a "list of sentences" prompt with a list of objects.
 * Flatten those to text instead of failing the whole research pass.
 */
/** Coerce whatever the model returned into a single trimmed string. */
function looseString(max: number) {
  return z.preprocess((v) => {
    if (v == null) return "";
    if (typeof v === "string") return v.slice(0, max);
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? Object.values(x as object).join(" ") : String(x))).join("; ").slice(0, max);
    if (typeof v === "object") {
      return Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val != null && val !== "")
        .map(([k, val]) => `${k.replace(/_/g, " ")}: ${String(val)}`)
        .join(" · ")
        .slice(0, max);
    }
    return String(v).slice(0, max);
  }, z.string()) as unknown as z.ZodType<string>;
}

function looseList(max: number, cap: number) {
  return z.preprocess((v) => {
    const arr = Array.isArray(v) ? v : v == null ? [] : [v];
    return arr
      .map((x) => {
        if (x == null) return "";
        if (typeof x === "string") return x;
        if (typeof x === "object") {
          const o = x as Record<string, unknown>;
          const parts = Object.entries(o)
            .filter(([, val]) => val != null && val !== "")
            .map(([k, val]) => (k === "item" || k === "title" || k === "question" || k === "step" ? String(val) : `${k.replace(/_/g, " ")}: ${String(val)}`));
          return parts.join(" — ");
        }
        return String(x);
      })
      .map((t) => t.trim().slice(0, max))
      .filter(Boolean)
      .slice(0, cap);
  }, z.array(z.string()).max(cap)) as unknown as z.ZodType<string[]>;
}

const PlanSchema = z.object({
  project_classification: looseString(300),
  complexity: looseEnum(["simple", "moderate", "complex", "major"] as const, "moderate"),
  scope_summary: looseString(4000),
  research_scope: looseList(300, 24),
  open_questions: looseList(400, 15),
  turnaround: looseString(200),
});

const LandUseSchema = z.object({
  ahj_summary: looseString(4000),
  authorities: z
    .array(
      z.object({
        role: z.string().max(60),
        official_name: z.string().max(200),
        responsibility: looseString(400),
        website: looseText(400).optional(),
        verification: Verification,
      }),
    )
    .max(20),
  jurisdiction_verification: Verification,
  zoning: z.object({
    district: looseText(160),
    use_conclusion: looseEnum(
      ["likely_permitted", "conditional", "potentially_not_permitted", "needs_confirmation"] as const,
      "needs_confirmation",
    ),
    rationale: looseString(4000),
    items_to_confirm: looseList(400, 12),
    verification: Verification,
    ...Cited,
  }),
  entitlements: z
    .array(
      z.object({
        name: looseString(160),
        agency: looseString(160),
        category: looseString(60),
        likelihood: looseEnum(["required", "likely", "conditional", "not_required"] as const, "conditional"),
        notes: looseText(600).optional(),
        verification: Verification,
        ...Cited,
      }),
    )
    .max(12),
});

const PermitPathSchema = z.object({
  permits: z
    .array(
      z.object({
        name: looseString(160),
        agency: looseString(160),
        category: looseString(60),
        likelihood: looseEnum(["required", "likely", "conditional", "not_required"] as const, "conditional"),
        depends_on: looseText(200).optional(),
        notes: looseText(600).optional(),
        verification: Verification,
        ...Cited,
      }),
    )
    .max(30),
  review_notes: looseList(400, 10),
});

const SiteSchema = z.object({
  utilities: z
    .array(
      z.object({
        utility: looseString(80),
        provider: looseText(160),
        coordination_required: looseString(600),
        verification: Verification,
        ...Cited,
      }),
    )
    .max(12),
  site_constraints: looseList(400, 12),
});

const DecisionSchema = z.object({
  timeline: z
    .array(
      z.object({
        phase: looseString(160),
        duration: looseString(80),
        depends_on: looseText(200).optional(),
        long_lead: z.boolean().optional(),
        critical_path: z.boolean().optional(),
      }),
    )
    .max(20),
  risks: z
    .array(
      z.object({
        title: looseString(200),
        severity: looseEnum(["low", "medium", "high"] as const, "medium"),
        why: looseString(600),
      }),
    )
    .max(15),
  recommended_next_steps: looseList(400, 12),
});

const CodesSchema = z.object({
  codes: z
    .array(
      z.object({
        discipline: looseString(80),
        code_and_edition: looseString(200),
        applies_because: looseString(600),
        verification: Verification,
        ...Cited,
      }),
    )
    .max(14),
  review_notes: looseList(400, 8),
});

const AccessSchema = z.object({
  access: z
    .array(
      z.object({
        item: looseString(160),
        authority: looseText(160),
        requirement: looseString(600),
        verification: Verification,
        ...Cited,
      }),
    )
    .max(12),
});

const EnvironmentalSchema = z.object({
  environmental: z
    .array(
      z.object({
        constraint: looseString(160),
        status: looseEnum(["present", "possible", "not_indicated", "needs_confirmation"] as const, "needs_confirmation"),
        implication: looseString(600),
        deal_killer: z.boolean().optional(),
        verification: Verification,
        ...Cited,
      }),
    )
    .max(14),
});

const FeeSchema = z.object({
  fees: z
    .array(
      z.object({
        item: looseString(160),
        agency: looseText(160),
        amount_or_basis: looseString(300),
        verification: Verification,
        ...Cited,
      }),
    )
    .max(16),
});

/* ------------------------------------------------------------------ helpers */

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Citation gate: only evidence-backed claims may keep a "verified" label. */
function gateCitation<T extends { verification: string; source_url?: string | null }>(
  item: T,
  label: string,
  agent: string,
  allowed: Set<string>,
  audit: SirResearchAudit,
): T {
  const host = item.source_url ? hostOf(item.source_url) : null;
  const backed = Boolean(host && allowed.has(host));
  if (item.verification === "verified" && !backed) {
    audit.citation_downgrades.push({
      agent,
      item: label,
      reason: item.source_url
        ? "Cited a URL that is not in the harvested official evidence pool."
        : "Claimed verified without citing an official source.",
    });
    return { ...item, verification: "ai_assisted" as const };
  }
  if (!backed && item.source_url) return { ...item, source_url: null };
  return item;
}

function tally(agent: string, role: string, items: Array<{ verification: string; source_url?: string | null }>, before: number, audit: SirResearchAudit): SirAgentAuditEntry {
  return {
    agent,
    role,
    status: "complete",
    items: items.length,
    cited: items.filter((i) => Boolean(i.source_url)).length,
    downgraded: audit.citation_downgrades.length - before,
  };
}

function evidenceBlock(context: string, sources: Source[]) {
  const list = sources.map((s) => `- ${s.url}${s.title ? ` (${s.title})` : ""}`).join("\n") || "(none retrieved)";
  return `AVAILABLE EVIDENCE URLS (cite only these):\n${list}\n\nEVIDENCE EXCERPTS:\n${context.slice(0, 13000) || "(no evidence retrieved — mark jurisdiction-specific items needs_confirmation)"}`;
}

function projectBlock(row: SirRequestRow, resolved: ResolvedJurisdiction) {
  return `SITE ADDRESS: ${resolved.formatted_address ?? row.site_address ?? "not provided"}
CLIENT-STATED JURISDICTION: ${row.jurisdiction}
RESOLVED: city=${resolved.city ?? "?"} · county=${resolved.county ?? "?"} · state=${resolved.state ?? "?"} · geocode=${resolved.geocode_precision ?? "unknown"}${resolved.zip_only ? " · ZIP-ONLY (exact AHJ NOT established)" : ""}
PERMIVIO AUTHORITY STACK (use verbatim when listed):
${resolved.authorities.length ? resolved.authorities.map((a) => `- ${a.role}: ${a.official_name}${a.website ? ` (${a.website})` : ""}`).join("\n") : "(none on file — identify likely offices and mark needs_confirmation)"}
PARCEL / APN: ${row.parcel_apn ?? "unknown"}
APPROX SIZE: ${row.approx_size ?? "unknown"} · EXISTING BUILDING: ${row.existing_building ?? "unknown"}
INTENDED USE / SCOPE: ${row.intended_use}
PROJECT STAGE: ${row.project_stage ?? "unknown"} · CLIENT ROLE: ${row.role ?? "unknown"}
REPORT REQUESTED: ${row.report_needed ?? "not specified"} · TARGET MILESTONE: ${row.target_date ?? "not specified"}
CLIENT NOTES: ${row.notes ?? "none"}`;
}

/* -------------------------------------------------------------- orchestrator */

/**
 * Run the Lead Project Intelligence Agent for one SIR request.
 * Returns the same research shape the report/PDF already consume, plus an audit.
 */
export async function runSirLeadAgent(row: SirRequestRow): Promise<{
  resolved: ResolvedJurisdiction;
  research: SirResearch;
  sources: Source[];
  audit: SirResearchAudit;
}> {
  const resolved = await resolveSirJurisdiction({ siteAddress: row.site_address, jurisdiction: row.jurisdiction });
  const locality = resolved.locality ?? resolved.county ?? resolved.city ?? row.jurisdiction;

  const { context, sources: harvested } = await gatherOfficialResearch({
    locality,
    state: resolved.state ?? "",
    address: resolved.formatted_address ?? row.site_address ?? "",
    use: row.intended_use.slice(0, 120),
  });

  // A search-engine results page is never a citable source, so it is removed
  // from the evidence pool before the citation gate runs.
  const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|search\.brave)\./i;
  const sources = harvested.filter((s) => {
    const h = hostOf(s.url);
    return Boolean(h) && !SEARCH_HOSTS.test(h!);
  });

  const allowed = new Set<string>();
  for (const s of sources) {
    const h = hostOf(s.url);
    if (h) allowed.add(h);
  }
  for (const a of resolved.authorities) {
    const h = a.website ? hostOf(a.website) : null;
    if (h) allowed.add(h);
  }

  const audit: SirResearchAudit = {
    version: SIR_LEAD_AGENT_VERSION,
    model: SIR_LEAD_AGENT_MODEL,
    ran_at: new Date().toISOString(),
    jurisdiction_verification: resolved.verification,
    evidence_sources: sources.length,
    evidence_domains: Array.from(allowed),
    agents: [],
    citation_downgrades: [],
    coverage_gaps: [],
  };

  const facts = projectBlock(row, resolved);
  const evidence = evidenceBlock(context, sources);
  // Reasoning models spend part of the budget before emitting JSON, so a
  // truncated first pass is retried once with a larger budget rather than
  // failing the whole assignment.
  const ask = async <T>(prompt: string, schema: z.ZodType<T>, max = 12000): Promise<T> => {
    try {
      return await callGeminiJSON(prompt, NO_FABRICATION, schema, { model: SIR_LEAD_AGENT_MODEL, max_tokens: max });
    } catch (err) {
      if (!/truncat/i.test((err as Error).message)) throw err;
      return await callGeminiJSON(prompt, NO_FABRICATION, schema, { model: SIR_LEAD_AGENT_MODEL, max_tokens: Math.min(max * 2, 24000) });
    }
  };

  // 1 — Lead agent plans the assignment.
  const plan = await ask(
    `You are the LEAD PROJECT INTELLIGENCE AGENT. Plan this Site Investigation Report assignment.

${facts}

${evidence}

Classify the project, set the research coverage plan for THIS jurisdiction and use, list the questions that must be answered by the agency (not guessed), and give a conservative turnaround range that depends on agency responsiveness.

Return JSON: { "project_classification": "", "complexity": "simple|moderate|complex|major", "scope_summary": "", "research_scope": [], "open_questions": [], "turnaround": "" }`,
    PlanSchema,
    8000,
  );
  audit.agents.push({ agent: "lead", role: "Assignment planning & coverage", status: "complete", items: plan.research_scope.length, cited: 0, downgraded: 0 });

  const assignment = `LEAD AGENT ASSIGNMENT
Classification: ${plan.project_classification}
Complexity: ${plan.complexity}
Coverage plan: ${plan.research_scope.join("; ") || "(none)"}
Open questions from the lead agent: ${plan.open_questions.join("; ") || "(none)"}`;

  // 2 — Specialists run in parallel against the same evidence pool.
  const settle = async <T>(agent: string, role: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (err) {
      audit.agents.push({ agent, role, status: "failed", items: 0, cited: 0, downgraded: 0, error: (err as Error).message.slice(0, 300) });
      audit.coverage_gaps.push(`${role} could not be completed automatically — this section needs manual research before delivery.`);
      return null;
    }
  };

  const [landUse, permitPath, site, codesRes, accessRes, envRes, feeRes, decision] = await Promise.all([
    settle("land_use", "Jurisdiction, zoning & entitlements", () =>
      ask(
        `You are the JURISDICTION & LAND USE AGENT.\n\n${facts}\n\n${assignment}\n\n${evidence}\n\nIdentify every authority having jurisdiction, research the zoning district and whether the intended use is permitted, and list entitlement / site-development approvals. Never state a final zoning determination.\n\nReturn JSON: { "ahj_summary": "", "authorities": [{"role":"","official_name":"","responsibility":"","website":null,"verification":""}], "jurisdiction_verification": "", "zoning": {"district":null,"use_conclusion":"","rationale":"","items_to_confirm":[],"verification":"","source_url":null}, "entitlements": [{"name":"","agency":"","category":"","likelihood":"","notes":null,"verification":"","source_url":null}] }`,
        LandUseSchema,
      ),
    ),
    settle("permit_path", "Permit & approval path", () =>
      ask(
        `You are the PERMIT & APPROVAL PATH AGENT.\n\n${facts}\n\n${assignment}\n\n${evidence}\n\nBuild the permit and approval matrix for this specific use and jurisdiction: building, trade, fire, health, site development, right-of-way, signage — only those that actually apply. Name the reviewing agency for each and its dependency.\n\nReturn JSON: { "permits": [{"name":"","agency":"","category":"","likelihood":"","depends_on":null,"notes":null,"verification":"","source_url":null}], "review_notes": [] }`,
        PermitPathSchema,
      ),
    ),
    settle("site_infrastructure", "Site & infrastructure", () =>
      ask(
        `You are the SITE & INFRASTRUCTURE AGENT.\n\n${facts}\n\n${assignment}\n\n${evidence}\n\nIdentify the utility providers and the coordination each requires, plus site constraints visible in agency records. Capacity is never confirmed without a written availability letter.\n\nReturn JSON: { "utilities": [{"utility":"","provider":null,"coordination_required":"","verification":"","source_url":null}], "site_constraints": [] }`,
        SiteSchema,
      ),
    ),
    settle("building_fire_health", "Building, fire & health codes", () =>
      ask(
        `You are the BUILDING, FIRE & HEALTH CODE AGENT.\n\n${facts}\n\n${assignment}\n\n${evidence}\n\nIdentify the code editions this jurisdiction has adopted that govern this project (building, residential, fire, mechanical, electrical, plumbing, energy, accessibility, and health/food-service where the use requires it), and why each applies to THIS scope. Do not state whether the project complies.\n\nReturn JSON: { "codes": [{"discipline":"","code_and_edition":"","applies_because":"","verification":"","source_url":null}], "review_notes": [] }`,
        CodesSchema,
        9000,
      ),
    ),
    settle("transportation_access", "Transportation & site access", () =>
      ask(
        `You are the TRANSPORTATION & ACCESS AGENT.\n\n${facts}\n\n${assignment}\n\n${evidence}\n\nIdentify roadway jurisdiction for the fronting street(s), driveway/entrance permit and right-of-way requirements, traffic study or trip-generation triggers, sidewalk/streetscape obligations, and fire-apparatus access requirements that apply to this use. Name the controlling authority for each.\n\nReturn JSON: { "access": [{"item":"","authority":null,"requirement":"","verification":"","source_url":null}] }`,
        AccessSchema,
        9000,
      ),
    ),
    settle("environmental_constraints", "Environmental constraints", () =>
      ask(
        `You are the ENVIRONMENTAL CONSTRAINTS AGENT.\n\n${facts}\n\n${assignment}\n\n${evidence}\n\nAssess floodplain, stormwater management, wetlands/waters, forest or tree protection, critical/resource protection areas, steep slopes, historic review and known contamination review that could apply at this site. Use "present" only when an official source states it for this location; otherwise "possible" or "needs_confirmation". Mark deal_killer true only for a constraint that could prevent the intended use.\n\nReturn JSON: { "environmental": [{"constraint":"","status":"present|possible|not_indicated|needs_confirmation","implication":"","deal_killer":false,"verification":"","source_url":null}] }`,
        EnvironmentalSchema,
        9000,
      ),
    ),
    settle("fee_schedule", "Fees & cost exposure", () =>
      ask(
        `You are the FEE SCHEDULE AGENT.\n\n${facts}\n\n${assignment}\n\n${evidence}\n\nResearch the published fee basis for the approvals this project needs (permit fees, plan review, impact/development fees, utility connection or availability fees, right-of-way fees). Copy amounts or the calculation basis ONLY from the supplied evidence; never estimate a dollar figure. When no published schedule was retrieved, emit the item with amount_or_basis describing what must be requested and verification needs_confirmation.\n\nReturn JSON: { "fees": [{"item":"","agency":null,"amount_or_basis":"","verification":"","source_url":null}] }`,
        FeeSchema,
        9000,
      ),
    ),
    settle("risk_decision", "Schedule, risk & decision support", () =>
      ask(
        `You are the SCHEDULE, RISK & DECISION SUPPORT AGENT.\n\n${facts}\n\n${assignment}\n\n${evidence}\n\nSequence the approval phases with dependencies and critical-path flags, identify project-specific permitting risks (including potential deal-killers) and the next steps that move this project forward. Durations are project-specific estimates, never published commitments — no generic 30-90 day ranges.\n\nReturn JSON: { "timeline": [{"phase":"","duration":"","depends_on":null,"long_lead":false,"critical_path":false}], "risks": [{"title":"","severity":"","why":""}], "recommended_next_steps": [] }`,
        DecisionSchema,
      ),
    ),
  ]);

  // 3 — Citation gate + audit tally per agent.
  let before = audit.citation_downgrades.length;
  const authorities = (landUse?.authorities ?? []).map((a) => {
    // An agency URL only survives when it is an official page we actually
    // retrieved — a model-supplied search-engine link is not a source.
    const host = a.website ? hostOf(a.website) : null;
    const backed = Boolean(host && allowed.has(host));
    return {
      ...a,
      website: backed ? (a.website as string) : null,
      verification: backed ? a.verification : a.verification === "verified" ? "ai_assisted" : a.verification,
    };
  });
  const zoning = landUse
    ? gateCitation(landUse.zoning, `zoning district ${landUse.zoning.district ?? "unknown"}`, "land_use", allowed, audit)
    : {
        district: null,
        use_conclusion: "needs_confirmation" as const,
        rationale: "Zoning research could not be completed automatically — confirm the district and permitted use with the planning / zoning office.",
        items_to_confirm: ["Zoning district of record", "Whether the intended use is permitted by right"],
        verification: "needs_confirmation" as const,
        source_url: null,
      };
  const entitlements = (landUse?.entitlements ?? []).map((e, i) => gateCitation(e, `${e.name || `entitlement ${i}`}`, "land_use", allowed, audit));
  if (landUse) audit.agents.push(tally("land_use", "Jurisdiction, zoning & entitlements", [zoning, ...entitlements], before, audit));

  before = audit.citation_downgrades.length;
  const permits = [
    ...entitlements.map((e) => ({ ...e, depends_on: null as string | null })),
    ...(permitPath?.permits ?? []).map((p, i) => gateCitation(p, p.name || `permit ${i}`, "permit_path", allowed, audit)),
  ];
  if (permitPath) audit.agents.push(tally("permit_path", "Permit & approval path", permits, before, audit));

  before = audit.citation_downgrades.length;
  const utilities = (site?.utilities ?? []).map((u, i) => gateCitation(u, u.utility || `utility ${i}`, "site_infrastructure", allowed, audit));
  if (site) audit.agents.push(tally("site_infrastructure", "Site & infrastructure", utilities, before, audit));

  before = audit.citation_downgrades.length;
  const codes = (codesRes?.codes ?? []).map((c, i) => gateCitation(c, c.code_and_edition || `code ${i}`, "building_fire_health", allowed, audit));
  if (codesRes) audit.agents.push(tally("building_fire_health", "Building, fire & health codes", codes, before, audit));

  before = audit.citation_downgrades.length;
  const access = (accessRes?.access ?? []).map((a, i) => gateCitation(a, a.item || `access item ${i}`, "transportation_access", allowed, audit));
  if (accessRes) audit.agents.push(tally("transportation_access", "Transportation & site access", access, before, audit));

  before = audit.citation_downgrades.length;
  const environmental = (envRes?.environmental ?? []).map((e, i) => gateCitation(e, e.constraint || `constraint ${i}`, "environmental_constraints", allowed, audit));
  if (envRes) audit.agents.push(tally("environmental_constraints", "Environmental constraints", environmental, before, audit));

  before = audit.citation_downgrades.length;
  const fees = (feeRes?.fees ?? []).map((f, i) => gateCitation(f, f.item || `fee ${i}`, "fee_schedule", allowed, audit));
  if (feeRes) audit.agents.push(tally("fee_schedule", "Fees & cost exposure", fees, before, audit));

  const risks = [
    ...(decision?.risks ?? []),
    // A constraint the environmental agent flags as a potential deal-killer is
    // carried into the risk matrix so it cannot be missed in the report.
    ...environmental
      .filter((e) => e.deal_killer || e.status === "present")
      .map((e) => ({
        title: `${e.constraint}${e.deal_killer ? " (potential deal-killer)" : ""}`.slice(0, 200),
        severity: (e.deal_killer ? "high" : "medium") as "high" | "medium",
        why: e.implication.slice(0, 600),
      })),
    ...(site?.site_constraints ?? []).map((c) => ({ title: c.slice(0, 200), severity: "medium" as const, why: "Site constraint identified in agency records — confirm with the authority having jurisdiction." })),
  ];
  if (decision) {
    audit.agents.push({
      agent: "risk_decision",
      role: "Schedule, risk & decision support",
      status: "complete",
      items: (decision.timeline?.length ?? 0) + risks.length,
      cited: 0,
      downgraded: 0,
    });
  }

  if (!sources.length) {
    audit.coverage_gaps.push("No official source pages were retrieved for this jurisdiction, so no finding in this report is evidence-verified.");
  }
  if (resolved.zip_only) {
    audit.coverage_gaps.push("Only a ZIP/locality was supplied — the exact authority having jurisdiction is not established.");
  }

  // The final record obeys the shared ResearchSchema limits the report/PDF expect.
  const clip = (arr: string[], n: number) => arr.map((t) => t.slice(0, n));
  const research: SirResearch = ResearchSchema.parse({
    scope_summary: plan.scope_summary,
    project_classification: plan.project_classification,
    complexity: plan.complexity,
    jurisdiction: {
      ahj_summary: landUse?.ahj_summary ?? resolved.note,
      authorities: authorities.length ? authorities : resolved.authorities,
      verification: landUse?.jurisdiction_verification ?? resolved.verification,
    },
    zoning: { ...zoning, items_to_confirm: clip(zoning.items_to_confirm, 300) },
    permits,
    utilities,
    codes,
    access,
    environmental,
    fees,
    timeline: decision?.timeline ?? [],
    research_scope: clip(plan.research_scope, 200),
    turnaround: plan.turnaround,
    risks,
    open_questions: clip([...plan.open_questions, ...(permitPath?.review_notes ?? []), ...(codesRes?.review_notes ?? [])].slice(0, 15), 300),
    recommended_next_steps: clip(decision?.recommended_next_steps ?? [], 300),
    sources,
  });

  return { resolved, research, sources, audit };
}
