// Phase 3 — AI enrichment for permit roadmaps.
// Fans out Firecrawl searches over jurisdiction sites, feeds excerpts to Gemini,
// then upgrades roadmap items with source citations and a `verified` label.
// Phase 4 helpers: send to checklist, export roadmap PDF, answer follow-ups.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGeminiJSON } from "@/lib/ai.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";

const ENRICH_VERSION = "enrich-v1";

// ---------- AI response schema ----------
const AiSource = z.object({
  url: z.string(),
  title: z.string().optional().nullable(),
  publisher: z.string().optional().nullable(),
  quote: z.string().optional().nullable(),
});
const AiPermitUpdate = z.object({
  name: z.string(),
  source_urls: z.array(z.string()).default([]),
  fee_estimate_usd: z.number().optional().nullable(),
  fee_basis: z.string().optional().nullable(),
  review_days_min: z.number().optional().nullable(),
  review_days_max: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  jurisdiction_confirmed: z.boolean().optional().default(false),
});
const AiDocumentUpdate = z.object({
  name: z.string(),
  source_urls: z.array(z.string()).default([]),
  jurisdiction_confirmed: z.boolean().optional().default(false),
});
const AiAgencyUpdate = z.object({
  name: z.string(),
  url: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  source_urls: z.array(z.string()).default([]),
  jurisdiction_confirmed: z.boolean().optional().default(false),
});
const AiNewPermit = z.object({
  name: z.string(),
  agency: z.string(),
  level: z.enum(["city", "county", "state", "federal", "utility", "special_district"]),
  category: z.string(),
  likelihood: z.enum(["required", "likely", "conditional", "not_required"]),
  review_days_min: z.number().optional().nullable(),
  review_days_max: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  source_urls: z.array(z.string()).default([]),
});
const AiRisk = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: z.string().optional().nullable(),
  message: z.string(),
  mitigation: z.string().optional().nullable(),
});
const AiFollowup = z.object({ question: z.string(), field_hint: z.string().optional().nullable() });

const AiEnrichment = z.object({
  summary: z.string().optional().nullable(),
  sources: z.array(AiSource).default([]),
  permit_updates: z.array(AiPermitUpdate).default([]),
  document_updates: z.array(AiDocumentUpdate).default([]),
  agency_updates: z.array(AiAgencyUpdate).default([]),
  new_permits: z.array(AiNewPermit).default([]),
  new_risks: z.array(AiRisk).default([]),
  followups: z.array(AiFollowup).default([]),
});

function normalizeUrl(u: string): string {
  try {
    return new URL(u).toString();
  } catch {
    return u.trim();
  }
}

async function fanoutResearch(fcKey: string, scope: {
  address?: string | null;
  scope_text?: string | null;
  project_type?: string | null;
  trades?: Record<string, { involved?: string }> | null;
}): Promise<{ url: string; title: string; markdown: string; publisher?: string }[]> {
  const addr = (scope.address ?? "").trim();
  if (!addr) return [];
  const trades = scope.trades ?? {};
  const on = (k: string) => trades[k]?.involved === "yes";
  const queries: string[] = [
    `${addr} building permit application requirements site:.gov OR site:.us`,
    `${addr} zoning use permit site plan review site:.gov OR site:.us`,
    `${addr} certificate of occupancy requirements site:.gov OR site:.us`,
  ];
  if (on("fire_alarm") || on("fire_sprinkler")) queries.push(`${addr} fire marshal permit sprinkler alarm site:.gov OR site:.us`);
  if (on("food_service")) queries.push(`${addr} health department food service plan review permit site:.gov OR site:.us`);
  if (on("site_dev") || on("grading") || on("stormwater")) queries.push(`${addr} grading stormwater sediment erosion permit site:.gov OR site:.us`);
  if (on("row")) queries.push(`${addr} right of way encroachment permit public works site:.gov OR site:.us`);
  if (on("utility")) queries.push(`${addr} water sewer utility connection permit site:.gov OR site:.us`);
  if (on("signage")) queries.push(`${addr} sign permit ordinance site:.gov OR site:.us`);
  if (scope.scope_text && scope.scope_text.length > 8) {
    queries.push(`${addr} ${scope.scope_text.slice(0, 100)} permit site:.gov OR site:.us`);
  }

  const searches = await Promise.all(
    queries.map((q) => firecrawlSearch(fcKey, q, 4).catch(() => [])),
  );
  const seen = new Set<string>();
  const ranked: { url: string; title: string }[] = [];
  for (const bucket of searches) {
    for (const r of bucket) {
      if (!r?.url) continue;
      const u = normalizeUrl(r.url);
      if (seen.has(u)) continue;
      seen.add(u);
      ranked.push({ url: u, title: r.title ?? "" });
    }
  }
  ranked.sort((a, b) => {
    const ag = /\.(gov|us)(\/|$)/i.test(a.url) ? 0 : 1;
    const bg = /\.(gov|us)(\/|$)/i.test(b.url) ? 0 : 1;
    return ag - bg;
  });
  const top = ranked.slice(0, 6);
  const scrapes = await Promise.all(
    top.map(async (r) => {
      try {
        const timeout = new Promise<null>((res) => setTimeout(() => res(null), 12000));
        const s = await Promise.race([firecrawlScrape(fcKey, r.url), timeout]);
        if (!s || !s.markdown) return null;
        const host = (() => { try { return new URL(r.url).host; } catch { return undefined; } })();
        return { url: r.url, title: s.title || r.title, markdown: s.markdown.slice(0, 6000), publisher: host };
      } catch { return null; }
    }),
  );
  return scrapes.filter((s): s is NonNullable<typeof s> => !!s);
}

export const enrichRoadmapWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Load latest roadmap + scope + current children
    const { data: roadmap, error: rErr } = await supabase
      .from("permit_roadmaps")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!roadmap) throw new Error("Generate the baseline roadmap first.");

    const { data: scope } = await supabase
      .from("scope_of_work")
      .select("*")
      .eq("id", roadmap.scope_id)
      .maybeSingle();
    if (!scope) throw new Error("Scope not found for this roadmap.");

    const [permitsRes, docsRes, agenciesRes] = await Promise.all([
      supabase.from("roadmap_permits").select("*").eq("roadmap_id", roadmap.id),
      supabase.from("roadmap_documents").select("*").eq("roadmap_id", roadmap.id),
      supabase.from("roadmap_agencies").select("*").eq("roadmap_id", roadmap.id),
    ]);
    const permits = permitsRes.data ?? [];
    const docs = docsRes.data ?? [];
    const agencies = agenciesRes.data ?? [];

    // Firecrawl fan-out
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const scraped = fcKey
      ? await fanoutResearch(fcKey, scope as never).catch(() => [])
      : [];

    const researchBlock = scraped.length
      ? `\n\n[LIVE JURISDICTION RESEARCH — ${scraped.length} pages]\n` +
        scraped.map((s, i) => `--- SOURCE ${i + 1} ---\nURL: ${s.url}\nTITLE: ${s.title}\n\n${s.markdown}`).join("\n\n")
      : "\n\n[No live jurisdiction sources retrieved — rely on model codes and label items ai_assisted.]";

    const scopeSummary = {
      address: scope.address,
      project_type: scope.project_type,
      residential_or_commercial: scope.residential_or_commercial,
      occupancy_existing: scope.occupancy_existing,
      occupancy_proposed: scope.occupancy_proposed,
      construction_type: scope.construction_type,
      construction_value_cents: scope.construction_value_cents,
      sq_ft_gross: scope.sq_ft_gross,
      sq_ft_affected: scope.sq_ft_affected,
      scope_text: scope.scope_text,
      trades: scope.trades,
    };

    const baseline = {
      permits: permits.map((p) => ({ name: p.name, agency: p.agency, category: p.category, likelihood: p.likelihood, verification: p.verification })),
      documents: docs.map((d) => ({ name: d.name, verification: d.verification })),
      agencies: agencies.map((a) => ({ name: a.name, level: a.level, verification: a.verification })),
    };

    const system =
      `You are a senior permit expeditor working for Permivio. Enrich an existing rule-engine roadmap with jurisdiction-specific facts sourced ONLY from the scraped excerpts below. ` +
      `RULES: (1) Every permit/document/agency update MUST reference at least one source_url copied verbatim from the excerpts, OR omit that entry. ` +
      `(2) Never invent phone numbers, fees, or review timelines. If the excerpts don't cover them, leave the field null. ` +
      `(3) Only add \`new_permits\` when the excerpts clearly indicate a jurisdiction-specific permit missing from the baseline. ` +
      `(4) Prefer .gov / .us URLs. (5) Keep summaries under 3 sentences. ` +
      `(6) When you are less than confident an item applies, add a followup question instead of asserting it.`;

    const prompt =
      `SCOPE:\n${JSON.stringify(scopeSummary, null, 2)}\n\n` +
      `BASELINE ROADMAP:\n${JSON.stringify(baseline, null, 2)}\n` +
      researchBlock +
      `\n\nReturn JSON matching this TypeScript shape exactly:\n` +
      `{ summary?: string; sources: {url, title?, publisher?, quote?}[]; permit_updates: {name, source_urls[], fee_estimate_usd?, fee_basis?, review_days_min?, review_days_max?, notes?, jurisdiction_confirmed?}[]; document_updates: {name, source_urls[], jurisdiction_confirmed?}[]; agency_updates: {name, url?, phone?, source_urls[], jurisdiction_confirmed?}[]; new_permits: {name, agency, level, category, likelihood, review_days_min?, review_days_max?, notes?, source_urls[]}[]; new_risks: {severity, category?, message, mitigation?}[]; followups: {question, field_hint?}[] }\n` +
      `Match \`name\` on updates EXACTLY to the baseline entries above (case-insensitive OK).`;

    const ai = await callGeminiJSON(prompt, system, AiEnrichment, {
      model: "google/gemini-3.6-flash",
      max_tokens: 16000,
    });

    // Insert sources — dedupe by url
    const sourceUrlSet = new Set<string>();
    const sourceRows: { url: string; title: string | null; publisher: string | null; quote: string | null; kind: "agency_site" | "portal" | "code" | "ordinance" | "other" }[] = [];
    for (const s of ai.sources ?? []) {
      const url = normalizeUrl(s.url);
      if (!url || sourceUrlSet.has(url)) continue;
      sourceUrlSet.add(url);
      const kind: "agency_site" | "portal" | "code" | "ordinance" | "other" =
        /\.gov|\.us/i.test(url) ? "agency_site" : "other";
      sourceRows.push({
        url,
        title: s.title ?? null,
        publisher: s.publisher ?? null,
        quote: (s.quote ?? "").slice(0, 400) || null,
        kind,
      });
    }
    // Also add scraped pages that AI didn't cite — they still form the evidence pool.
    for (const s of scraped) {
      if (sourceUrlSet.has(s.url)) continue;
      sourceUrlSet.add(s.url);
      sourceRows.push({ url: s.url, title: s.title || null, publisher: s.publisher || null, quote: null, kind: /\.gov|\.us/i.test(s.url) ? "agency_site" : "other" });
    }

    // Clear prior sources for this roadmap so re-runs are idempotent
    await supabase.from("roadmap_sources").delete().eq("roadmap_id", roadmap.id);

    const urlToSourceId = new Map<string, string>();
    if (sourceRows.length) {
      const { data: inserted } = await supabase
        .from("roadmap_sources")
        .insert(sourceRows.map((s) => ({ ...s, roadmap_id: roadmap.id, retrieved_at: new Date().toISOString() })))
        .select("id, url");
      for (const row of inserted ?? []) urlToSourceId.set(row.url as string, row.id as string);
    }

    const norm = (s: string) => s.trim().toLowerCase();

    // Permit updates
    for (const upd of ai.permit_updates ?? []) {
      const target = permits.find((p) => norm(p.name) === norm(upd.name));
      if (!target) continue;
      const ids = (upd.source_urls ?? [])
        .map((u) => urlToSourceId.get(normalizeUrl(u)))
        .filter((x): x is string => !!x);
      if (!ids.length && !upd.jurisdiction_confirmed) continue;
      const patch: Record<string, unknown> = {
        source_ids: Array.from(new Set([...(target.source_ids ?? []), ...ids])),
        verification: ids.length ? "verified" : target.verification,
      };
      if (upd.review_days_min != null) patch.review_days_min = upd.review_days_min;
      if (upd.review_days_max != null) patch.review_days_max = upd.review_days_max;
      if (upd.fee_estimate_usd != null) patch.fee_estimate_cents = Math.round(upd.fee_estimate_usd * 100);
      if (upd.fee_basis) patch.fee_basis = upd.fee_basis;
      if (upd.notes) patch.notes = [target.notes, upd.notes].filter(Boolean).join(" · ").slice(0, 800);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("roadmap_permits") as any).update(patch).eq("id", target.id);
    }

    // Document updates
    for (const upd of ai.document_updates ?? []) {
      const target = docs.find((d) => norm(d.name) === norm(upd.name));
      if (!target) continue;
      const ids = (upd.source_urls ?? []).map((u) => urlToSourceId.get(normalizeUrl(u))).filter((x): x is string => !!x);
      if (!ids.length) continue;
      await supabase
        .from("roadmap_documents")
        .update({
          source_ids: Array.from(new Set([...(target.source_ids ?? []), ...ids])),
          verification: "verified",
        })
        .eq("id", target.id);
    }

    // Agency updates
    for (const upd of ai.agency_updates ?? []) {
      const target = agencies.find((a) => norm(a.name) === norm(upd.name));
      if (!target) continue;
      const ids = (upd.source_urls ?? []).map((u) => urlToSourceId.get(normalizeUrl(u))).filter((x): x is string => !!x);
      const patch: Record<string, unknown> = {};
      if (ids.length) {
        patch.source_id = ids[0];
        patch.verification = "verified";
      }
      if (upd.url) patch.url = upd.url;
      if (upd.phone) patch.phone = upd.phone;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (Object.keys(patch).length) await (supabase.from("roadmap_agencies") as any).update(patch).eq("id", target.id);
    }

    // New permits
    const newPermits = ai.new_permits ?? [];
    if (newPermits.length) {
      const rows = newPermits.map((p, i) => {
        const ids = (p.source_urls ?? []).map((u) => urlToSourceId.get(normalizeUrl(u))).filter((x): x is string => !!x);
        return {
          roadmap_id: roadmap.id,
          name: p.name,
          agency: p.agency,
          level: p.level,
          // cast: AI returns free-form category; DB enum will validate at insert time
          category: p.category as never,
          likelihood: p.likelihood,
          verification: (ids.length ? "verified" : "ai_assisted") as never,
          review_days_min: p.review_days_min ?? null,
          review_days_max: p.review_days_max ?? null,
          sequence_order: (permits.length + i + 1) * 10,
          critical_path: false,
          notes: p.notes ?? null,
          source_ids: ids,
          depends_on: [] as string[],
          concurrent_with: [] as string[],
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("roadmap_permits") as any).insert(rows);
    }

    // Risks
    const newRisks = ai.new_risks ?? [];
    if (newRisks.length) {
      await supabase.from("roadmap_risks").insert(
        newRisks.map((r) => ({
          roadmap_id: roadmap.id,
          severity: r.severity,
          category: r.category ?? null,
          message: r.message,
          mitigation: r.mitigation ?? null,
        })),
      );
    }

    // Follow-ups (append; don't dup existing ones)
    const followups = ai.followups ?? [];
    if (followups.length) {
      const { data: existing } = await supabase
        .from("roadmap_followups").select("question").eq("roadmap_id", roadmap.id);
      const known = new Set((existing ?? []).map((r) => norm(r.question)));
      const rows = followups
        .filter((f) => !known.has(norm(f.question)))
        .map((f) => ({ roadmap_id: roadmap.id, question: f.question, field_hint: f.field_hint ?? null }));
      if (rows.length) await supabase.from("roadmap_followups").insert(rows);
    }

    // Update roadmap header
    const totalSources = sourceRows.length;
    const verifiedCount =
      permits.filter((p) => p.verification === "verified").length +
      docs.filter((d) => d.verification === "verified").length;
    const newConfidence = Math.min(0.95, (roadmap.confidence ?? 0.5) + Math.min(0.35, totalSources * 0.04) + verifiedCount * 0.01);

    await supabase
      .from("permit_roadmaps")
      .update({
        summary: ai.summary || roadmap.summary,
        confidence: newConfidence,
        generated_by_model: "google/gemini-3.6-flash",
        prompt_version: ENRICH_VERSION,
      })
      .eq("id", roadmap.id);

    return { ok: true, sources_added: totalSources, new_permits: newPermits.length };
  });

// ---------- Phase 4: send to checklist ----------
export const sendRoadmapToChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roadmap } = await supabase
      .from("permit_roadmaps").select("id").eq("project_id", data.project_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!roadmap) throw new Error("No roadmap for this project yet.");

    const { data: permits } = await supabase
      .from("roadmap_permits").select("name, category, agency, likelihood, notes, sequence_order")
      .eq("roadmap_id", roadmap.id).order("sequence_order", { ascending: true });

    const rows = (permits ?? [])
      .filter((p) => p.likelihood === "required" || p.likelihood === "likely")
      .map((p, idx) => ({
        user_id: userId,
        project_id: data.project_id,
        name: p.name,
        category: (p.category ?? "other") as string,
        required: p.likelihood === "required",
        notes: [p.agency, p.notes].filter(Boolean).join(" · ").slice(0, 500),
        sort_order: 1000 + idx,
      }));
    if (!rows.length) return { inserted: 0 };

    // Dedupe against existing items by name
    const { data: existing } = await supabase
      .from("permit_items").select("name").eq("project_id", data.project_id);
    const known = new Set((existing ?? []).map((r) => (r.name as string).trim().toLowerCase()));
    const toInsert = rows.filter((r) => !known.has(r.name.trim().toLowerCase()));
    if (!toInsert.length) return { inserted: 0 };

    const { error } = await supabase.from("permit_items").insert(toInsert);
    if (error) throw new Error(error.message);

    await supabase.from("activity").insert({
      user_id: userId,
      project_id: data.project_id,
      description: `Sent ${toInsert.length} roadmap permits to checklist.`,
    });
    return { inserted: toInsert.length };
  });

// ---------- Phase 4: answer follow-up ----------
export const answerRoadmapFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ followup_id: z.string().uuid(), answer: z.string().trim().min(1).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("roadmap_followups")
      .update({ answered_value: data.answer, answered_at: new Date().toISOString() })
      .eq("id", data.followup_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Phase 4: PDF export ----------
export const exportRoadmapPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: roadmap } = await supabase
      .from("permit_roadmaps").select("*").eq("project_id", data.project_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!roadmap) throw new Error("No roadmap to export.");
    const [permits, docs, agencies, risks, sources] = await Promise.all([
      supabase.from("roadmap_permits").select("*").eq("roadmap_id", roadmap.id).order("sequence_order"),
      supabase.from("roadmap_documents").select("*").eq("roadmap_id", roadmap.id),
      supabase.from("roadmap_agencies").select("*").eq("roadmap_id", roadmap.id),
      supabase.from("roadmap_risks").select("*").eq("roadmap_id", roadmap.id),
      supabase.from("roadmap_sources").select("*").eq("roadmap_id", roadmap.id),
    ]);
    const { data: project } = await supabase
      .from("projects").select("name, location").eq("id", data.project_id).maybeSingle();

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const brand = rgb(0.36, 0.44, 0.94);
    const ink = rgb(0.1, 0.11, 0.14);
    const muted = rgb(0.45, 0.48, 0.55);

    let page = pdf.addPage([612, 792]);
    let y = 760;
    const M = 48;
    const W = 612 - M * 2;

    const san = (s: string) => (s ?? "")
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/[\u2022\u25E6\u25AA\u25AB]/g, "-")
      .replace(/[\u2713\u2714]/g, "[x]")
      .replace(/[\u2715\u2717\u2718]/g, "[ ]")
      .replace(/\u00A0/g, " ")
      .replace(/[^\x00-\xFF]/g, "?");

    const draw = (t: string, o: Parameters<typeof page.drawText>[1]) => page.drawText(san(t), o);
    const wrap = (text: string, size: number, f = font) => {
      const words = san(text).split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (f.widthOfTextAtSize(t, size) > W) { if (line) lines.push(line); line = w; } else line = t;
      }
      if (line) lines.push(line);
      return lines;
    };
    const ensure = (h: number) => { if (y - h < 60) { page = pdf.addPage([612, 792]); y = 760; } };
    const heading = (t: string, size = 13) => { ensure(size + 10); draw(t, { x: M, y, size, font: bold, color: brand }); y -= size + 6; };
    const para = (t: string, size = 10, color = ink) => {
      for (const l of wrap(t, size)) { ensure(size + 4); draw(l, { x: M, y, size, font, color }); y -= size + 4; }
    };

    // Header
    page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: brand });
    draw("PERMIVIO · Permit Roadmap", { x: M, y: 766, size: 12, font: bold, color: rgb(1, 1, 1) });
    y = 730;

    draw(project?.name ?? "Project Roadmap", { x: M, y, size: 16, font: bold, color: ink });
    y -= 20;
    para(project?.location ?? "", 10, muted);
    y -= 4;
    if (roadmap.summary) { heading("Summary"); para(roadmap.summary); y -= 4; }
    para(`Health ${roadmap.health_score ?? "—"} · Confidence ${Math.round((roadmap.confidence ?? 0) * 100)}% · ${roadmap.prompt_version}`, 9, muted);
    y -= 6;

    heading(`Permits (${permits.data?.length ?? 0})`);
    for (const p of permits.data ?? []) {
      ensure(30);
      draw(`- ${p.name}`, { x: M, y, size: 11, font: bold, color: ink });
      y -= 14;
      const meta = `${p.agency} · ${p.likelihood} · ${p.verification} · ${p.review_days_min ?? "—"}-${p.review_days_max ?? "—"} biz days`;
      para(meta, 9, muted);
      if (p.notes) para(p.notes, 10);
      y -= 2;
    }

    if ((docs.data ?? []).length) {
      heading(`Required Documents (${docs.data!.length})`);
      for (const d of docs.data!) para(`- ${d.name}  [${d.verification}]`, 10);
    }
    if ((agencies.data ?? []).length) {
      heading(`Reviewing Agencies (${agencies.data!.length})`);
      for (const a of agencies.data!) para(`- ${a.name}${a.role ? " — " + a.role : ""}  [${a.verification}]`, 10);
    }
    if ((risks.data ?? []).length) {
      heading(`Risks (${risks.data!.length})`);
      for (const rk of risks.data!) para(`[${rk.severity}] ${rk.message}${rk.mitigation ? "  Mitigation: " + rk.mitigation : ""}`, 10);
    }
    if ((sources.data ?? []).length) {
      heading(`Sources (${sources.data!.length})`);
      for (const s of sources.data!) {
        para(`- ${s.title ?? s.url}`, 10);
        if (s.url) para(`  ${s.url}`, 9, muted);
      }
    }

    const bytes = await pdf.save();
    // base64 encode
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    // btoa is available on Workers
    const base64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
    return { pdf_base64: base64, filename: `permivio-roadmap-${data.project_id.slice(0, 8)}.pdf` };
  });

// ---------- Phase 4: fetch sources for drawer ----------
export const getRoadmapSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roadmap } = await context.supabase
      .from("permit_roadmaps").select("id").eq("project_id", data.project_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!roadmap) return { sources: [] };
    const { data: sources } = await context.supabase
      .from("roadmap_sources").select("*").eq("roadmap_id", roadmap.id);
    return { sources: sources ?? [] };
  });
