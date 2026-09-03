import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { toSlug } from "@/lib/ai.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";
import {
  QAQC_CATEGORIES,
  QAQC_DISCIPLINES,
  computeReadiness,
  containsProhibitedAssertion,
  PERMIVIO_PROFESSIONAL_DISCLAIMER,
  readinessMeta,
  type QaQcCategoryId,
} from "@/lib/qaqcConfig";

export const QAQC_PROMPT_VERSION = "qaqc-v1";
export const QAQC_MODEL = "google/gemini-2.5-pro";

// ---------------------------------------------------------------- AI plumbing

type ContentPart = { type: "text"; text: string } | { type: "file"; file: { filename: string; file_data: string } } | { type: "image_url"; image_url: { url: string } };

async function docToContentPart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  doc: { id: string; name: string; mime_type: string | null; storage_path: string },
): Promise<ContentPart | null> {
  const { data: signed } = await sb.storage.from("project-docs").createSignedUrl(doc.storage_path, 900);
  if (!signed?.signedUrl) return null;
  const mime = doc.mime_type || "application/pdf";
  if (mime.startsWith("image/")) return { type: "image_url", image_url: { url: signed.signedUrl } };
  const isPdf = mime === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return null;
  const resp = await fetch(signed.signedUrl);
  if (!resp.ok) return null;
  const buf = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { type: "file", file: { filename: doc.name, file_data: `data:${mime};base64,${btoa(bin)}` } };
}

async function callMultimodalJSON<T>(system: string, parts: ContentPart[], schema: z.ZodType<T>): Promise<T> {
  const aiKey = process.env['LOVABLE_API_KEY'];
  if (!aiKey) throw new Error("AI is not configured");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
    body: JSON.stringify({
      model: QAQC_MODEL,
      max_tokens: 8192,
      messages: [
        { role: "system", content: `${system}\n\nRespond ONLY with a single valid JSON object. No prose, no markdown fences.` },
        { role: "user", content: parts },
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
  const raw = (j.choices?.[0]?.message?.content ?? "").replace(/```json|```/g, "").trim();
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("AI returned an unreadable response. Try again.");
  return schema.parse(JSON.parse(raw.slice(s, e + 1)));
}

// ---------------------------------------------------------------- AI schemas

const InventorySchema = z.object({
  sheets: z.array(z.object({
    sheet_number: z.string().default(""),
    sheet_title: z.string().default(""),
    discipline: z.string().default("unknown"),
    revision_number: z.string().default(""),
    revision_date: z.string().default(""),
    professional_of_record: z.string().default(""),
    seal_status: z.string().default("not_visible"),
    index_state: z.string().default("present"),
    notes: z.string().default(""),
  })).max(400).default([]),
  index_sheets_not_uploaded: z.array(z.string()).max(200).default([]),
  uploaded_sheets_not_indexed: z.array(z.string()).max(200).default([]),
  duplicate_sheet_numbers: z.array(z.string()).max(100).default([]),
  missing_number_sequences: z.array(z.string()).max(100).default([]),
  missing_disciplines: z.array(z.string()).max(40).default([]),
  conflicting_dates: z.array(z.string()).max(60).default([]),
  project_information: z.record(z.string(), z.string()).default({}),
  observations: z.array(z.string()).max(40).default([]),
});

const FindingsSchema = z.object({
  findings: z.array(z.object({
    severity: z.enum(["critical", "high", "medium", "low", "informational"]).default("medium"),
    category: z.string().default("project_information"),
    discipline: z.string().default("architectural"),
    sheet_number: z.string().default(""),
    sheet_title: z.string().default(""),
    location: z.string().default(""),
    summary: z.string().min(3),
    plain_language: z.string().default(""),
    why_it_matters: z.string().default(""),
    code_basis: z.string().default(""),
    jurisdiction_source_url: z.string().default(""),
    recommended_action: z.string().default(""),
    responsible_discipline: z.string().default(""),
    verification: z.enum([
      "verified_requirement", "ai_suggested", "coordination_issue",
      "missing_information", "human_review_recommended", "agency_confirmation_required",
    ]).default("ai_suggested"),
  })).max(120).default([]),
  missing_documents: z.array(z.object({ name: z.string(), reason: z.string().default(""), blocking: z.boolean().default(false) })).max(40).default([]),
  submission_issues: z.array(z.string()).max(40).default([]),
  needs_professional_confirmation: z.array(z.string()).max(40).default([]),
  recommended_actions: z.array(z.string()).max(40).default([]),
  executive_summary: z.string().default(""),
});

// ------------------------------------------------- jurisdiction code research

type CodeRow = {
  discipline: string;
  code_family: string;
  edition: string;
  effective_date: string | null;
  source_url: string | null;
  source_title: string | null;
  verification: string;
  last_verified_at: string | null;
};

async function researchJurisdictionCodes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  jurisdiction: string,
  state: string | null,
): Promise<{ codes: CodeRow[]; sources: Array<{ url: string; title: string }>; context: string }> {
  const codes: CodeRow[] = [];
  const sources: Array<{ url: string; title: string }> = [];

  // 1) Verified rows already on file for this jurisdiction.
  if (jurisdiction) {
    const parts = jurisdiction.split(",").map((p) => p.trim());
    const muni = parts[0] ?? jurisdiction;
    const { data: jrows } = await sb
      .from("jurisdictions")
      .select("id, municipality, county, state")
      .or(`municipality.ilike.%${muni}%,county.ilike.%${muni}%`)
      .limit(3);
    const ids = (jrows ?? []).map((r: { id: string }) => r.id);
    if (ids.length) {
      const { data: adoptions } = await sb
        .from("code_adoptions")
        .select("discipline, code_family, edition, effective_date, verification, last_verified_at, local_amendments_url, official_sources(url, title)")
        .in("jurisdiction_id", ids);
      for (const a of adoptions ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const src = (a as any).official_sources as { url?: string; title?: string } | null;
        codes.push({
          discipline: a.discipline,
          code_family: a.code_family,
          edition: a.edition,
          effective_date: a.effective_date ?? null,
          source_url: src?.url ?? a.local_amendments_url ?? null,
          source_title: src?.title ?? null,
          verification: a.verification ?? "verified",
          last_verified_at: a.last_verified_at ?? null,
        });
        if (src?.url) sources.push({ url: src.url, title: src.title ?? "" });
      }
    }
  }

  // 2) Live research top-up for anything not on file.
  const fcKey = process.env['FIRECRAWL_API_KEY'];
  let context = "";
  if (fcKey && jurisdiction) {
    const queries = [
      `"${jurisdiction}" ${state ?? ""} adopted building code edition amendments site:.gov`,
      `"${jurisdiction}" ${state ?? ""} plan submission requirements sheet size seal requirements site:.gov`,
      `"${jurisdiction}" ${state ?? ""} fire code accessibility energy code adopted edition site:.gov`,
    ];
    const hits = (await Promise.all(queries.map((q) => firecrawlSearch(fcKey, q, 3).catch(() => [])))).flat();
    const seen = new Set(sources.map((s) => s.url));
    const targets = hits.filter((h) => h.url && !seen.has(h.url) && /(\.gov|municode|ecode360|codepublishing|amlegal|generalcode|up\.codes)/i.test(h.url)).slice(0, 4);
    const scraped = await Promise.all(targets.map(async (t) => {
      try {
        const s = await firecrawlScrape(fcKey, t.url);
        return `SOURCE: ${t.url}\nTITLE: ${t.title ?? ""}\n${s.markdown.slice(0, 2600)}`;
      } catch {
        return `SOURCE: ${t.url}\nTITLE: ${t.title ?? ""}\nDESC: ${t.description ?? ""}`;
      }
    }));
    for (const t of targets) sources.push({ url: t.url, title: t.title ?? "" });
    context = scraped.join("\n\n---\n\n");
  }

  // 3) Cached jurisdiction profile for submission standards.
  if (jurisdiction) {
    const { data: prof } = await sb
      .from("jurisdiction_profiles")
      .select("name, state, department, portal_url, overview, requirements, submission_portals, sources")
      .eq("slug", toSlug(jurisdiction))
      .maybeSingle();
    if (prof) context = `CACHED JURISDICTION PROFILE\n${JSON.stringify(prof).slice(0, 2500)}\n\n${context}`;
  }

  return { codes, sources, context };
}

// -------------------------------------------------------------- project context

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProjectContext(sb: any, projectId: string) {
  const [p, scope, conf, items] = await Promise.all([
    sb.from("projects").select("*").eq("id", projectId).maybeSingle(),
    sb.from("scope_of_work").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
    sb.from("jurisdiction_confirmations").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
    sb.from("permit_items").select("name, category, status, required").eq("project_id", projectId),
  ]);
  const project = p.data as Record<string, unknown> | null;
  const sc = (scope.data ?? [])[0] as Record<string, unknown> | null;
  const confirmation = (conf.data ?? [])[0] as Record<string, unknown> | null;
  return { project, scope: sc, confirmation, items: items.data ?? [] };
}

function contextBlock(ctx: Awaited<ReturnType<typeof loadProjectContext>>): string {
  const p = ctx.project ?? {};
  const s = ctx.scope ?? {};
  const c = ctx.confirmation ?? {};
  return [
    `PROJECT: ${p['name'] ?? ""}`,
    `ADDRESS: ${c['formatted_address'] ?? p['location'] ?? ""}`,
    `JURISDICTION (confirmed AHJ where available): ${[c['city'], c['state']].filter(Boolean).join(", ") || p['jurisdiction'] || "unknown"}`,
    `JURISDICTION CONFIRMATION STATUS: ${c['status'] ?? "unconfirmed"}`,
    `PROJECT TYPE: ${s['friendly_project_type'] ?? p['project_type'] ?? "unknown"}`,
    `SCOPE OF WORK: ${s['plain_scope'] ?? s['scope_text'] ?? "not provided"}`,
    `EXISTING USE/OCCUPANCY: ${s['occupancy_existing'] ?? "unknown"}`,
    `PROPOSED USE/OCCUPANCY: ${s['occupancy_proposed'] ?? "unknown"}`,
    `CONSTRUCTION TYPE: ${s['construction_type'] ?? "unknown"}`,
    `GROSS SF: ${s['sq_ft_gross'] ?? "unknown"} · AFFECTED SF: ${s['sq_ft_affected'] ?? "unknown"}`,
    `CONSTRUCTION VALUE (cents): ${s['construction_value_cents'] ?? "unknown"}`,
    `CHECKLIST ITEMS ON FILE: ${ctx.items.map((i: { name: string; status: string }) => `${i.name} [${i.status}]`).slice(0, 40).join("; ") || "none"}`,
  ].join("\n");
}

// ------------------------------------------------------------------ run review

export const runQaQcReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      document_ids: z.array(z.string().uuid()).min(1).max(8),
      revision_label: z.string().max(40).default("Rev A"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const ctx = await loadProjectContext(sb, data.project_id);
    if (!ctx.project) throw new Error("Project not found");

    const { data: docs } = await sb
      .from("project_documents")
      .select("id, name, mime_type, storage_path")
      .in("id", data.document_ids);
    if (!docs?.length) throw new Error("No readable plan documents selected");

    const jurisdiction = String(ctx.project['jurisdiction'] ?? "");
    const state = (ctx.confirmation?.['state'] as string | undefined) ?? null;

    const { data: review, error: insErr } = await sb
      .from("qaqc_reviews")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        revision_label: data.revision_label,
        document_ids: data.document_ids,
        status: "running",
        model: QAQC_MODEL,
        prompt_version: QAQC_PROMPT_VERSION,
        project_context: {
          project_type: ctx.project['project_type'] ?? null,
          address: ctx.confirmation?.['formatted_address'] ?? ctx.project['location'] ?? null,
          confirmation_status: ctx.confirmation?.['status'] ?? "unconfirmed",
        },
      })
      .select("*")
      .single();
    if (insErr || !review) throw new Error(insErr?.message ?? "Could not start review");

    try {
      const { codes, sources, context: codeContext } = await researchJurisdictionCodes(sb, jurisdiction, state);
      const projectBlock = contextBlock(ctx);
      const fileParts: ContentPart[] = [];
      for (const d of docs) {
        const part = await docToContentPart(sb, d);
        if (part) fileParts.push(part);
      }
      if (!fileParts.length) throw new Error("Selected documents could not be read (PDF or image only).");

      // ---- Pass 1: drawing set inventory
      const inventory = await callMultimodalJSON(
        "You are a senior permit expediter building a drawing set inventory before submission. You never invent sheets that are not visible. Report only what the documents show.",
        [
          {
            type: "text",
            text: `Build a complete DRAWING INVENTORY for the uploaded plan set and compare it against the drawing index printed on the cover/index sheet.

${projectBlock}

For every sheet you can see, report: sheet_number, sheet_title, discipline (one of: ${QAQC_DISCIPLINES.join(", ")}), revision_number, revision_date, professional_of_record, seal_status (sealed_signed | sealed_unsigned | not_visible | illegible), index_state (present | missing_from_upload | not_indexed | duplicate | superseded), notes.

Also report: index_sheets_not_uploaded, uploaded_sheets_not_indexed, duplicate_sheet_numbers, missing_number_sequences, missing_disciplines, conflicting_dates, project_information (key/value pairs printed on the sheets: address, owner, tenant, parcel, value, square footage, stories, occupancy, construction type), and observations.

Rules: if a seal or signature may be present (faint, scanned, digital), use sealed_signed or illegible — never claim it is missing unless the title block is clearly blank. Leave a field as an empty string when it is not shown.

Return JSON: { "sheets": [...], "index_sheets_not_uploaded": [], "uploaded_sheets_not_indexed": [], "duplicate_sheet_numbers": [], "missing_number_sequences": [], "missing_disciplines": [], "conflicting_dates": [], "project_information": {}, "observations": [] }`,
          },
          ...fileParts,
        ],
        InventorySchema,
      );

      const sheetRows = inventory.sheets
        .filter((s) => s.sheet_number || s.sheet_title)
        .map((s, i) => ({
          review_id: review.id,
          user_id: context.userId,
          sheet_number: s.sheet_number || `(unnumbered ${i + 1})`,
          sheet_title: s.sheet_title || null,
          discipline: (QAQC_DISCIPLINES as readonly string[]).includes(s.discipline) ? s.discipline : "unknown",
          revision_number: s.revision_number || null,
          revision_date: s.revision_date || null,
          professional_of_record: s.professional_of_record || null,
          seal_status: s.seal_status || "not_visible",
          index_state: s.index_state || "present",
          notes: s.notes || null,
          sort_order: i,
        }));
      const extraMissing = inventory.index_sheets_not_uploaded.map((num, i) => ({
        review_id: review.id,
        user_id: context.userId,
        sheet_number: num,
        sheet_title: null,
        discipline: "unknown",
        revision_number: null,
        revision_date: null,
        professional_of_record: null,
        seal_status: "not_visible",
        index_state: "missing_from_upload",
        notes: "Listed on the drawing index but not present in the upload.",
        sort_order: sheetRows.length + i,
      }));
      if (sheetRows.length || extraMissing.length) {
        await sb.from("qaqc_sheets").insert([...sheetRows, ...extraMissing]);
      }

      const inventoryDigest = [
        `SHEETS: ${sheetRows.map((s) => `${s.sheet_number} (${s.discipline}${s.revision_number ? ` rev ${s.revision_number}` : ""})`).join("; ") || "none detected"}`,
        `ON INDEX BUT NOT UPLOADED: ${inventory.index_sheets_not_uploaded.join(", ") || "none"}`,
        `UPLOADED BUT NOT INDEXED: ${inventory.uploaded_sheets_not_indexed.join(", ") || "none"}`,
        `DUPLICATE SHEET NUMBERS: ${inventory.duplicate_sheet_numbers.join(", ") || "none"}`,
        `MISSING DISCIPLINES: ${inventory.missing_disciplines.join(", ") || "none"}`,
        `CONFLICTING DATES: ${inventory.conflicting_dates.join(", ") || "none"}`,
        `PROJECT INFO ON SHEETS: ${JSON.stringify(inventory.project_information).slice(0, 1200)}`,
      ].join("\n");

      const codeBlock = codes.length
        ? codes.map((c) => `- ${c.discipline}: ${c.code_family} ${c.edition}${c.effective_date ? ` (effective ${c.effective_date})` : ""} [${c.verification}]${c.source_url ? ` ${c.source_url}` : ""}`).join("\n")
        : "(no verified adopted-code rows on file for this jurisdiction — say so instead of guessing an edition)";

      // ---- Pass 2 & 3: category findings (split so each pass stays focused)
      const groups: Array<{ ids: QaQcCategoryId[]; label: string }> = [
        { ids: ["project_information", "cover_code_analysis", "life_safety", "accessibility", "architectural", "structural"], label: "Group A" },
        { ids: ["mechanical", "electrical", "plumbing", "fire_protection", "civil_site", "cross_discipline"], label: "Group B" },
      ];

      const results = [] as Array<z.infer<typeof FindingsSchema>>;
      for (const g of groups) {
        const catText = QAQC_CATEGORIES.filter((c) => g.ids.includes(c.id))
          .map((c) => `${c.no}. ${c.label} (id: ${c.id}) — check: ${c.checks.join(", ")}`)
          .join("\n");
        const out = await callMultimodalJSON(
          "You are a commercial permit expediter and senior plan-QC reviewer performing a jurisdiction-specific pre-submission quality-control review. You never state that something is a confirmed code violation. You never write 'code compliant', 'plans approved', 'code certified', or 'engineering approved'. You do not perform or certify engineering.",
          [
            {
              type: "text",
              text: `Perform a pre-submission QA/QC review of this plan set for the categories below only.

${projectBlock}

ADOPTED CODES ON FILE FOR THIS JURISDICTION:
${codeBlock}

JURISDICTION RESEARCH EXCERPTS (prefer these over generic knowledge; cite their URLs in jurisdiction_source_url):
${codeContext.slice(0, 9000) || "(none retrieved — mark jurisdiction-specific claims as agency_confirmation_required)"}

DRAWING INVENTORY ALREADY EXTRACTED:
${inventoryDigest}

CATEGORIES TO REVIEW (${g.label}):
${catText}

RULES:
- Only report what you can see on the drawings or what the inventory shows. Prefer a false negative over a false positive.
- Life-safety wording must be "Potential life-safety issue requiring design-professional review." Never assert a confirmed violation.
- Structural items: flag for licensed-engineer review; never certify.
- Never invent a code section, local amendment, or edition. If unknown, leave code_basis empty and set verification to agency_confirmation_required.
- verification must be one of: verified_requirement (backed by a jurisdiction source you cite), ai_suggested, coordination_issue, missing_information, human_review_recommended, agency_confirmation_required.
- category must be one of the ids listed above. discipline should be one of: ${QAQC_DISCIPLINES.join(", ")}.

Return JSON: { "findings": [{ "severity": "critical|high|medium|low|informational", "category": "...", "discipline": "...", "sheet_number": "", "sheet_title": "", "location": "", "summary": "", "plain_language": "", "why_it_matters": "", "code_basis": "", "jurisdiction_source_url": "", "recommended_action": "", "responsible_discipline": "", "verification": "..." }], "missing_documents": [{"name":"","reason":"","blocking":false}], "submission_issues": [], "needs_professional_confirmation": [], "recommended_actions": [], "executive_summary": "" }`,
            },
            ...fileParts,
          ],
          FindingsSchema,
        );
        results.push(out);
      }

      const allFindings = results.flatMap((r) => r.findings)
        .filter((f) => !containsProhibitedAssertion(f.summary))
        .slice(0, 200);
      const validCats = new Set(QAQC_CATEGORIES.map((c) => c.id as string));

      if (allFindings.length) {
        await sb.from("qaqc_findings").insert(allFindings.map((f, i) => ({
          review_id: review.id,
          user_id: context.userId,
          finding_no: i + 1,
          severity: f.severity,
          category: validCats.has(f.category) ? f.category : "project_information",
          discipline: (QAQC_DISCIPLINES as readonly string[]).includes(f.discipline) ? f.discipline : "architectural",
          sheet_number: f.sheet_number || null,
          sheet_title: f.sheet_title || null,
          location: f.location || null,
          summary: f.summary,
          plain_language: f.plain_language || null,
          why_it_matters: f.why_it_matters || null,
          code_basis: f.code_basis || null,
          jurisdiction_source_url: f.jurisdiction_source_url || null,
          recommended_action: f.recommended_action || null,
          responsible_discipline: f.responsible_discipline || null,
          verification: f.verification,
        })));
      }

      const missingDocuments = results.flatMap((r) => r.missing_documents);
      const gaps = {
        missingSheets: inventory.index_sheets_not_uploaded.length,
        duplicateSheets: inventory.duplicate_sheet_numbers.length,
        missingDocuments: missingDocuments.length,
      };
      const { score, category } = computeReadiness(allFindings, gaps);

      const summary = results.map((r) => r.executive_summary).filter(Boolean).join(" ").slice(0, 3000);

      await sb.from("qaqc_reviews").update({
        status: "complete",
        jurisdiction_snapshot: {
          jurisdiction: jurisdiction || null,
          state,
          confirmation_status: ctx.confirmation?.['status'] ?? "unconfirmed",
          authorities: ctx.confirmation?.['overrides'] ?? {},
        },
        codes_researched: codes,
        sources,
        executive_summary: summary || null,
        readiness_score: score,
        readiness_category: category,
        missing_documents: missingDocuments,
        submission_issues: results.flatMap((r) => r.submission_issues),
        recommended_actions: results.flatMap((r) => r.recommended_actions),
        needs_professional_confirmation: results.flatMap((r) => r.needs_professional_confirmation),
      }).eq("id", review.id);

      await sb.from("activity").insert({
        project_id: data.project_id,
        user_id: context.userId,
        description: `Plan QA/QC review (${data.revision_label}) complete — ${allFindings.length} findings · ${readinessMeta(category).label}`,
      });

      return { review_id: review.id as string, findings: allFindings.length, readiness_score: score, readiness_category: category };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "QA/QC review failed";
      await sb.from("qaqc_reviews").update({ status: "error", error: msg }).eq("id", review.id);
      throw new Error(msg);
    }
  });

// ------------------------------------------------------------------- read APIs

export const listQaQcReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: reviews } = await context.supabase
      .from("qaqc_reviews")
      .select("id, revision_label, status, readiness_score, readiness_category, created_at, error")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    return { reviews: reviews ?? [] };
  });

export const getQaQcReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ review_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [r, sheets, findings, prof] = await Promise.all([
      sb.from("qaqc_reviews").select("*").eq("id", data.review_id).maybeSingle(),
      sb.from("qaqc_sheets").select("*").eq("review_id", data.review_id).order("sort_order", { ascending: true }),
      sb.from("qaqc_findings").select("*").eq("review_id", data.review_id).order("finding_no", { ascending: true }),
      sb.from("professional_reviews").select("*").eq("target_type", "qaqc_review").eq("target_id", data.review_id).order("created_at", { ascending: false }).limit(1),
    ]);
    return {
      review: r.data,
      sheets: sheets.data ?? [],
      findings: findings.data ?? [],
      professional_review: (prof.data ?? [])[0] ?? null,
      disclaimer: PERMIVIO_PROFESSIONAL_DISCLAIMER,
    };
  });

export const setQaQcFindingResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ finding_id: z.string().uuid(), resolved: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("qaqc_findings").update({ resolved: data.resolved }).eq("id", data.finding_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteQaQcReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ review_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("qaqc_reviews").delete().eq("id", data.review_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------- project integration: gaps -> checklist

export const addQaQcGapsToChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ review_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: review } = await sb.from("qaqc_reviews").select("*").eq("id", data.review_id).maybeSingle();
    if (!review) throw new Error("Review not found");
    const { data: missingSheets } = await sb
      .from("qaqc_sheets").select("sheet_number, discipline")
      .eq("review_id", data.review_id).eq("index_state", "missing_from_upload");

    const missingDocs = (review.missing_documents ?? []) as Array<{ name: string; reason?: string }>;
    const names = [
      ...missingDocs.map((m) => ({ name: m.name, notes: m.reason ?? "" })),
      ...(missingSheets ?? []).map((s: { sheet_number: string; discipline: string }) => ({
        name: `Missing sheet ${s.sheet_number}`,
        notes: `Listed on the drawing index but not in the submitted set (${s.discipline}).`,
      })),
    ];
    if (!names.length) return { added: 0 };

    const { data: existing } = await sb.from("permit_items").select("name").eq("project_id", review.project_id);
    const have = new Set((existing ?? []).map((e: { name: string }) => e.name.toLowerCase()));
    const rows = names
      .filter((n) => !have.has(n.name.toLowerCase()))
      .slice(0, 40)
      .map((n, i) => ({
        user_id: context.userId,
        project_id: review.project_id,
        name: n.name,
        category: "documents",
        status: "not_started",
        required: true,
        notes: `${n.notes}\nAdded from Plan QA/QC (${review.revision_label}).`.trim(),
        sort_order: 900 + i,
      }));
    if (!rows.length) return { added: 0 };
    const { error } = await sb.from("permit_items").insert(rows);
    if (error) throw new Error(error.message);
    await sb.from("activity").insert({
      project_id: review.project_id,
      user_id: context.userId,
      description: `Plan QA/QC added ${rows.length} missing-document item(s) to the checklist`,
    });
    return { added: rows.length };
  });

// ----------------------------------------------------------------- PDF export

function pdfSafe(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/[\u2713\u2714]/g, "x")
    .replace(/[^\x20-\x7E]/g, " ");
}

export const generateQaQcReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ review_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [r, sheets, findings] = await Promise.all([
      sb.from("qaqc_reviews").select("*").eq("id", data.review_id).maybeSingle(),
      sb.from("qaqc_sheets").select("*").eq("review_id", data.review_id).order("sort_order", { ascending: true }),
      sb.from("qaqc_findings").select("*").eq("review_id", data.review_id).order("finding_no", { ascending: true }),
    ]);
    const review = r.data;
    if (!review) throw new Error("Review not found");
    const { data: project } = await sb.from("projects").select("name, location, jurisdiction, project_type").eq("id", review.project_id).maybeSingle();

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([612, 792]);
    let y = 750;
    const margin = 48;
    const width = 612 - margin * 2;

    const newPage = () => { page = pdf.addPage([612, 792]); y = 750; };
    const text = (s: string, opts: { size?: number; b?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
      const size = opts.size ?? 9.5;
      const f = opts.b ? bold : font;
      const words = pdfSafe(s).split(/\s+/);
      let line = "";
      const lines: string[] = [];
      for (const w of words) {
        const t = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) > width) { lines.push(line); line = w; } else line = t;
      }
      if (line) lines.push(line);
      for (const ln of lines) {
        if (y < 60) newPage();
        page.drawText(ln, { x: margin, y, size, font: f, color: rgb(...(opts.color ?? [0.1, 0.12, 0.16])) });
        y -= size + 3;
      }
      y -= opts.gap ?? 4;
    };
    const heading = (s: string) => { if (y < 110) newPage(); y -= 6; text(s, { size: 12, b: true, color: [0.05, 0.3, 0.75], gap: 6 }); };

    text("PERMIVIO", { size: 18, b: true, color: [0.05, 0.3, 0.75], gap: 2 });
    text("Pre-Submission Plan QA/QC Report", { size: 14, b: true, gap: 8 });
    text(`Project: ${project?.name ?? ""}`);
    text(`Address: ${project?.location ?? ""}`);
    text(`Jurisdiction: ${review.jurisdiction_snapshot?.jurisdiction ?? project?.jurisdiction ?? "unconfirmed"}`);
    text(`Project type: ${project?.project_type ?? ""}`);
    text(`Revision reviewed: ${review.revision_label}`);
    text(`Prepared: ${new Date(review.created_at).toLocaleString()}`);
    text(`Permit readiness: ${readinessMeta(review.readiness_category).label} (${review.readiness_score ?? 0}/100)`, { b: true, gap: 8 });

    heading("Executive summary");
    text(review.executive_summary || "No summary generated.");

    heading("Codes researched");
    if ((review.codes_researched ?? []).length === 0) text("No verified adopted-code records were available for this jurisdiction. Confirm adopted editions and local amendments with the authority having jurisdiction.");
    for (const c of review.codes_researched ?? []) {
      text(`- ${c.discipline}: ${c.code_family} ${c.edition}${c.effective_date ? ` (effective ${c.effective_date})` : ""} [${c.verification}] ${c.source_url ?? ""}`);
    }

    heading("Plan set inventory");
    for (const s of (sheets.data ?? []).slice(0, 120)) {
      text(`- ${s.sheet_number} ${s.sheet_title ?? ""} | ${s.discipline} | rev ${s.revision_number ?? "-"} | seal: ${s.seal_status} | ${s.index_state}`);
    }
    const missing = (sheets.data ?? []).filter((s: { index_state: string }) => s.index_state === "missing_from_upload");
    heading("Missing / duplicate sheets");
    text(missing.length ? missing.map((s: { sheet_number: string }) => s.sheet_number).join(", ") : "None identified.");

    const bySev = (sev: string) => (findings.data ?? []).filter((f: { severity: string }) => f.severity === sev);
    for (const sev of ["critical", "high", "medium", "low", "informational"]) {
      const rows = bySev(sev);
      if (!rows.length) continue;
      heading(`${sev.toUpperCase()} findings (${rows.length})`);
      for (const f of rows) {
        text(`#${f.finding_no} [${f.discipline}] ${f.sheet_number ?? ""} — ${f.summary}`, { b: true, gap: 1 });
        if (f.plain_language) text(`What it means: ${f.plain_language}`, { gap: 1 });
        if (f.why_it_matters) text(`Why it matters: ${f.why_it_matters}`, { gap: 1 });
        if (f.code_basis) text(`Potential basis: ${f.code_basis}`, { gap: 1 });
        if (f.recommended_action) text(`Recommended action: ${f.recommended_action}`, { gap: 1 });
        text(`Responsible: ${f.responsible_discipline ?? f.discipline} · Status: ${f.verification.replace(/_/g, " ")}${f.jurisdiction_source_url ? ` · ${f.jurisdiction_source_url}` : ""}`, { size: 8, color: [0.35, 0.38, 0.44] });
      }
    }

    heading("Missing documents");
    const md = (review.missing_documents ?? []) as Array<{ name: string; reason?: string }>;
    text(md.length ? md.map((m) => `- ${m.name}${m.reason ? ` — ${m.reason}` : ""}`).join("\n") : "None identified.");

    heading("Likely jurisdiction submission issues");
    text((review.submission_issues ?? []).map((s: string) => `- ${s}`).join("\n") || "None identified.");

    heading("Items requiring professional confirmation");
    text((review.needs_professional_confirmation ?? []).map((s: string) => `- ${s}`).join("\n") || "None identified.");

    heading("Recommended actions before submission");
    text((review.recommended_actions ?? []).map((s: string) => `- ${s}`).join("\n") || "None identified.");

    heading("Limitations");
    text(PERMIVIO_PROFESSIONAL_DISCLAIMER);

    const bytes = await pdf.save();
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return {
      filename: `PERMIVIO-QAQC-${(project?.name ?? "project").replace(/[^A-Za-z0-9]+/g, "-")}-${review.revision_label.replace(/\s+/g, "")}.pdf`,
      base64: btoa(bin),
    };
  });
