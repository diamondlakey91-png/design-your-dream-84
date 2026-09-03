// Server-only research pipeline for public Site Investigation Report requests.
// Confirms the AHJ stack, then researches zoning, permits, utilities and timeline
// from official sources and produces the scope-confirmation record that
// auto-populates the request's report shell.
//
// Nothing here asserts a jurisdiction determination: every element carries a
// verification level and unresolved items are marked needs_confirmation.

import { z } from "zod";
import { geocode } from "@/lib/geocoding.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";
import { callGeminiJSON } from "@/lib/ai.shared";
import { buildMdVaAuthorities, canonicalMdVaLocality, isMdVaLocality } from "@/lib/mdVaAuthorities";

export const SIR_RESEARCH_MODEL = "google/gemini-2.5-pro";

// Models frequently return free-text verification wording ("confirmed via official
// website"). Normalise defensively and default to the most conservative label so a
// wording variation never fails the whole research pass.
export const Verification = z.preprocess((v) => {
  const s = String(v ?? "").toLowerCase();
  if (s === "verified" || s === "ai_assisted" || s === "needs_confirmation") return s;
  if (/(confirm|verified|official|published)/.test(s) && !/(needs|require|unconfirmed|pending)/.test(s)) return "verified";
  if (/(ai|inferred|estimate|likely|analysis)/.test(s)) return "ai_assisted";
  return "needs_confirmation";
}, z.enum(["verified", "ai_assisted", "needs_confirmation"])) as unknown as z.ZodType<"verified" | "ai_assisted" | "needs_confirmation">;

/** Lenient enum: normalises free-text values, falling back to a safe default. */
export function looseEnum<T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) {
  return z.preprocess((v) => {
    const s = String(v ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return (values as readonly string[]).includes(s) ? s : fallback;
  }, z.enum(values)) as unknown as z.ZodType<T[number]>;
}

/** Lenient text: models sometimes return arrays where a sentence was requested. */
export const looseText = (max: number) =>
  z.preprocess((v) => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map((x) => String(x)).join("; ").slice(0, max);
    if (typeof v === "object") return JSON.stringify(v).slice(0, max);
    return String(v).slice(0, max);
  }, z.string().max(max).nullable()) as unknown as z.ZodType<string | null>;

export const AuthoritySchema = z.object({
  role: z.string().max(60),
  official_name: z.string().max(200),
  responsibility: z.string().max(400),
  website: looseText(400).optional(),
  verification: Verification,
});


export const ResearchSchema = z.object({
  scope_summary: z.string(),
  project_classification: z.string(),
  complexity: looseEnum(["simple", "moderate", "complex", "major"] as const, "moderate"),
  jurisdiction: z.object({
    ahj_summary: z.string(),
    authorities: z.array(AuthoritySchema).max(20),
    verification: Verification,
  }),
  zoning: z.object({
    district: looseText(160),
    use_conclusion: looseEnum(["likely_permitted", "conditional", "potentially_not_permitted", "needs_confirmation"] as const, "needs_confirmation"),
    rationale: z.string(),
    items_to_confirm: z.array(z.string().max(300)).max(12),
    verification: Verification,
    source_url: looseText(500).optional(),
  }),
  permits: z.array(z.object({
    name: z.string().max(160),
    agency: z.string().max(160),
    category: z.string().max(60),
    likelihood: looseEnum(["required", "likely", "conditional", "not_required"] as const, "conditional"),
    depends_on: looseText(200).optional(),
    notes: looseText(600).optional(),
    verification: Verification,
    source_url: looseText(500).optional(),
  })).max(30),
  utilities: z.array(z.object({
    utility: z.string().max(80),
    provider: looseText(160),
    coordination_required: z.string().max(600),
    verification: Verification,
    source_url: looseText(500).optional(),
  })).max(12),
  codes: z.array(z.object({
    discipline: z.string().max(80),
    code_and_edition: z.string().max(200),
    applies_because: z.string().max(600),
    verification: Verification,
    source_url: looseText(500).optional(),
  })).max(14).optional(),
  access: z.array(z.object({
    item: z.string().max(160),
    authority: looseText(160),
    requirement: z.string().max(600),
    verification: Verification,
    source_url: looseText(500).optional(),
  })).max(12).optional(),
  environmental: z.array(z.object({
    constraint: z.string().max(160),
    status: looseEnum(["present", "possible", "not_indicated", "needs_confirmation"] as const, "needs_confirmation"),
    implication: z.string().max(600),
    deal_killer: z.boolean().optional(),
    verification: Verification,
    source_url: looseText(500).optional(),
  })).max(14).optional(),
  fees: z.array(z.object({
    item: z.string().max(160),
    agency: looseText(160),
    amount_or_basis: z.string().max(300),
    verification: Verification,
    source_url: looseText(500).optional(),
  })).max(16).optional(),
  timeline: z.array(z.object({
    phase: z.string().max(160),
    duration: z.string().max(80),
    depends_on: looseText(200).optional(),
    long_lead: z.boolean().optional(),
    critical_path: z.boolean().optional(),
  })).max(20),
  research_scope: z.array(z.string().max(200)).max(24),
  turnaround: z.string().max(200),
  risks: z.array(z.object({
    title: z.string().max(200),
    severity: looseEnum(["low", "medium", "high"] as const, "medium"),
    why: z.string().max(600),
  })).max(15),
  open_questions: z.array(z.string().max(300)).max(15),
  recommended_next_steps: z.array(z.string().max(300)).max(12),
  sources: z.array(z.object({ url: z.string().max(500), title: z.string().max(300) })).max(30),
  // Only produced for the Project Feasibility Report product: the go / no-go
  // verdict the Feasibility & Decision agent derives from the same evidence.
  feasibility: z
    .object({
      rating: looseEnum(["green", "yellow", "orange", "red", "gray"] as const, "gray"),
      recommendation: looseEnum(
        ["proceed", "proceed_with_conditions", "further_investigation_required", "high_risk", "not_recommended"] as const,
        "further_investigation_required",
      ),
      rationale: z.string().max(1500),
      deal_killers: z
        .array(z.object({ title: z.string().max(200), why: z.string().max(600), verification: Verification }))
        .max(10),
      conditions_to_proceed: z.array(z.string().max(300)).max(12),
      cost_schedule_exposure: z.array(z.string().max(300)).max(10),
    })
    .optional(),

});

export type SirResearch = z.infer<typeof ResearchSchema>;

export type ResolvedJurisdiction = {
  formatted_address: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  locality: string | null;
  incorporated: boolean;
  geocode_precision: string | null;
  zip_only: boolean;
  authorities: Array<{ role: string; official_name: string; responsibility: string; website?: string | null; verification: string }>;
  verification: "verified" | "ai_assisted" | "needs_confirmation";
  note: string;
};

/** Resolve the AHJ stack from the submitted address / locality text. Never ZIP-only. */
export async function resolveSirJurisdiction(input: { siteAddress?: string | null; jurisdiction: string }): Promise<ResolvedJurisdiction> {
  const query = [input.siteAddress, input.jurisdiction].filter(Boolean).join(", ");
  const base: ResolvedJurisdiction = {
    formatted_address: null,
    city: null,
    county: null,
    state: null,
    zip: null,
    lat: null,
    lng: null,
    locality: null,
    incorporated: false,
    geocode_precision: null,
    zip_only: false,
    authorities: [],
    verification: "needs_confirmation",
    note: "Jurisdiction could not be resolved automatically — confirm the authorities having jurisdiction before relying on this scope.",
  };

  let g;
  try {
    g = await geocode(query);
  } catch (err) {
    return { ...base, note: `Address lookup unavailable (${(err as Error).message}). Jurisdiction needs confirmation.` };
  }

  const county = (g.components.county ?? "").replace(/\s+County$/i, "") || null;
  const city = g.components.locality ?? g.components.sublocality ?? null;
  const state = g.components.state_code ?? null;
  const zipOnly = !input.siteAddress && !city && !county;

  const locality = state ? (county ? canonicalMdVaLocality(state, county) : null) ?? (city ? canonicalMdVaLocality(state, city) : null) ?? county : null;

  const authorities =
    state && locality && isMdVaLocality(state, locality)
      ? buildMdVaAuthorities(state, locality, city).map((a) => ({
          role: a.role,
          official_name: a.official_name,
          responsibility: a.responsibility,
          website: a.website ?? null,
          verification: a.verification,
        }))
      : [];

  return {
    formatted_address: g.formatted_address,
    city,
    county,
    state,
    zip: g.components.postal_code ?? null,
    lat: g.lat,
    lng: g.lng,
    locality,
    incorporated: Boolean(city),
    geocode_precision: g.location_type,
    zip_only: zipOnly,
    authorities,
    verification: authorities.length > 0 ? "ai_assisted" : "needs_confirmation",
    note: zipOnly
      ? "Only a ZIP/locality was provided — the exact AHJ must be confirmed with a street address before research is finalized."
      : authorities.length > 0
        ? "Authority stack generated from Permivio's jurisdiction library. Confirm each office with the agency."
        : "Authority stack outside Permivio's curated coverage — offices below are AI-identified and need agency confirmation.",
  };
}

export async function gatherOfficialResearch(args: { locality: string; state: string; address: string; use: string }) {
  const key = process.env['FIRECRAWL_API_KEY'];
  const sources: Array<{ url: string; title: string }> = [];
  if (!key) return { context: "", sources };
  const { locality, state, address, use } = args;
  const queries = [
    `"${locality}" ${state} zoning ordinance permitted uses district site:.gov`,
    `"${locality}" ${state} building permit application requirements site:.gov`,
    `"${locality}" ${state} site plan / site development review process site:.gov`,
    `"${locality}" ${state} fire marshal plan review health department food service plan review site:.gov`,
    `"${locality}" ${state} water sewer utility service availability connection new development`,
    `"${locality}" ${state} plan review timeline how long permit review takes site:.gov`,
    `"${locality}" ${state} ${use} permit requirements site:.gov`,
    address ? `${address} parcel zoning property assessment` : `"${locality}" ${state} parcel viewer GIS zoning map`,
  ];
  const hits = (await Promise.all(queries.map((q) => firecrawlSearch(key, q, 3).catch(() => [])))).flat();
  const seen = new Set<string>();
  const targets = hits
    .filter((h) => {
      if (!h.url || seen.has(h.url)) return false;
      seen.add(h.url);
      return true;
    })
    .slice(0, 10);
  const chunks = await Promise.all(
    targets.map(async (t) => {
      try {
        const s = await firecrawlScrape(key, t.url);
        return `SOURCE: ${t.url}\nTITLE: ${t.title ?? ""}\n${s.markdown.slice(0, 2600)}`;
      } catch {
        return `SOURCE: ${t.url}\nTITLE: ${t.title ?? ""}\nDESC: ${t.description ?? ""}`;
      }
    }),
  );
  for (const t of targets) sources.push({ url: t.url, title: t.title ?? "" });
  return { context: chunks.join("\n\n---\n\n"), sources };
}

export type SirRequestRow = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  project_stage: string | null;
  site_address: string | null;
  jurisdiction: string;
  parcel_apn: string | null;
  approx_size: string | null;
  intended_use: string;
  existing_building: string | null;
  report_needed: string | null;
  target_date: string | null;
  notes: string | null;
  /** Which product this brief produces; feasibility adds the go/no-go pass. */
  report_kind?: string | null;
};

/** Full research pass for one request: jurisdiction → official sources → structured scope. */
export async function researchSirRequestRow(row: SirRequestRow): Promise<{
  resolved: ResolvedJurisdiction;
  research: SirResearch;
  sources: Array<{ url: string; title: string }>;
}> {
  const resolved = await resolveSirJurisdiction({ siteAddress: row.site_address, jurisdiction: row.jurisdiction });

  const locality = resolved.locality ?? resolved.county ?? resolved.city ?? row.jurisdiction;
  const state = resolved.state ?? "";
  const address = resolved.formatted_address ?? row.site_address ?? "";

  const { context: research, sources } = await gatherOfficialResearch({
    locality,
    state,
    address,
    use: row.intended_use.slice(0, 120),
  });

  const result = await callGeminiJSON(
    `Confirm the research scope for a PERMIVIO Site Investigation Report request.

SITE ADDRESS: ${address || "not provided"}
CLIENT-STATED JURISDICTION: ${row.jurisdiction}
RESOLVED JURISDICTION: city=${resolved.city ?? "?"} · county=${resolved.county ?? "?"} · state=${state || "?"} · geocode precision=${resolved.geocode_precision ?? "unknown"}${resolved.zip_only ? " · ZIP-ONLY (exact AHJ NOT established)" : ""}
PERMIVIO AUTHORITY STACK (use these offices when listed; do not rename them):
${resolved.authorities.length ? resolved.authorities.map((a) => `- ${a.role}: ${a.official_name}${a.website ? ` (${a.website})` : ""}`).join("\n") : "(none on file — identify likely offices and mark them needs_confirmation)"}
PARCEL / APN: ${row.parcel_apn ?? "unknown"}
APPROX BUILDING / SITE SIZE: ${row.approx_size ?? "unknown"}
EXISTING BUILDING ON SITE: ${row.existing_building ?? "unknown"}
INTENDED USE / SCOPE: ${row.intended_use}
PROJECT STAGE: ${row.project_stage ?? "unknown"} · CLIENT ROLE: ${row.role ?? "unknown"}
REPORT REQUESTED: ${row.report_needed ?? "not specified"} · TARGET MILESTONE: ${row.target_date ?? "not specified"}
ADDITIONAL RESEARCH NOTES: ${row.notes ?? "none"}

OFFICIAL RESEARCH EXCERPTS (cite only these URLs):
${research.slice(0, 14000) || "(no research retrieved — mark jurisdiction-specific items needs_confirmation)"}

RULES:
- Never state a zoning determination as final. Use likely_permitted / conditional / potentially_not_permitted / needs_confirmation.
- Never invent a zoning district, parcel number, flood zone, setback, fee, utility capacity, contact or ordinance section. Unknown = needs_confirmation.
- Utility capacity is never confirmed without a written availability letter from the provider. Say so.
- Never say "code compliant", "guaranteed feasible", "plans approved" or "engineering approved".
- Timelines are project-specific estimates, not published commitments. No generic 30-90 day ranges.
- Every authority, permit, zoning conclusion and utility carries a verification level.
- research_scope is the list of research categories this report will actually cover for this jurisdiction and use.
- turnaround is a conservative business-day range with the caveat that it depends on agency responsiveness.

Return JSON: { "scope_summary": "", "project_classification": "", "complexity": "simple|moderate|complex|major", "jurisdiction": {"ahj_summary":"","authorities":[{"role":"","official_name":"","responsibility":"","website":null,"verification":""}],"verification":""}, "zoning": {"district":null,"use_conclusion":"","rationale":"","items_to_confirm":[],"verification":""}, "permits": [{"name":"","agency":"","category":"","likelihood":"","depends_on":null,"notes":null,"verification":""}], "utilities": [{"utility":"","provider":null,"coordination_required":"","verification":""}], "timeline": [{"phase":"","duration":"","depends_on":null,"long_lead":false,"critical_path":false}], "research_scope": [], "turnaround": "", "risks": [{"title":"","severity":"","why":""}], "open_questions": [], "recommended_next_steps": [], "sources": [{"url":"","title":""}] }`,
    "You are a commercial permit expeditor and land development consultant. You never fabricate GIS data, parcel boundaries, zoning classifications, ordinance citations, fees or utility capacity, and you never present your analysis as a jurisdiction determination, survey, engineering opinion or legal advice.",
    ResearchSchema,
    { model: SIR_RESEARCH_MODEL, max_tokens: 9000 },
  );

  const merged = new Map<string, { url: string; title: string }>();
  for (const s of [...sources, ...result.sources]) if (s.url) merged.set(s.url, { url: s.url, title: s.title ?? "" });

  return { resolved, research: result, sources: Array.from(merged.values()) };
}
