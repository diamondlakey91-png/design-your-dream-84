import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getEntitlement, requireFeature } from "@/lib/entitlements";
import { callLovableAI, callGeminiJSON, gatherProjectContext, toSlug } from "@/lib/ai.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";

const PlanReviewSchema = z.object({
  overall_summary: z.string().default(""),
  overall_risk: z.enum(["low", "medium", "high"]).default("medium"),
  sheets_detected: z.array(z.string()).max(50).default([]),
  jurisdiction_context: z.object({
    jurisdiction: z.string().default(""),
    applied_amendments: z.array(z.string()).max(30).default([]),
    source_urls: z.array(z.string()).max(15).default([]),
  }).default({ jurisdiction: "", applied_amendments: [], source_urls: [] }),
  findings: z.array(z.object({
    category: z.enum(["missing_exits", "ada", "fire_code", "permitting_mistake", "other"]),
    severity: z.enum(["low", "medium", "high"]).default("medium"),
    title: z.string(),
    detail: z.string(),
    code_reference: z.string().default(""),
    local_amendment: z.string().default(""),
    sheet_reference: z.string().default(""),
    recommendation: z.string().default(""),
    // Reviewer self-reported certainty. Findings with low confidence are shown
    // as "needs manual verification" rather than as hard issues, and any
    // stamp/signature/seal claim must clear a second verification pass.
    confidence: z.enum(["low", "medium", "high"]).default("medium"),
    // Short verbatim visual evidence the reviewer saw (e.g. "title block bottom-right
    // is blank" or "door labeled 24\" clear"). Used to cross-check hallucinated findings.
    evidence_quote: z.string().default(""),
    needs_manual_verification: z.boolean().default(false),
    // Location on the plan for visual markup (page is 1-indexed; bbox is normalized 0-1
    // with origin top-left). All optional — omit when the AI can't localize the issue.
    page: z.number().int().min(1).max(500).optional(),
    bbox: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    }).optional(),
  })).max(60).default([]),
});

// Detect "no stamp / not signed / no seal / no PE" style claims that are the
// most common false-positives in AI plan review. We re-verify these against
// the actual drawing before letting them ship as findings.
function isStampSignatureClaim(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /(unstamp|not\s+stamp|no\s+stamp|missing\s+stamp|without\s+stamp)/.test(t) ||
    /(unsigned|not\s+signed|no\s+signature|missing\s+signature|without\s+signature)/.test(t) ||
    /(no\s+seal|missing\s+seal|without\s+seal|unsealed)/.test(t) ||
    /(no\s+(pe|ra|architect|engineer)\s+(stamp|seal|signature))/.test(t)
  );
}

// Fetch jurisdiction-specific code amendments (works for any of 20k+ US jurisdictions).
// Returns a compact markdown context block or "" if nothing usable was found.
async function fetchJurisdictionAmendments(
  fcKey: string | undefined,
  jurisdiction: string,
): Promise<{ context: string; sources: string[] }> {
  if (!fcKey || !jurisdiction || jurisdiction === "the local jurisdiction") {
    return { context: "", sources: [] };
  }
  const queries = [
    `"${jurisdiction}" building code local amendments site:.gov`,
    `"${jurisdiction}" fire code amendments OR ordinance site:.gov`,
    `"${jurisdiction}" accessibility OR ADA amendments code site:.gov`,
  ];
  const searches = await Promise.all(
    queries.map((q) => firecrawlSearch(fcKey, q, 3).catch(() => [])),
  );
  const seen = new Set<string>();
  const candidates: Array<{ url: string; title?: string; description?: string }> = [];
  for (const hits of searches) {
    for (const h of hits) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      if (/(\.gov|municode|ecode360|codepublishing|amlegal|generalcode)/i.test(h.url)) {
        candidates.push(h);
      }
    }
  }
  const targets = candidates.slice(0, 3);
  if (targets.length === 0) return { context: "", sources: [] };

  const scrapes = await Promise.all(targets.map(async (h) => {
    try {
      const s = await firecrawlScrape(fcKey, h.url);
      return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 2800)}`;
    } catch {
      return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
    }
  }));
  return { context: scrapes.join("\n\n---\n\n"), sources: targets.map((t) => t.url) };
}


// Internal: run plan review for one document. Reused by reviewPlan + batchReviewPlans + MCP tool.
export async function runPlanReviewForDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  docId: string,
) {
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!aiKey) throw new Error("AI is not configured");
  const fcKey = process.env.FIRECRAWL_API_KEY;

  const { data: doc } = await supabase.from("project_documents").select("*").eq("id", docId).maybeSingle();
  if (!doc) throw new Error("Document not found");

  const { data: project } = await supabase
    .from("projects").select("name, jurisdiction, project_type, location")
    .eq("id", doc.project_id).maybeSingle();

  const { data: signed, error: sErr } = await supabase
    .storage.from("project-docs").createSignedUrl(doc.storage_path, 600);
  if (sErr || !signed?.signedUrl) throw new Error("Could not access document");

  const mime = doc.mime_type || "application/pdf";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
  if (!isImage && !isPdf) throw new Error("Only PDF or image plans can be reviewed.");

  const juris = project?.jurisdiction || "the local jurisdiction";
  const ptype = project?.project_type || "the project";

  let profileContext = "";
  if (project?.jurisdiction) {
    const { data: prof } = await supabase
      .from("jurisdiction_profiles")
      .select("name, state, department, overview, permits, fees, timelines, source_urls")
      .eq("slug", toSlug(project.jurisdiction))
      .maybeSingle();
    if (prof) profileContext = `CACHED JURISDICTION PROFILE\n${JSON.stringify(prof).slice(0, 2500)}`;
  }

  const { context: amendmentsContext, sources: amendmentSources } =
    await fetchJurisdictionAmendments(fcKey, juris);

  const jurisBlock = [profileContext, amendmentsContext].filter(Boolean).join("\n\n===\n\n");

  const instruction = `You are a licensed plan reviewer analyzing construction drawings for ${ptype} in ${juris}. Review the attached plan set for issues that THIS jurisdiction's plan checker would flag — using the jurisdiction's LOCAL amendments to the model codes wherever provided below, not just the base IBC/IFC/ADA.

${jurisBlock ? `JURISDICTION-SPECIFIC CONTEXT (authoritative — prefer over model-code defaults when they conflict):\n${jurisBlock}\n\n` : `No cached jurisdictional data was available. Apply the currently adopted code cycle for ${juris} (state-adopted IBC/IFC/IECC + any local amendments you are confident about). If unsure which cycle applies, cite the model code and note "verify local amendment".\n\n`}Focus on FOUR categories:
1. missing_exits — insufficient exits, exit access travel distance, dead-end corridors, exit width, exit signage/illumination (IBC Ch.10 + local amendments).
2. ada — accessibility: door clearances, ramp slopes, restroom fixture clearances, accessible route, parking, reach ranges, signage (ADA 2010 / ICC A117.1 + state accessibility code, e.g. CBC 11B in CA, TAS in TX, MAAB in MA, NYC Ch.11).
3. fire_code — fire separation, occupancy separation, sprinkler/alarm coverage, fire-rated assemblies, hydrant/FDC access (IBC Ch.7-9, IFC + local fire amendments).
4. permitting_mistake — missing sheets, incomplete title block, missing code analysis, missing energy compliance (IECC or state equivalent — e.g. Title 24 CA, Stretch Code MA), zoning setbacks, jurisdiction-specific submittal requirements.

ACCURACY RULES — READ CAREFULLY:
- Only flag issues you can VISUALLY CONFIRM on the drawing. If you are not certain, either omit the finding or mark it "confidence: low" with "needs_manual_verification: true".
- Every finding MUST include an "evidence_quote": a short verbatim description of what you actually see (e.g. "title block bottom-right shows no seal impression", or "corridor labeled 36\\" with 2 doors swinging in"). Findings without evidence will be discarded.
- STAMPS / SIGNATURES / SEALS: These live in the title block (usually bottom-right or right edge of each sheet), and are often faint, scanned, digital (DocuSign/Bluebeam), or partially cropped. Before flagging a sheet as unstamped/unsigned:
    (a) Scan the ENTIRE title block area of that sheet, not just the center.
    (b) Look for: embossed round PE/RA seals, digital signature blocks, "Digitally signed by…" text, DocuSign markers, initials, dates near a signature line, scanned-in wet signatures (often light/gray), or state-license numbers next to a name.
    (c) If ANY of the above is present or plausibly present, DO NOT flag it as unstamped. Prefer a false negative over a false positive on this specific issue.
    (d) If you do flag it, set confidence to at most "medium", set needs_manual_verification: true, and quote exactly what you looked at ("bottom-right title block on sheet E.6 is blank between the border and the sheet number").
- Do the same conservative check for "missing code analysis", "missing energy compliance", or "missing sheet index" — these frequently exist on cover/general sheets you may have skimmed past.
- Never fabricate specific code sections or local amendment numbers — leave those fields blank if unsure.
- If the document is not a plan set (e.g. a single detail, a photo, a spec cover), return findings: [] and explain in overall_summary.

Return ONLY valid JSON in this exact shape (no fences, no prose):
{
  "overall_summary": "3-5 sentence assessment referencing the jurisdiction",
  "overall_risk": "low" | "medium" | "high",
  "sheets_detected": ["A0.0", "A1.1", ...],
  "jurisdiction_context": {
    "jurisdiction": "${juris}",
    "applied_amendments": ["short label of each local amendment or code cycle you applied"],
    "source_urls": ${JSON.stringify(amendmentSources)}
  },
  "findings": [
    {
      "category": "missing_exits" | "ada" | "fire_code" | "permitting_mistake" | "other",
      "severity": "low" | "medium" | "high",
      "confidence": "low" | "medium" | "high",
      "needs_manual_verification": false,
      "title": "short label (<80 chars)",
      "detail": "what is wrong and where (<240 chars)",
      "evidence_quote": "verbatim visual evidence (<200 chars)",
      "code_reference": "model code, e.g. IBC 1006.2.1 or ADA 404.2.3",
      "local_amendment": "jurisdiction-specific amendment/section if applicable, else ''",
      "sheet_reference": "e.g. A2.1 or 'not shown'",
      "recommendation": "concrete fix (<200 chars)",
      "page": 1,
      "bbox": { "x": 0.12, "y": 0.34, "w": 0.18, "h": 0.09 }
    }
  ]
}

LOCATION (VERY IMPORTANT for markup): for every finding you visually identify on a sheet, include:
- "page": the 1-indexed page number of the PDF (or 1 for a single image) that contains the issue.
- "bbox": normalized box coordinates {x, y, w, h} in [0,1], where (0,0) is the TOP-LEFT of that page/image, x+w and y+h must stay <= 1, and the box tightly frames the problem region. Do not include a bbox that fills the whole page; leave bbox off entirely if you can't localize the issue.`;

  const contentParts: unknown[] = [{ type: "text", text: instruction }];
  if (isImage) {
    contentParts.push({ type: "image_url", image_url: { url: signed.signedUrl } });
  } else {
    const fileResp = await fetch(signed.signedUrl);
    if (!fileResp.ok) throw new Error("Could not download plan for review");
    const buf = new Uint8Array(await fileResp.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    contentParts.push({ type: "file", file: { filename: doc.name, file_data: `data:${mime};base64,${b64}` } });
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: "You are a senior plan reviewer. Output valid JSON only, no prose, no code fences. Prefer false negatives over false positives — omit any finding you cannot visually confirm." },
        { role: "user", content: contentParts },
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
  const raw = (j.choices?.[0]?.message?.content ?? "").trim();
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  let parsed: z.infer<typeof PlanReviewSchema>;
  try {
    parsed = PlanReviewSchema.parse(JSON.parse(cleaned.slice(s, e + 1)));
  } catch {
    throw new Error("AI returned an unreadable review. Try again.");
  }

  // ---- Cross-validation pass: verify stamp/signature/seal claims ----
  // These are the highest false-positive category. For each such finding, run
  // a focused second call scoped to the title-block area on the cited sheet,
  // and drop or soft-flag the finding based on what the model actually sees.
  const stampClaims = parsed.findings
    .map((f, idx) => ({ idx, f }))
    .filter(({ f }) =>
      isStampSignatureClaim(`${f.title} ${f.detail} ${f.recommendation}`),
    );

  if (stampClaims.length > 0) {
    const verifyInstruction = `You are re-verifying ONE narrow claim about a construction drawing: whether a licensed design professional's STAMP, SEAL, SIGNATURE, or DIGITAL SIGNATURE is present.

CLAIMS TO VERIFY (each references a specific sheet in the attached document):
${stampClaims.map(({ f }, i) => `${i + 1}. Sheet ${f.sheet_reference || "unspecified"} — claim: "${f.title}". Detail: ${f.detail}`).join("\n")}

Instructions:
- Look at the TITLE BLOCK of each referenced sheet (usually bottom-right, sometimes right edge or bottom strip).
- Consider ALL of these as valid evidence of stamp/signature/seal: embossed round PE/RA seals; state-license numbers next to a name; wet signatures (often gray/faint on scans); "Digitally signed by…" text; DocuSign / Bluebeam / Adobe digital signature marks; initials + date on a signature line; typed name over a signature line with license#.
- If ANY such evidence is present or plausibly present, the claim is INVALID — the sheet IS stamped/signed.

Return ONLY JSON:
{
  "verifications": [
    { "index": 1, "verdict": "confirmed" | "invalid" | "uncertain", "evidence": "verbatim description of what you see in the title block (<220 chars)" }
  ]
}
"confirmed" = the sheet really has no stamp/signature/seal.
"invalid"   = a stamp/signature/seal IS present; drop the finding.
"uncertain" = you cannot tell — leave the finding but mark for manual review.`;

    const verifyParts: unknown[] = [{ type: "text", text: verifyInstruction }];
    if (isImage) {
      verifyParts.push({ type: "image_url", image_url: { url: signed.signedUrl } });
    } else {
      // Re-attach the PDF (already downloaded above; do again for a clean base64).
      const fileResp = await fetch(signed.signedUrl);
      if (fileResp.ok) {
        const buf = new Uint8Array(await fileResp.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const b64 = btoa(bin);
        verifyParts.push({ type: "file", file: { filename: doc.name, file_data: `data:${mime};base64,${b64}` } });
      }
    }

    try {
      const vResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: "You verify stamp/signature/seal claims on construction drawings. Prefer 'invalid' when evidence is present or plausible. Output JSON only." },
            { role: "user", content: verifyParts },
          ],
        }),
      });
      if (vResp.ok) {
        const vJson = (await vResp.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const vRaw = (vJson.choices?.[0]?.message?.content ?? "").replace(/```json|```/g, "").trim();
        const vs = vRaw.indexOf("{");
        const ve = vRaw.lastIndexOf("}");
        if (vs >= 0 && ve > vs) {
          const vParsed = JSON.parse(vRaw.slice(vs, ve + 1)) as {
            verifications?: Array<{ index?: number; verdict?: string; evidence?: string }>;
          };
          const dropIdx = new Set<number>();
          for (const v of vParsed.verifications ?? []) {
            const target = stampClaims[(v.index ?? 0) - 1];
            if (!target) continue;
            if (v.verdict === "invalid") {
              dropIdx.add(target.idx);
            } else if (v.verdict === "uncertain") {
              parsed.findings[target.idx].confidence = "low";
              parsed.findings[target.idx].needs_manual_verification = true;
              if (v.evidence) parsed.findings[target.idx].evidence_quote = v.evidence;
            } else if (v.verdict === "confirmed") {
              parsed.findings[target.idx].confidence = "high";
              if (v.evidence) parsed.findings[target.idx].evidence_quote = v.evidence;
            }
          }
          if (dropIdx.size > 0) {
            parsed.findings = parsed.findings.filter((_, i) => !dropIdx.has(i));
          }
        }
      }
    } catch {
      // Verification is best-effort; if it fails, downgrade the claims to needs-manual-review
      // rather than shipping a possibly-wrong finding at high severity.
      for (const { idx } of stampClaims) {
        parsed.findings[idx].confidence = "low";
        parsed.findings[idx].needs_manual_verification = true;
      }
    }
  }


  const { data: updated, error: uErr } = await supabase
    .from("project_documents")
    .update({ plan_review: parsed, plan_reviewed_at: new Date().toISOString() })
    .eq("id", docId).select("*").single();
  if (uErr) throw new Error(uErr.message);

  const high = parsed.findings.filter(f => f.severity === "high").length;
  await supabase.from("activity").insert({
    user_id: userId,
    project_id: doc.project_id,
    description: `AI plan review on "${doc.name}" — ${parsed.findings.length} finding${parsed.findings.length === 1 ? "" : "s"}${high ? ` (${high} high-severity)` : ""}.`,
  });

  return { document: updated, review: parsed };
}

export const reviewPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "planReview");
    return runPlanReviewForDocument(context.supabase, context.userId, data.id);
  });

// Batch review + consolidated PermitHealth report across all plan documents in a project.
export const batchReviewPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    project_id: z.string().uuid(),
    force: z.boolean().optional().default(false),
  }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "planReview");
    const { supabase, userId } = context;

    const { data: docs } = await supabase
      .from("project_documents")
      .select("id, name, mime_type, plan_review, plan_reviewed_at")
      .eq("project_id", data.project_id);

    const isPlan = (d: { name: string; mime_type: string | null }) =>
      (d.mime_type || "").startsWith("image/") ||
      (d.mime_type || "") === "application/pdf" ||
      d.name.toLowerCase().endsWith(".pdf");

    const plans = (docs ?? []).filter(isPlan);
    if (plans.length === 0) throw new Error("No plan documents (PDF or image) to review.");

    const targets = data.force ? plans : plans.filter((d) => !d.plan_reviewed_at);

    // Run reviews sequentially — Gemini gets angry with parallel large PDFs.
    const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];
    for (const d of targets) {
      try {
        await runPlanReviewForDocument(supabase, userId, d.id);
        results.push({ id: d.id, name: d.name, ok: true });
      } catch (err) {
        results.push({ id: d.id, name: d.name, ok: false, error: err instanceof Error ? err.message : "Failed" });
      }
    }

    // Reload all plans (now with fresh reviews).
    const { data: refreshed } = await supabase
      .from("project_documents")
      .select("id, name, plan_review, plan_reviewed_at")
      .eq("project_id", data.project_id)
      .in("id", plans.map((p) => p.id));

    type Finding = {
      category: string; severity: "low"|"medium"|"high"; title: string; detail: string;
      code_reference?: string; local_amendment?: string; sheet_reference?: string; recommendation?: string;
      document_name: string; document_id: string;
    };
    const allFindings: Finding[] = [];
    const perDoc: Array<{ id: string; name: string; risk: string; count: number; summary: string }> = [];
    const jurisdictions = new Set<string>();
    const amendments = new Set<string>();
    const sources = new Set<string>();

    for (const d of refreshed ?? []) {
      const pr = d.plan_review as {
        overall_summary?: string; overall_risk?: "low"|"medium"|"high";
        jurisdiction_context?: { jurisdiction?: string; applied_amendments?: string[]; source_urls?: string[] };
        findings?: Array<Omit<Finding, "document_name" | "document_id">>;
      } | null;
      if (!pr) continue;
      const findings = pr.findings ?? [];
      for (const f of findings) allFindings.push({ ...f, document_name: d.name, document_id: d.id });
      perDoc.push({
        id: d.id, name: d.name,
        risk: pr.overall_risk || "medium",
        count: findings.length,
        summary: pr.overall_summary || "",
      });
      if (pr.jurisdiction_context?.jurisdiction) jurisdictions.add(pr.jurisdiction_context.jurisdiction);
      (pr.jurisdiction_context?.applied_amendments || []).forEach((a) => amendments.add(a));
      (pr.jurisdiction_context?.source_urls || []).forEach((u) => sources.add(u));
    }

    const bySeverity = { high: 0, medium: 0, low: 0 };
    const byCategory: Record<string, number> = {};
    for (const f of allFindings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    }

    // Composite plan-health score (independent of project health).
    let planHealth = 100;
    planHealth -= bySeverity.high * 10;
    planHealth -= bySeverity.medium * 4;
    planHealth -= bySeverity.low * 1;
    planHealth = Math.max(0, Math.min(100, planHealth));
    const risk: "low"|"medium"|"high" =
      bySeverity.high >= 3 || planHealth < 50 ? "high" :
      bySeverity.high >= 1 || planHealth < 75 ? "medium" : "low";

    const topFindings = [...allFindings]
      .sort((a, b) => (a.severity === "high" ? -1 : b.severity === "high" ? 1 : a.severity === "medium" ? -1 : 1))
      .slice(0, 10);

    const report = {
      generated_at: new Date().toISOString(),
      project_id: data.project_id,
      documents_total: plans.length,
      documents_reviewed: perDoc.length,
      documents_newly_reviewed: results.filter((r) => r.ok).length,
      documents_failed: results.filter((r) => !r.ok),
      total_findings: allFindings.length,
      by_severity: bySeverity,
      by_category: byCategory,
      plan_health_score: planHealth,
      overall_risk: risk,
      jurisdictions: Array.from(jurisdictions),
      applied_amendments: Array.from(amendments).slice(0, 20),
      source_urls: Array.from(sources).slice(0, 15),
      per_document: perDoc,
      top_findings: topFindings,
      all_findings: allFindings,
    };

    await supabase.from("activity").insert({
      user_id: userId,
      project_id: data.project_id,
      description: `Batch plan review: ${perDoc.length} plan${perDoc.length === 1 ? "" : "s"} · ${allFindings.length} finding${allFindings.length === 1 ? "" : "s"} (${bySeverity.high} high) · Health ${planHealth}.`,
    });

    return report;
  });

// ============= Plan Review → Fix List / Reviewer Response =============
type PlanReviewFinding = {
  category: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  code_reference?: string;
  local_amendment?: string;
  sheet_reference?: string;
  recommendation?: string;
};

const categoryToChecklist: Record<string, string> = {
  missing_exits: "Life Safety",
  ada: "Accessibility",
  fire_code: "Fire Code",
  permitting_mistake: "Submittal",
  other: "Plan Review",
};

// Turn plan-review findings into checklist items appended to the project.
export const addPlanReviewFixesToChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase
      .from("project_documents")
      .select("id, name, project_id, plan_review")
      .eq("id", data.document_id).maybeSingle();
    if (!doc) throw new Error("Document not found");
    const pr = doc.plan_review as { findings?: PlanReviewFinding[] } | null;
    const findings = pr?.findings ?? [];
    if (findings.length === 0) throw new Error("No findings to convert");

    const { data: existing } = await context.supabase
      .from("permit_items").select("sort_order").eq("project_id", doc.project_id);
    const startOrder = (existing ?? []).reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 1;

    const rows = findings.map((f, idx) => {
      const refs = [f.code_reference, f.local_amendment && `Local: ${f.local_amendment}`, f.sheet_reference && `Sheet ${f.sheet_reference}`]
        .filter(Boolean).join(" · ");
      const notes = [
        f.detail,
        f.recommendation ? `Fix: ${f.recommendation}` : "",
        refs,
        `From plan review of "${doc.name}"`,
      ].filter(Boolean).join("\n");
      return {
        user_id: context.userId,
        project_id: doc.project_id,
        name: `[${f.severity.toUpperCase()}] ${f.title}`,
        category: categoryToChecklist[f.category] || "Plan Review",
        required: f.severity !== "low",
        notes,
        sort_order: startOrder + idx,
      };
    });

    const { data: inserted, error } = await context.supabase
      .from("permit_items").insert(rows).select("*");
    if (error) throw new Error(error.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: doc.project_id,
      description: `Added ${inserted.length} fix${inserted.length === 1 ? "" : "es"} to checklist from plan review.`,
    });
    return { inserted_count: inserted.length };
  });

// AI-drafted reviewer response letter addressing each finding.
export const draftReviewerResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) throw new Error("AI is not configured");

    const { data: doc } = await context.supabase
      .from("project_documents")
      .select("id, name, project_id, plan_review")
      .eq("id", data.document_id).maybeSingle();
    if (!doc) throw new Error("Document not found");
    const pr = doc.plan_review as {
      overall_summary?: string;
      jurisdiction_context?: { jurisdiction?: string };
      findings?: PlanReviewFinding[];
    } | null;
    const findings = pr?.findings ?? [];
    if (findings.length === 0) throw new Error("No findings to draft against");

    const { data: project } = await context.supabase
      .from("projects").select("name, jurisdiction, project_type, location")
      .eq("id", doc.project_id).maybeSingle();

    const juris = pr?.jurisdiction_context?.jurisdiction || project?.jurisdiction || "the local jurisdiction";

    const findingsBlock = findings.map((f, i) => `#${i + 1} [${f.severity.toUpperCase()} · ${f.category}] ${f.title}
Issue: ${f.detail}
Code: ${f.code_reference || "—"}${f.local_amendment ? ` (Local: ${f.local_amendment})` : ""}
Sheet: ${f.sheet_reference || "—"}
Proposed fix: ${f.recommendation || "—"}`).join("\n\n");

    const prompt = `You are drafting a formal comment-response letter from the design team back to the ${juris} plan reviewer for project "${project?.name ?? ""}"${project?.location ? ` at ${project.location}` : ""}.

For EACH finding below, write a concise, professional response in this exact format:

Comment #N — <short restatement of the reviewer's concern>
Response: <2-4 sentences: acknowledge, explain what was corrected, cite the sheet or detail that now addresses it, reference the applicable code section>.

Rules:
- Be direct and respectful. No filler.
- Cite specific sheet numbers and code sections when provided.
- If the fix is a design change, describe the change; if it's a clarification, state it plainly.
- Do not invent sheet numbers or code sections that weren't given.
- Start with a one-paragraph cover note addressed to the plan reviewer, then the numbered responses.
- End with a single-line sign-off placeholder.

FINDINGS:
${findingsBlock}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You are a licensed architect drafting formal plan-review comment responses. Output plain text only." },
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
    const letter = (j.choices?.[0]?.message?.content ?? "").trim();
    if (!letter) throw new Error("AI returned an empty response");

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: doc.project_id,
      description: `Drafted reviewer response letter for "${doc.name}" (${findings.length} comment${findings.length === 1 ? "" : "s"}).`,
    });

    return { letter, finding_count: findings.length };
  });
// ---- Summarize reviewer comments across all analyzed docs ----
const ReviewerSummarySchema = z.object({
  top_themes: z.array(z.string()).max(8).default([]),
  by_discipline: z.array(z.object({
    discipline: z.string(),
    items: z.array(z.string()).max(10).default([]),
  })).max(10).default([]),
  suggested_response_order: z.array(z.string()).max(10).default([]),
});

export const summarizeReviewerComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "aiCopilot");
    const { data: docs } = await context.supabase

      .from("project_documents")
      .select("name, ai_summary, ai_action_items, plan_review")
      .eq("project_id", data.project_id);
    const analyzed = (docs ?? []).filter((d) => d.ai_summary || d.ai_action_items || d.plan_review);
    if (analyzed.length === 0) throw new Error("Analyze or plan-review at least one document first.");
    const prompt = `Consolidate reviewer comments across these documents into themes an owner/PM can act on:

${JSON.stringify(analyzed)}

Return ONLY JSON: { "top_themes": ["..."], "by_discipline": [{ "discipline": "Mechanical", "items": ["..."] }], "suggested_response_order": ["do this first", "..."] }.
Only use facts present. Skip disciplines with no comments.`;
    return callGeminiJSON(prompt, "You group construction plan-review comments into actionable themes. Output JSON only.", ReviewerSummarySchema);
  });
// ---- Schedule risks ----
const RiskSchema = z.object({
  overall_risk: z.enum(["low", "medium", "high"]).default("medium"),
  risks: z.array(z.object({
    severity: z.enum(["low", "medium", "high"]).default("medium"),
    title: z.string(),
    detail: z.string(),
    mitigation: z.string().default(""),
    related: z.string().default(""),
  })).max(15).default([]),
});

export const flagScheduleRisks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "aiCopilot");
    const ctx = await gatherProjectContext(context.supabase, data.project_id);

    if (!ctx.project) throw new Error("Project not found");
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Identify schedule and permitting risks for this project as of ${today}.
PROJECT: ${JSON.stringify({ name: ctx.project.name, jurisdiction: ctx.project.jurisdiction, project_type: ctx.project.project_type, stage: ctx.project.current_stage })}
PERMITS: ${JSON.stringify(ctx.items.map((i: { name: string; status: string; due_date: string | null }) => ({ name: i.name, status: i.status, due: i.due_date })))}
DEADLINES: ${JSON.stringify(ctx.deadlines.map((d: { title: string; due_date: string | null }) => ({ title: d.title, due: d.due_date })))}
INSPECTIONS: ${JSON.stringify(ctx.inspections.map((i: { type: string; scheduled_date: string | null; result: string | null }) => ({ type: i.type, date: i.scheduled_date, result: i.result })))}
RECENT ACTIVITY: ${JSON.stringify(ctx.activity.map((a: { description: string }) => a.description))}

Flag: overdue items, tight review windows, inspection sequencing gaps, missing statuses, jurisdiction-specific bottlenecks. Only flag issues supported by the data.

Return ONLY JSON: { "overall_risk": "low|medium|high", "risks": [{ "severity": "high", "title": "...", "detail": "...", "mitigation": "...", "related": "permit or deadline reference" }] }.`;
    return callGeminiJSON(prompt, "You are a permit risk analyst. Only flag concrete, data-supported risks. Output JSON only.", RiskSchema);
  });


// ============================================================
// REDLINED PLAN PDF — burns AI review bboxes onto the plan
// ============================================================

// Severity → RGB (0-1) used for both the box outline and label chip fill.
function severityRgb(sev: string): [number, number, number] {
  if (sev === "high") return [0.85, 0.15, 0.15];
  if (sev === "medium") return [0.95, 0.55, 0.05];
  return [0.10, 0.55, 0.35];
}

export const generateRedlinedPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "planReview");

    const { data: doc } = await context.supabase
      .from("project_documents").select("*").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Document not found");
    const review = doc.plan_review as z.infer<typeof PlanReviewSchema> | null;
    if (!review || !Array.isArray(review.findings) || review.findings.length === 0) {
      throw new Error("Run Plan Review first — no findings to markup.");
    }

    const mime = doc.mime_type || "application/pdf";
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) throw new Error("Only PDF or image plans can be marked up.");

    const { data: signed, error: sErr } = await context.supabase
      .storage.from("project-docs").createSignedUrl(doc.storage_path, 600);
    if (sErr || !signed?.signedUrl) throw new Error("Could not access document");
    const srcResp = await fetch(signed.signedUrl);
    if (!srcResp.ok) throw new Error("Could not download plan");
    const srcBytes = new Uint8Array(await srcResp.arrayBuffer());

    // Lazy-load pdf-lib on the server to keep the client bundle lean.
    const { PDFDocument, StandardFonts, rgb, degrees: _deg } = await import("pdf-lib");
    void _deg;

    let pdf: import("pdf-lib").PDFDocument;
    if (isPdf) {
      pdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    } else {
      pdf = await PDFDocument.create();
      const img = mime.includes("png")
        ? await pdf.embedPng(srcBytes)
        : await pdf.embedJpg(srcBytes);
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }

    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pages = pdf.getPages();

    // Group findings by page (1-indexed → 0-indexed). Findings with no page default to page 1.
    const byPage = new Map<number, Array<{ n: number; f: z.infer<typeof PlanReviewSchema>["findings"][number] }>>();
    review.findings.forEach((f, idx) => {
      const p = Math.min(Math.max((f.page ?? 1) - 1, 0), pages.length - 1);
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p)!.push({ n: idx + 1, f });
    });

    let drawn = 0;
    for (const [pageIdx, items] of byPage) {
      const page = pages[pageIdx];
      const { width, height } = page.getSize();
      for (const { n, f } of items) {
        if (!f.bbox) continue;
        const { x, y, w, h } = f.bbox;
        // AI uses top-left origin; pdf-lib uses bottom-left. Convert.
        const px = Math.max(0, x) * width;
        const py = Math.max(0, height - (y + h) * height);
        const pw = Math.max(6, Math.min(w * width, width - px));
        const ph = Math.max(6, Math.min(h * height, height - py));
        const [r, g, b] = severityRgb(f.severity);

        // Semi-transparent fill + hard outline.
        page.drawRectangle({
          x: px, y: py, width: pw, height: ph,
          color: rgb(r, g, b),
          opacity: 0.12,
          borderColor: rgb(r, g, b),
          borderWidth: 2,
          borderOpacity: 1,
        });

        // Numbered chip anchored to the box's top-left corner.
        const label = String(n);
        const chipSize = 18;
        const chipX = px;
        const chipY = py + ph - chipSize;
        page.drawRectangle({
          x: chipX, y: chipY, width: chipSize + label.length * 4, height: chipSize,
          color: rgb(r, g, b), opacity: 0.95,
        });
        page.drawText(label, {
          x: chipX + 5, y: chipY + 4, size: 11, font, color: rgb(1, 1, 1),
        });
        drawn++;
      }
    }

    // Append a findings-index page so the numbered chips resolve to explanations.
    const indexPage = pdf.addPage([612, 792]); // US Letter
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const draw = (t: string, x: number, y: number, size = 10, bold = false, color: [number,number,number] = [0,0,0]) => {
      indexPage.drawText(t, { x, y, size, font: bold ? font : regular, color: rgb(color[0], color[1], color[2]) });
    };
    draw("AI PLAN REVIEW — REDLINE INDEX", 40, 750, 14, true);
    draw(`${doc.name}`, 40, 732, 10, false, [0.35, 0.35, 0.35]);
    if (review.jurisdiction_context?.jurisdiction) {
      draw(`Jurisdiction: ${review.jurisdiction_context.jurisdiction}`, 40, 718, 9, false, [0.35, 0.35, 0.35]);
    }
    draw(`Overall risk: ${review.overall_risk.toUpperCase()}  ·  Findings: ${review.findings.length}`, 40, 704, 9, false, [0.35, 0.35, 0.35]);

    let cursor = 680;
    review.findings.forEach((f, idx) => {
      if (cursor < 60) {
        const p = pdf.addPage([612, 792]);
        p.drawText("REDLINE INDEX (cont.)", { x: 40, y: 750, size: 12, font, color: rgb(0,0,0) });
        cursor = 720;
        // Swap indexPage reference implicitly via closure by rebinding draw target:
        // simplest: draw remaining directly on p
        const [r, g, b] = severityRgb(f.severity);
        p.drawRectangle({ x: 40, y: cursor - 2, width: 14, height: 14, color: rgb(r,g,b) });
        p.drawText(String(idx + 1), { x: 44, y: cursor + 2, size: 9, font, color: rgb(1,1,1) });
        p.drawText(`[${f.severity.toUpperCase()}] ${f.title}`.slice(0, 90), { x: 62, y: cursor + 2, size: 10, font, color: rgb(0,0,0) });
        cursor -= 14;
        const wrap = (t: string, max: number) => {
          const words = t.split(/\s+/); const out: string[] = []; let line = "";
          for (const w of words) { if ((line + " " + w).length > max) { out.push(line); line = w; } else { line = line ? line + " " + w : w; } }
          if (line) out.push(line); return out;
        };
        wrap(f.detail, 105).forEach((line) => { p.drawText(line, { x: 62, y: cursor, size: 9, font: regular, color: rgb(0.25, 0.25, 0.25) }); cursor -= 11; });
        const meta = [f.sheet_reference && `Sheet ${f.sheet_reference}`, f.code_reference, f.local_amendment && `Local: ${f.local_amendment}`].filter(Boolean).join("  ·  ");
        if (meta) { p.drawText(meta.slice(0, 110), { x: 62, y: cursor, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) }); cursor -= 10; }
        if (f.recommendation) { wrap("→ " + f.recommendation, 110).forEach((line) => { p.drawText(line, { x: 62, y: cursor, size: 8, font: regular, color: rgb(0.15, 0.4, 0.15) }); cursor -= 10; }); }
        cursor -= 8;
        return;
      }
      const [r, g, b] = severityRgb(f.severity);
      indexPage.drawRectangle({ x: 40, y: cursor - 2, width: 14, height: 14, color: rgb(r,g,b) });
      indexPage.drawText(String(idx + 1), { x: 44, y: cursor + 2, size: 9, font, color: rgb(1,1,1) });
      indexPage.drawText(`[${f.severity.toUpperCase()}] ${f.title}`.slice(0, 90), { x: 62, y: cursor + 2, size: 10, font, color: rgb(0,0,0) });
      cursor -= 14;
      const wrap = (t: string, max: number) => {
        const words = t.split(/\s+/); const out: string[] = []; let line = "";
        for (const w of words) { if ((line + " " + w).length > max) { out.push(line); line = w; } else { line = line ? line + " " + w : w; } }
        if (line) out.push(line); return out;
      };
      wrap(f.detail, 105).forEach((line) => { indexPage.drawText(line, { x: 62, y: cursor, size: 9, font: regular, color: rgb(0.25, 0.25, 0.25) }); cursor -= 11; });
      const meta = [f.sheet_reference && `Sheet ${f.sheet_reference}`, f.code_reference, f.local_amendment && `Local: ${f.local_amendment}`].filter(Boolean).join("  ·  ");
      if (meta) { indexPage.drawText(meta.slice(0, 110), { x: 62, y: cursor, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) }); cursor -= 10; }
      if (f.recommendation) {
        wrap("→ " + f.recommendation, 110).forEach((line) => { indexPage.drawText(line, { x: 62, y: cursor, size: 8, font: regular, color: rgb(0.15, 0.4, 0.15) }); cursor -= 10; });
      }
      cursor -= 8;
    });

    const outBytes = await pdf.save();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = `${doc.storage_path.replace(/\.[^/.]+$/, "")}.redlined-${stamp}.pdf`;
    const { error: upErr } = await context.supabase.storage
      .from("project-docs").upload(outPath, outBytes, {
        contentType: "application/pdf", upsert: true,
      });
    if (upErr) throw new Error(upErr.message);
    const { data: outSigned, error: signErr } = await context.supabase.storage
      .from("project-docs").createSignedUrl(outPath, 3600);
    if (signErr || !outSigned?.signedUrl) throw new Error("Could not sign redlined PDF");

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: doc.project_id,
      description: `Generated redlined plan PDF for "${doc.name}" — ${drawn} markup${drawn === 1 ? "" : "s"} across ${byPage.size} page${byPage.size === 1 ? "" : "s"}.`,
    });

    return { url: outSigned.signedUrl, path: outPath, markups: drawn, pages: byPage.size };
  });

/* -------------------- BATCH REPORT — one-click PDF export -------------------- */

const BatchReportPdfSchema = z.object({
  project_id: z.string().uuid(),
  report: z.object({
    generated_at: z.string().optional(),
    documents_reviewed: z.number(),
    documents_newly_reviewed: z.number().optional(),
    documents_total: z.number().optional(),
    documents_failed: z.array(z.object({ name: z.string() })).optional(),
    jurisdictions: z.array(z.string()).default([]),
    applied_amendments: z.array(z.string()).default([]),
    plan_health_score: z.number(),
    overall_risk: z.enum(["low", "medium", "high"]),
    total_findings: z.number(),
    by_severity: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
    by_category: z.record(z.string(), z.number()).default({}),
    top_findings: z.array(z.object({
      severity: z.enum(["low", "medium", "high"]),
      category: z.string().optional().default(""),
      title: z.string(),
      detail: z.string(),
      document_name: z.string(),
      sheet_reference: z.string().optional().nullable(),
      code_reference: z.string().optional().nullable(),
      local_amendment: z.string().optional().nullable(),
      recommendation: z.string().optional().nullable(),
    })).default([]),
  }),
});

export const generateBatchReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchReportPdfSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "planReview");

    const { data: project } = await context.supabase
      .from("projects").select("id, name, jurisdiction, location, project_type")
      .eq("id", data.project_id).maybeSingle();
    if (!project) throw new Error("Project not found");

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    const r = data.report;
    const brand = rgb(0.10, 0.55, 0.90);
    const muted = rgb(0.42, 0.42, 0.45);
    const dark = rgb(0.10, 0.11, 0.13);

    const wrap = (t: string, max: number) => {
      const words = t.split(/\s+/); const out: string[] = []; let line = "";
      for (const w of words) { if ((line + " " + w).length > max) { out.push(line); line = w; } else { line = line ? line + " " + w : w; } }
      if (line) out.push(line); return out;
    };

    let page = pdf.addPage([612, 792]);
    let y = 752;
    const newPage = () => { page = pdf.addPage([612, 792]); y = 752; };
    const ensure = (need: number) => { if (y - need < 60) newPage(); };

    // Header
    page.drawText("CONSOLIDATED PERMITHEALTH REPORT", { x: 40, y, size: 10, font, color: brand });
    y -= 22;
    page.drawText(project.name || "Project", { x: 40, y, size: 22, font, color: dark });
    y -= 18;
    const subtitle = [project.project_type, project.jurisdiction, project.location].filter(Boolean).join(" · ");
    if (subtitle) { page.drawText(subtitle.slice(0, 90), { x: 40, y, size: 10, font: regular, color: muted }); y -= 14; }
    const generatedAt = r.generated_at ? new Date(r.generated_at) : new Date();
    const generated = generatedAt.toLocaleString();
    const claims = context.claims as { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined;
    const generatedBy = claims?.user_metadata?.full_name || claims?.user_metadata?.name || claims?.email || context.userId;
    page.drawText(`Generated ${generated} by ${generatedBy}`.slice(0, 110), { x: 40, y, size: 9, font: regular, color: muted });
    y -= 24;
    page.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 0.5, color: rgb(0.85,0.85,0.88) });
    y -= 22;

    // Metric cards
    const riskRgb = r.overall_risk === "high" ? rgb(0.85, 0.15, 0.15) : r.overall_risk === "medium" ? rgb(0.95, 0.55, 0.05) : rgb(0.10, 0.55, 0.35);
    const cards: Array<{ label: string; value: string; sub: string; color?: import("pdf-lib").RGB }> = [
      { label: "PLAN HEALTH", value: String(r.plan_health_score), sub: `${r.overall_risk.toUpperCase()} RISK`, color: riskRgb },
      { label: "FINDINGS", value: String(r.total_findings), sub: `${r.by_severity.high} HIGH`, color: rgb(0.85,0.15,0.15) },
      { label: "MEDIUM", value: String(r.by_severity.medium), sub: "", color: rgb(0.95,0.55,0.05) },
      { label: "LOW", value: String(r.by_severity.low), sub: "", color: rgb(0.10,0.55,0.35) },
    ];
    const cardW = 128, cardH = 62, gap = 10;
    cards.forEach((c, i) => {
      const x = 40 + i * (cardW + gap);
      page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, borderColor: rgb(0.88,0.88,0.9), borderWidth: 0.5, color: rgb(0.98,0.98,0.99) });
      page.drawText(c.label, { x: x + 8, y: y - 14, size: 8, font, color: muted });
      page.drawText(c.value, { x: x + 8, y: y - 40, size: 24, font, color: c.color ?? dark });
      if (c.sub) page.drawText(c.sub, { x: x + 8, y: y - 54, size: 7, font, color: muted });
    });
    y -= cardH + 20;

    // Summary line
    const summary = `${r.documents_reviewed} plan${r.documents_reviewed === 1 ? "" : "s"} analyzed${r.documents_newly_reviewed ? ` · ${r.documents_newly_reviewed} newly reviewed` : ""}${r.jurisdictions.length > 0 ? ` · ${r.jurisdictions.join(", ")}` : ""}`;
    wrap(summary, 100).forEach((line) => { page.drawText(line, { x: 40, y, size: 10, font: regular, color: dark }); y -= 13; });
    y -= 8;

    // Categories
    const catEntries = Object.entries(r.by_category || {});
    if (catEntries.length > 0) {
      ensure(30);
      page.drawText("BY CATEGORY", { x: 40, y, size: 9, font, color: muted }); y -= 14;
      let cx = 40;
      catEntries.forEach(([k, v]) => {
        const label = `${k.replace(/_/g, " ").toUpperCase()} · ${v}`;
        const w = regular.widthOfTextAtSize(label, 8) + 12;
        if (cx + w > 572) { cx = 40; y -= 16; ensure(20); }
        page.drawRectangle({ x: cx, y: y - 4, width: w, height: 14, borderColor: rgb(0.85,0.85,0.88), borderWidth: 0.5, color: rgb(1,1,1) });
        page.drawText(label, { x: cx + 6, y: y, size: 8, font: regular, color: dark });
        cx += w + 6;
      });
      y -= 22;
    }

    if (r.documents_failed && r.documents_failed.length > 0) {
      ensure(24);
      page.drawText("FAILED TO REVIEW", { x: 40, y, size: 9, font, color: rgb(0.85,0.15,0.15) }); y -= 12;
      wrap(r.documents_failed.map((f) => f.name).join(", "), 110).forEach((line) => { page.drawText(line, { x: 40, y, size: 9, font: regular, color: dark }); y -= 12; });
      y -= 6;
    }

    // Findings
    if (r.top_findings.length > 0) {
      ensure(30);
      page.drawText("TOP FINDINGS", { x: 40, y, size: 10, font, color: brand }); y -= 16;
      r.top_findings.forEach((f, idx) => {
        ensure(70);
        const [sr, sg, sb] = f.severity === "high" ? [0.85,0.15,0.15] : f.severity === "medium" ? [0.95,0.55,0.05] : [0.10,0.55,0.35];
        page.drawRectangle({ x: 40, y: y - 3, width: 18, height: 14, color: rgb(sr,sg,sb) });
        page.drawText(String(idx + 1), { x: 44, y: y + 1, size: 9, font, color: rgb(1,1,1) });
        page.drawText(`[${f.severity.toUpperCase()}] ${f.title}`.slice(0, 88), { x: 64, y: y + 1, size: 10, font, color: dark });
        y -= 14;
        const cat = (f.category || "").replace(/_/g, " ");
        if (cat) { page.drawText(cat.toUpperCase(), { x: 64, y, size: 7, font, color: muted }); y -= 10; }
        wrap(f.detail, 108).forEach((line) => { ensure(14); page.drawText(line, { x: 64, y, size: 9, font: regular, color: dark }); y -= 11; });
        const meta = [f.document_name, f.sheet_reference && `Sheet ${f.sheet_reference}`, f.code_reference, f.local_amendment && `Local: ${f.local_amendment}`].filter(Boolean).join("  ·  ");
        if (meta) { ensure(12); page.drawText(meta.slice(0, 115), { x: 64, y, size: 8, font: regular, color: muted }); y -= 10; }
        if (f.recommendation) { wrap("→ " + f.recommendation, 110).forEach((line) => { ensure(12); page.drawText(line, { x: 64, y, size: 8, font: regular, color: rgb(0.15, 0.4, 0.15) }); y -= 10; }); }
        y -= 8;
      });
    }

    if (r.applied_amendments && r.applied_amendments.length > 0) {
      ensure(24);
      y -= 4;
      page.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 0.5, color: rgb(0.85,0.85,0.88) });
      y -= 14;
      page.drawText("APPLIED JURISDICTION AMENDMENTS", { x: 40, y, size: 8, font, color: muted }); y -= 12;
      wrap(r.applied_amendments.join(" · "), 115).forEach((line) => { ensure(12); page.drawText(line, { x: 40, y, size: 8, font: regular, color: dark }); y -= 10; });
    }

    // Audit log — who generated + review actions applied
    const reviewKeywords = [
      "plan review", "redline", "redlined", "reviewer response",
      "checklist", "batch review", "permithealth", "fix list", "fixes",
      "inspection", "share link", "shared report", "amendment",
    ];
    const orFilter = reviewKeywords.map((k) => `description.ilike.%${k}%`).join(",");
    const { data: auditRows } = await context.supabase
      .from("activity")
      .select("description, created_at, user_id")
      .eq("project_id", data.project_id)
      .or(orFilter)
      .order("created_at", { ascending: false })
      .limit(25);

    ensure(60);
    y -= 4;
    page.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.88) });
    y -= 16;
    page.drawText("AUDIT LOG", { x: 40, y, size: 10, font, color: brand }); y -= 14;
    page.drawText(`Report generated by ${generatedBy}`.slice(0, 115), { x: 40, y, size: 9, font: regular, color: dark }); y -= 11;
    page.drawText(`Timestamp: ${generated}`, { x: 40, y, size: 9, font: regular, color: muted }); y -= 16;

    if (!auditRows || auditRows.length === 0) {
      page.drawText("No prior review actions recorded for this project.", { x: 40, y, size: 9, font: regular, color: muted }); y -= 12;
    } else {
      page.drawText(`Recent review actions (${auditRows.length})`, { x: 40, y, size: 8, font, color: muted }); y -= 12;
      auditRows.forEach((row) => {
        ensure(24);
        const when = new Date(row.created_at).toLocaleString();
        const actor = row.user_id === context.userId ? generatedBy : (row.user_id || "system");
        const header = `${when}  ·  ${actor}`.slice(0, 115);
        page.drawText(header, { x: 40, y, size: 8, font, color: dark }); y -= 10;
        wrap(row.description || "", 115).forEach((line) => {
          ensure(12);
          page.drawText(line, { x: 48, y, size: 8, font: regular, color: muted }); y -= 10;
        });
        y -= 3;
      });
    }

    // Footer on every page
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Permivio · PermitHealth Report · Page ${i + 1} of ${pages.length}`, { x: 40, y: 30, size: 8, font: regular, color: muted });
    });

    const outBytes = await pdf.save();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = `${context.userId}/${data.project_id}/reports/permithealth-${stamp}.pdf`;
    const { error: upErr } = await context.supabase.storage
      .from("project-docs").upload(outPath, outBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: signErr } = await context.supabase.storage
      .from("project-docs").createSignedUrl(outPath, 3600);
    if (signErr || !signed?.signedUrl) throw new Error("Could not sign report PDF");

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Exported PermitHealth report PDF — health ${r.plan_health_score}, ${r.total_findings} findings.`,
    });

    return { url: signed.signedUrl, path: outPath };
  });
