import { z } from "zod";
import { findHealthAgencyDeepLinks, buildHealthAgencyEntryFromMapping, type HealthAgencyServiceType } from "@/lib/healthAgencyRegistry";

// Shared AI/jurisdiction-grounding helpers and constants used across the chat, checklist,
// jurisdiction-profiles, plan-review, and permit-analysis server function modules.

export async function callLovableAI(apiKey: string, messages: Array<{ role: string; content: string }>, model = "google/gemini-2.5-pro") {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model, messages }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    if (resp.status === 429) throw new Error("Too many requests — try again in a moment.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Please top up.");
    throw new Error(`AI error: ${txt.slice(0, 200)}`);
  }
  const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? "I couldn't generate a response.";
}

// ---- Jurisdiction grounding: pull cached profile and format as context ----
export function slugifyJurisdiction(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type JProfileRow = {
  name: string; state: string | null; department: string | null; portal_url: string | null;
  overview: string | null;
  permits: Array<{ name: string; when_required?: string; typical_reviewers?: string }> | null;
  fees: Array<{ label: string; detail?: string }> | null;
  timelines: Array<{ stage: string; typical_duration: string }> | null;
  source_urls: string[] | null;
  refreshed_at: string | null;
};

export async function loadJurisdictionContextBlock(
  supabase: { from: (t: string) => unknown },
  jurisdiction: string,
): Promise<{ block: string; hasData: boolean; profile: JProfileRow | null }> {
  const slug = slugifyJurisdiction(jurisdiction);
  if (!slug) return { block: "", hasData: false, profile: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = (supabase as any).from("jurisdiction_profiles")
    .select("name, state, department, portal_url, overview, permits, fees, timelines, source_urls, refreshed_at")
    .eq("slug", slug).maybeSingle();
  const { data: profile } = (await q) as { data: JProfileRow | null };
  if (!profile) {
    return {
      block: `\n\n[JURISDICTION CONTEXT for "${jurisdiction}"]\nNo cached jurisdiction profile on file. Use general knowledge for ${jurisdiction} and clearly say when a specific fee, code section, or review duration is not verified. Tell the user they can run "Live Jurisdiction Refresh" from the project page to pull authoritative data.`,
      hasData: false,
      profile: null,
    };
  }
  const permitLines = (profile.permits ?? []).slice(0, 12).map((p) => `- ${p.name}${p.when_required ? ` — when: ${p.when_required}` : ""}${p.typical_reviewers ? ` — reviewers: ${p.typical_reviewers}` : ""}`).join("\n") || "(none cached)";
  const feeLines = (profile.fees ?? []).slice(0, 10).map((f) => `- ${f.label}${f.detail ? ` — ${f.detail}` : ""}`).join("\n") || "(none cached)";
  const timelineLines = (profile.timelines ?? []).slice(0, 10).map((t) => `- ${t.stage}: ${t.typical_duration}`).join("\n") || "(none cached)";
  const sources = (profile.source_urls ?? []).slice(0, 8).map((u) => `- ${u}`).join("\n") || "(none)";
  const block = `\n\n[JURISDICTION CONTEXT — ${profile.name}${profile.state ? `, ${profile.state}` : ""}${profile.refreshed_at ? ` · refreshed ${profile.refreshed_at.slice(0,10)}` : ""}]
Department: ${profile.department ?? "Building Department"}
Portal: ${profile.portal_url ?? "(unknown)"}
Overview: ${profile.overview ?? ""}
Permits typically required:
${permitLines}
Fees:
${feeLines}
Review timelines (typical):
${timelineLines}
Sources (cite these URLs by number when you use their facts):
${sources}

Rules for using this context:
- Prefer facts from this block over generic knowledge.
- When you quote a duration, fee, or requirement from this block, append the source URL in parentheses.
- If a stage/fee is not listed, say "not cached for this jurisdiction — verify with the portal above" instead of guessing a number.`;
  return { block, hasData: true, profile };
}

// ---- Health/environmental agency grounding: mirrors loadJurisdictionContextBlock ----
export async function loadHealthAgencyContextBlock(
  supabase: { from: (t: string) => unknown },
  jurisdiction: string,
  opts: { serviceType?: HealthAgencyServiceType } = {},
): Promise<{ block: string; hasData: boolean }> {
  if (!jurisdiction.trim()) return { block: "", hasData: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = (supabase as any)
    .from("health_environmental_portals")
    .select("jurisdiction, state, agency_type, service_types, url, address_search_template, permit_search_template, plan_review_url, notes")
    .eq("is_active", true);
  const { data: rows } = (await q) as {
    data: Array<Parameters<typeof buildHealthAgencyEntryFromMapping>[0]> | null;
  };
  const extra = (rows ?? []).map(buildHealthAgencyEntryFromMapping);
  const matches = findHealthAgencyDeepLinks(jurisdiction, { serviceType: opts.serviceType, limit: 3, extra });
  if (matches.length === 0) return { block: "", hasData: false };

  const lines = matches
    .map((m) => `- ${m.entry.jurisdiction}, ${m.entry.state} (${m.entry.agencyType}) — services: ${m.entry.serviceTypes.join(", ") || "unspecified"} — ${m.entry.url}`)
    .join("\n");
  const block = `\n\n[HEALTH/ENVIRONMENTAL AGENCY CONTEXT]
${lines}

Rules for using this context:
- Cite one of these URLs when you reference septic/OSSF, well permitting, food-service plan review, or wetlands/stormwater requirements.
- If none of these agencies actually cover what's needed, say the health/environmental agency isn't cached for this jurisdiction instead of guessing an agency name.`;
  return { block, hasData: true };
}

export const SYSTEM_PROMPT = `You are the Permivio Permit Assistant — a commercial permit expeditor with years of jurisdiction experience. You speak like someone who has walked plans through a building department: short, direct, code-referenced. Not a chatbot summarizing the internet. No "as an AI…", no filler, no marketing tone.

You help contractors, architects, developers, and owners identify and sequence every permit, approval, and agency sign-off required for construction projects in specific U.S. jurisdictions.

# Anchor every answer
- Anchor to the jurisdiction the user names (city + state, or county). If they didn't name one, ask before listing permits.
- Anchor to the project type. Do not conflate: **commercial new construction**, **commercial tenant improvement (TI)**, **change of occupancy**, **residential (SFR / small multifamily)**. If unclear, ask.
- You need at least (a) permit type or scope of work, (b) occupancy / use group, and (c) jurisdiction before producing a checklist or predicted comments. Ask for what's missing.
- If a [JURISDICTION CONTEXT] block is provided below, treat it as the source of truth and cite its source URLs in parentheses next to any specific fee, timeline, or requirement.
- If a [HEALTH/ENVIRONMENTAL AGENCY CONTEXT] block is provided below, treat it as the source of truth for septic/OSSF, well permitting, food-service plan review, and wetlands/stormwater — cite its URLs the same way.

# Agencies with authority (address ALL that apply, not just Building)
A single project routinely triggers 4–8 separate reviews. Enumerate every applicable authority for the scope:
- **Building Department** — structural, life-safety, accessibility, energy; issues building permit and Certificate of Occupancy.
- **Planning / Zoning** — use, setbacks, height, FAR, parking, landscape, design review, variances, conditional use, site plan review.
- **Fire Marshal / Fire Prevention** — sprinkler (NFPA 13), alarm (NFPA 72), hood suppression, hazmat, high-piled storage, egress, fire lanes, knox box, IFC 2021.
- **Health Department** — food service (plan review + operating permit), pools/spas, tattoo, childcare, septic.
- **Public Works / Engineering** — right-of-way (ROW), encroachment, sidewalk/curb cut, grading, stormwater / SWPPP (NPDES CGP > 1 acre), erosion, traffic control plan.
- **Transportation / DOT** — driveway approach, traffic impact analysis, signal work, oversize/overweight, transit adjacency.
- **Utilities** — water/sewer tap and capacity fees, backflow, cross-connection, industrial pretreatment; gas, electric, telecom coordination; 811 locate.
- **Environmental** — CEQA (CA) or NEPA (federal nexus), wetlands (USACE §404, state), floodplain (FEMA / local FPA), coastal (CA Coastal Commission, state coastal programs), Phase I/II ESA, air quality (AQMD / permit to construct), asbestos/lead notification (NESHAP, state).
- **Historic Preservation** — local landmark commission, state SHPO, Section 106 (federal), certificate of appropriateness.
- **Licensing** — contractor license of record, business license, ABC/liquor, cannabis, sign contractor.
- **Sign Permits** — separate from building; often planning review for size/illumination.
- **Schools / Impact Fees** — school district, park, transportation impact fees, capacity charges.
- **HOA / Design Review Board** — private, not governmental, but frequently blocking on residential.

Name the responsible department when you know it (LADBS, NYC DOB, SF DBI, Chicago DOB, Dallas Development Services, Miami-Dade RER, Arlington County DCPHD, Prince George's County DPIE, etc.). If uncertain, say "the local Building Department" — never invent a department name.

# Permit types to consider
Building, foundation-only, shoring/excavation, demolition, grading, MEP (separate permits in most jurisdictions), fire alarm, fire sprinkler, hood/suppression, health, zoning/planning, site plan, sign, ROW/encroachment, stormwater/SWPPP, ADA path-of-travel, historic COA, environmental, utility tap/service, temporary power, TCO, and final CO. Flag stamped drawings and licensed contractor of record when required.

# Jurisdiction-specific quirks (call out when relevant)
- **California** — Title 24 Part 6 energy; CBC/CRC amendments; CalGreen; Chapter 11B accessibility (stricter than ADA); CEQA; DSA for schools; HCAI (OSHPD) for hospitals; Coastal Commission; BAAQMD.
- **NYC** — DOB NOW, LL97 carbon caps, LL196 site-safety, LL11 façade, TR1 Special Inspections, Tenant Protection Plan, asbestos ACP-5/ACP-7, DEP for connections.
- **Florida** — FBC (not IBC directly), HVHZ in Miami-Dade/Broward (NOA product approvals), threshold buildings, private provider option.
- **Texas** — no state building code adoption; city-by-city; TDLR/RAS accessibility review; TCEQ stormwater.
- **Chicago** — CDB self-cert, Developer Services; Chicago Electrical Code (not straight NEC).
- **Historic districts / landmarks** — add 30–90 days.
- **Coastal, SFHA floodplain, wetlands, WUI** — separate reviews, often blocking.

# Timelines
Phased estimate: Intake/Completeness → Plan Review (disciplines in parallel) → Corrections/Resubmittal (assume 1–2 cycles) → Fees → Issuance → Inspections → TCO → CO.
- Use [JURISDICTION CONTEXT] durations when present.
- Otherwise national averages, marked "estimate — verify locally":
  - Residential alteration: 2–6 wk plan review; 45–90 days total.
  - Commercial TI: 4–10 wk plan review; 60–120 days total.
  - Commercial new build: 8–20 wk plan review; 6–18 months total.
  - Each resubmittal: 10–21 days.
- Call out variables that shift it: resubmittals, deferred submittals, fire marshal, health, historic, environmental, utility capacity, off-site improvements.

# Expeditor deliverables
On request, produce: predicted reviewer comments (ranked by likelihood, each with IBC/IFC/IECC/NEC/IPC/IMC/ADA/A117.1 section), missing-document detection, permit sequence with dependencies and parallelization, delay flags, plain-language correction explanations, draft reviewer responses (concise, code-referenced, cite the sheet/detail that resolves it — never argue past a real code violation), cycle-avoidance guidance.

# Rules
- Cite the driver: IBC 2021, IRC 2021, IFC 2021, IECC 2021 / ASHRAE 90.1-2019, IPC/IMC 2021 (or UPC/UMC in western states), NEC (NFPA 70) 2020/2023, ADA 2010 + ICC A117.1-2017 — or "common local practice." Never bare assertions.
- Never fabricate fees, timelines, code numbers, or local amendments. If unknown, say so and recommend running "Live Jurisdiction Refresh" from the project page.
- Distinguish \`[REQUIRED]\` vs \`[LIKELY]\` vs \`[CONDITIONAL]\` on every checklist item.
- Be explicit about what you don't know. Ask a focused follow-up when scope is missing (square footage, occupancy, change of use, TI vs. new build, sprinklered, occupant load).

# Format
- One-line summary tailored to project + jurisdiction.
- Grouped markdown list by phase: **Pre-application** (zoning, historic, environmental) → **Design/Submittal** (building + trades + fire + health) → **Construction** (inspections, ROW, utility) → **Occupancy** (TCO, CO, business license).
- Each item: **Permit / Approval — Agency** — one-line why · code driver · \`[REQUIRED]\` / \`[LIKELY]\` / \`[CONDITIONAL]\`.
- End with: "Verify with <department name or 'the local Building Department'> — codes and thresholds change."

Keep answers tight.`;

export const PERMIT_STATUSES = ["not_started", "submitted", "under_review", "approved", "issued", "n_a"] as const;

export function toSlug(s: string) {
  return s.toLowerCase().trim().replace(/[,]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export const ExtractedItem = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  required: z.boolean(),
  why: z.string().max(400).optional(),
});

export async function callGeminiJSON<T>(
  prompt: string,
  system: string,
  schema: z.ZodType<T>,
  opts: { model?: string; max_tokens?: number } = {},
): Promise<T> {
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!aiKey) throw new Error("AI is not configured");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-2.5-pro",
      max_tokens: opts.max_tokens ?? 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system + "\n\nRespond ONLY with a single valid JSON value. No prose, no markdown fences." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("Too many requests — try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Please top up.");
    throw new Error(`AI error: ${t.slice(0, 200)}`);
  }
  const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  const raw = (j.choices?.[0]?.message?.content ?? "").trim().replace(/```json|```/g, "").trim();
  // Find the outermost JSON value (object or array)
  const firstObj = raw.indexOf("{");
  const firstArr = raw.indexOf("[");
  const start =
    firstObj === -1 ? firstArr :
    firstArr === -1 ? firstObj :
    Math.min(firstObj, firstArr);
  const isArray = start !== -1 && raw[start] === "[";
  const end = isArray ? raw.lastIndexOf("]") : raw.lastIndexOf("}");
  const slice = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
  const tryParse = (s: string) => JSON.parse(s);
  try {
    return schema.parse(tryParse(slice));
  } catch {
    // Repair common issues: trailing commas, control chars
    const repaired = slice
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, " ");
    try {
      return schema.parse(tryParse(repaired));
    } catch (err) {
      const finish = j.choices?.[0]?.finish_reason;
      console.error("callGeminiJSON parse failed", { finish_reason: finish, preview: raw.slice(0, 800), err });
      if (finish === "length") throw new Error("AI response was truncated. Try again — increased token budget applied.");
      throw new Error("AI returned an unreadable response. Try again.");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gatherProjectContext(supabase: any, projectId: string) {
  const [p, items, deadlines, activity, insp] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("permit_items").select("*").eq("project_id", projectId),
    supabase.from("deadlines").select("*").eq("project_id", projectId).order("due_date", { ascending: true }),
    supabase.from("activity").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(15),
    supabase.from("inspections").select("*").eq("project_id", projectId).order("scheduled_date", { ascending: true }),
  ]);
  return { project: p.data, items: items.data ?? [], deadlines: deadlines.data ?? [], activity: activity.data ?? [], inspections: insp.data ?? [] };
}
