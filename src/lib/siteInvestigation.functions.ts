import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGeminiJSON, toSlug } from "@/lib/ai.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";
import {
  SI_REPORT_SECTIONS,
  SI_FINDING_CATEGORIES,
  SITE_INVESTIGATION_DISCLAIMER,
  UTILITY_CAPACITY_CAVEAT,
  ratingMeta,
} from "@/lib/siteInvestigationConfig";
import {
  buildInvestigationPlan,
  activeSectionKeys,
  activeModuleIds,
  depthMeta,
  complexityMeta,
  moduleMeta,
  RISK_CATEGORIES,
  NO_DEAL_KILLERS_TEXT,
  type InvestigationPlan,
} from "@/lib/siteInvestigationEngine";

export const SI_PROMPT_VERSION = "site-investigation-v2-engine";
export const SI_MODEL = "google/gemini-2.5-pro";


const SectionSchema = z.object({
  key: z.string(),
  title: z.string().default(""),
  body: z.string().default(""),
  bullets: z.array(z.string()).max(30).default([]),
});

const SiSchema = z.object({
  executive_summary: z.string().default(""),
  feasibility_rating: z.enum(["green", "yellow", "orange", "red", "gray"]).default("gray"),
  feasibility_rationale: z.string().default(""),
  property_info: z.record(z.string(), z.string()).default({}),
  sections: z.array(SectionSchema).max(30).default([]),
  findings: z.array(z.object({
    category: z.string().default("zoning"),
    classification: z.enum(["likely_permitted", "conditional", "potentially_not_permitted", "needs_confirmation"]).default("needs_confirmation"),
    title: z.string().min(2),
    detail: z.string().default(""),
    impact: z.string().default(""),
    source_url: z.string().default(""),
    source_title: z.string().default(""),
    verification: z.enum(["verified", "ai_assisted", "needs_agency_confirmation"]).default("needs_agency_confirmation"),
  })).max(120).default([]),
  permits: z.array(z.object({
    approval: z.string().min(2),
    agency: z.string().default(""),
    why_required: z.string().default(""),
    trigger_condition: z.string().default(""),
    timeline_estimate: z.string().default(""),
    concurrent: z.boolean().default(false),
    source_url: z.string().default(""),
    verification: z.enum(["verified", "ai_assisted", "needs_agency_confirmation"]).default("needs_agency_confirmation"),
  })).max(60).default([]),
  timeline: z.array(z.object({
    phase: z.string(),
    duration: z.string().default(""),
    depends_on: z.string().default(""),
    notes: z.string().default(""),
    concurrent: z.boolean().default(false),
    critical_path: z.boolean().default(false),
    long_lead: z.boolean().default(false),
  })).max(30).default([]),
  feasibility_snapshot: z.object({
    overall: z.string().default(""),
    proposed_project: z.string().default(""),
    property: z.string().default(""),
    jurisdiction: z.string().default(""),
    zoning_result: z.string().default(""),
    use_feasibility: z.string().default(""),
    major_approvals: z.string().default(""),
    primary_risk: z.string().default(""),
    critical_path: z.string().default(""),
    estimated_approval_range: z.string().default(""),
    recommended_next_step: z.string().default(""),
  }).default({}),
  risks: z.array(z.object({
    category: z.string().default("schedule"),
    level: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
    why: z.string().default(""),
    supporting_info: z.string().default(""),
    mitigation: z.string().default(""),
    verification: z.enum(["verified", "ai_assisted", "needs_agency_confirmation"]).default("needs_agency_confirmation"),
    parcel_label: z.string().default(""),
  })).max(24).default([]),
  deal_killers: z.array(z.object({
    title: z.string().min(2),
    detail: z.string().default(""),
    supporting_info: z.string().default(""),
    verification: z.enum(["verified", "ai_assisted", "needs_agency_confirmation"]).default("needs_agency_confirmation"),
  })).max(12).default([]),
  due_diligence: z.array(z.object({
    item: z.string().min(2),
    priority: z.enum(["before_purchase", "before_lease", "before_design", "before_permit", "before_construction"]).default("before_design"),
    why: z.string().default(""),
    who: z.string().default(""),
  })).max(30).default([]),
  parcel_notes: z.array(z.object({
    label: z.string().default(""),
    zoning: z.string().default(""),
    land_use: z.string().default(""),
    jurisdiction: z.string().default(""),
    notes: z.string().default(""),
    verification: z.enum(["verified", "ai_assisted", "needs_agency_confirmation"]).default("needs_agency_confirmation"),
  })).max(20).default([]),
  assumptions: z.array(z.string()).max(30).default([]),
  outstanding_questions: z.array(z.string()).max(30).default([]),
  recommended_next_steps: z.array(z.string()).max(30).default([]),
  sources: z.array(z.object({ url: z.string(), title: z.string().default("") })).max(40).default([]),
});

type SiOut = z.infer<typeof SiSchema>;

const ParcelInput = z.object({
  label: z.string().max(60).optional(),
  parcel_number: z.string().max(80).optional(),
  address: z.string().max(300).optional(),
  acreage: z.number().nonnegative().max(100000).optional(),
  phase: z.string().max(80).optional(),
  notes: z.string().max(600).optional(),
});

/** Investigation planner — decides complexity, depth and which research modules apply. */
export const planSiteInvestigation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      project_type_label: z.string().max(200).default(""),
      scope_text: z.string().max(6000).default(""),
      parcels: z.array(ParcelInput).max(40).default([]),
      acreage: z.number().nonnegative().max(100000).optional(),
      building_sf: z.number().nonnegative().max(10000000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: project }, { data: scopeRows }] = await Promise.all([
      sb.from("projects").select("project_type, jurisdiction").eq("id", data.project_id).maybeSingle(),
      sb.from("scope_of_work").select("*").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(1),
    ]);
    const scope = (scopeRows ?? [])[0] as Record<string, unknown> | undefined;
    const parcelAcreage = data.parcels.reduce((sum, p) => sum + (p.acreage ?? 0), 0);
    const plan = buildInvestigationPlan({
      projectTypeLabel: data.project_type_label || String(scope?.['friendly_project_type'] ?? project?.project_type ?? ""),
      scopeText: data.scope_text || String(scope?.['plain_scope'] ?? scope?.['scope_text'] ?? ""),
      parcelCount: Math.max(1, data.parcels.length),
      acreage: data.acreage ?? (parcelAcreage > 0 ? parcelAcreage : null),
      buildingSf: data.building_sf ?? (scope?.['sq_ft_gross'] ? Number(scope['sq_ft_gross']) : null),
      existingUse: (scope?.['occupancy_existing'] as string | null) ?? null,
      proposedUse: (scope?.['occupancy_proposed'] as string | null) ?? null,
    });
    return { plan, recommended_depth_label: depthMeta(plan.recommended_depth).label };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherSiteResearch(jurisdiction: string, state: string, address: string, projectType: string) {
  const key = process.env['FIRECRAWL_API_KEY'];
  const sources: Array<{ url: string; title: string }> = [];
  if (!key) return { context: "", sources };
  const queries = [
    `"${jurisdiction}" ${state} zoning ordinance permitted uses district site:.gov`,
    `"${jurisdiction}" ${state} site plan / site development approval process requirements site:.gov`,
    `"${jurisdiction}" ${state} parking requirements landscaping stormwater requirements site:.gov`,
    `"${jurisdiction}" ${state} building permit requirements fire marshal review health department plan review site:.gov`,
    `"${jurisdiction}" ${state} water sewer utility service availability connection new development`,
    `${address} parcel property assessment zoning`,
    `"${jurisdiction}" ${state} ${projectType} permit requirements site:.gov`,
  ];
  const hits = (await Promise.all(queries.map((q) => firecrawlSearch(key, q, 3).catch(() => [])))).flat();
  const seen = new Set<string>();
  const targets = hits.filter((h) => {
    if (!h.url || seen.has(h.url)) return false;
    seen.add(h.url);
    return true;
  }).slice(0, 10);
  const chunks = await Promise.all(targets.map(async (t) => {
    try {
      const s = await firecrawlScrape(key, t.url);
      return `SOURCE: ${t.url}\nTITLE: ${t.title ?? ""}\n${s.markdown.slice(0, 2600)}`;
    } catch {
      return `SOURCE: ${t.url}\nTITLE: ${t.title ?? ""}\nDESC: ${t.description ?? ""}`;
    }
  }));
  for (const t of targets) sources.push({ url: t.url, title: t.title ?? "" });
  return { context: chunks.join("\n\n---\n\n"), sources };
}

export const runSiteInvestigation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      address: z.string().min(5).max(300),
      project_type_label: z.string().max(160).optional(),
      notes: z.string().max(4000).optional(),
      client_name: z.string().max(160).optional(),
      report_depth: z.enum(["property_snapshot", "project_feasibility", "development_due_diligence", "major_development_study"]).optional(),
      parcels: z.array(ParcelInput).max(40).default([]),
      acreage: z.number().nonnegative().max(100000).optional(),
      building_sf: z.number().nonnegative().max(10000000).optional(),
      followup_answers: z.array(z.object({
        question: z.string().max(300),
        answer: z.enum(["yes", "no", "unsure", "skipped"]),
        note: z.string().max(600).optional(),
      })).max(20).default([]),
      document_ids: z.array(z.string().uuid()).max(30).default([]),
      previous_investigation_id: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: project }, { data: scopeRows }, { data: confRows }] = await Promise.all([
      sb.from("projects").select("*").eq("id", data.project_id).maybeSingle(),
      sb.from("scope_of_work").select("*").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(1),
      sb.from("jurisdiction_confirmations").select("*").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(1),
    ]);
    if (!project) throw new Error("Project not found");
    const scope = (scopeRows ?? [])[0] as Record<string, unknown> | undefined;
    const conf = (confRows ?? [])[0] as Record<string, unknown> | undefined;

    const jurisdiction = String(conf?.['city'] ?? project.jurisdiction ?? "").trim();
    const state = String(conf?.['state'] ?? "").trim();
    const projectType = data.project_type_label ?? String(scope?.['friendly_project_type'] ?? project.project_type ?? "");

    const { data: inv, error: insErr } = await sb
      .from("site_investigations")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        address: data.address,
        project_type_label: projectType || null,
        project_type_id: project.primary_project_type_id ?? null,
        notes: data.notes ?? null,
        client_name: data.client_name ?? null,
        prepared_date: new Date().toISOString().slice(0, 10),
        report_number: `SI-${Date.now().toString().slice(-8)}`,
        status: "running",
        model: SI_MODEL,
        prompt_version: SI_PROMPT_VERSION,
        jurisdiction_snapshot: {
          jurisdiction: jurisdiction || null,
          state: state || null,
          confirmation_status: String(conf?.['status'] ?? "unconfirmed"),
          parcel_number: conf?.['parcel_number'] ? String(conf['parcel_number']) : null,
        } as never,
      })
      .select("*")
      .single();
    if (insErr || !inv) throw new Error(insErr?.message ?? "Could not start investigation");

    try {
      const { context: research, sources } = await gatherSiteResearch(jurisdiction, state, data.address, projectType);

      const { data: prof } = jurisdiction
        ? await sb.from("jurisdiction_profiles").select("name, state, county, department, portal_url, overview, permit_categories, requirements, sources").eq("slug", toSlug(jurisdiction)).maybeSingle()
        : { data: null };

      const sectionList = SI_REPORT_SECTIONS.map((s) => `${s.no}. ${s.key} — ${s.title}`).join("\n");
      const catList = SI_FINDING_CATEGORIES.map((c) => `${c.id} (${c.label})`).join(", ");

      const result = await callGeminiJSON(
        `Produce a PERMIVIO Site Investigation & Feasibility Report.

SITE ADDRESS: ${data.address}
JURISDICTION (AHJ): ${jurisdiction || "not confirmed"} ${state}
JURISDICTION CONFIRMATION STATUS: ${conf?.['status'] ?? "unconfirmed"}
PARCEL: ${conf?.['parcel_number'] ?? "unknown"}
PROPOSED PROJECT TYPE: ${projectType || "unknown"}
PROPOSED SCOPE: ${scope?.['plain_scope'] ?? scope?.['scope_text'] ?? data.notes ?? "not provided"}
EXISTING USE: ${scope?.['occupancy_existing'] ?? "unknown"} · PROPOSED USE: ${scope?.['occupancy_proposed'] ?? "unknown"}
GROSS SF: ${scope?.['sq_ft_gross'] ?? "unknown"} · UNITS: ${scope?.['dwelling_units'] ?? "unknown"}
USER NOTES: ${data.notes ?? "none"}

CACHED JURISDICTION PROFILE: ${prof ? JSON.stringify(prof).slice(0, 2200) : "none on file"}

OFFICIAL RESEARCH EXCERPTS (cite these URLs; do not cite anything not listed):
${research.slice(0, 14000) || "(no research retrieved — mark jurisdiction-specific items needs_agency_confirmation)"}

Write all 25 report sections, in this order, using these exact keys:
${sectionList}

findings.category must be one of: ${catList}

RULES:
- Never state a zoning determination as final. Zoning conclusions are "likely_permitted", "conditional", "potentially_not_permitted", or "needs_confirmation".
- ${UTILITY_CAPACITY_CAVEAT} Always say so in the utility section.
- Never say "code compliant", "guaranteed feasible", "plans approved", or "engineering approved".
- Never invent a parcel number, zoning district, flood zone, setback, or ordinance section. If unknown, state that it requires confirmation.
- Every finding and permit needs a verification level: verified (backed by a cited official source), ai_assisted, or needs_agency_confirmation.
- Timelines are estimates only; label them as such.

Return JSON: { "executive_summary": "", "feasibility_rating": "green|yellow|orange|red|gray", "feasibility_rationale": "", "property_info": {}, "sections": [{"key":"","title":"","body":"","bullets":[]}], "findings": [...], "permits": [...], "timeline": [{"phase":"","duration":"","depends_on":"","notes":""}], "assumptions": [], "outstanding_questions": [], "recommended_next_steps": [], "sources": [{"url":"","title":""}] }`,
        "You are a land development consultant, permit expediter and GIS/property intelligence analyst. You never fabricate GIS data, parcel boundaries, zoning classifications, or ordinance citations, and you never present your analysis as a jurisdiction determination, survey, engineering opinion, or legal advice.",
        SiSchema,
        { model: SI_MODEL, max_tokens: 12000 },
      ) as unknown as SiOut;

      const validCats = new Set(SI_FINDING_CATEGORIES.map((c) => c.id as string));
      if (result.findings.length) {
        await sb.from("site_investigation_findings").insert(result.findings.map((f, i) => ({
          investigation_id: inv.id,
          user_id: context.userId,
          category: validCats.has(f.category) ? f.category : "zoning",
          classification: f.classification,
          title: f.title,
          detail: f.detail || null,
          impact: f.impact || null,
          source_url: f.source_url || null,
          source_title: f.source_title || null,
          verification: f.verification,
          sort_order: i,
        })));
      }
      if (result.permits.length) {
        await sb.from("site_investigation_permits").insert(result.permits.map((p, i) => ({
          investigation_id: inv.id,
          user_id: context.userId,
          approval: p.approval,
          agency: p.agency || null,
          why_required: p.why_required || null,
          trigger_condition: p.trigger_condition || null,
          timeline_estimate: p.timeline_estimate || null,
          concurrent: p.concurrent,
          source_url: p.source_url || null,
          verification: p.verification,
          sequence_order: i,
        })));
      }

      const orderedSections = SI_REPORT_SECTIONS.map((s) => {
        const found = result.sections.find((x) => x.key === s.key);
        return { key: s.key, no: s.no, title: s.title, body: found?.body ?? "", bullets: found?.bullets ?? [] };
      });

      await sb.from("site_investigations").update({
        status: "complete",
        executive_summary: result.executive_summary || null,
        feasibility_rating: result.feasibility_rating,
        property_info: result.property_info,
        report: {
          sections: orderedSections,
          feasibility_rationale: result.feasibility_rationale,
          outstanding_questions: result.outstanding_questions,
          recommended_next_steps: result.recommended_next_steps,
          disclaimer: SITE_INVESTIGATION_DISCLAIMER,
        },
        timeline: result.timeline,
        assumptions: result.assumptions,
        sources: [...sources, ...result.sources].slice(0, 60),
      }).eq("id", inv.id);

      await sb.from("activity").insert({
        project_id: data.project_id,
        user_id: context.userId,
        description: `Site investigation complete — feasibility ${ratingMeta(result.feasibility_rating).label}`,
      });

      return { investigation_id: inv.id as string, feasibility_rating: result.feasibility_rating };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Site investigation failed";
      await sb.from("site_investigations").update({ status: "error", error: msg }).eq("id", inv.id);
      throw new Error(msg);
    }
  });

export const listSiteInvestigations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("site_investigations")
      .select("id, address, project_type_label, feasibility_rating, status, created_at, report_number, error")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    return { investigations: rows ?? [] };
  });

export const getSiteInvestigation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ investigation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [i, f, p, pr] = await Promise.all([
      sb.from("site_investigations").select("*").eq("id", data.investigation_id).maybeSingle(),
      sb.from("site_investigation_findings").select("*").eq("investigation_id", data.investigation_id).order("sort_order", { ascending: true }),
      sb.from("site_investigation_permits").select("*").eq("investigation_id", data.investigation_id).order("sequence_order", { ascending: true }),
      sb.from("professional_reviews").select("*").eq("target_type", "site_investigation").eq("target_id", data.investigation_id).order("created_at", { ascending: false }).limit(1),
    ]);
    return {
      investigation: i.data,
      findings: f.data ?? [],
      permits: p.data ?? [],
      professional_review: (pr.data ?? [])[0] ?? null,
      disclaimer: SITE_INVESTIGATION_DISCLAIMER,
    };
  });

export const deleteSiteInvestigation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ investigation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("site_investigations").delete().eq("id", data.investigation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Push identified approvals into the project permit checklist. */
export const addSiteInvestigationPermitsToChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ investigation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: inv } = await sb.from("site_investigations").select("id, project_id").eq("id", data.investigation_id).maybeSingle();
    if (!inv) throw new Error("Investigation not found");
    const { data: permits } = await sb.from("site_investigation_permits").select("approval, agency, why_required, sequence_order").eq("investigation_id", data.investigation_id).order("sequence_order", { ascending: true });
    if (!permits?.length) return { added: 0 };
    const { data: existing } = await sb.from("permit_items").select("name").eq("project_id", inv.project_id);
    const have = new Set((existing ?? []).map((e: { name: string }) => e.name.toLowerCase()));
    const rows = permits
      .filter((p: { approval: string }) => !have.has(p.approval.toLowerCase()))
      .slice(0, 40)
      .map((p: { approval: string; agency: string | null; why_required: string | null; sequence_order: number }) => ({
        user_id: context.userId,
        project_id: inv.project_id,
        name: p.approval,
        category: "permits",
        status: "not_started",
        required: true,
        notes: [p.agency ? `Agency: ${p.agency}` : "", p.why_required ?? "", "Identified by Site Investigation — confirm with the agency."].filter(Boolean).join("\n"),
        sort_order: 700 + p.sequence_order,
      }));
    if (!rows.length) return { added: 0 };
    const { error } = await sb.from("permit_items").insert(rows);
    if (error) throw new Error(error.message);
    await sb.from("activity").insert({
      project_id: inv.project_id,
      user_id: context.userId,
      description: `Site investigation added ${rows.length} approval(s) to the permit checklist`,
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

export const generateSiteInvestigationPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ investigation_id: z.string().uuid(), client_ready: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [i, f, p, settings] = await Promise.all([
      sb.from("site_investigations").select("*").eq("id", data.investigation_id).maybeSingle(),
      sb.from("site_investigation_findings").select("*").eq("investigation_id", data.investigation_id).order("sort_order", { ascending: true }),
      sb.from("site_investigation_permits").select("*").eq("investigation_id", data.investigation_id).order("sequence_order", { ascending: true }),
      sb.from("user_settings").select("brand_company_name, brand_license_number, brand_contact_email, brand_contact_phone, brand_footer_note").eq("user_id", context.userId).maybeSingle(),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = i.data as any;
    if (!inv) throw new Error("Investigation not found");
    const { data: project } = await sb.from("projects").select("name, jurisdiction").eq("id", inv.project_id).maybeSingle();

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
      const fnt = opts.b ? bold : font;
      for (const para of pdfSafe(s).split("\n")) {
        const words = para.split(/\s+/);
        let line = "";
        const lines: string[] = [];
        for (const w of words) {
          const t = line ? `${line} ${w}` : w;
          if (fnt.widthOfTextAtSize(t, size) > width) { lines.push(line); line = w; } else line = t;
        }
        if (line) lines.push(line);
        for (const ln of lines) {
          if (y < 60) newPage();
          page.drawText(ln, { x: margin, y, size, font: fnt, color: rgb(...(opts.color ?? [0.1, 0.12, 0.16])) });
          y -= size + 3;
        }
      }
      y -= opts.gap ?? 4;
    };
    const heading = (s: string) => { if (y < 110) newPage(); y -= 6; text(s, { size: 12, b: true, color: [0.05, 0.3, 0.75], gap: 6 }); };

    text(settings.data?.brand_company_name || "PERMIVIO", { size: 18, b: true, color: [0.05, 0.3, 0.75], gap: 2 });
    text("Site Investigation & Feasibility Report", { size: 14, b: true, gap: 8 });
    text(`Report no: ${inv.report_number ?? ""}`);
    text(`Site address: ${inv.address}`);
    text(`Project: ${project?.name ?? ""}`);
    if (inv.client_name) text(`Prepared for: ${inv.client_name}`);
    text(`Jurisdiction: ${inv.jurisdiction_snapshot?.jurisdiction ?? project?.jurisdiction ?? "requires confirmation"}`);
    text(`Prepared: ${inv.prepared_date ?? new Date().toISOString().slice(0, 10)}`);
    text(`Overall feasibility rating: ${ratingMeta(inv.feasibility_rating).label} — ${ratingMeta(inv.feasibility_rating).definition}`, { b: true, gap: 8 });

    for (const s of (inv.report?.sections ?? []) as Array<{ no: number; title: string; body: string; bullets: string[] }>) {
      heading(`${s.no}. ${s.title}`);
      if (s.body) text(s.body);
      for (const b of s.bullets ?? []) text(`- ${b}`);
      if (!s.body && !(s.bullets ?? []).length) text("Requires confirmation — no verified information available.");
    }

    heading("Identified findings by category");
    for (const cat of SI_FINDING_CATEGORIES) {
      const rows = (f.data ?? []).filter((x: { category: string }) => x.category === cat.id);
      if (!rows.length) continue;
      text(cat.label, { b: true, gap: 1 });
      for (const r of rows) {
        text(`- ${r.title} [${r.classification.replace(/_/g, " ")} · ${r.verification.replace(/_/g, " ")}]`, { gap: 1 });
        if (r.detail) text(`  ${r.detail}`, { gap: 1 });
        if (r.impact) text(`  Impact: ${r.impact}`, { gap: 1 });
        if (r.source_url) text(`  Source: ${r.source_url}`, { size: 8, color: [0.35, 0.38, 0.44], gap: 1 });
      }
    }

    heading("Required permits and approvals (estimated)");
    for (const r of p.data ?? []) {
      text(`${r.sequence_order + 1}. ${r.approval}${r.agency ? ` — ${r.agency}` : ""}${r.concurrent ? " (can run concurrently)" : ""}`, { b: true, gap: 1 });
      if (r.why_required) text(`   Why: ${r.why_required}`, { gap: 1 });
      if (r.trigger_condition) text(`   Trigger: ${r.trigger_condition}`, { gap: 1 });
      if (r.timeline_estimate) text(`   Estimated timeline: ${r.timeline_estimate} (estimate only)`, { gap: 1 });
      text(`   Status: ${r.verification.replace(/_/g, " ")}`, { size: 8, color: [0.35, 0.38, 0.44] });
    }

    heading("Estimated timeline");
    for (const t of (inv.timeline ?? []) as Array<{ phase: string; duration: string; depends_on: string; notes: string }>) {
      text(`- ${t.phase}: ${t.duration || "TBD"}${t.depends_on ? ` (after ${t.depends_on})` : ""}${t.notes ? ` — ${t.notes}` : ""}`);
    }

    heading("Official sources");
    for (const s of (inv.sources ?? []) as Array<{ url: string; title: string }>) text(`- ${s.title || s.url}: ${s.url}`, { size: 8 });

    heading("Assumptions and limitations");
    for (const a of (inv.assumptions ?? []) as string[]) text(`- ${a}`);
    text(UTILITY_CAPACITY_CAVEAT);
    text(SITE_INVESTIGATION_DISCLAIMER);
    if (settings.data?.brand_footer_note) text(settings.data.brand_footer_note, { size: 8, color: [0.35, 0.38, 0.44] });
    if (data.client_ready && settings.data?.brand_company_name) {
      text(`${settings.data.brand_company_name}${settings.data.brand_license_number ? ` · License ${settings.data.brand_license_number}` : ""}${settings.data.brand_contact_email ? ` · ${settings.data.brand_contact_email}` : ""}${settings.data.brand_contact_phone ? ` · ${settings.data.brand_contact_phone}` : ""}`, { size: 8, color: [0.35, 0.38, 0.44] });
    }

    const bytes = await pdf.save();
    let bin = "";
    for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    return {
      filename: `PERMIVIO-Site-Investigation-${(inv.address || "site").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}.pdf`,
      base64: btoa(bin),
    };
  });
