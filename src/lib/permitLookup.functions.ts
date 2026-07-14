import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callLovableAI } from "@/lib/ai.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";

const AddressLookupInput = z.object({
  address: z.string().trim().min(3).max(300),
  jurisdiction: z.string().trim().max(200).optional().default(""),
});

const AddressFindingSchema = z.object({
  permit_number: z.string().default(""),
  permit_type: z.string().default(""),
  status: z.string().default("Unknown"),
  address: z.string().default(""),
  applicant: z.string().default(""),
  filed_date: z.string().default(""),
  updated_date: z.string().default(""),
  description: z.string().default(""),
  source_url: z.string().default(""),
  match_confidence: z.enum(["high", "medium", "low"]).default("medium"),
  match_score: z.number().min(0).max(100).default(60),
  match_reason: z.string().default(""),
});

const AddressLookupSchema = z.object({
  jurisdiction: z.string(),
  portal_name: z.string(),
  portal_url: z.string(),
  search_url: z.string().default(""),
  findings: z.array(AddressFindingSchema).max(25),
  summary: z.string(),
  overall_confidence: z.enum(["high", "medium", "low", "none"]).default("medium"),
  no_match_reason: z.string().default(""),
  sources_scanned: z.object({
    official_portal: z.boolean().default(false),
    direct_portal_search: z.boolean().default(false),
    web_search: z.boolean().default(false),
  }).default({ official_portal: false, direct_portal_search: false, web_search: false }),
});

// Direct portal search URL templates for jurisdictions where the public portal
// is not well-indexed by Google (Accela, EnerGov, etc). Extend as needed —
// each entry returns URLs we can hand to Firecrawl to scrape address-scoped
// search results directly from the source of truth.
function buildDirectPortalSearchUrls(jurisdiction: string, address: string): string[] {
  const j = jurisdiction.toLowerCase();
  const streetOnly = address.replace(/,.*$/, "").trim();
  const enc = encodeURIComponent(streetOnly);
  const urls: string[] = [];

  if (/baltimore(\s+city)?,\s*md/.test(j)) {
    // Baltimore City ePermits — Accela Citizen Access global search
    urls.push(`https://cels.baltimorehousing.org/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/baltimore\s+county,\s*md/.test(j)) {
    urls.push(`https://permits.baltimorecountymd.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/washington,?\s*dc|district of columbia/.test(j)) {
    urls.push(`https://eservices.dcra.dc.gov/DCRAPermitApplicationSearch/Search/Permit?address=${enc}`);
  }
  if (/new york,?\s*ny|nyc/.test(j)) {
    urls.push(`https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?requestid=1&allbin=&houseno=${enc}`);
  }
  if (/los angeles,?\s*ca/.test(j)) {
    urls.push(`https://www.ladbsservices2.lacity.org/OnlineServices/PermitReport/PermitReportAddress?address=${enc}`);
  }
  if (/chicago,?\s*il/.test(j)) {
    urls.push(`https://webapps1.chicago.gov/buildingrecords/?addr=${enc}`);
  }
  if (/san francisco,?\s*ca/.test(j)) {
    urls.push(`https://dbiweb02.sfgov.org/dbipts/default.aspx?page=AddressLookup&Address=${enc}`);
  }
  if (/seattle,?\s*wa/.test(j)) {
    urls.push(`https://cosaccela.seattle.gov/portal/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/boston,?\s*ma/.test(j)) {
    urls.push(`https://www.boston.gov/permits?search=${enc}`);
  }
  if (/austin,?\s*tx/.test(j)) {
    urls.push(`https://abc.austintexas.gov/web/permit/public-search-other?reset=true&t_selected_search=CAP&t_selected_property=STREET_NUMBER&t_selected_permit_type=BP&t_STREET_NUMBER=${enc}`);
  }
  if (/miami,?\s*fl/.test(j)) {
    urls.push(`https://apps.miamigov.com/eBuilding/PropertySearch.aspx?address=${enc}`);
  }
  if (/philadelphia,?\s*pa/.test(j)) {
    urls.push(`https://eclipse.phila.gov/phillylmsprod/int/lms/Login.aspx#address=${enc}`);
  }
  // Virginia
  if (/arlington(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ARLINGTONCO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
    urls.push(`https://permits.arlingtonva.us/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/fairfax(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://www.fairfaxcounty.gov/plan2build/permit-status?address=${enc}`);
    urls.push(`https://aca-prod.accela.com/FFXC/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/loudoun(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://aca-prod.accela.com/LOUDOUN/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/prince\s+william(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://eservices.pwcgov.org/BuildingDevelopment/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/alexandria,?\s*va/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ALEXANDRIA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/richmond,?\s*va/.test(j)) {
    urls.push(`https://energov.richmondgov.com/EnerGov_Prod/SelfService#/search?searchText=${enc}`);
  }
  if (/virginia\s+beach,?\s*va/.test(j)) {
    urls.push(`https://energov.vbgov.com/EnerGov_Prod/SelfService#/search?searchText=${enc}`);
  }
  // Additional major jurisdictions
  if (/houston,?\s*tx/.test(j)) {
    urls.push(`https://ipermits.houstontx.gov/publicsearch/PermitSearch?SearchText=${enc}`);
  }
  if (/dallas,?\s*tx/.test(j)) {
    urls.push(`https://developdallas.dallascityhall.com/publicsearch/PermitSearch?SearchText=${enc}`);
  }
  if (/phoenix,?\s*az/.test(j)) {
    urls.push(`https://apps-secure.phoenix.gov/PDD/Search/Permits?address=${enc}`);
  }
  if (/san\s+diego,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/SANDIEGO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/denver,?\s*co/.test(j)) {
    urls.push(`https://aca-prod.accela.com/denver/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/atlanta,?\s*ga/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ATLANTA_GA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/portland,?\s*or/.test(j)) {
    urls.push(`https://www.portlandmaps.com/search/?query=${enc}`);
  }
  if (/minneapolis,?\s*mn/.test(j)) {
    urls.push(`https://aca-prod.accela.com/MINNEAPOLIS/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/nashville,?\s*tn|davidson\s+county,?\s*tn/.test(j)) {
    urls.push(`https://epermits.nashville.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/charlotte,?\s*nc|mecklenburg,?\s*nc/.test(j)) {
    urls.push(`https://aca-prod.accela.com/CLTNC/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/raleigh,?\s*nc/.test(j)) {
    urls.push(`https://aca-prod.accela.com/RALEIGH/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // Additional Maryland
  if (/montgomery(\s+county)?,?\s*md/.test(j)) {
    urls.push(`https://eservices.montgomerycountymd.gov/DPSPermitting/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/prince\s+george'?s?(\s+county)?,?\s*md/.test(j)) {
    urls.push(`https://aca-prod.accela.com/PGC/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/howard(\s+county)?,?\s*md/.test(j)) {
    urls.push(`https://aca-prod.accela.com/HOWARD/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/anne\s+arundel(\s+county)?,?\s*md/.test(j)) {
    urls.push(`https://aca-prod.accela.com/AACOUNTY/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // Additional CA
  if (/oakland,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/OAKLAND/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/san\s+jose,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/SANJOSECA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/sacramento,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/SACRAMENTO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/long\s+beach,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/LONGBEACH/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/anaheim,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ANAHEIM/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/riverside,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/RIVERSIDECA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/fresno,?\s*ca/.test(j)) {
    urls.push(`https://aca-prod.accela.com/FRESNO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // Additional TX
  if (/san\s+antonio,?\s*tx/.test(j)) {
    urls.push(`https://aca-prod.accela.com/SANANTONIO_TX/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/fort\s+worth,?\s*tx/.test(j)) {
    urls.push(`https://aca-prod.accela.com/FORTWORTH/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/el\s+paso,?\s*tx/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ELPASOTX/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/plano,?\s*tx/.test(j)) {
    urls.push(`https://aca-prod.accela.com/PLANO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/arlington,?\s*tx/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ARLINGTON_TX/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // FL
  if (/orlando,?\s*fl/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ORLANDO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/tampa,?\s*fl/.test(j)) {
    urls.push(`https://aca-prod.accela.com/TAMPA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/jacksonville,?\s*fl|duval\s+county,?\s*fl/.test(j)) {
    urls.push(`https://aca-prod.accela.com/JACKSONVILLE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/fort\s+lauderdale,?\s*fl/.test(j)) {
    urls.push(`https://aca-prod.accela.com/FTL/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/miami-?dade,?\s*fl/.test(j)) {
    urls.push(`https://www.miamidade.gov/Apps/RER/EPSPortal/Main/PermitSearch?address=${enc}`);
  }
  // WA/OR
  if (/tacoma,?\s*wa/.test(j)) {
    urls.push(`https://aca-prod.accela.com/TACOMA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/king\s+county,?\s*wa/.test(j)) {
    urls.push(`https://aca-prod.accela.com/KINGCO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/eugene,?\s*or/.test(j)) {
    urls.push(`https://aca-prod.accela.com/EUGENE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // NY/NJ/PA/CT
  if (/pittsburgh,?\s*pa/.test(j)) {
    urls.push(`https://aca-prod.accela.com/PITTSBURGHPA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/newark,?\s*nj/.test(j)) {
    urls.push(`https://aca-prod.accela.com/NEWARK/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/jersey\s+city,?\s*nj/.test(j)) {
    urls.push(`https://aca-prod.accela.com/JCNJ/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/hartford,?\s*ct/.test(j)) {
    urls.push(`https://aca-prod.accela.com/HARTFORD/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // Midwest
  if (/detroit,?\s*mi/.test(j)) {
    urls.push(`https://aca-prod.accela.com/DETROIT/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/columbus,?\s*oh/.test(j)) {
    urls.push(`https://aca-prod.accela.com/COLUMBUS/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/cleveland,?\s*oh/.test(j)) {
    urls.push(`https://aca-prod.accela.com/CLEVELAND/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/cincinnati,?\s*oh/.test(j)) {
    urls.push(`https://aca-prod.accela.com/CINCINNATI/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/indianapolis,?\s*in|marion\s+county,?\s*in/.test(j)) {
    urls.push(`https://permitsandcases.indy.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/milwaukee,?\s*wi/.test(j)) {
    urls.push(`https://aca-prod.accela.com/MILWAUKEE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/st\.?\s*louis,?\s*mo/.test(j)) {
    urls.push(`https://aca-prod.accela.com/STLOUISMO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/kansas\s+city,?\s*mo/.test(j)) {
    urls.push(`https://aca-prod.accela.com/KCMO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // Mountain
  if (/salt\s+lake\s+city,?\s*ut/.test(j)) {
    urls.push(`https://aca-prod.accela.com/SLC/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/albuquerque,?\s*nm/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ABQ/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/tucson,?\s*az/.test(j)) {
    urls.push(`https://aca-prod.accela.com/TUCSON/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/mesa,?\s*az/.test(j)) {
    urls.push(`https://aca-prod.accela.com/MESA/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/las\s+vegas,?\s*nv|clark\s+county,?\s*nv/.test(j)) {
    urls.push(`https://aca-prod.accela.com/CLARKCO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/reno,?\s*nv/.test(j)) {
    urls.push(`https://aca-prod.accela.com/RENO/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/boise,?\s*id/.test(j)) {
    urls.push(`https://aca-prod.accela.com/BOISE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // Southeast
  if (/durham,?\s*nc/.test(j)) {
    urls.push(`https://aca-prod.accela.com/DURHAM/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/charleston,?\s*sc/.test(j)) {
    urls.push(`https://aca-prod.accela.com/CHARLESTON/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/columbia,?\s*sc/.test(j)) {
    urls.push(`https://aca-prod.accela.com/COLUMBIASC/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/savannah,?\s*ga/.test(j)) {
    urls.push(`https://aca-prod.accela.com/SAVANNAH/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/birmingham,?\s*al/.test(j)) {
    urls.push(`https://aca-prod.accela.com/BIRMINGHAM/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/new\s+orleans,?\s*la/.test(j)) {
    urls.push(`https://onestopapp.nola.gov/Search.aspx?address=${enc}`);
  }
  if (/memphis,?\s*tn|shelby\s+county,?\s*tn/.test(j)) {
    urls.push(`https://aca-prod.accela.com/MEMPHIS/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/knoxville,?\s*tn/.test(j)) {
    urls.push(`https://aca-prod.accela.com/KNOXVILLE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/louisville,?\s*ky/.test(j)) {
    urls.push(`https://aca-prod.accela.com/LOUISVILLE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // Additional VA
  if (/henrico(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://energov.henrico.us/EnerGov_Prod/SelfService#/search?searchText=${enc}`);
  }
  if (/chesterfield(\s+county)?,?\s*va/.test(j)) {
    urls.push(`https://energov.chesterfield.gov/EnerGov_Prod/SelfService#/search?searchText=${enc}`);
  }
  // New England
  if (/providence,?\s*ri/.test(j)) {
    urls.push(`https://aca-prod.accela.com/PROVIDENCE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/portland,?\s*me/.test(j)) {
    urls.push(`https://aca-prod.accela.com/PORTLANDME/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/cambridge,?\s*ma/.test(j)) {
    urls.push(`https://aca-prod.accela.com/CAMBRIDGE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  // AK/HI
  if (/anchorage,?\s*ak/.test(j)) {
    urls.push(`https://aca-prod.accela.com/ANCHORAGE/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }
  if (/honolulu,?\s*hi/.test(j)) {
    urls.push(`https://aca-prod.accela.com/HONOLULU/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  }

  // Generic Accela guess for any jurisdiction not hardcoded above (~thousands of
  // agencies run on Accela Civic Platform at aca-prod.accela.com/<AGENCY>/). Uses
  // a slugified jurisdiction name so we always have at least one portal-side URL
  // to hand Firecrawl, instead of relying solely on web search.
  if (urls.length === 0) {
    const slug = jurisdiction
      .toLowerCase()
      .replace(/,.*$/, "")
      .replace(/\bcounty\b/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24);
    if (slug) {
      urls.push(`https://aca-prod.accela.com/${slug.toUpperCase()}/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
      // EnerGov (Tyler) is the other dominant civic platform
      urls.push(`https://energov.${slug}.gov/EnerGov_Prod/SelfService#/search?searchText=${enc}`);
    }
  }

  return urls;
}

// ------------------------------ Utility Coordination ------------------------------
// Every US state (+DC) has a one-call "811" center for underground utility locates.
// This is a state-anchored, always-safe starting point for water/gas/electric/telecom
// coordination on any project. Provider search links help identify actual service
// utilities for the address.
const ONE_CALL_811_BY_STATE: Record<string, { name: string; url: string; phone: string }> = {
  AL: { name: "Alabama 811", url: "https://www.al811.com/", phone: "811" },
  AK: { name: "Alaska Digline", url: "https://akonecall.com/", phone: "811" },
  AZ: { name: "Arizona 811", url: "https://arizona811.com/", phone: "811" },
  AR: { name: "Arkansas One Call", url: "https://arkonecall.com/", phone: "811" },
  CA: { name: "USA North 811 / DigAlert (S. CA)", url: "https://usanorth811.org/", phone: "811" },
  CO: { name: "Colorado 811", url: "https://colorado811.org/", phone: "811" },
  CT: { name: "Call Before You Dig CT", url: "https://www.cbyd.com/", phone: "811" },
  DE: { name: "Miss Utility of Delmarva", url: "https://www.missutility.net/delaware/", phone: "811" },
  DC: { name: "Miss Utility (DC/MD/VA)", url: "https://www.missutility.net/", phone: "811" },
  FL: { name: "Sunshine 811", url: "https://www.sunshine811.com/", phone: "811" },
  GA: { name: "Georgia 811", url: "https://www.georgia811.com/", phone: "811" },
  HI: { name: "Hawaii One Call", url: "https://www.hawaiionecall.com/", phone: "811" },
  ID: { name: "Digline Idaho", url: "https://digline.com/", phone: "811" },
  IL: { name: "JULIE Illinois", url: "https://illinois1call.com/", phone: "811" },
  IN: { name: "Indiana 811", url: "https://indiana811.org/", phone: "811" },
  IA: { name: "Iowa One Call", url: "https://www.iowaonecall.com/", phone: "811" },
  KS: { name: "Kansas One Call", url: "https://www.kansasonecall.com/", phone: "811" },
  KY: { name: "Kentucky 811", url: "https://kentucky811.org/", phone: "811" },
  LA: { name: "Louisiana 811", url: "https://www.louisiana811.com/", phone: "811" },
  ME: { name: "Dig Safe (New England)", url: "https://www.digsafe.com/", phone: "811" },
  MD: { name: "Miss Utility (DC/MD/VA)", url: "https://www.missutility.net/", phone: "811" },
  MA: { name: "Dig Safe (New England)", url: "https://www.digsafe.com/", phone: "811" },
  MI: { name: "MISS DIG 811", url: "https://www.missdig811.org/", phone: "811" },
  MN: { name: "Gopher State One Call", url: "https://www.gopherstateonecall.org/", phone: "811" },
  MS: { name: "Mississippi 811", url: "https://www.ms811.org/", phone: "811" },
  MO: { name: "Missouri 811", url: "https://mo1call.com/", phone: "811" },
  MT: { name: "Montana 811", url: "https://montana811.org/", phone: "811" },
  NE: { name: "Nebraska 811", url: "https://ne811.org/", phone: "811" },
  NV: { name: "USA North 811", url: "https://usanorth811.org/", phone: "811" },
  NH: { name: "Dig Safe (New England)", url: "https://www.digsafe.com/", phone: "811" },
  NJ: { name: "New Jersey One Call", url: "https://www.nj1-call.org/", phone: "811" },
  NM: { name: "New Mexico 811", url: "https://nm811.org/", phone: "811" },
  NY: { name: "Dig Safely New York / NYC 811", url: "https://www.digsafelynewyork.com/", phone: "811" },
  NC: { name: "NC 811", url: "https://www.nc811.org/", phone: "811" },
  ND: { name: "North Dakota One Call", url: "https://www.ndonecall.com/", phone: "811" },
  OH: { name: "Ohio 811 (OUPS)", url: "https://www.oups.org/", phone: "811" },
  OK: { name: "Oklahoma 811", url: "https://www.okie811.org/", phone: "811" },
  OR: { name: "Oregon Utility Notification Center", url: "https://digsafelyoregon.com/", phone: "811" },
  PA: { name: "PA One Call", url: "https://www.pa1call.org/", phone: "811" },
  RI: { name: "Dig Safe (New England)", url: "https://www.digsafe.com/", phone: "811" },
  SC: { name: "SC 811", url: "https://www.sc811.com/", phone: "811" },
  SD: { name: "South Dakota One Call", url: "https://www.sdonecall.com/", phone: "811" },
  TN: { name: "Tennessee 811", url: "https://tn811.com/", phone: "811" },
  TX: { name: "Texas 811", url: "https://www.texas811.org/", phone: "811" },
  UT: { name: "Blue Stakes of Utah", url: "https://bluestakes.org/", phone: "811" },
  VT: { name: "Dig Safe (New England)", url: "https://www.digsafe.com/", phone: "811" },
  VA: { name: "Miss Utility of Virginia", url: "https://www.missutilityofvirginia.com/", phone: "811" },
  WA: { name: "Washington 811", url: "https://www.washington811.com/", phone: "811" },
  WV: { name: "Miss Utility of West Virginia", url: "https://www.wv811.com/", phone: "811" },
  WI: { name: "Diggers Hotline", url: "https://www.diggershotline.com/", phone: "811" },
  WY: { name: "Wyoming 811", url: "https://www.onecallofwyoming.com/", phone: "811" },
};

function extractStateCode(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{2})\b(?:\s*\d{5})?$/);
  if (m && ONE_CALL_811_BY_STATE[m[1]]) return m[1];
  const any = text.toUpperCase().match(/\b(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/);
  return any && ONE_CALL_811_BY_STATE[any[1]] ? any[1] : null;
}

export type UtilityContact = {
  category: "water_sewer" | "gas" | "electric" | "telecom" | "stormwater" | "one_call";
  name: string;
  url: string;
  phone?: string;
  notes?: string;
};

function buildUtilityCoordinationContacts(jurisdiction: string, address: string): UtilityContact[] {
  const j = jurisdiction.toLowerCase();
  const state = extractStateCode(`${address} ${jurisdiction}`);
  const contacts: UtilityContact[] = [];

  // 811 one-call (state)
  if (state && ONE_CALL_811_BY_STATE[state]) {
    const oc = ONE_CALL_811_BY_STATE[state];
    contacts.push({
      category: "one_call",
      name: oc.name,
      url: oc.url,
      phone: oc.phone,
      notes: "Call 811 or file a locate ticket at least 2–3 business days before any excavation. Required by law in every US state.",
    });
  }

  // Jurisdiction water/sewer authorities (major cities/counties)
  if (/baltimore(\s+city)?,\s*md/.test(j)) contacts.push({ category: "water_sewer", name: "Baltimore DPW – Water & Wastewater", url: "https://publicworks.baltimorecity.gov/", phone: "311", notes: "Water taps, sewer connections, and stormwater in Baltimore City." });
  if (/washington,?\s*dc/.test(j)) contacts.push({ category: "water_sewer", name: "DC Water", url: "https://www.dcwater.com/", phone: "202-354-3600" });
  if (/arlington(\s+county)?,?\s*va/.test(j)) contacts.push({ category: "water_sewer", name: "Arlington County Water/Sewer", url: "https://www.arlingtonva.us/Government/Programs/Water-Sewer", phone: "703-228-6555" });
  if (/fairfax(\s+county)?,?\s*va/.test(j)) contacts.push({ category: "water_sewer", name: "Fairfax Water", url: "https://www.fairfaxwater.org/", phone: "703-698-5800" });
  if (/new york,?\s*ny|nyc/.test(j)) contacts.push({ category: "water_sewer", name: "NYC DEP – Water & Sewer", url: "https://www.nyc.gov/site/dep/", phone: "718-595-7000" });
  if (/los angeles,?\s*ca/.test(j)) contacts.push({ category: "water_sewer", name: "LADWP (Water)", url: "https://www.ladwp.com/", phone: "1-800-342-5397" });
  if (/chicago,?\s*il/.test(j)) contacts.push({ category: "water_sewer", name: "Chicago Dept of Water Management", url: "https://www.chicago.gov/city/en/depts/water.html", phone: "311" });
  if (/san francisco,?\s*ca/.test(j)) contacts.push({ category: "water_sewer", name: "SFPUC – Water & Sewer", url: "https://sfpuc.org/", phone: "415-551-3000" });
  if (/seattle,?\s*wa/.test(j)) contacts.push({ category: "water_sewer", name: "Seattle Public Utilities", url: "https://www.seattle.gov/utilities", phone: "206-684-3000" });
  if (/boston,?\s*ma/.test(j)) contacts.push({ category: "water_sewer", name: "Boston Water & Sewer Commission", url: "https://www.bwsc.org/", phone: "617-989-7000" });
  if (/austin,?\s*tx/.test(j)) contacts.push({ category: "water_sewer", name: "Austin Water", url: "https://www.austintexas.gov/department/austin-water", phone: "512-972-0101" });
  if (/miami,?\s*fl|miami-?dade/.test(j)) contacts.push({ category: "water_sewer", name: "Miami-Dade Water & Sewer Dept", url: "https://www.miamidade.gov/global/water/home.page", phone: "305-665-7477" });
  if (/philadelphia,?\s*pa/.test(j)) contacts.push({ category: "water_sewer", name: "Philadelphia Water Dept", url: "https://water.phila.gov/", phone: "215-685-6300" });
  if (/houston,?\s*tx/.test(j)) contacts.push({ category: "water_sewer", name: "Houston Public Works – Water", url: "https://www.houstonpublicworks.org/houston-water", phone: "311" });
  if (/dallas,?\s*tx/.test(j)) contacts.push({ category: "water_sewer", name: "Dallas Water Utilities", url: "https://dallascityhall.com/departments/waterutilities/", phone: "214-651-1441" });
  if (/atlanta,?\s*ga/.test(j)) contacts.push({ category: "water_sewer", name: "Atlanta Dept of Watershed Management", url: "https://www.atlantawatershed.org/", phone: "404-546-0311" });

  // AI/web-search fallback: generic search links so the AI + user can drill in
  const enc = encodeURIComponent(`${jurisdiction} water sewer utility connection new service`);
  contacts.push({
    category: "water_sewer",
    name: `Search: water/sewer authority for ${jurisdiction}`,
    url: `https://www.google.com/search?q=${enc}`,
    notes: "Use if the local water/sewer provider isn't listed above.",
  });

  const gasQ = encodeURIComponent(`${jurisdiction} natural gas service provider new connection ${address}`);
  contacts.push({
    category: "gas",
    name: `Search: gas provider for this address`,
    url: `https://www.google.com/search?q=${gasQ}`,
    notes: "US gas is provider-specific (e.g. BGE, Washington Gas, PG&E, ConEd, Southern Company). Confirm the serving utility by address.",
  });

  const elecQ = encodeURIComponent(`${jurisdiction} electric utility service provider new connection ${address}`);
  contacts.push({
    category: "electric",
    name: `Search: electric utility for this address`,
    url: `https://www.google.com/search?q=${elecQ}`,
    notes: "Coordinate temporary power, meter set, and permanent service release with the serving electric utility.",
  });

  const telQ = encodeURIComponent(`${jurisdiction} telecom fiber cable service ${address}`);
  contacts.push({
    category: "telecom",
    name: `Search: telecom / fiber providers`,
    url: `https://www.google.com/search?q=${telQ}`,
    notes: "Verizon, AT&T, Comcast, Lumen, Crown Castle and local fiber ISPs may all need coordination for tenant fit-outs.",
  });

  return contacts;
}

const UtilityLookupInput = z.object({
  address: z.string().min(3).max(300),
  jurisdiction: z.string().max(200).optional().default(""),
});

export const lookupUtilityCoordination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UtilityLookupInput.parse(input))
  .handler(async ({ data }) => {
    const aiKey = process.env.LOVABLE_API_KEY;
    const addr = data.address;
    let juris = data.jurisdiction?.trim() || "";
    if (!juris && aiKey) {
      const inferred = await callLovableAI(aiKey, [
        { role: "system", content: "You extract US permit jurisdictions from addresses. Reply with ONLY the jurisdiction in the form 'City, ST' or 'County, ST'. No prose." },
        { role: "user", content: `Address: ${addr}\nJurisdiction:` },
      ]);
      juris = inferred.trim().split("\n")[0].slice(0, 120);
    }
    const contacts = buildUtilityCoordinationContacts(juris, addr);

    // Ask AI to sequence utility coordination steps for this jurisdiction.
    let steps: Array<{ step: string; owner: string; timing: string; notes?: string }> = [];
    if (aiKey) {
      try {
        const raw = await callLovableAI(aiKey, [
          { role: "system", content: "You are a US construction utility-coordination expert. Return STRICT JSON only: {\"steps\":[{\"step\":\"\",\"owner\":\"\",\"timing\":\"\",\"notes\":\"\"}]}. 5-9 steps covering: 811 locates, water/sewer tap application + fees, gas service application + meter set, electric service application (temp + permanent), telecom/fiber, stormwater, ROW/encroachment. Sequence realistically for this jurisdiction." },
          { role: "user", content: `Address: ${addr}\nJurisdiction: ${juris}\nReturn JSON.` },
        ]);
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]) as { steps?: typeof steps };
          if (Array.isArray(parsed.steps)) steps = parsed.steps.slice(0, 12);
        }
      } catch {
        // non-fatal
      }
    }

    return {
      jurisdiction: juris || "Unknown",
      address: addr,
      contacts,
      steps,
    };
  });




export const lookupPermitsByAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddressLookupInput.parse(input))
  .handler(async ({ data }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const addr = data.address;
    const juris = data.jurisdiction;

    // 1. If no jurisdiction, ask AI to infer city/county/state from the address.
    let jurisdictionGuess = juris;
    if (!jurisdictionGuess) {
      const inferred = await callLovableAI(aiKey, [
        { role: "system", content: "You extract US permit jurisdictions from addresses. Reply with ONLY the jurisdiction in the form 'City, ST' or 'County, ST'. No prose." },
        { role: "user", content: `Address: ${addr}\nJurisdiction:` },
      ]);
      jurisdictionGuess = inferred.trim().split("\n")[0].slice(0, 120);
    }

    // 2b. Known-jurisdiction direct search URLs. Many municipal portals (Accela,
    // EnerGov, etc.) do not expose individual permit records to Google, so
    // address-only web search misses active applications. For jurisdictions we
    // know, hit the portal's own search endpoint directly.
    const directSearchUrls = buildDirectPortalSearchUrls(jurisdictionGuess, addr);

    // 2. Find the official permit portal for this jurisdiction (best-effort).
    const portalQuery = `${jurisdictionGuess} building permit search portal site:.gov OR Accela OR energov OR opengov OR citizenserve`;
    const portalHits = await firecrawlSearch(fcKey, portalQuery, 5).catch(() => []);
    const portal = portalHits.length
      ? (portalHits.find((h) => /(\.gov|accela|energov|opengov|citizenserve|permitium|mygovernmentonline|viewpointcloud)/i.test(h.url)) ?? portalHits[0])
      : { url: directSearchUrls[0] || "", title: jurisdictionGuess, description: "" };
    if (!portal.url && directSearchUrls.length === 0) {
      throw new Error(`No official permit portal found for "${jurisdictionGuess}". Try entering the jurisdiction manually.`);
    }

    // 3. Search the web for permit records at this specific address.
    // Try multiple address variants to catch differing portal formats.
    const streetOnly = addr.replace(/,.*$/, "").trim(); // "1603 Whetstone Way"
    const cityState = jurisdictionGuess;
    const addressQueries = [
      `"${addr}" permit ${cityState}`,
      `"${streetOnly}" permit ${cityState} site:.gov`,
      `"${streetOnly}" ${cityState} accela OR energov OR opengov OR citizenserve OR permits`,
    ];
    const addressHitsNested = await Promise.all(
      addressQueries.map((q) => firecrawlSearch(fcKey, q, 5).catch(() => [])),
    );
    const seenUrls = new Set<string>();
    const addressHits = addressHitsNested.flat().filter((h) => {
      if (seenUrls.has(h.url)) return false;
      seenUrls.add(h.url);
      return true;
    });

    // 4. Scrape portal landing + direct portal search URLs + top address hits.
    const portalScrape = portal.url ? await firecrawlScrape(fcKey, portal.url).catch(() => ({ markdown: "", title: "" })) : { markdown: "", title: "" };
    const directScrapes = (
      await Promise.all(
        directSearchUrls.slice(0, 4).map(async (u: string) => {
          try {
            const s = await firecrawlScrape(fcKey, u);
            return `DIRECT PORTAL SEARCH: ${u}\n${s.markdown.slice(0, 4000)}`;
          } catch {
            return "";
          }
        }),
      )
    ).filter(Boolean).join("\n\n---\n\n");
    const addressScrapes = (
      await Promise.all(
        addressHits.slice(0, 3).map(async (h) => {
          try {
            const s = await firecrawlScrape(fcKey, h.url);
            return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 2500)}`;
          } catch {
            return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
          }
        }),
      )
    ).join("\n\n---\n\n");



    // 5. Ask AI to extract structured permit records for this address.
    const extractionPrompt = `You are Permivio's live permit lookup. Extract permit records tied to the address below from the real source text provided. Never invent data.

ADDRESS: ${addr}
JURISDICTION (inferred): ${jurisdictionGuess}

OFFICIAL PORTAL CANDIDATE (${portal.url})
${portalScrape.markdown.slice(0, 3500)}

DIRECT PORTAL SEARCH RESULTS (authoritative — prefer these over web search when present)
${directScrapes || "(none)"}

ADDRESS SEARCH RESULTS (web)
${addressScrapes || "(none)"}

Return ONLY valid JSON in this shape:
{
  "jurisdiction": "City, ST (or County, ST)",
  "portal_name": "official department / portal name",
  "portal_url": "canonical portal URL",
  "search_url": "direct URL to search permits by address on this portal, if present in the sources; else empty",
  "findings": [
    {
      "permit_number": "record #",
      "permit_type": "e.g. Building, Electrical, MEP, Certificate of Occupancy",
      "status": "Issued | Under Review | Submitted | Approved | Finaled | Expired | Withdrawn | Unknown",
      "address": "as listed",
      "applicant": "if listed",
      "filed_date": "YYYY-MM-DD or as listed",
      "updated_date": "YYYY-MM-DD or as listed",
      "description": "1 short clause",
      "source_url": "URL from the sources above",
      "match_confidence": "high | medium | low",
      "match_score": 0-100,
      "match_reason": "1 sentence: exactly why this record matches (or partially matches) the queried address. Cite the field that matched: full street number + name, street only, block range, parcel/APN, unit, etc."
    }
  ],
  "summary": "2-4 sentence plain-English summary explaining what was found and how well it matches.",
  "overall_confidence": "high | medium | low | none",
  "no_match_reason": "If findings is empty OR overall_confidence is low/none, explain in 1-2 sentences WHY (e.g. 'Portal returned zero rows for this street number', 'Only nearby addresses on the same block appeared', 'Portal requires interactive session Firecrawl cannot render'). Empty string if high/medium confidence.",
  "sources_scanned": {
    "official_portal": ${portalScrape.markdown ? "true" : "false"},
    "direct_portal_search": ${directScrapes ? "true" : "false"},
    "web_search": ${addressScrapes ? "true" : "false"}
  }
}

MATCH SCORING RULES
- high (85-100): permit's address string contains the exact street number AND street name from the query.
- medium (55-84): street name matches and street number is within the same block range (e.g. 1601-1699), OR parcel/APN matches, OR record explicitly names the property.
- low (1-54): only the street name matches (different number), or the source is a summary/news article referencing the address without a portal record.
- Never include a finding with match_score < 25. Drop it and mention in no_match_reason instead.

RULES
- Only include a finding if the source text clearly shows a permit tied to this address (or a very close match). Otherwise return findings: [].
- Never fabricate a permit number, status, or date.
- portal_url and any source_url must be real URLs from the source text above.
- Always populate match_reason with a specific, verifiable justification — never generic ("looks similar").`;

    const raw = await callLovableAI(aiKey, [
      { role: "system", content: "You extract structured permit records from live portal text. Output valid JSON only, no prose, no fences." },
      { role: "user", content: extractionPrompt },
    ], "google/gemini-2.5-flash");

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    let parsed: z.infer<typeof AddressLookupSchema>;
    try {
      if (start < 0 || end < 0) throw new Error("No JSON in AI response");
      parsed = AddressLookupSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
    } catch (err) {
      parsed = AddressLookupSchema.parse({
        jurisdiction: jurisdictionGuess,
        portal_name: portal.title || portal.url || jurisdictionGuess,
        portal_url: portal.url || directSearchUrls[0] || "",
        search_url: directSearchUrls[0] || "",
        findings: [],
        summary: "Live extraction did not return a parseable result. Use the direct portal link below to search this address.",
        overall_confidence: "none" as const,
        no_match_reason: `AI response could not be parsed (${err instanceof Error ? err.message : "unknown"}). The portal may require an interactive session.`,
      });
    }

    return {
      address: addr,
      jurisdiction: parsed.jurisdiction || jurisdictionGuess,
      portal_name: parsed.portal_name || portal.title || portal.url,
      portal_url: parsed.portal_url || portal.url,
      search_url: parsed.search_url || directSearchUrls[0] || "",
      findings: parsed.findings,
      summary: parsed.summary,
      overall_confidence: parsed.overall_confidence,
      no_match_reason: parsed.no_match_reason,
      sources_scanned: {
        official_portal: Boolean(portalScrape.markdown),
        direct_portal_search: Boolean(directScrapes),
        web_search: Boolean(addressScrapes),
      },
      searched_at: new Date().toISOString(),
    };
  });

// ---- Permit-number lookup + live tracking ----

// Build direct portal URLs for searching by permit / record number.
// Most Accela agencies accept the record # in QueryText; EnerGov uses searchText.
function buildDirectPortalUrlsForPermitNumber(jurisdiction: string, permitNumber: string): string[] {
  const j = jurisdiction.toLowerCase();
  const enc = encodeURIComponent(permitNumber.trim());
  const urls: string[] = [];

  const accela = (agency: string) =>
    `https://aca-prod.accela.com/${agency}/Cap/GlobalSearchResults.aspx?QueryText=${enc}`;
  const energov = (host: string) =>
    `https://${host}/EnerGov_Prod/SelfService#/search?searchText=${enc}`;

  if (/baltimore(\s+city)?,\s*md/.test(j)) urls.push(`https://cels.baltimorehousing.org/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/baltimore\s+county,\s*md/.test(j)) urls.push(`https://permits.baltimorecountymd.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/washington,?\s*dc|district of columbia/.test(j)) urls.push(`https://eservices.dcra.dc.gov/DCRAPermitApplicationSearch/Search/Permit?permitNumber=${enc}`);
  if (/new york,?\s*ny|nyc/.test(j)) urls.push(`https://a810-bisweb.nyc.gov/bisweb/JobsQueryByNumberServlet?passjobnumber=${enc}`);
  if (/los angeles,?\s*ca/.test(j)) urls.push(`https://www.ladbsservices2.lacity.org/OnlineServices/PermitReport/PermitReportPermitNumber?permitnumber=${enc}`);
  if (/chicago,?\s*il/.test(j)) urls.push(`https://webapps1.chicago.gov/buildingrecords/?pmt=${enc}`);
  if (/san francisco,?\s*ca/.test(j)) urls.push(`https://dbiweb02.sfgov.org/dbipts/default.aspx?page=PermitDetails&PermitNumber=${enc}`);
  if (/seattle,?\s*wa/.test(j)) urls.push(`https://cosaccela.seattle.gov/portal/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/boston,?\s*ma/.test(j)) urls.push(`https://www.boston.gov/permits?search=${enc}`);
  if (/austin,?\s*tx/.test(j)) urls.push(`https://abc.austintexas.gov/web/permit/public-search-other?reset=true&t_selected_search=CAP&t_CAP_NUMBER=${enc}`);
  if (/miami,?\s*fl/.test(j)) urls.push(`https://apps.miamigov.com/eBuilding/PermitSearch.aspx?permit=${enc}`);
  if (/philadelphia,?\s*pa/.test(j)) urls.push(`https://eclipse.phila.gov/phillylmsprod/int/lms/Login.aspx#permit=${enc}`);
  if (/arlington(\s+county)?,?\s*va/.test(j)) { urls.push(accela("ARLINGTONCO")); urls.push(`https://permits.arlingtonva.us/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`); }
  if (/fairfax(\s+county)?,?\s*va/.test(j)) urls.push(accela("FFXC"));
  if (/loudoun(\s+county)?,?\s*va/.test(j)) urls.push(accela("LOUDOUN"));
  if (/prince\s+william(\s+county)?,?\s*va/.test(j)) urls.push(`https://eservices.pwcgov.org/BuildingDevelopment/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/alexandria,?\s*va/.test(j)) urls.push(accela("ALEXANDRIA"));
  if (/richmond,?\s*va/.test(j)) urls.push(energov("energov.richmondgov.com"));
  if (/virginia\s+beach,?\s*va/.test(j)) urls.push(energov("energov.vbgov.com"));
  if (/houston,?\s*tx/.test(j)) urls.push(`https://ipermits.houstontx.gov/publicsearch/PermitSearch?SearchText=${enc}`);
  if (/dallas,?\s*tx/.test(j)) urls.push(`https://developdallas.dallascityhall.com/publicsearch/PermitSearch?SearchText=${enc}`);
  if (/phoenix,?\s*az/.test(j)) urls.push(`https://apps-secure.phoenix.gov/PDD/Search/Permits?permit=${enc}`);
  if (/san\s+diego,?\s*ca/.test(j)) urls.push(accela("SANDIEGO"));
  if (/denver,?\s*co/.test(j)) urls.push(accela("denver"));
  if (/atlanta,?\s*ga/.test(j)) urls.push(accela("ATLANTA_GA"));
  if (/minneapolis,?\s*mn/.test(j)) urls.push(accela("MINNEAPOLIS"));
  if (/nashville,?\s*tn|davidson\s+county,?\s*tn/.test(j)) urls.push(`https://epermits.nashville.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc}`);
  if (/charlotte,?\s*nc|mecklenburg,?\s*nc/.test(j)) urls.push(accela("CLTNC"));
  if (/raleigh,?\s*nc/.test(j)) urls.push(accela("RALEIGH"));

  // Generic Accela fallback for any jurisdiction not hardcoded.
  if (urls.length === 0) {
    const slug = jurisdiction.toLowerCase().replace(/,.*$/, "").replace(/\bcounty\b/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 24);
    if (slug) urls.push(accela(slug.toUpperCase()));
  }
  return urls;
}

const PermitNumberLookupInput = z.object({
  jurisdiction: z.string().trim().min(2).max(200),
  permit_number: z.string().trim().min(2).max(80),
});

const PermitNumberSchema = z.object({
  permit_number: z.string().default(""),
  permit_type: z.string().default(""),
  status: z.string().default("Unknown"),
  address: z.string().default(""),
  applicant: z.string().default(""),
  filed_date: z.string().default(""),
  updated_date: z.string().default(""),
  issued_date: z.string().default(""),
  expiration_date: z.string().default(""),
  next_inspection: z.string().default(""),
  description: z.string().default(""),
  fees_due: z.string().default(""),
  reviewers: z.array(z.object({ discipline: z.string(), status: z.string(), name: z.string().default("") })).max(20).default([]),
  timeline: z.array(z.object({ date: z.string(), event: z.string() })).max(30).default([]),
  source_url: z.string().default(""),
  portal_name: z.string().default(""),
  jurisdiction: z.string().default(""),
  found: z.boolean().default(false),
  no_match_reason: z.string().default(""),
});

async function scrapePermitByNumber(fcKey: string, aiKey: string, jurisdiction: string, permitNumber: string) {
  const urls = buildDirectPortalUrlsForPermitNumber(jurisdiction, permitNumber);
  const scrapes = (await Promise.all(
    urls.map(async (u) => {
      try {
        const s = await firecrawlScrape(fcKey, u);
        return `PORTAL URL: ${u}\n${(s.markdown || "").slice(0, 5000)}`;
      } catch { return ""; }
    })
  )).filter(Boolean).join("\n\n---\n\n");

  // Also do a targeted web search in case the direct URLs miss.
  const webHits = await firecrawlSearch(fcKey, `"${permitNumber}" ${jurisdiction} permit site:.gov OR accela OR energov`, 5).catch(() => []);
  const webScrapes = (await Promise.all(
    webHits.slice(0, 3).map(async (h) => {
      try {
        const s = await firecrawlScrape(fcKey, h.url);
        return `WEB: ${h.url}\n${(s.markdown || "").slice(0, 2500)}`;
      } catch { return `WEB: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`; }
    })
  )).join("\n\n---\n\n");

  const prompt = `Extract the live status of a specific permit from the source text. Never invent data.

JURISDICTION: ${jurisdiction}
PERMIT NUMBER: ${permitNumber}

DIRECT PORTAL SOURCES (authoritative):
${scrapes || "(none)"}

WEB SOURCES:
${webScrapes || "(none)"}

Return ONLY JSON:
{
  "permit_number": "as listed (should match query)",
  "permit_type": "e.g. Building, Electrical, MEP, Grading, CofO",
  "status": "Issued | Under Review | Submitted | Approved | Finaled | Expired | Withdrawn | Plan Review | Ready to Issue | Unknown",
  "address": "as listed",
  "applicant": "if listed",
  "filed_date": "YYYY-MM-DD or as listed",
  "updated_date": "YYYY-MM-DD or as listed",
  "issued_date": "YYYY-MM-DD or empty",
  "expiration_date": "YYYY-MM-DD or empty",
  "next_inspection": "if listed, else empty",
  "description": "1 short clause",
  "fees_due": "if listed, else empty",
  "reviewers": [{"discipline": "Fire / Zoning / Structural", "status": "Approved | Pending | Rejected", "name": ""}],
  "timeline": [{"date": "YYYY-MM-DD", "event": "what happened"}],
  "source_url": "canonical URL from sources above",
  "portal_name": "portal or department name",
  "jurisdiction": "${jurisdiction}",
  "found": true or false,
  "no_match_reason": "1 sentence if not found; empty otherwise"
}`;

  let parsed: z.infer<typeof PermitNumberSchema>;
  try {
    const raw = await callLovableAI(aiKey, [
      { role: "system", content: "You extract structured live permit status from real portal text. Output valid JSON only, no prose, no fences." },
      { role: "user", content: prompt },
    ], "google/gemini-2.5-flash");

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("No JSON in AI response");
    parsed = PermitNumberSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
  } catch (err) {
    // Never hard-fail the lookup — return a structured "not found" record so the UI can show the tried URLs.
    parsed = PermitNumberSchema.parse({
      permit_number: permitNumber,
      jurisdiction,
      found: false,
      status: "Unknown",
      no_match_reason: scrapes || webScrapes
        ? `Could not parse portal response: ${err instanceof Error ? err.message : String(err)}`
        : "No accessible portal returned data for this permit. Try the direct portal link below.",
      source_url: urls[0] || "",
    });
  }
  return { parsed, sourceUrls: urls };
}

export const lookupPermitByNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PermitNumberLookupInput.parse(input))
  .handler(async ({ data }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");
    const { parsed, sourceUrls } = await scrapePermitByNumber(fcKey, aiKey, data.jurisdiction, data.permit_number);
    return { ...parsed, tried_urls: sourceUrls, searched_at: new Date().toISOString() };
  });

export const linkPermitToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      permit_number: z.string().trim().min(2).max(80),
      jurisdiction: z.string().trim().min(2).max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const { data: proj, error: pErr } = await context.supabase
      .from("projects").select("id, jurisdiction, name").eq("id", data.project_id).maybeSingle();
    if (pErr || !proj) throw new Error("Project not found");
    const juris = (data.jurisdiction || proj.jurisdiction || "").trim();
    if (!juris) throw new Error("Project has no jurisdiction. Set one first.");

    const { parsed } = await scrapePermitByNumber(fcKey, aiKey, juris, data.permit_number);

    const { error: uErr } = await context.supabase
      .from("projects")
      .update({
        linked_permit_number: data.permit_number,
        linked_permit_url: parsed.source_url || null,
        linked_permit_data: parsed,
        linked_permit_synced_at: new Date().toISOString(),
      })
      .eq("id", data.project_id);
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("permit_sync_history").insert({
      user_id: context.userId,
      project_id: data.project_id,
      permit_number: data.permit_number,
      jurisdiction: juris,
      status: parsed.status || "",
      found: !!parsed.found,
      source_url: parsed.source_url || null,
      portal_name: parsed.portal_name || null,
      snapshot: parsed,
      trigger: "link",
    });

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: parsed.found
        ? `Linked live permit ${data.permit_number} (${parsed.status}) from ${parsed.portal_name || juris}.`
        : `Linked permit ${data.permit_number} but no live record found yet.`,
    });

    return { linked: parsed };
  });

export const refreshLinkedPermit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const { data: proj, error: pErr } = await context.supabase
      .from("projects").select("id, jurisdiction, linked_permit_number").eq("id", data.project_id).maybeSingle();
    if (pErr || !proj) throw new Error("Project not found");
    if (!proj.linked_permit_number) throw new Error("No permit is linked to this project.");
    const juris = proj.jurisdiction || "";
    if (!juris) throw new Error("Project has no jurisdiction.");

    const { parsed } = await scrapePermitByNumber(fcKey, aiKey, juris, proj.linked_permit_number);
    const { error: uErr } = await context.supabase
      .from("projects")
      .update({
        linked_permit_url: parsed.source_url || null,
        linked_permit_data: parsed,
        linked_permit_synced_at: new Date().toISOString(),
      })
      .eq("id", data.project_id);
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("permit_sync_history").insert({
      user_id: context.userId,
      project_id: data.project_id,
      permit_number: proj.linked_permit_number,
      jurisdiction: juris,
      status: parsed.status || "",
      found: !!parsed.found,
      source_url: parsed.source_url || null,
      portal_name: parsed.portal_name || null,
      snapshot: parsed,
      trigger: "refresh",
    });

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Refreshed live permit ${proj.linked_permit_number} — status ${parsed.status}.`,
    });
    return { linked: parsed };
  });

export const listPermitSyncHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ project_id: z.string().uuid(), limit: z.number().int().min(1).max(100).default(25) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("permit_sync_history")
      .select("id, permit_number, jurisdiction, status, found, source_url, portal_name, snapshot, trigger, created_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { history: rows ?? [] };
  });

export const unlinkPermit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({
        linked_permit_number: null,
        linked_permit_url: null,
        linked_permit_data: null,
        linked_permit_synced_at: null,
      })
      .eq("id", data.project_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
