// Site Investigation Report PDF renderer (server-only).
//
// Extracted from the server function so the same renderer can be exercised
// directly in tests/QA runs and reused by any caller that already holds the
// request row. Nothing here re-runs research — it renders the compiled record.

/* eslint-disable @typescript-eslint/no-explicit-any */

function sirPdfSafe(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/[^\x20-\x7E]/g, " ");
}

/** Render the full Site Investigation Report for one request row. */
export async function renderSirReportPdf(r: any): Promise<{ filename: string; base64: string }> {
const {
  buildSirReport,
  buildSirSnapshot,
  buildSirRiskMatrix,
  rollupSirReview,
  effectiveFindingText,
  SIR_REPORT_DISCLAIMER,
  SIR_PROFESSIONAL_REVIEW_NOTE,
  SIR_AI_RESEARCH_DISCLAIMER,
} = await import("@/lib/sirReport");

const sections = buildSirReport(r.research);
const snapshot = buildSirSnapshot(r.research);
const matrix = buildSirRiskMatrix(r.research);
const reviews = (r.finding_reviews ?? {}) as Record<string, { decision: string; note?: string | null; revised_text?: string | null }>;
const rollup = rollupSirReview(sections, reviews as never);
const professionallyReviewed = r.review_status === "reviewed" && rollup.allDecided;

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
  for (const para of sirPdfSafe(s).split("\n")) {
    const words = para.split(/\s+/);
    let line = "";
    const lines: string[] = [];
    for (const w of words) {
      // Long unbroken tokens (source URLs) are split by character so they
      // never run past the right margin.
      let word = w;
      while (fnt.widthOfTextAtSize(word, size) > width) {
        let cut = 1;
        while (cut < word.length && fnt.widthOfTextAtSize(word.slice(0, cut + 1), size) <= width) cut++;
        if (line) { lines.push(line); line = ""; }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const t = line ? `${line} ${word}` : word;
      if (fnt.widthOfTextAtSize(t, size) > width) { if (line) lines.push(line); line = word; } else line = t;
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
const heading = (s: string) => { if (y < 120) newPage(); y -= 6; text(s, { size: 12, b: true, color: [0.05, 0.3, 0.75], gap: 6 }); };

text("PERMIVIO", { size: 18, b: true, color: [0.05, 0.3, 0.75], gap: 2 });
text("Site Investigation Report", { size: 14, b: true, gap: 6 });
if (professionallyReviewed) {
  text("PROFESSIONALLY REVIEWED", { size: 11, b: true, color: [0.05, 0.45, 0.3], gap: 2 });
  text(`Reviewer: ${r.reviewer_name ?? ""}${r.reviewer_credential ? ` · ${r.reviewer_credential}` : ""} · ${new Date(r.reviewed_at).toLocaleDateString()}`, { size: 9, gap: 4 });
  text(SIR_PROFESSIONAL_REVIEW_NOTE, { size: 8, color: [0.35, 0.38, 0.44], gap: 6 });
} else {
  text("AI-ASSISTED RESEARCH - NOT YET PROFESSIONALLY REVIEWED", { size: 10, b: true, color: [0.55, 0.15, 0.15], gap: 6 });
}

text(`Prepared for: ${r.name}${r.company ? ` (${r.company})` : ""}`);
text(`Site address: ${r.site_address || "not provided"}`);
text(`Jurisdiction: ${r.jurisdiction}`);
if (r.parcel_apn) text(`Parcel / APN: ${r.parcel_apn}`);
text(`Intended use / scope: ${r.intended_use}`);
text(`Prepared: ${new Date().toISOString().slice(0, 10)}`, { gap: 8 });

heading("Executive feasibility snapshot");
for (const s of snapshot) text(`${s.label}: ${s.value}`, { gap: 1 });
if (r.research.scope_summary) { y -= 4; text(r.research.scope_summary); }

for (const section of sections) {
  heading(`${section.no}. ${section.title}`);
  text(section.intro, { size: 8.5, color: [0.35, 0.38, 0.44] });
  for (const m of section.modules) {
    text(m.label, { b: true, gap: 1 });
    if (m.summary) text(`   ${m.summary}`, { gap: 1 });
    for (const f of m.findings) {
      const rev = reviews[f.id];
      if (rev?.decision === "rejected") continue;
      const tags = [f.verification.replace(/_/g, " "), ...(rev ? [`reviewer ${rev.decision}`] : [])];
      text(`- ${f.title} [${tags.join(" · ")}]`, { gap: 1 });
      const detail = effectiveFindingText(f, rev as never);
      if (detail) text(`   ${detail}`, { gap: 1 });
      if (rev?.note) text(`   Reviewer note: ${rev.note}`, { size: 8, color: [0.35, 0.38, 0.44], gap: 1 });
      if (f.source) text(`   Source: ${f.source}`, { size: 8, color: [0.35, 0.38, 0.44], gap: 1 });
    }
    y -= 3;
  }
}

if (matrix.length) {
  heading("Risk matrix");
  for (const g of matrix) {
    text(`${g.level.toUpperCase()} severity`, { b: true, gap: 1 });
    for (const it of g.items) {
      if (reviews[it.id]?.decision === "rejected") continue;
      text(`- ${it.title}${it.why ? `: ${it.why}` : ""}`, { gap: 1 });
    }
  }
}

const sources = (r.research_sources ?? []) as Array<{ url: string; title: string }>;
if (sources.length) {
  heading("Official sources");
  for (const s of sources) text(`- ${s.title || s.url}: ${s.url}`, { size: 8, gap: 1 });
}

const auditRec = r.research_audit as
  | { agents?: Array<{ role: string; status: string; items: number; cited: number }>; evidence_sources?: number; coverage_gaps?: string[]; citation_downgrades?: Array<{ item: string; reason: string }> }
  | null;
if (auditRec) {
  heading("How this research was produced");
  text(SIR_AI_RESEARCH_DISCLAIMER, { size: 8.5, color: [0.35, 0.38, 0.44] });
  text(`Official source pages reviewed: ${auditRec.evidence_sources ?? 0}`, { gap: 1 });
  for (const a of auditRec.agents ?? []) {
    text(`- ${a.role}: ${a.status} · ${a.items} finding(s) · ${a.cited} source-backed`, { size: 8.5, gap: 1 });
  }
  for (const g of auditRec.coverage_gaps ?? []) text(`- Coverage gap: ${g}`, { size: 8.5, gap: 1 });
  for (const d of auditRec.citation_downgrades ?? []) {
    text(`- Downgraded from verified: ${d.item} — ${d.reason}`, { size: 8.5, gap: 1 });
  }
}

heading("Assumptions and limitations");
text(SIR_REPORT_DISCLAIMER);

const bytes = await pdf.save();
let bin = "";
for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
return {
  filename: `PERMIVIO-Site-Investigation-Report-${String(r.site_address || r.jurisdiction).replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}.pdf`,
  base64: btoa(bin),
};

}
