/**
 * Evidence following (pure, client/server safe).
 * Given official page text, find (a) links worth following toward adoption evidence and
 * (b) explicit adoption statements ("adopts the 2021 International Building Code … effective July 1, 2023").
 * Nothing here is inferred: a statement becomes evidence only when the page literally says it.
 */
import type { CodeEvidence, CodeFamily, SourceType, Layer } from "./codeTemporal";

const MODEL: Array<{ re: RegExp; family: CodeFamily; model: string }> = [
  { re: /International Residential Code|\bIRC\b/i, family: "residential", model: "IRC" },
  { re: /International Existing Building Code|\bIEBC\b/i, family: "existing_building", model: "IEBC" },
  { re: /International Energy Conservation Code|\bIECC\b/i, family: "energy", model: "IECC" },
  { re: /International Fire Code|\bIFC\b|NFPA 1\b(?!\d)/i, family: "fire", model: "IFC / NFPA 1" },
  { re: /International Mechanical Code|\bIMC\b|Uniform Mechanical Code|\bUMC\b/i, family: "mechanical", model: "IMC / UMC" },
  { re: /International Plumbing Code|\bIPC\b|Uniform Plumbing Code|\bUPC\b/i, family: "plumbing", model: "IPC / UPC" },
  { re: /International Fuel Gas Code|\bIFGC\b/i, family: "fuel_gas", model: "IFGC" },
  { re: /National Electrical Code|NFPA 70\b(?!\d)|\bNEC\b/i, family: "electrical", model: "NFPA 70 (NEC)" },
  { re: /ICC A117\.1|ANSI A117\.1|Accessible and Usable/i, family: "accessibility", model: "ICC A117.1" },
  { re: /International Building Code|\bIBC\b/i, family: "building", model: "IBC" },
];

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept?\\.?|Oct\\.?|Nov\\.?|Dec\\.?";
const DATE_RE = new RegExp(`(?:(${MONTHS})\\s+(\\d{1,2}),?\\s+(20\\d\\d))|(?:(\\d{1,2})/(\\d{1,2})/(20\\d\\d))|(?:(20\\d\\d)-(\\d\\d)-(\\d\\d))`, "i");
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseDate(s: string): string | null {
  const m = s.match(DATE_RE);
  if (!m) return null;
  const pad = (x: number) => String(x).padStart(2, "0");
  if (m[1]) return `${m[3]}-${pad(MON[m[1].slice(0, 3).toLowerCase()]!)}-${pad(Number(m[2]))}`;
  if (m[4]) return `${m[6]}-${pad(Number(m[4]))}-${pad(Number(m[5]))}`;
  if (m[7]) return `${m[7]}-${m[8]}-${m[9]}`;
  return null;
}

export function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
}

/** Score a link for how likely it leads to code-adoption / amendment evidence. 0 = don't follow. */
export function adoptionLinkScore(text: string, href: string): number {
  const t = `${text} ${href}`.toLowerCase();
  if (/\.(jpg|png|gif|zip|docx?|xlsx?)(\?|$)/.test(href.toLowerCase())) return 0;
  if (/(facebook|twitter|instagram|linkedin|youtube|mailto:|tel:)/.test(t)) return 0;
  let s = 0;
  if (/(adopted codes?|code adoption|codes? adopted|current codes?|building codes?|construction codes?|codes? in effect|applicable codes?)/.test(t)) s += 5;
  if (/(amendment|local amendments?|ordinance)/.test(t)) s += 3;
  if (/(administrative (code|rule)|regulation|rulemaking|register|statute)/.test(t)) s += 3;
  if (/(international (building|residential|fire)|nec\b|nfpa|electrical code|fire code|energy code)/.test(t)) s += 3;
  if (/(building (department|division|services|safety)|inspections?|permits?)/.test(t)) s += 1;
  if (/\.pdf(\?|$)/.test(href.toLowerCase()) && s > 0) s += 1;
  if (/(news|calendar|events?|jobs|careers|bid|rfp|agenda|minutes)/.test(t)) s -= 3;
  return Math.max(0, s);
}

export type AdoptionStatement = { family: CodeFamily; model: string; edition: string; effective_from: string | null; adopted: string | null; amended: boolean; proposed: boolean; quote: string };

/** Extract explicit edition statements from page text. Requires a year adjacent to a model-code name. */
export function extractAdoptionStatements(text: string, max = 40): AdoptionStatement[] {
  const out: AdoptionStatement[] = [];
  const re = /(20[012]\d)\s+(?:edition\s+of\s+(?:the\s+)?)?((?:International|National|Uniform)\s+[A-Z][A-Za-z ]{2,40}?Code|IBC|IRC|IECC|IEBC|IFC|IMC|IPC|IFGC|UPC|UMC|NEC|NFPA\s*70|NFPA\s*1|ICC\s*A117\.1)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < max) {
    const model = MODEL.find((x) => x.re.test(m![2]!));
    if (!model) continue;
    const start = Math.max(0, m.index - 220), end = Math.min(text.length, m.index + m[0].length + 220);
    const win = text.slice(start, end);
    const before = text.slice(start, m.index).toLowerCase();
    const after = text.slice(m.index, end).toLowerCase();
    const proposed = /(propos|draft|under (review|development)|public comment|will consider|hearing)/.test(win.toLowerCase());
    const adoptionCue = /(adopt|in effect|enforce|currently use|effective|amend|shall be|is the)/.test(before + after);
    if (!adoptionCue && !proposed) continue;
    const effIdx = win.toLowerCase().search(/effective|in effect|beginning|as of/);
    const effective_from = effIdx >= 0 ? parseDate(win.slice(effIdx, effIdx + 60)) : null;
    const adIdx = win.toLowerCase().search(/adopted (on|by)/);
    const adopted = adIdx >= 0 ? parseDate(win.slice(adIdx, adIdx + 60)) : null;
    const quote = win.replace(/\s+/g, " ").trim().slice(0, 400);
    if (out.some((o) => o.family === model.family && o.edition === m![1])) continue;
    out.push({ family: model.family, model: model.model, edition: `${m[1]} ${model.model}`, effective_from, adopted, amended: /amend/.test(win.toLowerCase()), proposed, quote });
  }
  return out;
}

/** Classify an official page by its legal authority from URL/text cues. */
export function classifySourceType(url: string, text: string): SourceType {
  const u = url.toLowerCase(), t = text.slice(0, 3000).toLowerCase();
  if (/(statutes?|legislature|leg\.state|\/laws?\/|codes\.ohio|revisor)/.test(u)) return "statute";
  if (/(administrative (code|rules?)|\/rules?\/|\/regulations?\/|register|\/comar|\/admin-code|oal\.|sos\.)/.test(u) || /administrative (code|rule)/.test(t)) return "rule";
  if (/(municode|ecode360|amlegal|codelibrary|codepublishing|generalcode)/.test(u)) return "rule";
  if (/(ordinance no|resolution no|notice of adoption|hereby adopt)/.test(t)) return "adoption_notice";
  if (/(propos|draft|public comment)/.test(t) && /(code development|update process)/.test(t)) return "development";
  if (/(faq|frequently asked)/.test(u + t)) return "faq";
  if (/(adopted codes?|codes? in effect|current codes?)/.test(t)) return "agency_current_code_page";
  return "informational";
}

export function toEvidence(st: AdoptionStatement, ctx: { layer: Layer; state: string; jurisdiction_key?: string | null; authority: string; url: string; source_type: SourceType; primary: boolean }): CodeEvidence {
  return {
    layer: ctx.layer, state: ctx.state, jurisdiction_key: ctx.jurisdiction_key ?? null, family: st.family, edition: st.edition, model: st.model,
    adopted: st.adopted, effective_from: st.effective_from, retrieved_at: new Date().toISOString(), authority: ctx.authority,
    source_type: st.proposed ? "development" : ctx.source_type, url: ctx.url, quote: st.quote, primary: ctx.primary, proposed: st.proposed,
    note: st.amended ? "Source text mentions amendments to this edition." : null,
  };
}

/** Evidence detected on local pages that limits local amendment authority. */
export function statePreemptionCue(text: string): string | null {
  const m = text.match(/[^.]{0,160}(may not (be )?amend|shall not amend|preempt|uniform statewide|minimum (statewide|standards)|no (local )?amendments?)[^.]{0,160}\./i);
  return m ? m[0].trim().slice(0, 320) : null;
}
