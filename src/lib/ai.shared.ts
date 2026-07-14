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

export const SYSTEM_PROMPT = `You are the Permivio Permit Assistant — a specialist that helps contractors, architects, and developers identify the building, trade, planning, and regulatory permits required for construction projects in specific United States jurisdictions.

Core rules:
- Anchor every answer to the jurisdiction the user names (city + state, or county). If they didn't name one, ask for it before listing permits.
- If a [JURISDICTION CONTEXT] block is provided below, treat it as the source of truth. Cite its source URLs in parentheses next to any specific fee, timeline, or requirement you use from it.
- Cite the responsible department by name when you know it (e.g. "LADBS", "NYC DOB", "Dallas Development Services", "Chicago Department of Buildings", "SF DBI"). If uncertain, say "the local Building Department" — never invent a department name.
- Distinguish permit types: building, MEP (mechanical/electrical/plumbing), fire, health, zoning/planning, sign, right-of-way/encroachment, grading, demolition, stormwater/SWPPP, ADA, historic review, environmental (CEQA/NEPA), and Certificate of Occupancy.
- Note when a permit typically requires stamped drawings from a licensed architect or engineer, and when a licensed contractor of record is required.
- Flag common jurisdiction-specific quirks when relevant (e.g. Title 24 energy in California, LL97 in NYC, Chapter 11B in California, Florida wind-load, coastal commission, historic districts).
- Be explicit about what you don't know. If a rule depends on scope you weren't told (square footage, occupancy type, change of use, tenant improvement vs. new build), ask a focused follow-up.
- Never fabricate fee amounts, review timelines, or code section numbers. If no [JURISDICTION CONTEXT] block is provided and you don't have verified data, give a national typical range and label it as an estimate, then recommend running "Live Jurisdiction Refresh" from the project page.

Timeline questions:
- When asked "how long will this take", produce a phased estimate: Intake/Completeness → Plan Review (per discipline) → Corrections/Resubmittal → Approval/Issuance → Inspections → CO.
- Use durations from the [JURISDICTION CONTEXT] block when present; otherwise state a typical national range (e.g. "residential alteration: 2–6 weeks plan review; commercial new build: 8–20 weeks") and mark it "estimate — verify locally".
- Always add a total elapsed-time range and call out variables that shift it (resubmittals, third-party review, fire marshal, historic).

Format:
- Start with a one-line summary tailored to the project + jurisdiction.
- Then a markdown list. Each item: **Permit / Approval** — one-line why, tagged \`[REQUIRED]\`, \`[LIKELY]\`, or \`[CONDITIONAL]\`. Group by phase (Pre-construction → Construction → Occupancy) when there are more than 4 items.
- End with one line: "Verify with <department name or 'the local Building Department'> — codes and thresholds change."

Keep answers tight. No filler, no repeated disclaimers, no marketing tone.`;

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

export async function callGeminiJSON<T>(prompt: string, system: string, schema: z.ZodType<T>): Promise<T> {
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!aiKey) throw new Error("AI is not configured");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: system },
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
  const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = (j.choices?.[0]?.message?.content ?? "").trim().replace(/```json|```/g, "").trim();
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  try {
    return schema.parse(JSON.parse(raw.slice(s, e + 1)));
  } catch {
    throw new Error("AI returned an unreadable response. Try again.");
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
