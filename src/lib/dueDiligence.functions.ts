import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGeminiJSON } from "@/lib/ai.shared";
import {
  QUESTIONS,
  pickQuestions,
  type AnswerChoice,
} from "@/lib/intakeQuestions";
import type { FriendlyProjectType } from "@/lib/projectTypeMap";
import { FRIENDLY_PROJECT_TYPES } from "@/lib/projectTypeMap";

// ---------------- Report shape (versioned) ----------------
export const DUE_DILIGENCE_VERSION = "dd-v1";
export const DUE_DILIGENCE_MODEL = "google/gemini-3.6-flash";

const Verification = z.enum(["verified", "ai_assisted", "needs_confirmation"]);

const Line = z.object({
  label: z.string().min(1).max(240),
  detail: z.string().max(600).optional().nullable(),
  verification: Verification,
  source: z.string().max(240).optional().nullable(),
});

export const DueDiligenceSchema = z.object({
  version: z.string().default(DUE_DILIGENCE_VERSION),
  overview: z.object({
    project_type_label: z.string(),
    plain_summary: z.string().max(1500),
    jurisdiction_line: z.string(),
    verification: Verification,
  }),
  key_facts: z.array(Line).max(20),
  agencies: z.array(Line).max(15),
  likely_approvals: z.array(Line).max(20),
  required_documents: z.array(Line).max(25),
  inspections: z.array(Line).max(20),
  sequencing: z.array(z.object({
    step: z.number().int(),
    title: z.string(),
    detail: z.string().max(500).optional().nullable(),
    verification: Verification,
  })).max(15),
  risks: z.array(Line).max(15),
  open_questions: z.array(z.object({
    question: z.string(),
    why: z.string().max(300).optional().nullable(),
  })).max(15),
  next_steps: z.array(z.object({
    title: z.string(),
    detail: z.string().max(400).optional().nullable(),
  })).max(10),
});

export type DueDiligenceReport = z.infer<typeof DueDiligenceSchema>;

// ---------------- Helpers ----------------
function friendlyLabel(v: string | null | undefined): string {
  const hit = FRIENDLY_PROJECT_TYPES.find((f) => f.v === v);
  return hit?.label ?? "Project";
}

function buildAgencyBase(
  jur: {
    municipality: string | null;
    county: string | null;
    state: string | null;
    incorporated: boolean;
    confirmed: boolean;
    authorities: Array<{ role: string; official_name: string }>;
  } | null,
): Array<z.infer<typeof Line>> {
  if (!jur) return [];
  const verification = jur.confirmed ? "verified" : "needs_confirmation";
  const rows: Array<z.infer<typeof Line>> = [];
  if (jur.authorities?.length) {
    for (const a of jur.authorities) {
      rows.push({
        label: a.official_name,
        detail: a.role,
        verification,
        source: null,
      });
    }
  }
  return rows;
}

function humanQuestion(key: string): string {
  return QUESTIONS.find((q) => q.key === key)?.prompt ?? key;
}

// ---------------- Generate ----------------
export const generateDueDiligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: proj } = await supabase
      .from("projects")
      .select("id, user_id, location")
      .eq("id", data.project_id)
      .maybeSingle();
    if (!proj || proj.user_id !== userId) throw new Error("Project not found");

    const { data: scope } = await supabase
      .from("scope_of_work")
      .select("*")
      .eq("project_id", data.project_id)
      .maybeSingle();
    if (!scope) throw new Error("Complete the intake first.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopeAny = scope as any;
    const friendly = (scopeAny.friendly_project_type ?? null) as FriendlyProjectType | null;
    const plainScope: string = scopeAny.plain_scope ?? scopeAny.scope_text ?? "";

    // Load intake answers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: answerRows } = await (supabase.from("intake_answers") as any)
      .select("question_key, answer_choice, answer_value")
      .eq("project_id", data.project_id);
    const answers: Record<string, AnswerChoice | string | undefined> = {};
    for (const r of (answerRows ?? []) as Array<{
      question_key: string; answer_choice: string | null; answer_value: string | null;
    }>) {
      if (r.answer_choice) answers[r.question_key] = r.answer_choice as AnswerChoice;
      else if (r.answer_value) answers[r.question_key] = r.answer_value;
    }

    // Load confirmed jurisdiction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: confirmation } = await (supabase.from("jurisdiction_confirmations") as any)
      .select("*, jurisdictions!left(state, county, municipality, incorporated)")
      .eq("project_id", data.project_id)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = confirmation;
    const j = c?.jurisdictions ?? null;
    const confirmed = c?.status === "user_confirmed" || c?.status === "human_verified";
    const authorities: Array<{ role: string; official_name: string }> =
      Array.isArray(c?.overrides?.authorities) ? c.overrides.authorities : [];
    const jurCtx = j
      ? {
          municipality: (j.municipality as string | null) ?? null,
          county: (j.county as string | null) ?? null,
          state: (j.state as string | null) ?? null,
          incorporated: !!j.incorporated,
          confirmed,
          authorities,
        }
      : null;

    // ------- Deterministic base (marked "verified" when we truly know) -------
    const juris_line =
      jurCtx
        ? [jurCtx.municipality, jurCtx.county && `${jurCtx.county} County`, jurCtx.state]
            .filter(Boolean).join(", ")
        : (proj.address ?? proj.location ?? "Address not resolved");

    const verifiedFacts: Array<z.infer<typeof Line>> = [];
    if (proj.address ?? proj.location) {
      verifiedFacts.push({
        label: "Project address",
        detail: (proj.address ?? proj.location) as string,
        verification: "verified",
        source: "Project intake",
      });
    }
    if (jurCtx) {
      verifiedFacts.push({
        label: "Jurisdiction",
        detail: juris_line,
        verification: confirmed ? "verified" : "needs_confirmation",
        source: confirmed ? "User-confirmed jurisdiction" : "Auto-resolved — awaiting confirmation",
      });
    }
    if (friendly) {
      verifiedFacts.push({
        label: "Project type",
        detail: friendlyLabel(friendly),
        verification: "verified",
        source: "Intake",
      });
    }

    // Include user's answers as verified facts
    const relevantQs = pickQuestions({ friendly, scopeText: plainScope, answers });
    for (const q of relevantQs) {
      const ans = answers[q.key];
      if (!ans) continue;
      const readable =
        ans === "yes" ? "Yes" :
        ans === "no" ? "No" :
        ans === "unsure" ? "Not sure" :
        ans === "later" ? "To be determined" : String(ans);
      verifiedFacts.push({
        label: q.prompt,
        detail: readable,
        verification: ans === "unsure" || ans === "later" ? "needs_confirmation" : "verified",
        source: "Intake answers",
      });
    }

    const agenciesBase = buildAgencyBase(jurCtx);

    // ------- AI enrichment -------
    const system = `You are a senior permit expeditor writing a plain-language Project Due Diligence report for a client.
- Prefer specific, jurisdiction-appropriate agencies. If the jurisdiction is not confirmed, mark items "needs_confirmation".
- Never invent agency names. When unsure, describe by role (e.g. "County Health Department") and mark "needs_confirmation".
- Verification values MUST be one of: "verified", "ai_assisted", "needs_confirmation".
- Use "verified" only when the fact came directly from the user's confirmed intake or confirmed jurisdiction.
- Use "ai_assisted" for typical requirements you're confident about for this class of project.
- Use "needs_confirmation" for anything that depends on the specific reviewer or unconfirmed data.
- Never cite fake code sections. Only cite well-known codes (IBC, IRC, IPC, IMC, NEC, IECC, NFPA 13/72/96, ADA).
- Keep language plain — the reader may not be a construction professional.`;

    const userPrompt = `Project intake JSON:
${JSON.stringify({
  friendly_project_type: friendly,
  friendly_project_type_label: friendlyLabel(friendly),
  plain_scope: plainScope,
  intake_answers: relevantQs.map((q) => ({
    question: q.prompt,
    section: q.section,
    answer: answers[q.key] ?? null,
  })),
  jurisdiction: jurCtx,
  address: proj.address ?? proj.location ?? null,
}, null, 2)}

Return a single JSON object matching EXACTLY this shape (no extra keys):
{
  "version": "${DUE_DILIGENCE_VERSION}",
  "overview": {
    "project_type_label": string,
    "plain_summary": string,
    "jurisdiction_line": string,
    "verification": "verified" | "ai_assisted" | "needs_confirmation"
  },
  "key_facts":         [{ "label": string, "detail": string, "verification": ..., "source": string|null }],
  "agencies":          [{ "label": string, "detail": string, "verification": ..., "source": string|null }],
  "likely_approvals":  [{ "label": string, "detail": string, "verification": ..., "source": string|null }],
  "required_documents":[{ "label": string, "detail": string, "verification": ..., "source": string|null }],
  "inspections":       [{ "label": string, "detail": string, "verification": ..., "source": string|null }],
  "sequencing":        [{ "step": number, "title": string, "detail": string|null, "verification": ... }],
  "risks":             [{ "label": string, "detail": string, "verification": ..., "source": string|null }],
  "open_questions":    [{ "question": string, "why": string|null }],
  "next_steps":        [{ "title": string, "detail": string|null }]
}

Guidance:
- overview.plain_summary: 3–5 sentences explaining what the client is doing and what to expect, in plain English.
- key_facts: echo the essential facts a reviewer will care about (address, occupancy classification if inferable, scope highlights).
- agencies: list every reviewing body likely involved (Building, Planning/Zoning, Fire, Health, Public Works, Utility, ROW, Historic if applicable). Use the confirmed authorities when provided.
- likely_approvals: the permits/approvals you expect (Building, Trade, Fire, Health Plan Review, Sign, Site/Grading, ROW, CO/TCO, etc.).
- required_documents: what the applicant will need to prepare (stamped plans, MEP drawings, hood shop drawings, egress plans, energy compliance, etc.).
- inspections: typical inspection milestones for this scope.
- sequencing: numbered 1..N in the order the client should tackle work.
- open_questions: items answered "Not sure" or "Ask me later" during intake, plus anything else you need to confirm.
- next_steps: 3–6 concrete actions the client should take this week.
${!confirmed ? "IMPORTANT: The jurisdiction is NOT yet user-confirmed. Downgrade every agency and approval item to \"needs_confirmation\"." : ""}
`;

    let ai: DueDiligenceReport;
    try {
      ai = await callGeminiJSON(userPrompt, system, DueDiligenceSchema, {
        model: DUE_DILIGENCE_MODEL,
        max_tokens: 8192,
      });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "AI failed to generate the report.");
    }

    // ------- Merge deterministic facts on top of AI output -------
    const mergedKeyFacts = [
      ...verifiedFacts,
      ...ai.key_facts.filter((f) =>
        !verifiedFacts.some((v) => v.label.toLowerCase() === f.label.toLowerCase()),
      ),
    ];

    const mergedAgencies = agenciesBase.length
      ? [
          ...agenciesBase,
          ...ai.agencies.filter((a) =>
            !agenciesBase.some((b) => b.label.toLowerCase() === a.label.toLowerCase()),
          ),
        ]
      : ai.agencies;

    // Force downgrade when jurisdiction is not confirmed
    const downgrade = <T extends { verification: "verified" | "ai_assisted" | "needs_confirmation" }>(rows: T[]): T[] =>
      confirmed ? rows : rows.map((r) => ({ ...r, verification: r.verification === "verified" ? "verified" : "needs_confirmation" }));

    // Ensure unanswered/"unsure" questions surface as open questions
    const unansweredOpen = relevantQs
      .filter((q) => !answers[q.key] || answers[q.key] === "unsure" || answers[q.key] === "later")
      .map((q) => ({ question: humanQuestion(q.key), why: q.why }));

    const report: DueDiligenceReport = {
      version: DUE_DILIGENCE_VERSION,
      overview: {
        project_type_label: ai.overview.project_type_label || friendlyLabel(friendly),
        plain_summary: ai.overview.plain_summary,
        jurisdiction_line: juris_line || ai.overview.jurisdiction_line,
        verification: confirmed ? ai.overview.verification : "needs_confirmation",
      },
      key_facts: mergedKeyFacts,
      agencies: downgrade(mergedAgencies),
      likely_approvals: downgrade(ai.likely_approvals),
      required_documents: ai.required_documents,
      inspections: ai.inspections,
      sequencing: downgrade(ai.sequencing),
      risks: ai.risks,
      open_questions: [
        ...unansweredOpen,
        ...ai.open_questions.filter((q) =>
          !unansweredOpen.some((u) => u.question.toLowerCase() === q.question.toLowerCase()),
        ),
      ],
      next_steps: ai.next_steps,
    };

    // Persist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: uErr } = await (supabase.from("scope_of_work") as any)
      .update({
        due_diligence: report,
        due_diligence_generated_at: new Date().toISOString(),
        due_diligence_model: DUE_DILIGENCE_MODEL,
        intake_status: "report_ready",
      })
      .eq("project_id", data.project_id);
    if (uErr) throw new Error(uErr.message);

    return { report, generated_at: new Date().toISOString() };
  });

// ---------------- Fetch ----------------
export const getDueDiligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (context.supabase.from("scope_of_work") as any)
      .select("due_diligence, due_diligence_generated_at, due_diligence_model, intake_status")
      .eq("project_id", data.project_id)
      .maybeSingle();
    if (!row?.due_diligence) return { report: null as DueDiligenceReport | null, generated_at: null, model: null, intake_status: row?.intake_status ?? "draft" };
    const parsed = DueDiligenceSchema.safeParse(row.due_diligence);
    return {
      report: parsed.success ? parsed.data : (row.due_diligence as DueDiligenceReport),
      generated_at: row.due_diligence_generated_at as string | null,
      model: row.due_diligence_model as string | null,
      intake_status: row.intake_status as string,
    };
  });
