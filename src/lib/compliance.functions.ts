import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callGeminiJSON, loadJurisdictionContextBlock, loadHealthAgencyContextBlock } from "@/lib/ai.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";
import { getAgent } from "@/lib/complianceAgents";

// ---------- Schema for the AI-generated report ----------
const ContactSchema = z.object({
  department: z.string(),
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  verified: z.boolean().optional().default(false),
});

const CodeCitationSchema = z.object({
  code: z.string(), // e.g. "IPC 2021 §405.3.1"
  requirement: z.string(),
  discipline: z.string().optional(), // Building / Health / Fire / ADA
});

const TimelineStepSchema = z.object({
  phase: z.string(),
  duration_business_days: z.string(), // e.g. "5-10"
  responsible: z.string().optional(),
  note: z.string().optional(),
});

const WbsTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  phase: z.string(),
  duration_days: z.number(),
  start_offset_days: z.number(),
  depends_on: z.array(z.string()).default([]),
  responsible: z.string().optional(),
});

const CostSchema = z.object({
  low_usd: z.number().optional(),
  high_usd: z.number().optional(),
  breakdown: z.array(z.object({ label: z.string(), amount_usd_low: z.number().optional(), amount_usd_high: z.number().optional() })).default([]),
});

const DepartmentBlockSchema = z.object({
  name: z.string(), // e.g. "Building Department"
  authority_reason: z.string(),
  required_reviews: z.array(z.string()).default([]),
  required_documents: z.array(z.string()).default([]),
  codes: z.array(CodeCitationSchema).default([]),
});

const ReportSchema = z.object({
  jurisdiction: z.string(),
  jurisdiction_state: z.string().optional(),
  official_department: z.string(),
  summary: z.string(),
  scope_recap: z.string(),
  common_rejection_flags: z.array(z.string()).default([]),
  departments: z.array(DepartmentBlockSchema).default([]),
  contacts: z.array(ContactSchema).default([]),
  timeline: z.array(TimelineStepSchema).default([]),
  cost_estimate: CostSchema.default({ breakdown: [] }),
  sources: z.array(z.string()).default([]),
  wbs: z.array(WbsTaskSchema).default([]),
  confidence: z.number().min(0).max(1).optional(),
});

export type ComplianceReport = z.infer<typeof ReportSchema>;

// ---------- Input ----------
const GenInput = z.object({
  address: z.string().trim().min(4).max(300),
  project_type: z.string().trim().min(2).max(200),
  agent_id: z.string().trim().min(1).max(80),
  scope_notes: z.string().trim().max(2000).optional(),
  jurisdiction_hint: z.string().trim().max(200).optional(),
  project_id: z.string().uuid().optional(),
});

async function tryFirecrawlContext(address: string, agentLabel: string): Promise<{ block: string; urls: string[] }> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { block: "", urls: [] };
  try {
    const query = `${address} building permit ${agentLabel} requirements site:.gov OR site:.us`;
    const results = await firecrawlSearch(key, query, 4);
    if (results.length === 0) return { block: "", urls: [] };
    // Only scrape 1 page — keeps total wall time under the Worker budget so the
    // final UPDATE actually lands. The remaining URLs still get folded into `sources`.
    const scraped: string[] = [];
    const urls: string[] = [];
    for (const r of results.slice(0, 1)) {
      try {
        const s = await firecrawlScrape(key, r.url);
        if (s.markdown) {
          scraped.push(`SOURCE: ${r.url}\nTITLE: ${s.title}\n${s.markdown.slice(0, 3000)}`);
          urls.push(r.url);
        }
      } catch {
        /* skip */
      }
    }
    const otherUrls = results.map((r) => r.url).filter((u) => !urls.includes(u));
    urls.push(...otherUrls);
    if (scraped.length === 0) return { block: "", urls };
    return {
      block: `\n\n[LIVE JURISDICTION SEARCH — scraped ${scraped.length} pages]\n${scraped.join("\n\n---\n\n")}\n\nUse these excerpts to identify the exact department, phone/website, review timeline, and any local amendments. Cite the SOURCE url when you use a fact from it.`,
      urls,
    };
  } catch {
    return { block: "", urls: [] };
  }
}

export const generateComplianceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const agent = getAgent(data.agent_id);

    // 1. Insert a "generating" row so the UI can navigate to the detail page immediately.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = supabase as any;
    const { data: initial, error: initErr } = await supa
      .from("compliance_reports")
      .insert({
        user_id: userId,
        project_id: data.project_id ?? null,
        address: data.address,
        project_type: data.project_type,
        agent_id: agent.id,
        jurisdiction: data.jurisdiction_hint ?? null,
        status: "generating",
        summary: null,
      })
      .select("id")
      .single();
    if (initErr || !initial) throw new Error(initErr?.message ?? "Could not start report");
    const reportId: string = initial.id;

    try {
      // 2. Gather context — cached jurisdiction profile + health-agency block + live web excerpts.
      const jHint = data.jurisdiction_hint ?? data.address;
      const [jCtx, hCtx, live] = await Promise.all([
        loadJurisdictionContextBlock(supabase, jHint),
        loadHealthAgencyContextBlock(supabase, jHint),
        tryFirecrawlContext(data.address, agent.label),
      ]);

      const system = `You are Permivio's PermitNow-style Compliance Report agent. Produce a jurisdiction-anchored multi-department permit compliance report.

RULES:
- Identify the EXACT jurisdiction with authority (e.g. "Pikes Peak Regional Building Department" not just "Colorado Springs"). If the address spans multiple, name the primary one and note the others.
- Enumerate every applicable department (Building, Health, Fire, Planning/Zoning, ADA, Public Works, Utilities, Environmental, Sign, Historic) with authority_reason.
- Cite specific code sections: IBC/IRC/IPC/IMC/NEC/IECC/IFC 2021, ADA 2010, A117.1-2017, FDA Food Code, and any local amendments referenced in the context.
- Every contact should include department, phone, email, website. Set verified=true ONLY if the phone/website appears explicitly in the LIVE context. Otherwise verified=false.
- Timeline in business-day ranges, per phase.
- Cost estimate: realistic low/high USD range with breakdown (permit fees, plan review, inspections).
- WBS: 6-14 tasks with duration_days and depends_on for Gantt rendering. Include intake, plan review cycles, corrections, fee payment, issuance, inspections, CO.
- Include a "common_rejection_flags" list of the 3-5 most likely reasons this project type gets rejected on first submission in this jurisdiction.
- sources: URLs you cited. Prefer URLs from the LIVE context block.
- confidence: 0.0-1.0 self-assessment.

AGENT FOCUS (${agent.label}):
${agent.focus.map((f) => `- ${f}`).join("\n")}

TYPICAL DEPARTMENTS: ${agent.departments.join(", ")}
${jCtx.block}${hCtx.block}${live.block}
`;

      const prompt = `Generate a comprehensive compliance report.

Address: ${data.address}
Project type: ${data.project_type}
Scope: ${agent.scope}
${data.scope_notes ? `Additional scope notes: ${data.scope_notes}` : ""}
${data.jurisdiction_hint ? `User-provided jurisdiction hint: ${data.jurisdiction_hint}` : ""}

Return ONLY JSON matching the schema. Do not include narrative outside JSON.`;

      const report = await callGeminiJSON(prompt, system, ReportSchema, { model: "google/gemini-3.6-flash", max_tokens: 32000 });

      // Merge live URLs into sources if the AI missed them.
      const sources = Array.from(new Set([...(report.sources ?? []), ...live.urls])).slice(0, 12);

      await supa
        .from("compliance_reports")
        .update({
          status: "ready",
          summary: report.summary,
          jurisdiction: report.jurisdiction,
          state: report.jurisdiction_state ?? null,
          report,
          contacts: report.contacts ?? [],
          timeline: report.timeline ?? [],
          cost_estimate: report.cost_estimate ?? {},
          sources,
          wbs: report.wbs ?? [],
          confidence: report.confidence ?? null,
          error: null,
        })
        .eq("id", reportId);

      return { id: reportId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Report generation failed";
      await supa.from("compliance_reports").update({ status: "failed", error: msg }).eq("id", reportId);
      throw new Error(msg);
    }
  });

export const listComplianceReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any)
      .from("compliance_reports")
      .select("id, address, project_type, agent_id, jurisdiction, state, status, summary, confidence, created_at, project_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      address: string;
      project_type: string;
      agent_id: string;
      jurisdiction: string | null;
      state: string | null;
      status: string;
      summary: string | null;
      confidence: number | null;
      created_at: string;
      project_id: string | null;
    }>;
  });

export const getComplianceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = context.supabase as any;
    const { data: row, error } = await supa
      .from("compliance_reports")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Report not found");

    // Auto-fail rows stuck in "generating" for more than 3 minutes — the worker
    // process died before the final UPDATE could land. Flip to "failed" so the
    // UI can offer a Retry instead of spinning forever.
    if (row.status === "generating") {
      const ageMs = Date.now() - new Date(row.updated_at ?? row.created_at).getTime();
      if (ageMs > 3 * 60 * 1000) {
        await supa
          .from("compliance_reports")
          .update({ status: "failed", error: "Generation timed out. Please retry." })
          .eq("id", data.id);
        row.status = "failed";
        row.error = "Generation timed out. Please retry.";
      }
    }

    return row as {
      id: string;
      user_id: string;
      project_id: string | null;
      address: string;
      project_type: string;
      agent_id: string;
      jurisdiction: string | null;
      state: string | null;
      status: string;
      summary: string | null;
      report: ComplianceReport;
      contacts: ComplianceReport["contacts"];
      timeline: ComplianceReport["timeline"];
      cost_estimate: ComplianceReport["cost_estimate"];
      sources: string[];
      wbs: ComplianceReport["wbs"];
      confidence: number | null;
      error: string | null;
      created_at: string;
      updated_at: string;
    };
  });

export const deleteComplianceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).from("compliance_reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- PDF export (Standard + WBS) ----------
export const exportComplianceReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), format: z.enum(["standard", "wbs"]).default("standard") }).parse(data))
  .handler(async ({ data, context }): Promise<{ pdf_base64: string; filename: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase as any)
      .from("compliance_reports")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Report not found");
    const r = row as Awaited<ReturnType<typeof getComplianceReport>>;

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

    const wrap = (text: string, size: number, f = font) => {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (f.widthOfTextAtSize(t, size) > W) {
          if (line) lines.push(line);
          line = w;
        } else line = t;
      }
      if (line) lines.push(line);
      return lines;
    };
    const ensure = (h: number) => {
      if (y - h < 60) {
        page = pdf.addPage([612, 792]);
        y = 760;
      }
    };
    const heading = (t: string, size = 14) => {
      ensure(size + 12);
      page.drawText(t, { x: M, y, size, font: bold, color: brand });
      y -= size + 8;
    };
    const para = (t: string, size = 10, color = ink) => {
      for (const l of wrap(t, size)) {
        ensure(size + 4);
        page.drawText(l, { x: M, y, size, font, color });
        y -= size + 4;
      }
    };
    const kv = (k: string, v: string) => {
      ensure(14);
      page.drawText(k, { x: M, y, size: 9, font: bold, color: muted });
      const vLines = wrap(v, 10);
      for (let i = 0; i < vLines.length; i++) {
        ensure(14);
        page.drawText(vLines[i], { x: M + 120, y, size: 10, font, color: ink });
        y -= 14;
      }
    };

    // Header
    page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: brand });
    page.drawText("PERMIVIO · Compliance Report", { x: M, y: 766, size: 12, font: bold, color: rgb(1, 1, 1) });
    page.drawText(data.format === "wbs" ? "WBS / Gantt Format" : "Standard Format", { x: 612 - M - 120, y: 766, size: 10, font, color: rgb(1, 1, 1) });
    y = 730;

    heading(r.address, 16);
    para(`${r.project_type} · ${r.jurisdiction ?? "Jurisdiction TBD"}${r.state ? `, ${r.state}` : ""}`, 10, muted);
    y -= 6;

    if (r.summary) {
      heading("Summary");
      para(r.summary);
      y -= 4;
    }

    if (data.format === "wbs") {
      // WBS + ASCII Gantt
      heading("Work Breakdown Structure");
      const wbs = r.wbs ?? [];
      const maxDay = wbs.reduce((m, t) => Math.max(m, t.start_offset_days + t.duration_days), 1);
      const barW = W - 220;
      const scale = barW / maxDay;
      for (const t of wbs) {
        ensure(22);
        page.drawText(`${t.id}. ${t.name}`, { x: M, y, size: 9, font: bold, color: ink });
        page.drawText(`${t.phase}`, { x: M, y: y - 10, size: 8, font, color: muted });
        // bar
        const bx = M + 220 + t.start_offset_days * scale;
        const bw = Math.max(2, t.duration_days * scale);
        page.drawRectangle({ x: M + 220, y: y - 6, width: barW, height: 2, color: rgb(0.9, 0.92, 0.96) });
        page.drawRectangle({ x: bx, y: y - 9, width: bw, height: 8, color: brand });
        page.drawText(`${t.duration_days}d`, { x: bx + bw + 4, y: y - 8, size: 7, font, color: muted });
        y -= 22;
      }
      y -= 8;
    } else {
      // Standard narrative
      heading("Applicable Departments");
      for (const d of r.report.departments ?? []) {
        ensure(18);
        page.drawText(d.name, { x: M, y, size: 11, font: bold, color: ink });
        y -= 14;
        para(d.authority_reason, 9, muted);
        if (d.codes?.length) {
          for (const c of d.codes) para(`• ${c.code} — ${c.requirement}`, 9);
        }
        if (d.required_documents?.length) para(`Docs: ${d.required_documents.join(", ")}`, 9, muted);
        y -= 4;
      }
    }

    heading("Verified Contacts");
    for (const c of r.contacts ?? []) {
      ensure(28);
      page.drawText(`${c.department}${c.verified ? "  ✓ verified" : ""}`, { x: M, y, size: 10, font: bold, color: ink });
      y -= 12;
      if (c.phone) para(`Phone: ${c.phone}`, 9);
      if (c.email) para(`Email: ${c.email}`, 9);
      if (c.website) para(`Web: ${c.website}`, 9);
      y -= 4;
    }

    heading("Timeline");
    for (const t of r.timeline ?? []) {
      kv(`${t.phase}`, `${t.duration_business_days} business days${t.responsible ? ` — ${t.responsible}` : ""}${t.note ? ` (${t.note})` : ""}`);
    }

    heading("Cost Estimate");
    const ce = r.cost_estimate ?? {};
    if (ce.low_usd || ce.high_usd) kv("Range", `$${ce.low_usd ?? 0} – $${ce.high_usd ?? 0}`);
    for (const b of ce.breakdown ?? []) kv(b.label, `$${b.amount_usd_low ?? 0} – $${b.amount_usd_high ?? 0}`);

    if ((r.report.common_rejection_flags ?? []).length) {
      heading("Common Rejection Flags");
      for (const f of r.report.common_rejection_flags) para(`• ${f}`, 10);
    }

    if ((r.sources ?? []).length) {
      heading("Sources");
      for (const s of r.sources) para(s, 8, muted);
    }

    const bytes = await pdf.save();
    // Convert bytes -> base64 in a Workers-safe way
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    const slug = (r.address || "report").replace(/[^a-z0-9]+/gi, "-").slice(0, 40).toLowerCase();
    return { pdf_base64: b64, filename: `permivio-compliance-${slug}-${data.format}.pdf` };
  });
