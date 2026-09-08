// PERMIVIO — live municipal agency contact resolver (server-only).
//
// Retrieves the real contact record for each permitting authority that controls
// a site: department name, phone, email, counter address, public hours and the
// online permit portal — read directly off the agency's own .gov / .us page.
//
// Extraction is deterministic (no model involved). If a field is not printed on
// the retrieved page it stays null, so an agent can never present an invented
// phone number or email as an agency contact.

import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";
import { AGENCY_ROLE_LABEL, type AgencyContact, type AgencyRole } from "@/lib/agencyContacts";

const OFFICIAL_HOST_RE = /(\.gov|\.mil|\.us)(:|$)/i;

const ROLE_QUERY: Record<AgencyRole, (j: string) => string> = {
  building: (j) => `"${j}" building permit office contact phone address hours site:.gov`,
  planning_zoning: (j) => `"${j}" planning zoning department contact phone address site:.gov`,
  fire: (j) => `"${j}" fire marshal office plan review contact phone site:.gov`,
  health: (j) => `"${j}" health department environmental health plan review contact phone site:.gov`,
  public_works: (j) => `"${j}" public works engineering permits right of way contact phone site:.gov`,
  utilities: (j) => `"${j}" water sewer utility new service connection contact phone site:.gov`,
};

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:gov|us|org|net|com)\b/i;
const STREET_RE =
  /\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Circle|Highway|Hwy\.?|Parkway|Pkwy\.?|Plaza|Square)\b[^\n|]{0,60}/;
const HOURS_RE =
  /(?:Monday|Mon\.?|Hours[^\n]{0,10}:)[^\n|]{0,120}(?:a\.?m\.?|p\.?m\.?|AM|PM|noon)[^\n|]{0,40}/i;
const PORTAL_RE =
  /https?:\/\/[^\s)"']*(?:accela|citizenaccess|energov|projectdox|opengov|clariti|etrakit|mygov|permit|portal|selfservice)[^\s)"']*/i;
const DEPT_RE =
  /\b(?:Department|Division|Office|Bureau)\s+of\s+[A-Z][A-Za-z&,'\- ]{3,60}|\b[A-Z][A-Za-z&'\- ]{3,40}\s+(?:Department|Division|Office|Bureau)\b/;

function clean(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
  return s.length > 2 ? s.slice(0, 180) : null;
}

function isOfficialUrl(url: string): boolean {
  try {
    return OFFICIAL_HOST_RE.test(new URL(url).host);
  } catch {
    return false;
  }
}

/** Pull contact details out of a retrieved page's text. Nothing is inferred. */
export function extractContactFields(markdown: string): {
  department: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  portal_url: string | null;
} {
  const text = markdown.slice(0, 20000);
  return {
    department: clean(DEPT_RE.exec(text)?.[0]),
    phone: clean(PHONE_RE.exec(text)?.[0]),
    email: clean(EMAIL_RE.exec(text)?.[0]),
    address: clean(STREET_RE.exec(text)?.[0]),
    hours: clean(HOURS_RE.exec(text)?.[0]),
    portal_url: clean(PORTAL_RE.exec(text)?.[0]),
  };
}

async function resolveOne(
  fcKey: string,
  jurisdiction: string,
  role: AgencyRole,
): Promise<AgencyContact | null> {
  const hits = await firecrawlSearch(fcKey, ROLE_QUERY[role](jurisdiction), 4).catch(() => []);
  const targets = hits.filter((h) => h.url && isOfficialUrl(h.url)).slice(0, 2);
  for (const t of targets) {
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), 12000));
    const page = await Promise.race([firecrawlScrape(fcKey, t.url), timeout]).catch(() => null);
    if (!page?.markdown) continue;
    const f = extractContactFields(page.markdown);
    // Require at least one real, reachable detail before we call it a contact.
    if (!f.phone && !f.email && !f.address) continue;
    return {
      role,
      role_label: AGENCY_ROLE_LABEL[role],
      jurisdiction,
      department: f.department,
      phone: f.phone,
      email: f.email,
      address: f.address,
      hours: f.hours,
      portal_url: f.portal_url,
      source_url: t.url,
      source_title: clean(page.title || t.title) ?? t.url,
      verified: true,
    };
  }
  return null;
}

/**
 * Resolve the live contact record for each requested authority family in one
 * jurisdiction. Returns only the contacts that were actually retrieved.
 */
export async function gatherAgencyContacts(opts: {
  jurisdiction: string;
  roles?: AgencyRole[];
}): Promise<{ contacts: AgencyContact[]; unavailable: string[] }> {
  const jurisdiction = opts.jurisdiction.trim();
  const roles = opts.roles ?? (["building", "planning_zoning", "fire", "health", "public_works", "utilities"] as AgencyRole[]);
  const fcKey = process.env["FIRECRAWL_API_KEY"];
  if (!fcKey) return { contacts: [], unavailable: ["Agency contact directory (document retrieval not configured)"] };
  if (!jurisdiction) return { contacts: [], unavailable: ["Agency contact directory (jurisdiction not resolved)"] };

  const settled = await Promise.all(roles.map((r) => resolveOne(fcKey, jurisdiction, r).catch(() => null)));
  const contacts = settled.filter((c): c is AgencyContact => c !== null);
  const missing = roles.filter((r) => !contacts.some((c) => c.role === r));
  const unavailable = missing.length
    ? [`Published contact details not found for: ${missing.map((r) => AGENCY_ROLE_LABEL[r]).join(", ")}`]
    : [];
  return { contacts, unavailable };
}

/** Prompt-ready block. Empty when nothing was retrieved. */
export function agencyContactsBlock(contacts: AgencyContact[]): string {
  if (!contacts.length) return "";
  const lines = contacts.map(
    (c, i) =>
      [
        `AGENCY CONTACT ${i + 1} — ${c.role_label} (${c.jurisdiction})`,
        c.department ? `Department as published: ${c.department}` : "",
        c.phone ? `Phone: ${c.phone}` : "",
        c.email ? `Email: ${c.email}` : "",
        c.address ? `Counter address: ${c.address}` : "",
        c.hours ? `Public hours: ${c.hours}` : "",
        c.portal_url ? `Online permit portal: ${c.portal_url}` : "",
        `Source: ${c.source_url}`,
      ]
        .filter(Boolean)
        .join("\n"),
  );
  return [
    `[OFFICIAL AGENCY CONTACT DIRECTORY — retrieved from agency pages]`,
    lines.join("\n\n"),
    `- Name the agency exactly as published above when a contact exists for that authority family.`,
    `- Never state a phone number, email, address, office hours or portal URL that is not listed above.`,
  ].join("\n\n");
}
