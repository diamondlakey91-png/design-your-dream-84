/**
 * Official-document evidence (pure, testable). A document becomes evidence only when:
 *  - it is hosted by / linked from the government it claims to represent, and
 *  - the relevant text is literally present on an identified page.
 * Scanned or unreadable documents never yield facts — they become Needs Verification.
 */
import { parseDate } from "./evidenceFollower";

export type DocAuthorityClass = "issuing_government" | "related_government" | "code_publisher" | "unconfirmed";

export type DocEvidence = {
  url: string;
  title: string;
  issuing_authority: string | null;
  authority_class: DocAuthorityClass;
  published: string | null;
  adopted: string | null;
  effective: string | null;
  page: number | null;
  section: string | null;
  excerpt: string;
  retrieved_at: string;
  readable: boolean;
  kind: DocKind;
};

export type DocKind = "code_adoption_ordinance" | "amendment_ordinance" | "administrative_rule" | "building_code_document" | "zoning_ordinance" | "permit_guide" | "application_instructions" | "agency_bulletin" | "fire_code_adoption" | "other";

/** Text with fewer than ~40 real characters per page is treated as scanned / image-only. */
export function isScanned(pages: string[]): boolean {
  if (!pages.length) return true;
  const chars = pages.reduce((a, p) => a + p.replace(/\s+/g, "").length, 0);
  return chars / pages.length < 40;
}

export function classifyDocKind(title: string, text: string): DocKind {
  const t = `${title} ${text.slice(0, 4000)}`.toLowerCase();
  if (/fire (prevention )?code/.test(t) && /(adopt|ordinance|amend)/.test(t)) return "fire_code_adoption";
  if (/zoning (ordinance|resolution|code)|zoning district/.test(t) && !/building code/.test(t)) return "zoning_ordinance";
  if (/(administrative code|administrative rule|\brule\s+\d)/.test(t)) return "administrative_rule";
  if (/ordinance/.test(t) && /amend/.test(t) && /(building|residential|electrical|plumbing|mechanical) code/.test(t)) return "amendment_ordinance";
  if (/(ordinance|resolution)/.test(t) && /adopt/.test(t) && /code/.test(t)) return "code_adoption_ordinance";
  if (/(application|how to apply|submittal requirements|checklist)/.test(t)) return "application_instructions";
  if (/(permit guide|permitting guide|when is a permit required|permits? (are|is) required)/.test(t)) return "permit_guide";
  if (/(bulletin|notice|memorandum|advisory)/.test(t)) return "agency_bulletin";
  if (/(building code|residential code|electrical code)/.test(t)) return "building_code_document";
  return "other";
}

/** Find page-anchored passages matching a regex. Returns 1-based page numbers. */
export function findPassages(pages: string[], re: RegExp, max = 6, radius = 220): Array<{ page: number; excerpt: string; section: string | null }> {
  const out: Array<{ page: number; excerpt: string; section: string | null }> = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  pages.forEach((raw, i) => {
    const p = raw.replace(/\s+/g, " ");
    let m: RegExpExecArray | null;
    g.lastIndex = 0;
    while ((m = g.exec(p)) && out.length < max) {
      const s = Math.max(0, m.index - radius), e = Math.min(p.length, m.index + m[0].length + radius);
      const before = p.slice(Math.max(0, m.index - 600), m.index);
      const sec = [...before.matchAll(/\b(Section|Sec\.|§|Chapter|Article)\s*([0-9A-Z][0-9A-Z.\-]{0,14})/g)].pop();
      out.push({ page: i + 1, excerpt: p.slice(s, e).trim(), section: sec ? `${sec[1]} ${sec[2]}` : null });
      if (m[0].length === 0) g.lastIndex++;
    }
  });
  return out;
}

/** Publication / adoption / effective dates stated in the document (first pages). */
export function documentDates(pages: string[]): { published: string | null; adopted: string | null; effective: string | null } {
  const head = pages.slice(0, 3).join(" ").replace(/\s+/g, " ");
  const at = (re: RegExp) => { const i = head.search(re); return i >= 0 ? parseDate(head.slice(i, i + 80)) : null; };
  return {
    adopted: at(/(adopted|passed|enacted)( on| this)?/i),
    effective: at(/(effective( date)?|shall take effect|in effect)/i),
    published: at(/(published|issued|revised|dated|date:)/i) ?? parseDate(head.slice(0, 400)),
  };
}

/**
 * Does this document belong to the government it would be evidence for?
 * host on the government's own domain → issuing_government; another .gov/.us host → related_government;
 * known code publisher → code_publisher; anything else → unconfirmed (never Verified).
 */
export function documentAuthority(url: string, govHosts: string[]): DocAuthorityClass {
  let h = "";
  try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "unconfirmed"; }
  if (govHosts.some((g) => { const x = g.replace(/^www\./, ""); return h === x || h.endsWith(`.${x}`); })) return "issuing_government";
  if (/(municode|ecode360|amlegal|codelibrary|codepublishing|generalcode)/.test(h)) return "code_publisher";
  if (/\.(gov|us)$/.test(h)) return "related_government";
  return "unconfirmed";
}
