// Portal-specific "headless browser" recipes used as a fallback when the
// plain Firecrawl scrape returns an empty / login-only shell. Each recipe
// drives a real Chromium session server-side via Firecrawl actions and
// returns markdown of the loaded page. Covers the 5 portal families that
// account for the vast majority of US permit portals: Accela ACA/Civic,
// Avolve ProjectDox, Tyler EnerGov, eTRAKiT, CitizenServe.

import { firecrawlScrapeWithActions, type FirecrawlAction } from "@/lib/firecrawl.shared";

export type PortalKind = "accela" | "projectdox" | "energov" | "etrakit" | "citizenserve" | "generic";

export function detectPortalKind(url: string): PortalKind {
  const u = url.toLowerCase();
  if (u.includes("aca-prod.accela.com") || u.includes("/portlets/") || u.includes("accela")) return "accela";
  if (u.includes("projectdox") || u.includes("avolvecloud") || u.includes("epr.")) return "projectdox";
  if (u.includes("energov") || u.includes("selfservice")) return "energov";
  if (u.includes("etrakit") || u.includes("etrakit3")) return "etrakit";
  if (u.includes("citizenserve")) return "citizenserve";
  return "generic";
}

function accelaActions(permitNumber: string): FirecrawlAction[] {
  // Accela Citizen Access "Search Application" flow.
  return [
    { type: "wait", milliseconds: 3000 },
    { type: "click", selector: "input[id*='PermitNumber'], input[name*='PermitNumber'], input[id*='txtPermitNumber']" },
    { type: "write", text: permitNumber, selector: "input[id*='PermitNumber'], input[name*='PermitNumber'], input[id*='txtPermitNumber']" },
    { type: "click", selector: "a[id*='btnNewSearch'], input[id*='btnNewSearch'], a[title*='Search'], input[value='Search']" },
    { type: "wait", milliseconds: 5000 },
    { type: "click", selector: "a[id*='RecordNumber'], a[href*='CapDetail']" },
    { type: "wait", milliseconds: 4000 },
  ];
}

function projectdoxActions(permitNumber: string): FirecrawlAction[] {
  return [
    { type: "wait", milliseconds: 3500 },
    { type: "write", text: permitNumber, selector: "input[id*='Project'], input[name*='Project'], input[type='search']" },
    { type: "press", key: "Enter" },
    { type: "wait", milliseconds: 5000 },
  ];
}

function energovActions(permitNumber: string): FirecrawlAction[] {
  return [
    { type: "wait", milliseconds: 3000 },
    { type: "write", text: permitNumber, selector: "input[id*='SearchModule'], input[placeholder*='Search'], input[type='search']" },
    { type: "press", key: "Enter" },
    { type: "wait", milliseconds: 5000 },
    { type: "click", selector: "a[href*='PermitDetail'], a[href*='CaseDetail']" },
    { type: "wait", milliseconds: 3500 },
  ];
}

function etrakitActions(permitNumber: string): FirecrawlAction[] {
  return [
    { type: "wait", milliseconds: 2500 },
    { type: "write", text: permitNumber, selector: "input[id*='PermitNumber'], input[name*='PermitNumber']" },
    { type: "click", selector: "input[value='Search'], button[id*='Search']" },
    { type: "wait", milliseconds: 4000 },
  ];
}

function citizenserveActions(permitNumber: string): FirecrawlAction[] {
  return [
    { type: "wait", milliseconds: 2500 },
    { type: "write", text: permitNumber, selector: "input[name*='PermitNumber'], input[type='search']" },
    { type: "press", key: "Enter" },
    { type: "wait", milliseconds: 4000 },
  ];
}

// Try to scrape a portal URL by driving a real headless browser through the
// portal-specific search flow. Returns empty markdown on failure — callers
// should treat this as a best-effort supplement to plain scraping.
export async function browserFallbackScrape(
  apiKey: string,
  url: string,
  permitNumber: string,
): Promise<{ markdown: string; kind: PortalKind }> {
  const kind = detectPortalKind(url);
  let actions: FirecrawlAction[];
  switch (kind) {
    case "accela": actions = accelaActions(permitNumber); break;
    case "projectdox": actions = projectdoxActions(permitNumber); break;
    case "energov": actions = energovActions(permitNumber); break;
    case "etrakit": actions = etrakitActions(permitNumber); break;
    case "citizenserve": actions = citizenserveActions(permitNumber); break;
    default: return { markdown: "", kind };
  }
  try {
    const res = await firecrawlScrapeWithActions(apiKey, url, actions, { waitFor: 3000, timeoutMs: 55000 });
    return { markdown: res.markdown || "", kind };
  } catch {
    return { markdown: "", kind };
  }
}
