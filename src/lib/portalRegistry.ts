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

export const PORTAL_REGISTRY: PortalEntry[] = [
  // ================= Accela (largest footprint) =================
  A("Arlington County", "VA", "ARLINGTONCO", { planReviewUrl: "https://permitva.arlingtonva.us/ProjectDox/index.aspx" }),
  A("Fairfax County", "VA", "FFXC", { planReviewUrl: "https://fidoprod.fairfaxcounty.gov/ProjectDox/" }),
  A("Loudoun County", "VA", "LOUDOUN", { planReviewUrl: "https://loudounpdx.loudoun.gov/ProjectDox/" }),
  A("Alexandria", "VA", "ALEXANDRIA"),
  A("San Diego", "CA", "SANDIEGO", { planReviewUrl: "https://plans.sandiego.gov/ProjectDox/" }),
  A("Oakland", "CA", "OAKLAND"),
  A("San Jose", "CA", "SANJOSECA"),
  A("Sacramento", "CA", "SACRAMENTO"),
  A("Long Beach", "CA", "LONGBEACH"),
  A("Anaheim", "CA", "ANAHEIM"),
  A("Riverside", "CA", "RIVERSIDECA"),
  A("Fresno", "CA", "FRESNO"),
  A("Bakersfield", "CA", "BAKERSFIELD"),
  A("Denver", "CO", "denver", { planReviewUrl: "https://www.denvergov.org/edaps/" }),
  A("Colorado Springs", "CO", "COLORADOSPRINGS"),
  A("Aurora", "CO", "AURORACO"),
  A("Atlanta", "GA", "ATLANTA_GA"),
  A("Savannah", "GA", "SAVANNAH"),
  A("Minneapolis", "MN", "MINNEAPOLIS"),
  A("Charlotte / Mecklenburg", "NC", "CLTNC"),
  A("Raleigh", "NC", "RALEIGH"),
  A("Durham", "NC", "DURHAM"),
  A("Greensboro", "NC", "GREENSBORO"),
  A("Prince George's County", "MD", "PGC"),
  A("Howard County", "MD", "HOWARD"),
  A("Anne Arundel County", "MD", "AACOUNTY"),
  A("San Antonio", "TX", "SANANTONIO_TX"),
  A("Fort Worth", "TX", "FORTWORTH"),
  A("El Paso", "TX", "ELPASOTX"),
  A("Plano", "TX", "PLANO"),
  A("Arlington", "TX", "ARLINGTON_TX"),
  A("Orlando", "FL", "ORLANDO"),
  A("Tampa", "FL", "TAMPA"),
  A("Jacksonville", "FL", "JACKSONVILLE"),
  A("Fort Lauderdale", "FL", "FTL"),
  A("St. Petersburg", "FL", "STPETE"),
  A("Tacoma", "WA", "TACOMA"),
  A("King County", "WA", "KINGCO"),
  A("Eugene", "OR", "EUGENE"),
  A("Pittsburgh", "PA", "PITTSBURGHPA"),
  A("Newark", "NJ", "NEWARK"),
  A("Jersey City", "NJ", "JCNJ"),
  A("Hartford", "CT", "HARTFORD"),
  A("Detroit", "MI", "DETROIT"),
  A("Grand Rapids", "MI", "GRANDRAPIDS"),
  A("Columbus", "OH", "COLUMBUS"),
  A("Cleveland", "OH", "CLEVELAND"),
  A("Cincinnati", "OH", "CINCINNATI"),
  A("Milwaukee", "WI", "MILWAUKEE"),
  A("St. Louis", "MO", "STLOUISMO"),
  A("Kansas City", "MO", "KCMO"),
  A("Salt Lake City", "UT", "SLC"),
  A("Albuquerque", "NM", "ABQ"),
  A("Tucson", "AZ", "TUCSON"),
  A("Mesa", "AZ", "MESA"),
  A("Clark County / Las Vegas", "NV", "CLARKCO"),
  A("Reno", "NV", "RENO"),
  A("Boise", "ID", "BOISE"),
  A("Charleston", "SC", "CHARLESTON"),
  A("Columbia", "SC", "COLUMBIASC"),
  A("Birmingham", "AL", "BIRMINGHAM"),
  A("Memphis / Shelby County", "TN", "MEMPHIS"),
  A("Knoxville", "TN", "KNOXVILLE"),
  A("Louisville", "KY", "LOUISVILLE"),
  A("Providence", "RI", "PROVIDENCE"),
  A("Portland", "ME", "PORTLANDME"),
  A("Cambridge", "MA", "CAMBRIDGE"),
  A("Anchorage", "AK", "ANCHORAGE"),
  A("Honolulu", "HI", "HONOLULU"),

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
  {
    jurisdiction: "Arlington County", state: "VA", platform: "Accela",
    url: "https://permits.arlingtonva.us/CitizenAccess/Default.aspx",
    addressSearch: (a) => `https://permits.arlingtonva.us/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${enc(a)}`,
    permitSearch: (n) => `https://permits.arlingtonva.us/CitizenAccess/Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(n.trim())}`,
    notes: "Local mirror of Arlington's ACA instance.",
  },
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
  { jurisdiction: "Denver (E-Permits ePlans)", state: "CO", platform: "ProjectDox", url: "https://www.denvergov.org/edaps/" },
  { jurisdiction: "Aurora (ePlans)", state: "CO", platform: "ProjectDox", url: "https://eplan.auroragov.org/ProjectDox/" },
  { jurisdiction: "Palm Beach County (ePlans)", state: "FL", platform: "ProjectDox", url: "https://epzb.pbcgov.org/ProjectDox/" },
  { jurisdiction: "Orange County (ePlans)", state: "FL", platform: "ProjectDox", url: "https://fastrackepr.ocfl.net/ProjectDox/" },
  { jurisdiction: "Broward County (ePermits ePlans)", state: "FL", platform: "ProjectDox", url: "https://eplans.broward.org/ProjectDox/" },
  { jurisdiction: "Miami-Dade (ePlans)", state: "FL", platform: "ProjectDox", url: "https://eplans.miamidade.gov/ProjectDox/" },
  { jurisdiction: "Chicago (E-Plan Review)", state: "IL", platform: "ProjectDox", url: "https://ipiweb.cityofchicago.org/EPlan/" },
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
    jurisdiction: "Washington, DC (eServices DCRA)", state: "DC", platform: "Custom",
    url: "https://eservices.dcra.dc.gov/DCRAPermitApplicationSearch/",
    addressSearch: (a) => `https://eservices.dcra.dc.gov/DCRAPermitApplicationSearch/Search/Permit?address=${enc(a)}`,
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
    url: "https://eclipse.phila.gov/phillylmsprod/int/lms/Login.aspx",
  },
  {
    jurisdiction: "Phoenix (PDD Search)", state: "AZ", platform: "Custom",
    url: "https://apps-secure.phoenix.gov/PDD/Search/Permits",
    addressSearch: (a) => `https://apps-secure.phoenix.gov/PDD/Search/Permits?address=${enc(a)}`,
  },
  {
    jurisdiction: "Fairfax County (Plan & Build)", state: "VA", platform: "Custom",
    url: "https://www.fairfaxcounty.gov/plan2build/permit-status",
    addressSearch: (a) => `https://www.fairfaxcounty.gov/plan2build/permit-status?address=${enc(a)}`,
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
