/**
 * Permivio branded report renderer.
 *
 * One reusable, print-safe PDF layout for every purchased Permivio report:
 * cover page, report control page, table of contents, executive summary and
 * researched sections, followed by official sources and limitations.
 *
 * The renderer never invents content. It draws exactly what the calling report
 * passes in, and every material statement keeps the verification label the
 * research recorded for it. No internal agent, model or tool names are printed.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// ---------------------------------------------------------------------------
// Content contract
// ---------------------------------------------------------------------------

export type VerificationLabel =
  | "Verified Source"
  | "Agency Confirmation Needed"
  | "Client Input Needed"
  | "Professional Judgment"
  | "Estimated"
  | "Not Applicable";

export const VERIFICATION_LABELS: VerificationLabel[] = [
  "Verified Source",
  "Agency Confirmation Needed",
  "Client Input Needed",
  "Professional Judgment",
  "Estimated",
  "Not Applicable",
];

/** Maps internal verification states onto the client-facing label set. */
export function toVerificationLabel(raw: string | null | undefined): VerificationLabel {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("not_applicable") || v === "n/a") return "Not Applicable";
  if (v.includes("verified") || v.includes("official")) return "Verified Source";
  if (v.includes("client")) return "Client Input Needed";
  if (v.includes("estimate")) return "Estimated";
  if (v.includes("judgment") || v.includes("professional")) return "Professional Judgment";
  return "Agency Confirmation Needed";
}

export type ReportBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "keyvalue"; rows: { label: string; value: string }[] }
  | { kind: "table"; columns: string[]; rows: string[][]; widths?: number[] }
  | {
      kind: "findings";
      items: { statement: string; label: VerificationLabel; detail?: string; source?: string }[];
    }
  | { kind: "sources"; items: { title: string; url?: string; retrieved?: string }[] }
  | { kind: "callout"; title: string; text: string };

export type ReportSection = { heading: string; blocks: ReportBlock[] };

export type ReportDoc = {
  report_title: string;
  report_subtitle?: string | null;
  report_number: string;
  issued_at: string;
  prepared_for?: string | null;
  project_name?: string | null;
  project_address?: string | null;
  jurisdiction?: string | null;
  delivery_label: string;
  professionally_reviewed: boolean;
  reviewer_name?: string | null;
  reviewer_title?: string | null;
  version: number;
  executive_summary?: string | null;
  executive_decision?: { question: string; answer: string; basis: string } | null;
  sections: ReportSection[];
  limitations?: string[];
};

// ---------------------------------------------------------------------------
// Layout constants — light, print-safe palette
// ---------------------------------------------------------------------------

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0.11, 0.13, 0.17);
const MUTED = rgb(0.42, 0.46, 0.53);
const NAVY = rgb(0.043, 0.106, 0.2);
const BLUE = rgb(0.114, 0.416, 0.898);
const LINE = rgb(0.85, 0.87, 0.9);
const BAND = rgb(0.96, 0.97, 0.99);
const GREEN = rgb(0.09, 0.5, 0.32);
const RED = rgb(0.65, 0.14, 0.16);

const LABEL_COLOR: Record<VerificationLabel, ReturnType<typeof rgb>> = {
  "Verified Source": GREEN,
  "Agency Confirmation Needed": BLUE,
  "Client Input Needed": BLUE,
  "Professional Judgment": MUTED,
  Estimated: MUTED,
  "Not Applicable": MUTED,
};

type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  pages: PDFPage[];
  doc: ReportDoc;
};

function sanitize(text: string): string {
  // Standard PDF fonts are WinAnsi — normalise smart punctuation and strip
  // anything unencodable rather than failing the render.
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a1-\u00ff]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of sanitize(text).split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(ctx.page);
  ctx.y = PAGE_H - MARGIN - 26;
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 40) newPage(ctx);
}

function text(
  ctx: Ctx,
  value: string,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; width?: number; lead?: number } = {},
) {
  const size = opts.size ?? 10;
  const font = opts.bold ? ctx.bold : ctx.regular;
  const indent = opts.indent ?? 0;
  const width = opts.width ?? CONTENT_W - indent;
  const lead = opts.lead ?? size * 1.42;
  for (const line of wrap(value, font, size, width)) {
    ensure(ctx, lead);
    ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size, font, color: opts.color ?? INK });
    ctx.y -= lead;
  }
}

function gap(ctx: Ctx, amount = 8) {
  ctx.y -= amount;
}

function rule(ctx: Ctx) {
  ensure(ctx, 12);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.7,
    color: LINE,
  });
  ctx.y -= 12;
}

function sectionHeading(ctx: Ctx, heading: string) {
  ensure(ctx, 46);
  gap(ctx, 6);
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 2, width: 3, height: 14, color: BLUE });
  ctx.page.drawText(sanitize(heading), { x: MARGIN + 10, y: ctx.y, size: 12.5, font: ctx.bold, color: NAVY });
  ctx.y -= 20;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function drawBlock(ctx: Ctx, block: ReportBlock) {
  switch (block.kind) {
    case "paragraph":
      text(ctx, block.text, { size: 10 });
      gap(ctx, 6);
      break;

    case "bullets":
      for (const item of block.items) {
        ensure(ctx, 15);
        ctx.page.drawCircle({ x: MARGIN + 3.5, y: ctx.y + 3.5, size: 1.6, color: BLUE });
        text(ctx, item, { size: 10, indent: 14 });
      }
      gap(ctx, 6);
      break;

    case "keyvalue": {
      const labelW = 150;
      for (const row of block.rows) {
        const valueLines = wrap(row.value || "-", ctx.regular, 10, CONTENT_W - labelW - 10);
        const height = Math.max(valueLines.length, 1) * 14 + 4;
        ensure(ctx, height);
        ctx.page.drawText(sanitize(row.label), { x: MARGIN, y: ctx.y, size: 9.5, font: ctx.bold, color: MUTED });
        let vy = ctx.y;
        for (const line of valueLines) {
          ctx.page.drawText(line, { x: MARGIN + labelW, y: vy, size: 10, font: ctx.regular, color: INK });
          vy -= 14;
        }
        ctx.y -= height;
      }
      gap(ctx, 6);
      break;
    }

    case "table": {
      const cols = block.columns.length;
      const widths =
        block.widths && block.widths.length === cols
          ? block.widths.map((w) => (w / block.widths!.reduce((a, b) => a + b, 0)) * CONTENT_W)
          : Array.from({ length: cols }, () => CONTENT_W / cols);

      const drawHeader = () => {
        ensure(ctx, 26);
        ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 5, width: CONTENT_W, height: 18, color: BAND });
        let x = MARGIN + 5;
        block.columns.forEach((c, i) => {
          ctx.page.drawText(sanitize(c), { x, y: ctx.y, size: 9, font: ctx.bold, color: NAVY });
          x += widths[i];
        });
        ctx.y -= 22;
      };
      drawHeader();

      for (const row of block.rows) {
        const cellLines = row.map((cell, i) => wrap(cell || "-", ctx.regular, 9, widths[i] - 10));
        const height = Math.max(...cellLines.map((l) => l.length)) * 12 + 8;
        if (ctx.y - height < MARGIN + 40) {
          newPage(ctx);
          drawHeader();
        }
        let x = MARGIN + 5;
        cellLines.forEach((lines, i) => {
          let cy = ctx.y;
          for (const line of lines) {
            ctx.page.drawText(line, { x, y: cy, size: 9, font: ctx.regular, color: INK });
            cy -= 12;
          }
          x += widths[i];
        });
        ctx.y -= height;
        ctx.page.drawLine({
          start: { x: MARGIN, y: ctx.y + 4 },
          end: { x: PAGE_W - MARGIN, y: ctx.y + 4 },
          thickness: 0.5,
          color: LINE,
        });
      }
      gap(ctx, 10);
      break;
    }

    case "findings":
      for (const item of block.items) {
        ensure(ctx, 40);
        const labelText = item.label;
        const labelW = ctx.bold.widthOfTextAtSize(labelText, 7.5) + 12;
        ctx.page.drawRectangle({
          x: MARGIN,
          y: ctx.y - 2,
          width: labelW,
          height: 12,
          color: BAND,
          borderColor: LABEL_COLOR[item.label],
          borderWidth: 0.6,
        });
        ctx.page.drawText(labelText, {
          x: MARGIN + 6,
          y: ctx.y + 1.5,
          size: 7.5,
          font: ctx.bold,
          color: LABEL_COLOR[item.label],
        });
        ctx.y -= 16;
        text(ctx, item.statement, { size: 10, bold: true });
        if (item.detail) text(ctx, item.detail, { size: 9.5, color: MUTED });
        if (item.source) text(ctx, `Source: ${item.source}`, { size: 8.5, color: MUTED });
        gap(ctx, 8);
      }
      break;

    case "sources":
      for (const s of block.items) {
        ensure(ctx, 26);
        text(ctx, s.title, { size: 9.5, bold: true });
        if (s.url) {
          const lines = wrap(s.url, ctx.regular, 8.5, CONTENT_W);
          for (const line of lines) {
            ensure(ctx, 12);
            ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size: 8.5, font: ctx.regular, color: BLUE });
            const w = ctx.regular.widthOfTextAtSize(line, 8.5);
            ctx.page.drawLine({
              start: { x: MARGIN, y: ctx.y - 1.5 },
              end: { x: MARGIN + w, y: ctx.y - 1.5 },
              thickness: 0.4,
              color: BLUE,
            });
            ctx.y -= 12;
          }
        }
        if (s.retrieved) text(ctx, `Retrieved ${s.retrieved}`, { size: 8, color: MUTED });
        gap(ctx, 6);
      }
      break;

    case "callout": {
      const lines = wrap(block.text, ctx.regular, 9.5, CONTENT_W - 24);
      const height = lines.length * 13 + 34;
      ensure(ctx, height);
      ctx.page.drawRectangle({
        x: MARGIN,
        y: ctx.y - height + 22,
        width: CONTENT_W,
        height,
        color: BAND,
        borderColor: LINE,
        borderWidth: 0.6,
      });
      ctx.page.drawText(sanitize(block.title), { x: MARGIN + 12, y: ctx.y + 4, size: 10, font: ctx.bold, color: NAVY });
      ctx.y -= 18;
      let cy = ctx.y;
      for (const line of lines) {
        ctx.page.drawText(line, { x: MARGIN + 12, y: cy, size: 9.5, font: ctx.regular, color: INK });
        cy -= 13;
      }
      ctx.y = cy - 14;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Fixed front matter
// ---------------------------------------------------------------------------

function drawCover(ctx: Ctx) {
  const { doc } = ctx;
  const page = ctx.page;

  page.drawRectangle({ x: 0, y: PAGE_H - 190, width: PAGE_W, height: 190, color: NAVY });
  page.drawText("PERMIVIO", { x: MARGIN, y: PAGE_H - 78, size: 26, font: ctx.bold, color: rgb(1, 1, 1) });
  page.drawText("Know the path. Clear the way.", {
    x: MARGIN,
    y: PAGE_H - 98,
    size: 10,
    font: ctx.regular,
    color: rgb(0.72, 0.82, 0.96),
  });
  page.drawRectangle({ x: MARGIN, y: PAGE_H - 132, width: 46, height: 3, color: BLUE });
  page.drawText(sanitize(doc.delivery_label.toUpperCase()), {
    x: MARGIN,
    y: PAGE_H - 158,
    size: 9,
    font: ctx.bold,
    color: rgb(0.72, 0.82, 0.96),
  });

  ctx.y = PAGE_H - 250;
  text(ctx, doc.report_title, { size: 25, bold: true, color: NAVY, lead: 30 });
  if (doc.report_subtitle) {
    gap(ctx, 4);
    text(ctx, doc.report_subtitle, { size: 12, color: MUTED, lead: 16 });
  }
  gap(ctx, 18);
  rule(ctx);

  const rows: { label: string; value: string }[] = [];
  if (doc.project_name) rows.push({ label: "Project", value: doc.project_name });
  if (doc.project_address) rows.push({ label: "Site address", value: doc.project_address });
  if (doc.jurisdiction) rows.push({ label: "Jurisdiction researched", value: doc.jurisdiction });
  if (doc.prepared_for) rows.push({ label: "Prepared for", value: doc.prepared_for });
  rows.push({ label: "Report number", value: doc.report_number });
  rows.push({ label: "Date issued", value: doc.issued_at });
  rows.push({ label: "Report version", value: `Version ${doc.version}` });
  rows.push({
    label: "Review status",
    value: doc.professionally_reviewed
      ? `Professionally reviewed${doc.reviewer_name ? ` by ${doc.reviewer_name}${doc.reviewer_title ? `, ${doc.reviewer_title}` : ""}` : ""}`
      : "AI-assisted research - not professionally reviewed",
  });
  drawBlock(ctx, { kind: "keyvalue", rows });

  gap(ctx, 6);
  drawBlock(ctx, {
    kind: "callout",
    title: doc.professionally_reviewed ? "PROFESSIONALLY REVIEWED" : "AI-ASSISTED RESEARCH",
    text: doc.professionally_reviewed
      ? "A Permivio permitting professional reviewed the findings in this report before delivery. Requirements may change and final determinations remain with the authority having jurisdiction and, where applicable, licensed design professionals."
      : "This report was produced through Permivio's AI-assisted permitting research and has not been reviewed by a Permivio permitting professional. It is not a code-compliance certification or an engineering approval. Final determinations remain with the authority having jurisdiction and, where applicable, licensed design professionals.",
  });
}

function drawControlPage(ctx: Ctx) {
  const { doc } = ctx;
  newPage(ctx);
  sectionHeading(ctx, "Report Control");
  drawBlock(ctx, {
    kind: "keyvalue",
    rows: [
      { label: "Report number", value: doc.report_number },
      { label: "Version", value: `Version ${doc.version}` },
      { label: "Date issued", value: doc.issued_at },
      { label: "Delivery level", value: doc.delivery_label },
      {
        label: "Reviewed by",
        value: doc.professionally_reviewed
          ? `${doc.reviewer_name ?? "Permivio permitting professional"}${doc.reviewer_title ? `, ${doc.reviewer_title}` : ""}`
          : "Not professionally reviewed",
      },
      { label: "Prepared by", value: "Permivio" },
    ],
  });

  sectionHeading(ctx, "How to read this report");
  drawBlock(ctx, {
    kind: "paragraph",
    text: "Every material statement in this report carries one of the labels below. Labels describe how the statement was established, so you always know what has been confirmed against an official source and what still needs confirmation before you rely on it.",
  });
  drawBlock(ctx, {
    kind: "bullets",
    items: [
      "Verified Source - established from an official published source cited in this report.",
      "Agency Confirmation Needed - the responsible agency should confirm this before you rely on it.",
      "Client Input Needed - information only you or your design team can supply.",
      "Professional Judgment - the considered opinion of a permitting professional, not a published rule.",
      "Estimated - an approximation based on available information, not a published figure.",
      "Not Applicable - reviewed and determined not to apply to this project.",
    ],
  });
  drawBlock(ctx, {
    kind: "callout",
    title: "Important",
    text: "Nothing in this report is a code-compliance certification, a zoning determination, a permit approval, or an engineering or architectural approval. Requirements change and interpretations vary by reviewer. Final determinations remain with the authority having jurisdiction and, where applicable, licensed design professionals.",
  });
}

function drawContents(ctx: Ctx) {
  newPage(ctx);
  sectionHeading(ctx, "Contents");
  const items = ["Report Control", "How to read this report"];
  if (ctx.doc.executive_decision || ctx.doc.executive_summary) items.push("Executive Summary");
  items.push(...ctx.doc.sections.map((s) => s.heading));
  if (ctx.doc.limitations?.length) items.push("Assumptions and Limitations");
  let n = 1;
  for (const item of items) {
    ensure(ctx, 17);
    ctx.page.drawText(`${String(n).padStart(2, "0")}`, { x: MARGIN, y: ctx.y, size: 9.5, font: ctx.bold, color: BLUE });
    ctx.page.drawText(sanitize(item), { x: MARGIN + 26, y: ctx.y, size: 10, font: ctx.regular, color: INK });
    ctx.y -= 17;
    n += 1;
  }
}

function drawExecutive(ctx: Ctx) {
  const { doc } = ctx;
  if (!doc.executive_summary && !doc.executive_decision) return;
  newPage(ctx);
  sectionHeading(ctx, "Executive Summary");
  if (doc.executive_decision) {
    drawBlock(ctx, {
      kind: "keyvalue",
      rows: [
        { label: "Question answered", value: doc.executive_decision.question },
        { label: "Our answer", value: doc.executive_decision.answer },
        { label: "Basis for the answer", value: doc.executive_decision.basis },
      ],
    });
    gap(ctx, 4);
  }
  if (doc.executive_summary) drawBlock(ctx, { kind: "paragraph", text: doc.executive_summary });
}

function drawHeadersAndFooters(ctx: Ctx) {
  const total = ctx.pages.length;
  ctx.pages.forEach((page, index) => {
    const pageNo = index + 1;
    if (pageNo > 1) {
      page.drawText("PERMIVIO", { x: MARGIN, y: PAGE_H - 42, size: 8.5, font: ctx.bold, color: NAVY });
      const right = sanitize(ctx.doc.report_title);
      const w = ctx.regular.widthOfTextAtSize(right, 8.5);
      page.drawText(right, { x: PAGE_W - MARGIN - w, y: PAGE_H - 42, size: 8.5, font: ctx.regular, color: MUTED });
      page.drawLine({
        start: { x: MARGIN, y: PAGE_H - 50 },
        end: { x: PAGE_W - MARGIN, y: PAGE_H - 50 },
        thickness: 0.6,
        color: LINE,
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: MARGIN - 8 },
      end: { x: PAGE_W - MARGIN, y: MARGIN - 8 },
      thickness: 0.6,
      color: LINE,
    });
    const left = sanitize(
      `${ctx.doc.report_number} - ${ctx.doc.professionally_reviewed ? "Professionally reviewed" : "AI-assisted research"}`,
    );
    page.drawText(left, { x: MARGIN, y: MARGIN - 22, size: 7.5, font: ctx.regular, color: MUTED });
    const label = `Page ${pageNo} of ${total}`;
    const lw = ctx.regular.widthOfTextAtSize(label, 7.5);
    page.drawText(label, { x: PAGE_W - MARGIN - lw, y: MARGIN - 22, size: 7.5, font: ctx.regular, color: MUTED });
  });
}

/** Renders a complete branded Permivio report PDF. */
export async function renderPermivioReportPdf(doc: ReportDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const first = pdf.addPage([PAGE_W, PAGE_H]);

  const ctx: Ctx = { pdf, page: first, y: PAGE_H - MARGIN, regular, bold, pages: [first], doc };

  pdf.setTitle(`${doc.report_title} - ${doc.report_number}`);
  pdf.setAuthor("Permivio");
  pdf.setSubject(doc.report_subtitle ?? doc.report_title);
  pdf.setProducer("Permivio");
  pdf.setCreator("Permivio");

  drawCover(ctx);
  drawControlPage(ctx);
  drawContents(ctx);
  drawExecutive(ctx);

  for (const section of doc.sections) {
    if (section.blocks.length === 0) continue;
    newPage(ctx);
    sectionHeading(ctx, section.heading);
    for (const block of section.blocks) drawBlock(ctx, block);
  }

  if (doc.limitations?.length) {
    newPage(ctx);
    sectionHeading(ctx, "Assumptions and Limitations");
    drawBlock(ctx, { kind: "bullets", items: doc.limitations });
    drawBlock(ctx, {
      kind: "callout",
      title: "Scope of this report",
      text: "Permivio provides permitting research, pre-submission quality control, and project intelligence. This report does not constitute legal advice, engineering or architectural services, a code-compliance certification, or an approval of any kind.",
    });
  }

  drawHeadersAndFooters(ctx);
  return pdf.save();
}

export const REPORT_RED = RED;
