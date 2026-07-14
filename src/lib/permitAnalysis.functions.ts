import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { loadJurisdictionContextBlock, type JProfileRow } from "@/lib/ai.shared";


// ============= Permit Analysis (Structured Roadmap) =============

const PermitIntakeSchema = z.object({
  project_name: z.string().min(1).max(200),
  address: z.string().max(300).default(""),
  city: z.string().max(120).default(""),
  county: z.string().max(120).default(""),
  state: z.string().max(60).default(""),
  zip: z.string().max(20).default(""),
  property_type: z.enum(["commercial", "residential", "mixed"]).default("commercial"),
  project_type: z.string().max(80).default(""),
  scope: z.string().max(4000).default(""),
  occupancy_type: z.string().max(160).default(""),
  square_footage: z.string().max(40).default(""),
  construction_value: z.string().max(40).default(""),
  existing_use: z.string().max(160).default(""),
  proposed_use: z.string().max(160).default(""),
  target_construction_date: z.string().max(40).default(""),
  target_opening_date: z.string().max(40).default(""),
  client: z.string().max(160).default(""),
  property_owner: z.string().max(160).default(""),
  general_contractor: z.string().max(160).default(""),
  architect: z.string().max(160).default(""),
  engineer: z.string().max(160).default(""),
  jurisdiction: z.string().max(200).default(""),
  existing_permit_number: z.string().max(120).default(""),
  project_id: z.string().uuid().nullable().optional(),
});
export type PermitIntake = z.infer<typeof PermitIntakeSchema>;

function extractJsonObject(raw: string): unknown {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const s = cleaned.search(/[\{\[]/);
  const e = cleaned.lastIndexOf(cleaned[s] === "[" ? "]" : "}");
  if (s === -1 || e === -1) throw new Error("No JSON in AI response");
  cleaned = cleaned.slice(s, e + 1);
  try { return JSON.parse(cleaned); }
  catch {
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(cleaned);
  }
}

export const generatePermitAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PermitIntakeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");

    const jurisdictionText = data.jurisdiction || [data.city, data.county, data.state].filter(Boolean).join(", ");
    const jc = jurisdictionText
      ? await loadJurisdictionContextBlock(context.supabase, jurisdictionText)
      : { block: "", hasData: false, profile: null as JProfileRow | null };

    const intakeBlock = `PROJECT INTAKE
Name: ${data.project_name}
Address: ${data.address}
City / County / State / ZIP: ${data.city} / ${data.county} / ${data.state} / ${data.zip}
Property type: ${data.property_type}
Project type / scope category: ${data.project_type}
Scope of work: ${data.scope}
Occupancy / business type: ${data.occupancy_type}
Square footage: ${data.square_footage}
Estimated construction value: ${data.construction_value}
Existing use → Proposed use: ${data.existing_use} → ${data.proposed_use}
Target construction / opening: ${data.target_construction_date} / ${data.target_opening_date}
Client / Owner / GC / Architect / Engineer: ${data.client} / ${data.property_owner} / ${data.general_contractor} / ${data.architect} / ${data.engineer}
Known jurisdiction: ${data.jurisdiction}
Existing permit number: ${data.existing_permit_number}`;

    const sys = `You are the Permivio Permit Assistant, an organizational research tool for permit expediters, contractors, architects, developers, and franchise teams.

Return a single JSON object. No prose, no markdown fences. Every field must be present (use [] when empty). Never invent fees, contacts, links, or timelines. If a jurisdiction fact is not in the [JURISDICTION CONTEXT] block, mark verification_status as "verification_needed".

Verification status vocabulary (use exactly one): "likely_required", "possibly_required", "confirmed_by_source", "verification_needed", "insufficient_info".
Priority vocabulary: "critical", "high", "medium", "low".
Severity vocabulary: "red", "amber", "info".

JSON shape:
{
  "summary": { "project_name": string, "address": string, "jurisdiction": string, "project_type": string, "scope": string, "proposed_use": string, "assumptions": string[] },
  "permits": [ { "name": string, "agency": string, "why": string, "status": string, "priority": string, "dependency": string, "verification_status": string } ],
  "documents": [ { "name": string, "responsible_party": string, "required": boolean, "status": string, "notes": string } ],
  "agencies": [ { "name": string, "department": string, "role": string, "contact": string, "portal": string, "verified_date": string, "source": string } ],
  "sequence": [ { "step": number, "stage": string, "status": string, "responsible_party": string, "dependency": string, "notes": string } ],
  "inspections": [ { "type": string, "agency": string, "when": string, "prerequisites": string, "verification_status": string } ],
  "risks": [ { "title": string, "detail": string, "severity": string } ],
  "next_actions": [ { "action": string, "responsible_party": string, "priority": string, "suggested_due_date": string, "related_permit": string, "reason": string } ],
  "sources": [ { "title": string, "agency": string, "url": string, "date_accessed": string, "last_verified": string, "official": boolean } ],
  "missing_info": string[],
  "follow_up_questions": string[]
}

Rules:
- Prefer facts from [JURISDICTION CONTEXT] when present; cite the URL in the sources[] array.
- If no verified source exists, leave sources[] empty (the UI will show a "not verified" notice). Do not fabricate URLs.
- Cover all applicable permit categories that could apply: zoning/use, building, demolition, mechanical, electrical, plumbing, fire, health, sign, right-of-way, utility, business license, CO / TCO, environmental, elevator, hood suppression, grease interceptor.
- If key intake fields are missing (jurisdiction, scope, sqft, use change), reflect that in missing_info[] and follow_up_questions[] and mark permits verification_needed.`;

    const user = `${intakeBlock}${jc.block}\n\nProduce the JSON object now.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
    }
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content ?? "";
    const analysis = extractJsonObject(raw) as Record<string, unknown>;

    const { data: row, error } = await context.supabase
      .from("permit_analyses")
      .insert({
        user_id: context.userId,
        project_id: data.project_id ?? null,
        title: data.project_name,
        intake: data as unknown as Record<string, string>,
        analysis: analysis as unknown as Record<string, string>,
        jurisdiction: jurisdictionText,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });


export const listPermitAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("permit_analyses")
      .select("id, title, jurisdiction, project_id, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getPermitAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("permit_analyses").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Analysis not found");
    return row;
  });

export const attachAnalysisToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ analysis_id: z.string().uuid(), project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("permit_analyses").update({ project_id: data.project_id }).eq("id", data.analysis_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const analysisToChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ analysis_id: z.string().uuid(), project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: a } = await context.supabase.from("permit_analyses").select("*").eq("id", data.analysis_id).maybeSingle();
    if (!a) throw new Error("Analysis not found");
    const aAny = a as unknown as { analysis?: { permits?: Array<Record<string, string>>; documents?: Array<Record<string, unknown>> }; title?: string };
    const permits = aAny.analysis?.permits ?? [];
    const documents = aAny.analysis?.documents ?? [];
    const rows: Array<{ user_id: string; project_id: string; name: string; category: string; status: string; required: boolean; notes: string; sort_order: number }> = [];

    permits.forEach((p, i) => {
      rows.push({
        user_id: context.userId,
        project_id: data.project_id,
        name: p.name || "Permit",
        category: "Permit",
        status: "pending",
        required: (p.verification_status || "").includes("required") || p.priority === "critical",
        notes: `${p.agency ? p.agency + " · " : ""}${p.why || ""} [${p.verification_status || "verification_needed"}]`,
        sort_order: i,
      });
    });
    documents.forEach((d, i) => {
      rows.push({
        user_id: context.userId,
        project_id: data.project_id,
        name: String(d.name ?? "Document"),
        category: "Document",
        status: "pending",
        required: Boolean(d.required),
        notes: String(d.notes ?? d.responsible_party ?? ""),
        sort_order: permits.length + i,
      });
    });
    if (rows.length) {
      const { error } = await context.supabase.from("permit_items").insert(rows);
      if (error) throw new Error(error.message);
    }
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Imported ${rows.length} items from permit analysis "${aAny.title ?? ""}".`,
    });
    return { count: rows.length };
  });

export const analysisToDeadlines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ analysis_id: z.string().uuid(), project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: a } = await context.supabase.from("permit_analyses").select("*").eq("id", data.analysis_id).maybeSingle();
    if (!a) throw new Error("Analysis not found");
    const aAny = a as unknown as { analysis?: { next_actions?: Array<Record<string, string>> } };
    const actions = aAny.analysis?.next_actions ?? [];

    const today = new Date();
    const rows = actions.map((act, i) => {
      let due = act.suggested_due_date;
      if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        const d = new Date(today); d.setDate(d.getDate() + (i + 1) * 7);
        due = d.toISOString().slice(0, 10);
      }
      return {
        user_id: context.userId,
        project_id: data.project_id,
        title: act.action || "Follow-up action",
        due_date: due,
      };
    });
    if (rows.length) {
      const { error } = await context.supabase.from("deadlines").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { count: rows.length };
  });
