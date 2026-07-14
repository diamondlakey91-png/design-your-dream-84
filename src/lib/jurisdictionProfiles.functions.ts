import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callLovableAI, toSlug } from "@/lib/ai.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";
import { findHealthAgencyDeepLinks } from "@/lib/healthAgencyRegistry";

export const listJurisdictionProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    q: z.string().max(120).optional().default(""),
    state: z.string().max(4).optional().default(""),
    jurisdiction_type: z.string().max(40).optional().default(""),
    verified_only: z.boolean().optional().default(false),
  }).parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("jurisdiction_profiles")
      .select("id, slug, name, state, county, jurisdiction_type, department, portal_url, gov_website, verification_status, last_verified_date, confidence, is_demo, permit_categories, refreshed_at, updated_at")
      .order("is_demo", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(100);
    if (data.q) query = query.or(`name.ilike.%${data.q}%,county.ilike.%${data.q}%,department.ilike.%${data.q}%`);
    if (data.state) query = query.eq("state", data.state.toUpperCase());
    if (data.jurisdiction_type) query = query.eq("jurisdiction_type", data.jurisdiction_type);
    if (data.verified_only) query = query.in("verification_status", ["verified", "recently_verified"]);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


export const getJurisdictionProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(160) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jurisdiction_profiles").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

const ProfileExtractionSchema = z.object({
  name: z.string(),
  state: z.string().default(""),
  department: z.string().default(""),
  portal_url: z.string().default(""),
  overview: z.string(),
  permits: z.array(z.object({
    name: z.string(),
    when_required: z.string().default(""),
    typical_reviewers: z.string().default(""),
  })).max(20),
  fees: z.array(z.object({
    label: z.string(),
    detail: z.string().default(""),
  })).max(20),
  timelines: z.array(z.object({
    stage: z.string(),
    typical_duration: z.string(),
  })).max(20),
  contacts: z.array(z.object({
    role: z.string(),
    detail: z.string(),
  })).max(20),
  source_urls: z.array(z.string()).max(15),
  health_department: z.object({
    name: z.string().default(""),
    portal_url: z.string().default(""),
    phone: z.string().default(""),
    services: z.array(z.string()).default([]),
  }).default({ name: "", portal_url: "", phone: "", services: [] }),
});

export const buildJurisdictionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    jurisdiction: z.string().min(2).max(160),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const slug = toSlug(data.jurisdiction);
    if (!slug) throw new Error("Invalid jurisdiction");

    // Firecrawl search + scrape top .gov/permit pages
    const hits = await firecrawlSearch(
      fcKey,
      `${data.jurisdiction} building department permits fees timeline site:.gov OR "permit fees" OR "plan review"`,
      6,
    );
    const preferred = hits
      .filter((h) => /(\.gov|accela|energov|opengov|citizenserve|permitium|mygovernmentonline)/i.test(h.url))
      .slice(0, 3);
    const targets = (preferred.length > 0 ? preferred : hits.slice(0, 3));
    if (targets.length === 0) throw new Error(`No sources found for ${data.jurisdiction}.`);

    const scrapes = await Promise.all(targets.map(async (h) => {
      try {
        const s = await firecrawlScrape(fcKey, h.url);
        return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 3500)}`;
      } catch {
        return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
      }
    }));

    // Health/environmental agency search — separate query, since the building-department
    // search above rarely surfaces septic/OSSF, well-permitting, or food-service pages.
    const healthHits = await firecrawlSearch(
      fcKey,
      `${data.jurisdiction} health department septic OSSF well permit food service plan review site:.gov`,
      3,
    ).catch(() => []);
    const healthTargets = healthHits
      .filter((h) => /\.gov/i.test(h.url))
      .slice(0, 2);
    const healthScrapes = await Promise.all(healthTargets.map(async (h) => {
      try {
        const s = await firecrawlScrape(fcKey, h.url);
        return `HEALTH/ENVIRONMENTAL SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 3500)}`;
      } catch {
        return `HEALTH/ENVIRONMENTAL SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
      }
    }));

    const prompt = `Build a jurisdiction intelligence profile for ${data.jurisdiction}, USA. Use ONLY facts from the sources below. If you don't know, leave the field empty; never fabricate specific fee amounts or code sections.

SOURCES
${[...scrapes, ...healthScrapes].join("\n\n---\n\n")}

Return ONLY valid JSON of this exact shape:
{
  "name": "City, ST",
  "state": "ST",
  "department": "official building/permit department name",
  "portal_url": "canonical URL for permit search or applications",
  "overview": "2-4 sentence plain-English overview of how this jurisdiction handles permits",
  "permits": [{"name":"Building Permit","when_required":"...","typical_reviewers":"Plan Check, Fire, etc."}],
  "fees": [{"label":"Building permit fee","detail":"formula or 'valuation-based; see fee schedule'"}],
  "timelines": [{"stage":"Plan review","typical_duration":"2-6 weeks"}],
  "contacts": [{"role":"Building Department","detail":"phone / email / address"}],
  "source_urls": ["https://..."],
  "health_department": {"name":"official health dept / environmental agency name, or empty if no HEALTH/ENVIRONMENTAL SOURCE was provided above","portal_url":"...","phone":"...","services":["septic/OSSF","well permitting","food service plan review"]}
}

The "health_department" field must be based ONLY on the HEALTH/ENVIRONMENTAL SOURCE entries above (if any). If none were provided, leave name/portal_url/phone empty and services as an empty array — do not guess.`;

    const raw = await callLovableAI(aiKey, [
      { role: "system", content: "You extract structured jurisdiction data. Output valid JSON only, no prose, no fences. Never fabricate specific numbers." },
      { role: "user", content: prompt },
    ]);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    let parsed: z.infer<typeof ProfileExtractionSchema>;
    try { parsed = ProfileExtractionSchema.parse(JSON.parse(cleaned.slice(s, e + 1))); }
    catch { throw new Error("AI returned unparseable profile. Try again."); }

    // Prefer a known, hand-verified health-agency URL over the AI's guess when we have a
    // high-confidence registry match — same cross-check idea as the building-department
    // side would use if it queried portalRegistry.ts (it doesn't today; this is additive).
    const healthMatch = findHealthAgencyDeepLinks(data.jurisdiction, { limit: 1 })[0];
    const healthDeptName = parsed.health_department.name || (healthMatch && healthMatch.score >= 6 ? healthMatch.entry.jurisdiction + " Health Department" : "");
    const healthDeptUrl = (healthMatch && healthMatch.score >= 6) ? healthMatch.entry.url : parsed.health_department.portal_url;

    const departments = [
      { name: "Building", responsibility: parsed.department, webpage: parsed.portal_url },
      ...(healthDeptName
        ? [{
            name: "Health Department",
            responsibility: parsed.health_department.services.join(", "),
            webpage: healthDeptUrl,
            phone: parsed.health_department.phone,
          }]
        : []),
    ];

    const payload = {
      slug,
      name: parsed.name || data.jurisdiction,
      state: parsed.state,
      department: parsed.department,
      portal_url: parsed.portal_url,
      overview: parsed.overview,
      permits: parsed.permits,
      fees: parsed.fees,
      timelines: parsed.timelines,
      contacts: parsed.contacts,
      source_urls: parsed.source_urls,
      departments,
      refreshed_at: new Date().toISOString(),
      created_by: context.userId,
    };

    const { data: row, error } = await context.supabase
      .from("jurisdiction_profiles")
      .upsert(payload, { onConflict: "slug" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listSavedJurisdictions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("saved_jurisdictions")
      .select("id, jurisdiction_id, pinned, notes, updated_at, jurisdiction:jurisdiction_profiles(id, slug, name, state, county, jurisdiction_type, verification_status, last_verified_date, is_demo)")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const toggleSaveJurisdiction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jurisdiction_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("saved_jurisdictions").select("id")
      .eq("user_id", context.userId).eq("jurisdiction_id", data.jurisdiction_id).maybeSingle();
    if (existing) {
      await context.supabase.from("saved_jurisdictions").delete().eq("id", existing.id);
      return { saved: false };
    }
    const { error } = await context.supabase
      .from("saved_jurisdictions")
      .insert({ user_id: context.userId, jurisdiction_id: data.jurisdiction_id });
    if (error) throw new Error(error.message);
    return { saved: true };
  });

export const updateSavedJurisdiction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    jurisdiction_id: z.string().uuid(),
    pinned: z.boolean().optional(),
    notes: z.string().max(4000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const patch: { pinned?: boolean; notes?: string } = {};
    if (typeof data.pinned === "boolean") patch.pinned = data.pinned;
    if (typeof data.notes === "string") patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("saved_jurisdictions").update(patch)
      .eq("user_id", context.userId).eq("jurisdiction_id", data.jurisdiction_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const listJurisdictionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("jurisdiction_requests").select("*")
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createJurisdictionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    jurisdiction_name: z.string().trim().min(2).max(160),
    state: z.string().trim().max(4).default(""),
    county: z.string().trim().max(120).default(""),
    project_address: z.string().trim().max(240).default(""),
    permit_type: z.string().trim().max(120).default(""),
    project_type: z.string().trim().max(120).default(""),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    notes: z.string().max(2000).default(""),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jurisdiction_requests")
      .insert({ ...data, state: data.state.toUpperCase(), user_id: context.userId })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

// Seed demonstration jurisdictions (idempotent, per-user creator)
export const seedDemoJurisdictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const demos = [
      {
        slug: "arlington-county-va",
        name: "Arlington County, VA",
        state: "VA", county: "Arlington County",
        jurisdiction_type: "county",
        department: "Department of Community Planning, Housing and Development — Inspection Services",
        portal_url: "https://aca-prod.accela.com/ARLINGTONCO/Default.aspx",
        gov_website: "https://www.arlingtonva.us/Government/Programs/Building",
        phone: "703-228-3800",
        email: "inspections@arlingtonva.us",
        office_address: "2100 Clarendon Blvd, Arlington, VA 22201",
        office_hours: "Mon–Fri, 8:00 AM – 5:00 PM",
        overview: "Arlington County reviews and issues building, trade, land-disturbing, and certificate-of-occupancy permits through the Inspection Services Division. Most applications are filed through the Accela Citizen Access portal.",
      },
      {
        slug: "montgomery-county-md",
        name: "Montgomery County, MD",
        state: "MD", county: "Montgomery County",
        jurisdiction_type: "county",
        department: "Department of Permitting Services (DPS)",
        portal_url: "https://eplans.montgomerycountymd.gov/",
        gov_website: "https://www.montgomerycountymd.gov/dps/",
        phone: "311 (or 240-777-0311)",
        email: "mc311@montgomerycountymd.gov",
        office_address: "2425 Reedie Dr, 7th Floor, Wheaton, MD 20902",
        office_hours: "Mon–Fri, 7:30 AM – 4:00 PM",
        overview: "Montgomery County DPS handles building, electrical, mechanical, sediment control, right-of-way, and use-and-occupancy permits. Plans are submitted through the ePlans / ePermits system.",
      },
      {
        slug: "prince-georges-county-md",
        name: "Prince George's County, MD",
        state: "MD", county: "Prince George's County",
        jurisdiction_type: "county",
        department: "Department of Permitting, Inspections and Enforcement (DPIE)",
        portal_url: "https://mypermits.princegeorgescountymd.gov/",
        gov_website: "https://www.princegeorgescountymd.gov/government/departments-offices/permitting-inspections-enforcement",
        phone: "301-636-2050",
        email: "dpie@co.pg.md.us",
        office_address: "9400 Peppercorn Pl, Largo, MD 20774",
        office_hours: "Mon–Fri, 8:00 AM – 4:00 PM",
        overview: "DPIE issues building, grading, use-and-occupancy, and health permits for Prince George's County. Most permits are filed through the MyPermits online portal.",
      },
      {
        slug: "washington-dc",
        name: "Washington, DC",
        state: "DC", county: "District of Columbia",
        jurisdiction_type: "district",
        department: "Department of Buildings (DOB)",
        portal_url: "https://dob.dc.gov/service/permit-wizard",
        gov_website: "https://dob.dc.gov/",
        phone: "202-671-3500",
        email: "dob@dc.gov",
        office_address: "1100 4th St SW, Washington, DC 20024",
        office_hours: "Mon–Fri, 8:30 AM – 4:30 PM",
        overview: "The DC Department of Buildings issues construction, trade, and certificate-of-occupancy permits. Applications are filed through DOB's ProjectDox / Permit Wizard system.",
      },
      {
        slug: "tampa-fl",
        name: "Tampa, FL",
        state: "FL", county: "Hillsborough County",
        jurisdiction_type: "city",
        department: "Construction Services Division",
        portal_url: "https://aca-prod.accela.com/TAMPA/Default.aspx",
        gov_website: "https://www.tampa.gov/development-and-economic-opportunity/programs/construction-services",
        phone: "813-274-3100",
        email: "constructionservices@tampagov.net",
        office_address: "1400 N Boulevard, Tampa, FL 33607",
        office_hours: "Mon–Fri, 8:00 AM – 5:00 PM",
        overview: "City of Tampa Construction Services reviews building, electrical, mechanical, plumbing, and sign permits within city limits. Filings run through the Accela Citizen Access portal.",
      },
    ];

    const commonPermits = [
      { name: "Commercial Building Permit", department: "Building", verification_status: "unverified" },
      { name: "Tenant Improvement", department: "Building", verification_status: "unverified" },
      { name: "Mechanical / Electrical / Plumbing", department: "Building", verification_status: "unverified" },
      { name: "Fire Protection", department: "Fire", verification_status: "unverified" },
      { name: "Sign Permit", department: "Zoning", verification_status: "unverified" },
      { name: "Certificate of Occupancy", department: "Building", verification_status: "unverified" },
    ];

    const rows = demos.map((d) => ({
      ...d,
      created_by: context.userId,
      is_demo: true,
      verification_status: "demo",
      confidence: "demo",
      last_verified_date: null,
      permits: [],
      fees: [],
      timelines: [],
      contacts: [],
      source_urls: [d.gov_website, d.portal_url].filter(Boolean),
      departments: [
        { name: "Building", responsibility: "Building & trade permits, inspections", webpage: d.gov_website, portal: d.portal_url },
        { name: "Planning / Zoning", responsibility: "Zoning approval, site plan, signs", webpage: d.gov_website },
        { name: "Fire", responsibility: "Fire protection & life safety review", webpage: d.gov_website },
        { name: "Certificate of Occupancy", responsibility: "Final approval after inspections", webpage: d.gov_website },
      ],
      permit_categories: commonPermits,
      submission_portals: [{
        name: d.portal_url.includes("accela") ? "Accela Citizen Access" : "Official permit portal",
        agency: d.department, url: d.portal_url,
        account_required: true, online_submission: true, payment: true, inspection_scheduling: true, status_tracking: true,
      }],
      requirements: [],
      sources: [{ title: "Official department page", agency: d.department, url: d.gov_website, accessed_at: new Date().toISOString().slice(0, 10) }],
    }));

    const { error } = await context.supabase
      .from("jurisdiction_profiles")
      .upsert(rows, { onConflict: "slug" });
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });
