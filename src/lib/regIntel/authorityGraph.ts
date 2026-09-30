/**
 * Authority graph (pure). Separates WHERE a property is (located_in) from WHO administers each
 * function (administered_by). Relationships come only from literal statements on official pages;
 * absent evidence the edge stays a structural presumption and Needs Verification.
 */
export type AuthorityFunction = "building" | "zoning" | "electrical" | "plumbing_mechanical" | "fire" | "health";
export type Relationship = "direct" | "delegated" | "contracted" | "county_administered" | "state_administered" | "split_by_type" | "not_administered" | "presumed";

export type AuthorityEdge = {
  fn: AuthorityFunction;
  agency: string;
  relationship: Relationship;
  /** e.g. "residential" / "commercial" when the statement limits the edge. */
  applies_to: "all" | "residential" | "commercial";
  quote: string;
  url: string | null;
  page: number | null;
  origin: "official_text" | "structure" | "ai_extraction";
};

export const FUNCTION_LABEL: Record<AuthorityFunction, string> = {
  building: "Building permits", zoning: "Zoning", electrical: "Electrical permits", plumbing_mechanical: "Plumbing / mechanical permits", fire: "Fire review / fire code", health: "Health / onsite sewage",
};
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  direct: "Administered directly", delegated: "Delegated", contracted: "Contracted to another agency", county_administered: "County-administered",
  state_administered: "State-administered", split_by_type: "Split by permit / project type", not_administered: "Not administered by this government", presumed: "Structural presumption (unconfirmed)",
};

const FN_RE: Array<[AuthorityFunction, RegExp]> = [
  ["building", /\b(building|construction|residential|commercial) (permits?|inspections?|plan review|code enforcement)\b|\bbuilding department\b|\bbuilding official\b/i],
  ["zoning", /\bzoning (permits?|certificates?|compliance|administration|inspector|approval)\b/i],
  ["electrical", /\belectrical (permits?|inspections?)\b/i],
  ["plumbing_mechanical", /\b(plumbing|mechanical|hvac) (permits?|inspections?)\b/i],
  ["fire", /\bfire (code|plan review|prevention|marshal|inspections?)\b/i],
  ["health", /\b(septic|onsite (sewage|wastewater)|well) (permits?|systems?)\b/i],
];

// An agency name: capitalised words ending in a government noun.
const AGENCY = String.raw`((?:the\s+)?(?:[A-Z][A-Za-z.&'\-]+\s+){0,7}(?:County|City|Town|Township|Village|Borough|State|Department|Division|Bureau|Office|Agency|District|Commission|Authority|Services|Development|Planning|Inspections?|Industrial Compliance|Fire Marshal)(?:\s+(?:of|for)\s+(?:[A-Z][A-Za-z.\-]+\s?){1,5})?)`;
const VERB = String.raw`(?:are|is)\s+(?:issued|administered|handled|processed|reviewed|enforced|provided|performed|conducted)\s+(?:by|through)`;

const clean = (s: string) => s.replace(/^the\s+/i, "").replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();

function sentenceAround(text: string, idx: number): string {
  const s = Math.max(text.lastIndexOf(".", idx - 1) + 1, idx - 320);
  let e = text.indexOf(".", idx);
  if (e < 0 || e - idx > 360) e = Math.min(text.length, idx + 360);
  return text.slice(s, e + 1).replace(/\s+/g, " ").trim();
}

function fnOf(sentence: string): AuthorityFunction[] {
  return FN_RE.filter(([, re]) => re.test(sentence)).map(([f]) => f);
}
function appliesTo(sentence: string, url?: string | null): AuthorityEdge["applies_to"] {
  const own = appliesToText(sentence);
  if (own !== "all" || !url) return own;
  return appliesToText(url.replace(/[-_/]/g, " "));
}
function appliesToText(sentence: string): AuthorityEdge["applies_to"] {
  const r = /residential|one- and two-family|single-family|1- and 2-family/i.test(sentence), c = /commercial|non-?residential/i.test(sentence);
  return r && !c ? "residential" : c && !r ? "commercial" : "all";
}

/**
 * Extract explicit authority relationships from official text.
 * ctx.self = the government whose page this is (for "we issue…"-style statements).
 */
export function extractAuthorityRelations(text: string, ctx: { self: string; url: string | null; page?: number | null; state?: string | null }): AuthorityEdge[] {
  const out: AuthorityEdge[] = [];
  const t = text.replace(/\s+/g, " ");
  const push = (fns: AuthorityFunction[], agency: string, rel: Relationship, quote: string) => {
    const a = clean(agency);
    if (!a || a.length < 4 || /^(the )?(state|county|city|town|township)$/i.test(a) && rel !== "state_administered") return;
    for (const fn of fns) {
      if (out.some((o) => o.fn === fn && o.agency.toLowerCase() === a.toLowerCase() && o.applies_to === appliesTo(quote))) continue;
      out.push({ fn, agency: a, relationship: rel, applies_to: appliesTo(quote, ctx.url), quote: quote.slice(0, 400), url: ctx.url, page: ctx.page ?? null, origin: "official_text" });
    }
  };
  const rels: Array<{ re: RegExp; rel: (q: string, agency: string) => Relationship; agencyGroup: number }> = [
    // "Building permits are issued by the Franklin County Economic Development and Planning Department"
    { re: new RegExp(String.raw`(?:permits?|inspections?|plan review)[^.]{0,80}?${VERB}\s+${AGENCY}`, "g"), agencyGroup: 1, rel: (q, a) => kindOfAgency(a, ctx.self, q) },
    // "contracts with the X for building inspection services"
    { re: new RegExp(String.raw`(?:contracts?|contracted|agreement|partners?)\s+with\s+${AGENCY}[^.]{0,80}?(?:building|inspection|permit|plan review|code)`, "g"), agencyGroup: 1, rel: () => "contracted" },
    // "X issues/administers building permits for …"
    { re: new RegExp(String.raw`${AGENCY}\s+(?:issues|administers|reviews|enforces|handles|processes|is responsible for)\s+(?:all\s+)?(?:residential\s+|commercial\s+)?(?:building|electrical|plumbing|mechanical|zoning|construction)\s+(?:permits?|code|inspections?)`, "g"), agencyGroup: 1, rel: (q, a) => kindOfAgency(a, ctx.self, q) },
    // "apply for a building permit with/through/at the X"
    { re: new RegExp(String.raw`(?:apply|application|obtain|submit)[^.]{0,40}?(?:building|electrical|plumbing|mechanical)\s+permits?[^.]{0,40}?(?:with|through|at|from)\s+${AGENCY}`, "g"), agencyGroup: 1, rel: (q, a) => kindOfAgency(a, ctx.self, q) },
  ];
  for (const r of rels) {
    let m: RegExpExecArray | null;
    r.re.lastIndex = 0;
    while ((m = r.re.exec(t)) && out.length < 40) {
      const q = sentenceAround(t, m.index + 5);
      // Functions come from the matched clause first (a sentence may mention zoning only as a prerequisite).
      const fns = fnOf(m[0]).length ? fnOf(m[0]) : fnOf(q);
      if (!fns.length) continue;
      push(fns, m[r.agencyGroup]!, r.rel(q, m[r.agencyGroup]!), q);
    }
  }
  // Explicit negative: "The township does not issue building permits"
  const neg = /\b(?:does|do)\s+not\s+(?:issue|administer|provide|handle)\s+(?:any\s+)?(building|electrical|plumbing|construction)\s+(?:permits?|inspections?)/gi;
  let m: RegExpExecArray | null;
  while ((m = neg.exec(t))) {
    const q = sentenceAround(t, m.index);
    const fns = fnOf(q.replace(/does not issue|do not issue/i, "issues"));
    for (const fn of fns.length ? fns : (["building"] as AuthorityFunction[])) if (!out.some((o) => o.fn === fn && o.relationship === "not_administered")) out.push({ fn, agency: ctx.self, relationship: "not_administered", applies_to: appliesTo(q), quote: q.slice(0, 400), url: ctx.url, page: ctx.page ?? null, origin: "official_text" });
  }
  return out;
}

function kindOfAgency(agency: string, self: string, quote: string): Relationship {
  const a = agency.toLowerCase();
  if (/\bstate\b|division of industrial compliance|state fire marshal|department of (commerce|labor)/.test(a)) return "state_administered";
  if (/contract/.test(quote.toLowerCase())) return "contracted";
  if (/delegat/.test(quote.toLowerCase())) return "delegated";
  const core = self.toLowerCase().replace(/^(city|town|township|village|borough|county) of /, "").replace(/ (city|town|township|village|borough|county)$/, "").trim();
  if (core && a.includes(core)) return "direct";
  if (/\bcounty\b/.test(a)) return "county_administered";
  return "delegated";
}

export type GraphNode = { fn: AuthorityFunction; status: "evidenced" | "split" | "conflict" | "presumed" | "unresolved"; edges: AuthorityEdge[]; summary: string };

/** Resolve per function. Conflicting agencies for the same applies_to → conflict (Needs Verification). */
export function resolveAuthorityGraph(edges: AuthorityEdge[], presumption: { agency: string | null; basis: string }, fns: AuthorityFunction[]): GraphNode[] {
  return fns.map((fn) => {
    const ev = edges.filter((e) => e.fn === fn && e.origin !== "structure");
    const pos = ev.filter((e) => e.relationship !== "not_administered");
    if (!pos.length) {
      const negs = ev.filter((e) => e.relationship === "not_administered");
      if (negs.length) return { fn, status: "unresolved", edges: negs, summary: `${negs[0]!.agency} states it does not administer ${FUNCTION_LABEL[fn].toLowerCase()}; the administering agency was not stated.` };
      return presumption.agency
        ? { fn, status: "presumed", edges: [{ fn, agency: presumption.agency, relationship: "presumed", applies_to: "all", quote: presumption.basis, url: null, page: null, origin: "structure" }], summary: `${presumption.agency} (presumed from government structure — not confirmed by an official statement).` }
        : { fn, status: "unresolved", edges: [], summary: "Not established." };
    }
    const byScope = new Map<string, Set<string>>();
    for (const e of pos) (byScope.get(e.applies_to) ?? byScope.set(e.applies_to, new Set()).get(e.applies_to)!).add(e.agency.toLowerCase());
    const conflict = [...byScope.values()].some((s) => s.size > 1);
    // Different agencies for different project types (residential vs commercial, or one type vs "all others").
    const scoped = [...byScope.entries()].map(([k, v]) => [k, [...v][0]] as const);
    const split = scoped.length > 1 && new Set(scoped.map(([, a]) => a)).size > 1 && scoped.some(([k]) => k !== "all");
    const uniq = [...new Map(pos.map((e) => [`${e.agency.toLowerCase()}|${e.applies_to}`, e])).values()];
    if (conflict) return { fn, status: "conflict", edges: uniq, summary: `Official pages name different agencies: ${uniq.map((e) => e.agency).join(" / ")}.` };
    if (split) return { fn, status: "split", edges: uniq.map((e) => ({ ...e, relationship: e.relationship === "direct" ? "split_by_type" : e.relationship })), summary: uniq.map((e) => `${e.applies_to === "all" ? (uniq.some((x) => x.applies_to !== "all") ? "Other" : "All") : e.applies_to[0]!.toUpperCase() + e.applies_to.slice(1)}: ${e.agency}`).join(" · ") };
    const e = uniq[0]!;
    return { fn, status: "evidenced", edges: uniq, summary: `${e.agency} — ${RELATIONSHIP_LABEL[e.relationship]}${e.applies_to !== "all" ? ` (${e.applies_to})` : ""}.` };
  });
}

/** Score a link for how likely it explains who administers permits (bounded crawl). */
export function authorityLinkScore(text: string, href: string): number {
  const t = `${text} ${href}`.toLowerCase();
  if (/(facebook|twitter|instagram|linkedin|youtube|mailto:|tel:|\.(jpg|png|gif|zip))/.test(t)) return 0;
  let s = 0;
  if (/(building (department|division|services|permits?|inspections?|safety|regulation)|permits? (and|&) inspections?|code enforcement)/.test(t)) s += 5;
  if (/(zoning|planning)/.test(t)) s += 2;
  if (/(electrical|plumbing|mechanical|fire (marshal|prevention))/.test(t)) s += 2;
  if (/(frequently asked|faq|who (issues|do i)|contact)/.test(t)) s += 1;
  if (/(news|calendar|events?|jobs|careers|bid|rfp|agenda|minutes|meeting)/.test(t)) s -= 3;
  return Math.max(0, s);
}
