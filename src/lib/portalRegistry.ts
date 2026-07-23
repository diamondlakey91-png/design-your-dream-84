// Nationwide direct-link permit portal registry.
// Curated jurisdictions across all major permitting platforms. Each entry
// exposes the public "search / status" landing URL and, when possible, an
// address-query builder that pre-fills the portal's search form so the user
// lands on results, not a blank page.
//
// Platforms covered:
//  - Accela Civic Platform (Citizen Access) — the largest US footprint
//  - Tyler EnerGov SelfService
//  - Avolve ProjectDox (electronic plan review)
//  - CentralSquare Community Development (Momentum)
//  - OpenGov Permitting & Licensing (formerly ViewPoint Cloud)
//  - CitizenServe
//  - MyGovernmentOnline
//  - Cityworks / PLL
//  - Custom / in-house municipal portals

export type PortalPlatform =
  | "Accela"
  | "EnerGov"
  | "ProjectDox"
  | "Momentum"
  | "OpenGov"
  | "CitizenServe"
  | "MyGovernmentOnline"
  | "Cityworks"
  | "Custom";

export type PortalEntry = {
  jurisdiction: string;
  state: string;
  platform: PortalPlatform;
  /** Landing URL for permit search / status. */
  url: string;
  /** Optional builder: given an address, return a URL that pre-fills the search. */
  addressSearch?: (address: string) => string;
  /** Optional builder: given a permit number, return a URL that pre-fills the search. */
  permitSearch?: (permitNumber: string) => string;
  /** Optional ProjectDox / plan-review companion URL. */
  planReviewUrl?: string;
  notes?: string;
};

const enc = (s: string) => encodeURIComponent(s.replace(/,.*$/, "").trim());

// Accela ACA slug helper — same pattern every agency uses.
const acaSearch = (slug: string) => (addr: string) =>
  `https://aca-prod.accela.com/${slug}/Cap/GlobalSearchResults.aspx?QueryText=${enc(addr)}`;
const acaHome = (slug: string) => `https://aca-prod.accela.com/${slug}/Default.aspx`;
const acaPermit = (slug: string) => (num: string) =>
  `https://aca-prod.accela.com/${slug}/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(num.trim())}`;

// EnerGov SelfService (Tyler) helper.
const energovSearch = (host: string) => (addr: string) =>
  `https://${host}/EnerGov_Prod/SelfService#/search?searchText=${enc(addr)}`;
const energovHome = (host: string) => `https://${host}/EnerGov_Prod/SelfService#/home`;

// Google search fallback — scoped to .gov sites so the top result is the
// jurisdiction's actual portal. Guarantees the link always resolves to a
// live page even for jurisdictions without a stable ACA/ePortal deep link.
export const govSearchUrl = (jurisdiction: string, state: string, extra = "building permits online portal") =>
  `https://www.google.com/search?q=${encodeURIComponent(`${jurisdiction} ${state} ${extra} site:.gov`)}`;

function A(
  jurisdiction: string,
  state: string,
  slug: string,
  extra: Partial<PortalEntry> = {},
): PortalEntry {
  return {
    jurisdiction,
    state,
    platform: "Accela",
    url: acaHome(slug),
    addressSearch: acaSearch(slug),
    permitSearch: acaPermit(slug),
    ...extra,
  };
}
function E(
  jurisdiction: string,
  state: string,
  host: string,
  extra: Partial<PortalEntry> = {},
): PortalEntry {
  return {
    jurisdiction,
    state,
    platform: "EnerGov",
    url: energovHome(host),
    addressSearch: energovSearch(host),
    ...extra,
  };
}
/** Search-fallback entry for jurisdictions without a stable direct portal URL.
 *  Uses a `site:.gov` Google search so users still land on the right portal. */
function S(
  jurisdiction: string,
  state: string,
  platform: PortalPlatform = "Custom",
  extra: Partial<PortalEntry> = {},
): PortalEntry {
  return {
    jurisdiction,
    state,
    platform,
    url: extra.url ?? govSearchUrl(jurisdiction, state),
    addressSearch: (a: string) => govSearchUrl(jurisdiction, state, `${a} permit`),
    permitSearch: (n: string) => govSearchUrl(jurisdiction, state, `permit ${n}`),
    notes:
      extra.notes ??
      "No stable public portal deep link — opens a scoped .gov search that surfaces the jurisdiction's live permit portal.",
    ...extra,
  };
}

export const PORTAL_REGISTRY: PortalEntry[] = [
  // ================= Accela (largest footprint) =================
  A("Arlington County", "VA", "ARLINGTONCO", { planReviewUrl: "https://permitva.arlingtonva.us/ProjectDox/index.aspx" }),
  A("Fairfax County", "VA", "fairfax", { planReviewUrl: "https://fidoprod.fairfaxcounty.gov/ProjectDox/" }),
  S("Loudoun County", "VA", "Accela", { url: "https://loudounpdx.loudoun.gov/", planReviewUrl: "https://loudounpdx.loudoun.gov/ProjectDox/" }),
  S("Alexandria", "VA", "Custom", { url: "https://www.alexandriava.gov/Permits" }),
  A("San Diego", "CA", "SANDIEGO", { planReviewUrl: "https://plans.sandiego.gov/ProjectDox/" }),
  A("Oakland", "CA", "OAKLAND"),
  S("San Jose", "CA", "Accela", { url: "https://buildingpermits.sanjoseca.gov/CitizenAccess/" }),
  A("Sacramento", "CA", "SACRAMENTO"),
  S("Long Beach", "CA", "Accela", { url: "https://lbpermits.longbeach.gov/CitizenAccess/" }),
  A("Anaheim", "CA", "ANAHEIM"),
  S("Riverside", "CA"),
  A("Fresno", "CA", "FRESNO"),
  S("Bakersfield", "CA"),
  A("Denver", "CO", "denver"),
  S("Colorado Springs", "CO", "Custom", { url: "https://coloradosprings.gov/permits" }),
  S("Aurora", "CO", "Custom", { url: "https://www.auroragov.org/business/permits", planReviewUrl: "https://eplan.auroragov.org/ProjectDox/" }),
  A("Atlanta", "GA", "ATLANTA_GA"),
  S("Savannah", "GA"),
  S("Minneapolis", "MN", "Custom", { url: "https://www2.minneapolismn.gov/business-services/permits-licenses/" }),
  S("Charlotte / Mecklenburg", "NC", "Custom", { url: "https://www.mecklenburgcountync.gov/departments/code-enforcement" }),
  S("Raleigh", "NC", "Custom", { url: "https://raleighnc.gov/services/permits-and-inspections" }),
  S("Durham", "NC", "Custom", { url: "https://durhamnc.gov/1146/Permits-Inspections" }),
  S("Greensboro", "NC", "Custom", { url: "https://www.greensboro-nc.gov/departments/planning/permits" }),

  S("Howard County", "MD", "Custom", { url: "https://www.howardcountymd.gov/inspections-permits" }),
  S("Anne Arundel County", "MD", "Custom", { url: "https://www.aacounty.org/departments/inspections-and-permits", planReviewUrl: "https://epermit.aacounty.org/ProjectDox/" }),
  S("San Antonio", "TX", "Custom", { url: "https://www.sanantonio.gov/DSD/Online-Services" }),
  S("Fort Worth", "TX", "Custom", { url: "https://www.fortworthtexas.gov/departments/development-services", planReviewUrl: "https://eplans.fortworthtexas.gov/ProjectDox/" }),
  A("El Paso", "TX", "elpaso"),
  S("Plano", "TX", "Custom", { url: "https://www.plano.gov/292/Building-Inspections" }),
  S("Arlington", "TX", "Custom", { url: "https://www.arlingtontx.gov/city_hall/departments/community_development_and_planning" }),
  S("Orlando", "FL", "Custom", { url: "https://www.orlando.gov/Building-Development" }),
  A("Tampa", "FL", "TAMPA"),
  S("Jacksonville", "FL", "Custom", { url: "https://www.coj.net/departments/planning-and-development" }),
  A("Fort Lauderdale", "FL", "FTL"),
  S("St. Petersburg", "FL", "Custom", { url: "https://www.stpete.org/business/development_review/index.php" }),
  A("Tacoma", "WA", "TACOMA"),
  A("King County", "WA", "KINGCO"),
  S("Eugene", "OR", "Custom", { url: "https://www.eugene-or.gov/95/Building-Permits" }),
  S("Pittsburgh", "PA", "Custom", { url: "https://pittsburghpa.gov/pli/pli-home" }),
  S("Newark", "NJ"),
  S("Jersey City", "NJ", "Custom", { url: "https://data.jerseycitynj.gov/explore/dataset/permits/" }),
  A("Hartford", "CT", "HARTFORD"),
  A("Detroit", "MI", "DETROIT"),
  A("Grand Rapids", "MI", "GRANDRAPIDS"),
  A("Columbus", "OH", "COLUMBUS"),
  S("Cleveland", "OH", "Custom", { url: "https://www.clevelandohio.gov/CityofCleveland/Home/Government/CityAgencies/BuildingHousing" }),
  A("Cincinnati", "OH", "CINCINNATI"),
  A("Milwaukee", "WI", "MILWAUKEE"),
  S("St. Louis", "MO", "Custom", { url: "https://www.stlouis-mo.gov/government/departments/public-safety/building/" }),
  S("Kansas City", "MO", "Custom", { url: "https://www.kcmo.gov/city-hall/departments/city-planning-development" }),
  A("Salt Lake City", "UT", "SLC", { planReviewUrl: "https://eplans.slcgov.com/ProjectDox/" }),
  S("Albuquerque", "NM", "Custom", { url: "https://www.cabq.gov/planning/online-services" }),
  S("Tucson", "AZ", "Custom", { url: "https://www.tucsonaz.gov/pdsd" }),
  A("Mesa", "AZ", "MESA", { planReviewUrl: "https://eplan.mesaaz.gov/ProjectDox/" }),
  A("Clark County / Las Vegas", "NV", "CLARKCO"),
  A("Reno", "NV", "RENO"),
  A("Boise", "ID", "BOISE"),
  S("Charleston", "SC", "Custom", { url: "https://www.charleston-sc.gov/265/Permitting-Inspections" }),
  S("Columbia", "SC", "Custom", { url: "https://www.columbiasc.gov/depts/planning-development-services/" }),
  A("Birmingham", "AL", "BIRMINGHAM"),
  S("Memphis / Shelby County", "TN", "Custom", { url: "https://www.memphistn.gov/government/executive-division/permits-office/" }),
  A("Knoxville", "TN", "KNOXVILLE"),
  S("Louisville", "KY", "Custom", { url: "https://louisvilleky.gov/government/develop-louisville" }),
  S("Providence", "RI", "Custom", { url: "https://www.providenceri.gov/inspection-standards/" }),
  S("Portland", "ME", "Custom", { url: "https://www.portlandmaine.gov/253/Inspections" }),
  S("Cambridge", "MA", "Custom", { url: "https://www.cambridgema.gov/inspection" }),
  A("Anchorage", "AK", "anchorage"),
  S("Honolulu", "HI", "Custom", { url: "https://www.honolulu.gov/dpp" }),

  // Accela — custom-hosted (non aca-prod)
  {
    jurisdiction: "Baltimore City", state: "MD", platform: "Accela",
    url: "https://cels.baltimorehousing.org/CitizenAccess/Default.aspx",
    addressSearch: (a) => `https://cels.baltimorehousing.org/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc(a)}`,
    permitSearch: (n) => `https://cels.baltimorehousing.org/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(n.trim())}`,
  },
  {
    jurisdiction: "Baltimore County", state: "MD", platform: "Accela",
    url: "https://permits.baltimorecountymd.gov/CitizenAccess/Default.aspx",
    addressSearch: (a) => `https://permits.baltimorecountymd.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc(a)}`,
    permitSearch: (n) => `https://permits.baltimorecountymd.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(n.trim())}`,
  },
  {
    jurisdiction: "Montgomery County", state: "MD", platform: "Accela",
    url: "https://eservices.montgomerycountymd.gov/DPSPermitting/CitizenAccess/Default.aspx",
    addressSearch: (a) => `https://eservices.montgomerycountymd.gov/DPSPermitting/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc(a)}`,
    permitSearch: (n) => `https://eservices.montgomerycountymd.gov/DPSPermitting/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(n.trim())}`,
  },
  S("Arlington County (local mirror)", "VA", "Accela", {
    url: "https://permitva.arlingtonva.us/CitizenAccess/",
    notes: "Alternate deep link to Arlington's Permit VA portal.",
  }),
  {
    jurisdiction: "Prince William County", state: "VA", platform: "Accela",
    url: "https://eservices.pwcgov.org/BuildingDevelopment/Default.aspx",
    addressSearch: (a) => `https://eservices.pwcgov.org/BuildingDevelopment/Cap/GlobalSearchResults.aspx?QueryText=${enc(a)}`,
    permitSearch: (n) => `https://eservices.pwcgov.org/BuildingDevelopment/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(n.trim())}`,
  },
  {
    jurisdiction: "Seattle", state: "WA", platform: "Accela",
    url: "https://cosaccela.seattle.gov/portal/",
    addressSearch: (a) => `https://cosaccela.seattle.gov/portal/Cap/GlobalSearchResults.aspx?QueryText=${enc(a)}`,
    permitSearch: (n) => `https://cosaccela.seattle.gov/portal/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(n.trim())}`,
  },
  {
    jurisdiction: "Nashville / Davidson County", state: "TN", platform: "Accela",
    url: "https://epermits.nashville.gov/CitizenAccess/Default.aspx",
    addressSearch: (a) => `https://epermits.nashville.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc(a)}`,
    permitSearch: (n) => `https://epermits.nashville.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(n.trim())}`,
  },
  {
    jurisdiction: "Indianapolis / Marion County", state: "IN", platform: "Accela",
    url: "https://permitsandcases.indy.gov/CitizenAccess/Default.aspx",
    addressSearch: (a) => `https://permitsandcases.indy.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc(a)}`,
    permitSearch: (n) => `https://permitsandcases.indy.gov/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(n.trim())}`,
  },

  // ================= Tyler EnerGov =================
  E("Richmond", "VA", "energov.richmondgov.com"),
  E("Virginia Beach", "VA", "energov.vbgov.com"),
  E("Henrico County", "VA", "energov.henrico.us"),
  E("Chesterfield County", "VA", "energov.chesterfield.gov"),
  E("Chesapeake", "VA", "energov.cityofchesapeake.net"),
  E("Norfolk", "VA", "energov.norfolk.gov"),
  E("Newport News", "VA", "energov.nnva.gov"),
  E("Frederick County", "MD", "energov.frederickcountymd.gov"),
  E("Charles County", "MD", "energov.charlescountymd.gov"),
  E("Frederick", "MD", "energov.cityoffrederickmd.gov"),
  E("Gainesville", "FL", "energov.cityofgainesville.org"),
  E("Cape Coral", "FL", "energov.capecoral.gov"),
  E("Palm Beach County", "FL", "energov.pbcgov.org"),
  E("Boulder", "CO", "energov.bouldercolorado.gov"),
  E("Fort Collins", "CO", "energov.fcgov.com"),
  E("Chattanooga", "TN", "energov.chattanooga.gov"),
  E("Little Rock", "AR", "energov.littlerock.gov"),
  E("Wichita", "KS", "energov.wichita.gov"),
  E("Omaha", "NE", "energov.cityofomaha.org"),
  E("Lincoln", "NE", "energov.lincoln.ne.gov"),
  E("Des Moines", "IA", "energov.dsm.city"),
  E("Madison", "WI", "energov.cityofmadison.com"),
  E("Green Bay", "WI", "energov.greenbaywi.gov"),
  E("Toledo", "OH", "energov.toledo.oh.gov"),
  E("Akron", "OH", "energov.akronohio.gov"),
  E("Rochester", "NY", "energov.cityofrochester.gov"),
  E("Buffalo", "NY", "energov.buffalony.gov"),
  E("Syracuse", "NY", "energov.syrgov.net"),
  E("Bakersfield", "CA", "energov.bakersfieldcity.us"),
  E("Modesto", "CA", "energov.modestogov.com"),
  E("Stockton", "CA", "energov.stocktonca.gov"),

  // ================= Avolve ProjectDox (electronic plan review) =================
  {
    jurisdiction: "Washington, DC (DOB ProjectDox)", state: "DC", platform: "ProjectDox",
    url: "https://dcra-eplan.dc.gov/ProjectDox/",
    notes: "Electronic plan review. Permit records live on eServices DCRA.",
  },
  { jurisdiction: "Fairfax County (ePlans)", state: "VA", platform: "ProjectDox", url: "https://fidoprod.fairfaxcounty.gov/ProjectDox/" },
  { jurisdiction: "Loudoun County (LandMARC)", state: "VA", platform: "ProjectDox", url: "https://loudounpdx.loudoun.gov/ProjectDox/" },
  { jurisdiction: "Arlington County (Permit Arlington)", state: "VA", platform: "ProjectDox", url: "https://permitva.arlingtonva.us/ProjectDox/index.aspx" },
  { jurisdiction: "Prince William County (ePlans)", state: "VA", platform: "ProjectDox", url: "https://eplans.pwcgov.org/ProjectDox/" },
  { jurisdiction: "San Diego (DSD ePlans)", state: "CA", platform: "ProjectDox", url: "https://plans.sandiego.gov/ProjectDox/" },
  { jurisdiction: "Denver (E-Permits ePlans)", state: "CO", platform: "ProjectDox", url: "https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Community-Planning-and-Development/Denver-Development-Services/Help-with-permits" },
  { jurisdiction: "Aurora (ePlans)", state: "CO", platform: "ProjectDox", url: "https://eplan.auroragov.org/ProjectDox/" },
  { jurisdiction: "Palm Beach County (ePlans)", state: "FL", platform: "ProjectDox", url: "https://epzb.pbcgov.org/ProjectDox/" },
  { jurisdiction: "Orange County (ePlans)", state: "FL", platform: "ProjectDox", url: "https://fastrackepr.ocfl.net/ProjectDox/" },
  { jurisdiction: "Broward County (ePermits ePlans)", state: "FL", platform: "ProjectDox", url: "https://eplans.broward.org/ProjectDox/" },
  { jurisdiction: "Miami-Dade (ePlans)", state: "FL", platform: "ProjectDox", url: "https://eplans.miamidade.gov/ProjectDox/" },
  { jurisdiction: "Chicago (E-Plan Review)", state: "IL", platform: "ProjectDox", url: "https://www.chicago.gov/city/en/depts/bldgs/provdrs/electronic_planreview.html" },
  { jurisdiction: "Louisville / Jefferson County (ePlans)", state: "KY", platform: "ProjectDox", url: "https://lojicplans.louisvilleky.gov/ProjectDox/" },
  { jurisdiction: "Nashville (ePlans)", state: "TN", platform: "ProjectDox", url: "https://plans.nashville.gov/ProjectDox/" },
  { jurisdiction: "Salt Lake City (ePlans)", state: "UT", platform: "ProjectDox", url: "https://eplans.slcgov.com/ProjectDox/" },
  { jurisdiction: "Phoenix (PDD ePlans)", state: "AZ", platform: "ProjectDox", url: "https://eplan.phoenix.gov/ProjectDox/" },
  { jurisdiction: "Mesa (ePlans)", state: "AZ", platform: "ProjectDox", url: "https://eplan.mesaaz.gov/ProjectDox/" },
  { jurisdiction: "Tempe (ePlans)", state: "AZ", platform: "ProjectDox", url: "https://eplans.tempe.gov/ProjectDox/" },
  { jurisdiction: "Fort Worth (ePlans)", state: "TX", platform: "ProjectDox", url: "https://eplans.fortworthtexas.gov/ProjectDox/" },
  { jurisdiction: "Plano (ePlans)", state: "TX", platform: "ProjectDox", url: "https://eplans.plano.gov/ProjectDox/" },
  { jurisdiction: "El Paso (ePlans)", state: "TX", platform: "ProjectDox", url: "https://eplans.elpasotexas.gov/ProjectDox/" },
  { jurisdiction: "Atlanta (ePlans)", state: "GA", platform: "ProjectDox", url: "https://eplans.atlantaga.gov/ProjectDox/" },
  { jurisdiction: "Cobb County (ePlans)", state: "GA", platform: "ProjectDox", url: "https://eplans.cobbcounty.org/ProjectDox/" },
  { jurisdiction: "Gwinnett County (ePlans)", state: "GA", platform: "ProjectDox", url: "https://eplans.gwinnettcounty.com/ProjectDox/" },

  // ================= CentralSquare Momentum / Community Development =================
  {
    jurisdiction: "Houston", state: "TX", platform: "Momentum",
    url: "https://ipermits.houstontx.gov/publicsearch/PermitSearch",
    addressSearch: (a) => `https://ipermits.houstontx.gov/publicsearch/PermitSearch?SearchText=${enc(a)}`,
    permitSearch: (n) => `https://ipermits.houstontx.gov/publicsearch/PermitSearch?SearchText=${encodeURIComponent(n.trim())}`,
  },
  {
    jurisdiction: "Dallas", state: "TX", platform: "Momentum",
    url: "https://developdallas.dallascityhall.com/publicsearch/PermitSearch",
    addressSearch: (a) => `https://developdallas.dallascityhall.com/publicsearch/PermitSearch?SearchText=${enc(a)}`,
    permitSearch: (n) => `https://developdallas.dallascityhall.com/publicsearch/PermitSearch?SearchText=${encodeURIComponent(n.trim())}`,
  },
  {
    jurisdiction: "Austin (ABC)", state: "TX", platform: "Momentum",
    url: "https://abc.austintexas.gov/web/permit/public-search-other",
    addressSearch: (a) => `https://abc.austintexas.gov/web/permit/public-search-other?reset=true&t_selected_search=CAP&t_selected_property=STREET_NUMBER&t_selected_permit_type=BP&t_STREET_NUMBER=${enc(a)}`,
  },
  {
    jurisdiction: "Corpus Christi", state: "TX", platform: "Momentum",
    url: "https://developcc.cctexas.com/publicsearch/PermitSearch",
    addressSearch: (a) => `https://developcc.cctexas.com/publicsearch/PermitSearch?SearchText=${enc(a)}`,
  },
  {
    jurisdiction: "Sugar Land", state: "TX", platform: "Momentum",
    url: "https://permits.sugarlandtx.gov/publicsearch/PermitSearch",
    addressSearch: (a) => `https://permits.sugarlandtx.gov/publicsearch/PermitSearch?SearchText=${enc(a)}`,
  },
  {
    jurisdiction: "Prince George's County", state: "MD", platform: "Momentum",
    url: "https://momentumhome.princegeorgescountymd.gov/",
    addressSearch: (a) => `https://momentumhome.princegeorgescountymd.gov/publicsearch/PermitSearch?SearchText=${enc(a)}`,
    permitSearch: (n) => `https://momentumhome.princegeorgescountymd.gov/publicsearch/PermitSearch?SearchText=${encodeURIComponent(n.trim())}`,
    notes: "CentralSquare Momentum — DPIE permits, licenses & inspections",
  },

  // ================= OpenGov Permitting & Licensing (formerly ViewPoint Cloud) =================
  {
    jurisdiction: "Boston", state: "MA", platform: "OpenGov",
    url: "https://www.boston.gov/permits",
    addressSearch: (a) => `https://www.boston.gov/permits?search=${enc(a)}`,
  },
  { jurisdiction: "Somerville", state: "MA", platform: "OpenGov", url: "https://somervillema.viewpointcloud.com/" },
  { jurisdiction: "Brookline", state: "MA", platform: "OpenGov", url: "https://brookline.viewpointcloud.com/" },
  { jurisdiction: "Newton", state: "MA", platform: "OpenGov", url: "https://newtonma.viewpointcloud.com/" },
  { jurisdiction: "Quincy", state: "MA", platform: "OpenGov", url: "https://quincyma.viewpointcloud.com/" },
  { jurisdiction: "Worcester", state: "MA", platform: "OpenGov", url: "https://worcesterma.viewpointcloud.com/" },
  { jurisdiction: "Provincetown", state: "MA", platform: "OpenGov", url: "https://provincetownma.viewpointcloud.com/" },
  { jurisdiction: "New Haven", state: "CT", platform: "OpenGov", url: "https://newhavenct.viewpointcloud.com/" },
  { jurisdiction: "Stamford", state: "CT", platform: "OpenGov", url: "https://stamfordct.viewpointcloud.com/" },
  { jurisdiction: "Alameda", state: "CA", platform: "OpenGov", url: "https://alamedaca.viewpointcloud.com/" },
  { jurisdiction: "Berkeley", state: "CA", platform: "OpenGov", url: "https://berkeleyca.viewpointcloud.com/" },
  { jurisdiction: "Palo Alto", state: "CA", platform: "OpenGov", url: "https://paloaltoca.viewpointcloud.com/" },
  { jurisdiction: "Mountain View", state: "CA", platform: "OpenGov", url: "https://mountainviewca.viewpointcloud.com/" },
  { jurisdiction: "Santa Monica", state: "CA", platform: "OpenGov", url: "https://santamonica.viewpointcloud.com/" },
  { jurisdiction: "Bend", state: "OR", platform: "OpenGov", url: "https://bend.viewpointcloud.com/" },

  // ================= CitizenServe =================
  { jurisdiction: "Peoria", state: "AZ", platform: "CitizenServe", url: "https://www3.citizenserve.com/peoriaaz" },
  { jurisdiction: "Glendale", state: "AZ", platform: "CitizenServe", url: "https://www3.citizenserve.com/glendaleaz" },
  { jurisdiction: "Casa Grande", state: "AZ", platform: "CitizenServe", url: "https://www3.citizenserve.com/casagrande" },
  { jurisdiction: "Lake Havasu City", state: "AZ", platform: "CitizenServe", url: "https://www3.citizenserve.com/lakehavasu" },
  { jurisdiction: "Frisco", state: "TX", platform: "CitizenServe", url: "https://www3.citizenserve.com/friscotx" },
  { jurisdiction: "McKinney", state: "TX", platform: "CitizenServe", url: "https://www3.citizenserve.com/mckinney" },
  { jurisdiction: "Round Rock", state: "TX", platform: "CitizenServe", url: "https://www3.citizenserve.com/roundrocktx" },
  { jurisdiction: "Coral Springs", state: "FL", platform: "CitizenServe", url: "https://www3.citizenserve.com/coralsprings" },
  { jurisdiction: "Boca Raton", state: "FL", platform: "CitizenServe", url: "https://www3.citizenserve.com/bocaraton" },
  { jurisdiction: "Kissimmee", state: "FL", platform: "CitizenServe", url: "https://www3.citizenserve.com/kissimmee" },
  { jurisdiction: "Deerfield Beach", state: "FL", platform: "CitizenServe", url: "https://www3.citizenserve.com/deerfieldbeach" },

  // ================= MyGovernmentOnline (heavy in LA/MS/TX/AL) =================
  { jurisdiction: "Statewide Portal", state: "LA", platform: "MyGovernmentOnline", url: "https://www.mygovernmentonline.org/", notes: "Search by jurisdiction after opening the portal." },
  { jurisdiction: "Lafayette Consolidated Government", state: "LA", platform: "MyGovernmentOnline", url: "https://www.mygovernmentonline.org/" },
  { jurisdiction: "Shreveport", state: "LA", platform: "MyGovernmentOnline", url: "https://www.mygovernmentonline.org/" },
  { jurisdiction: "Baton Rouge (East Baton Rouge Parish)", state: "LA", platform: "MyGovernmentOnline", url: "https://www.mygovernmentonline.org/" },
  { jurisdiction: "Statewide Portal", state: "MS", platform: "MyGovernmentOnline", url: "https://www.mygovernmentonline.org/" },
  { jurisdiction: "Statewide Portal", state: "AL", platform: "MyGovernmentOnline", url: "https://www.mygovernmentonline.org/" },
  { jurisdiction: "Statewide Portal", state: "AR", platform: "MyGovernmentOnline", url: "https://www.mygovernmentonline.org/" },

  // ================= Cityworks PLL =================
  { jurisdiction: "Provo", state: "UT", platform: "Cityworks", url: "https://pll.provo.org/" },
  { jurisdiction: "Ogden", state: "UT", platform: "Cityworks", url: "https://pll.ogdencity.com/" },
  { jurisdiction: "Sandy", state: "UT", platform: "Cityworks", url: "https://pll.sandy.utah.gov/" },
  { jurisdiction: "St. George", state: "UT", platform: "Cityworks", url: "https://pll.sgcity.org/" },
  { jurisdiction: "Meridian", state: "ID", platform: "Cityworks", url: "https://pll.meridiancity.org/" },

  // ================= Custom / in-house =================
  {
    jurisdiction: "New York City (DOB NOW / BIS)", state: "NY", platform: "Custom",
    url: "https://a810-dobnow.nyc.gov/publish/#!/",
    addressSearch: (a) => `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?requestid=1&allbin=&houseno=${enc(a)}`,
    notes: "DOB NOW for active permits; BIS for records.",
  },
  {
    jurisdiction: "Washington, DC (DOB Permit Wizard)", state: "DC", platform: "Custom",
    url: "https://dob.dc.gov/service/permit-wizard",
    notes: "DCRA has been reorganized into DOB. Use Permit Wizard to reach the current permit portal.",
  },
  {
    jurisdiction: "Los Angeles (LADBS)", state: "CA", platform: "Custom",
    url: "https://www.ladbsservices2.lacity.org/OnlineServices/PermitReport/PermitReportAddress",
    addressSearch: (a) => `https://www.ladbsservices2.lacity.org/OnlineServices/PermitReport/PermitReportAddress?address=${enc(a)}`,
  },
  {
    jurisdiction: "Chicago (Building Records)", state: "IL", platform: "Custom",
    url: "https://webapps1.chicago.gov/buildingrecords/",
    addressSearch: (a) => `https://webapps1.chicago.gov/buildingrecords/?addr=${enc(a)}`,
  },
  {
    jurisdiction: "San Francisco (DBI PTS)", state: "CA", platform: "Custom",
    url: "https://dbiweb02.sfgov.org/dbipts/",
    addressSearch: (a) => `https://dbiweb02.sfgov.org/dbipts/default.aspx?page=AddressLookup&Address=${enc(a)}`,
  },
  {
    jurisdiction: "Miami", state: "FL", platform: "Custom",
    url: "https://apps.miamigov.com/eBuilding/PropertySearch.aspx",
    addressSearch: (a) => `https://apps.miamigov.com/eBuilding/PropertySearch.aspx?address=${enc(a)}`,
  },
  {
    jurisdiction: "Miami-Dade County", state: "FL", platform: "Custom",
    url: "https://www.miamidade.gov/Apps/RER/EPSPortal/Main/PermitSearch",
    addressSearch: (a) => `https://www.miamidade.gov/Apps/RER/EPSPortal/Main/PermitSearch?address=${enc(a)}`,
  },
  {
    jurisdiction: "Philadelphia (eCLIPSE)", state: "PA", platform: "Custom",
    url: "https://www.phila.gov/departments/department-of-licenses-and-inspections/permits-and-certificates/",
    notes: "Direct eCLIPSE login is unstable — this landing page redirects to the current portal.",
  },
  {
    jurisdiction: "Phoenix (PDD Search)", state: "AZ", platform: "Custom",
    url: "https://apps-secure.phoenix.gov/PDD/Search/Permits",
    addressSearch: (a) => `https://apps-secure.phoenix.gov/PDD/Search/Permits?address=${enc(a)}`,
  },
  {
    jurisdiction: "Fairfax County (Plan & Build)", state: "VA", platform: "Custom",
    url: "https://www.fairfaxcounty.gov/landdevelopment/permits",
  },
  {
    jurisdiction: "Portland (PortlandMaps)", state: "OR", platform: "Custom",
    url: "https://www.portlandmaps.com/search/",
    addressSearch: (a) => `https://www.portlandmaps.com/search/?query=${enc(a)}`,
  },
  {
    jurisdiction: "New Orleans (One Stop)", state: "LA", platform: "Custom",
    url: "https://onestopapp.nola.gov/Search.aspx",
    addressSearch: (a) => `https://onestopapp.nola.gov/Search.aspx?address=${enc(a)}`,
  },
];

export const PORTAL_PLATFORMS: PortalPlatform[] = [
  "Accela", "EnerGov", "ProjectDox", "Momentum", "OpenGov", "CitizenServe", "MyGovernmentOnline", "Cityworks", "Custom",
];

export const US_STATES: string[] = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

// ---------------------------------------------------------------------------
// Portal matching + deep-link helpers.
//
// Given a jurisdiction string (from a project, chat, or lookup) plus optional
// address / permit number, find the best matching portal entries and produce
// direct deep links that land on the correct pre-filled search page.
// ---------------------------------------------------------------------------

export const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama:"AL", alaska:"AK", arizona:"AZ", arkansas:"AR", california:"CA", colorado:"CO",
  connecticut:"CT", delaware:"DE", florida:"FL", georgia:"GA", hawaii:"HI", idaho:"ID",
  illinois:"IL", indiana:"IN", iowa:"IA", kansas:"KS", kentucky:"KY", louisiana:"LA",
  maine:"ME", maryland:"MD", massachusetts:"MA", michigan:"MI", minnesota:"MN",
  mississippi:"MS", missouri:"MO", montana:"MT", nebraska:"NE", nevada:"NV",
  "new hampshire":"NH", "new jersey":"NJ", "new mexico":"NM", "new york":"NY",
  "north carolina":"NC", "north dakota":"ND", ohio:"OH", oklahoma:"OK", oregon:"OR",
  pennsylvania:"PA", "rhode island":"RI", "south carolina":"SC", "south dakota":"SD",
  tennessee:"TN", texas:"TX", utah:"UT", vermont:"VT", virginia:"VA", washington:"WA",
  "west virginia":"WV", wisconsin:"WI", wyoming:"WY", "district of columbia":"DC",
};

export function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/\bcounty\b|\bcity of\b|\btown of\b|\bvillage of\b|\bborough of\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse a free-form jurisdiction string like "Arlington County, VA" into
 * a normalized name + best-guess two-letter state code. */
export function parseJurisdiction(input: string): { name: string; state: string | null } {
  const raw = (input || "").trim();
  if (!raw) return { name: "", state: null };
  const m = raw.match(/,\s*([A-Za-z .]{2,20})\s*$/);
  let state: string | null = null;
  let bare = raw;
  if (m) {
    const tail = m[1].trim();
    if (/^[A-Za-z]{2}$/.test(tail)) state = tail.toUpperCase();
    else state = STATE_NAME_TO_CODE[tail.toLowerCase()] ?? null;
    bare = raw.slice(0, m.index).trim();
  }
  return { name: normalize(bare), state };
}

export type PortalMatch = {
  entry: PortalEntry;
  score: number;
  /** Direct deep link that lands on the correct pre-filled search page (permit# preferred over address). */
  deepLink: string;
  linkKind: "permit" | "address" | "home";
};

/** Convert a DB-backed portal mapping row into a runtime PortalEntry. */
export function buildEntryFromMapping(m: {
  jurisdiction: string;
  state: string;
  platform: string;
  url: string;
  address_search_template?: string | null;
  permit_search_template?: string | null;
  plan_review_url?: string | null;
  notes?: string | null;
}): PortalEntry {
  const platform: PortalPlatform = (PORTAL_PLATFORMS as string[]).includes(m.platform)
    ? (m.platform as PortalPlatform)
    : "Custom";
  const fill = (tpl: string | null | undefined, q: string) =>
    tpl ? tpl.replace(/\{q\}/g, encodeURIComponent(q.trim())) : undefined;
  return {
    jurisdiction: m.jurisdiction,
    state: m.state,
    platform,
    url: m.url,
    addressSearch: m.address_search_template
      ? (a: string) => fill(m.address_search_template, a) as string
      : undefined,
    permitSearch: m.permit_search_template
      ? (n: string) => fill(m.permit_search_template, n) as string
      : undefined,
    planReviewUrl: m.plan_review_url ?? undefined,
    notes: m.notes ?? undefined,
  };
}

/** Rank the registry against a jurisdiction + optional address/permit, and
 * return the top-N matches with their best available deep link. */
export function findPortalDeepLinks(
  jurisdiction: string,
  opts: { permitNumber?: string; address?: string; limit?: number; extra?: PortalEntry[] } = {},
): PortalMatch[] {
  const { permitNumber, address } = opts;
  const limit = opts.limit ?? 6;
  const { name, state } = parseJurisdiction(jurisdiction);
  if (!name && !state) return [];

  const nameTokens = name.split(" ").filter((t) => t.length >= 3);

  // Merge: DB entries override built-ins on (jurisdiction+state+platform).
  const byKey = new Map<string, PortalEntry>();
  const key = (e: PortalEntry) => `${normalize(e.jurisdiction)}|${e.state}|${e.platform}`;
  for (const e of PORTAL_REGISTRY) byKey.set(key(e), e);
  for (const e of opts.extra ?? []) byKey.set(key(e), e);

  const scored: PortalMatch[] = [];
  for (const entry of byKey.values()) {
    const entryName = normalize(entry.jurisdiction);
    let score = 0;
    if (state && entry.state === state) score += 3;
    if (name && (entryName === name || entryName.includes(name) || name.includes(entryName))) {
      score += 6;
    } else {
      const overlap = nameTokens.filter((t) => entryName.includes(t)).length;
      if (overlap > 0) score += overlap * 2;
    }
    if (score <= 0) continue;

    const permitUrl = permitNumber && entry.permitSearch ? entry.permitSearch(permitNumber) : null;
    const addrUrl = address && entry.addressSearch ? entry.addressSearch(address) : null;
    const deepLink = permitUrl ?? addrUrl ?? entry.url;
    const linkKind: PortalMatch["linkKind"] = permitUrl ? "permit" : addrUrl ? "address" : "home";
    scored.push({ entry, score, deepLink, linkKind });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}


