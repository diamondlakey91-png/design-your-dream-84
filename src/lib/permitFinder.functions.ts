import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadJurisdictionContextBlock } from "@/lib/ai.shared";
import {
  PERMIT_CATEGORIES,
  type PermitDetermination,
  type PermitFinderReport,
  type PermitFinding,
  type PermitVerification,
} from "@/lib/permitFinder";

const InputSchema = z.object({
  jurisdiction: z.string().min(2).max(200),
  project_type: z.string().min(2).max(160),
  scope: z.string().max(2000).default(""),
  occupancy: z.string().max(160).default(""),
  square_footage: z.string().max(40).default(""),
  existing_building: z.enum(["yes", "no", "unknown"]).default("unknown"),
  change_of_use: z.enum(["yes", "no", "unknown"]).default("unknown"),
  project_id: z.string().uuid().nullable().optional(),
});

const DETERMINATIONS: PermitDetermination[] = [
  "required",
  "likely_required",
  "conditional",
  "likely_not_required",
  "verification_needed",
];
const VERIFICATIONS: PermitVerification[] = ["confirmed_by_source", "ai_assisted", "needs_confirmation"];

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join("; ");
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}
function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean).slice(0, 12);
  const s = str(v);
  return s ? [s] : [];
}
function enumOr<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  const s = str(v).toLowerCase().replace(/[\s-]+/g, "_");
  return (allowed as string[]).includes(s) ? (s as T) : fallback;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("The AI response could not be read. Try again.");
  cleaned = cleaned.slice(s, e + 1);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(cleaned) as Record<string, unknown>;
  }
}

/**
 * Tell us the jurisdiction and project type — get a permit requirement report that
 * covers every permit category, with an explicit determination for each one.
 */
export const findPermitRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PermitFinderReport> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const jc = await loadJurisdictionContextBlock(context.supabase, data.jurisdiction);

    // Live municipal evidence: government boundary data resolves the controlling
    // authority, and official agency pages supply the requirement facts.
    let siteAddress: string | null = null;
    if (data.project_id) {
      const { data: proj } = await context.supabase
        .from("projects").select("location").eq("id", data.project_id).maybeSingle();
      siteAddress = (proj?.location as string | null) ?? null;
    }
    const { gatherMunicipalEvidence } = await import("@/lib/liveMunicipalEvidence.server");
    const live = await gatherMunicipalEvidence({
      jurisdiction: data.jurisdiction,
      address: siteAddress,
      topics: ["permit_requirements", "adopted_codes", "zoning", "fire", "health", "site_utilities", "inspections_co"],
    }).catch(() => null);

    const categoryList = PERMIT_CATEGORIES.map(
      (c) => `- ${c.key} | ${c.label} | typical authority family: ${c.authority}`,
    ).join("\n");

    const sys = `You are the Permivio Permit Requirement Finder, a research tool used by permit expediters, contractors, architects and developers.

Return ONE JSON object. No prose, no markdown fences.

ABSOLUTE COVERAGE RULE: findings[] MUST contain exactly one entry for EVERY category key listed by the user, in the same order. Never omit a category. If a category clearly does not apply, still return it with determination "likely_not_required" and explain why in one short sentence.

Vocabulary (use exactly these values):
determination: "required" | "likely_required" | "conditional" | "likely_not_required" | "verification_needed"
verification: "confirmed_by_source" (the fact appears in the JURISDICTION CONTEXT block) | "ai_assisted" (general code/practice knowledge) | "needs_confirmation" (jurisdiction-specific and unknown)

JSON shape:
{
  "assumptions": string[],
  "findings": [ { "category_key": string, "determination": string, "verification": string, "agency": string, "why": string, "triggers": string, "typical_documents": string[], "sequence_note": string, "open_questions": string } ],
  "sequence": [ { "step": number, "stage": string, "depends_on": string, "note": string } ],
  "missing_info": string[],
  "confirm_with_agency": string[],
  "sources": [ { "title": string, "url": string, "official": boolean } ]
}

Rules:
- Use "confirmed_by_source" ONLY for facts present in [JURISDICTION CONTEXT]. Everything else is "ai_assisted" or "needs_confirmation".
- Never invent fees, URLs, contacts, code amendments, or review durations. If no verified source exists, return sources: [].
- Never state that a project is code compliant, approved, or that no permits are needed. Determinations are research, not agency determinations.
- Name the agency generically (e.g. "Fire Marshal") unless the context block names the actual department.
- "triggers" states the condition that makes the permit apply (thresholds, occupancy, scope traits).
- Base national code references on IBC/IRC/IFC/IECC/IPC/IMC/NEC 2021-era model codes and say the local amendments must be confirmed.`;

    const user = `JURISDICTION: ${data.jurisdiction}
PROJECT TYPE: ${data.project_type}
SCOPE OF WORK: ${data.scope || "(not provided)"}
OCCUPANCY / BUSINESS TYPE: ${data.occupancy || "(not provided)"}
APPROX SIZE: ${data.square_footage || "(not provided)"}
EXISTING BUILDING ON SITE: ${data.existing_building}
CHANGE OF USE: ${data.change_of_use}

CATEGORY KEYS — return one finding for each, in this order:
${categoryList}
${jc.block}

Produce the JSON object now.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Too many requests right now — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to continue.");
      if (res.status === 403) throw new Error("AI access is blocked for this workspace.");
      throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = extractJsonObject(json.choices?.[0]?.message?.content ?? "");

    const rawFindings = Array.isArray(parsed["findings"]) ? (parsed["findings"] as Record<string, unknown>[]) : [];
    const byKey = new Map<string, Record<string, unknown>>();
    for (const f of rawFindings) {
      const key = str(f["category_key"]);
      if (key && !byKey.has(key)) byKey.set(key, f);
    }

    // Structural completeness: every category appears, whether or not the model returned it.
    const findings: PermitFinding[] = PERMIT_CATEGORIES.map((cat) => {
      const f = byKey.get(cat.key);
      if (!f) {
        return {
          category_key: cat.key,
          category_label: cat.label,
          group: cat.group,
          determination: "verification_needed",
          verification: "needs_confirmation",
          agency: cat.authority,
          why: "This category was not addressed in the research pass, so it is reported as unresolved rather than dropped.",
          triggers: "",
          typical_documents: [],
          sequence_note: "",
          open_questions: `Confirm with the ${cat.authority} whether this applies to the project.`,
        };
      }
      return {
        category_key: cat.key,
        category_label: cat.label,
        group: cat.group,
        determination: enumOr(f["determination"], DETERMINATIONS, "verification_needed"),
        verification: enumOr(f["verification"], VERIFICATIONS, "needs_confirmation"),
        agency: str(f["agency"], cat.authority) || cat.authority,
        why: str(f["why"]),
        triggers: str(f["triggers"]),
        typical_documents: strList(f["typical_documents"]),
        sequence_note: str(f["sequence_note"]),
        open_questions: str(f["open_questions"]),
      };
    });

    const rawSeq = Array.isArray(parsed["sequence"]) ? (parsed["sequence"] as Record<string, unknown>[]) : [];
    const sequence = rawSeq.slice(0, 20).map((s, i) => ({
      step: typeof s["step"] === "number" ? (s["step"] as number) : i + 1,
      stage: str(s["stage"]),
      depends_on: str(s["depends_on"]),
      note: str(s["note"]),
    })).filter((s) => s.stage);

    const rawSources = Array.isArray(parsed["sources"]) ? (parsed["sources"] as Record<string, unknown>[]) : [];
    const sources = rawSources
      .map((s) => ({ title: str(s["title"]), url: str(s["url"]), official: s["official"] === true }))
      .filter((s) => /^https?:\/\//i.test(s.url))
      .slice(0, 12);

    return {
      jurisdiction: data.jurisdiction,
      project_type: data.project_type,
      scope: data.scope,
      assumptions: strList(parsed["assumptions"]),
      findings,
      sequence,
      missing_info: strList(parsed["missing_info"]),
      confirm_with_agency: strList(parsed["confirm_with_agency"]),
      sources,
      jurisdiction_data_on_file: jc.hasData,
      generated_at: new Date().toISOString(),
    };
  });
