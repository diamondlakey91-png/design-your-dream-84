import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callLovableAI, PERMIT_STATUSES } from "@/lib/ai.shared";
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl.shared";

// ---- Live Jurisdiction Sync (Firecrawl + AI) ----
export const listJurisdictionSyncs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("jurisdiction_syncs")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const FindingSchema = z.object({
  permit_or_record: z.string(),
  status: z.string(),
  applicant_or_address: z.string().optional().default(""),
  filed_or_updated: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

const SyncExtractionSchema = z.object({
  portal_name: z.string(),
  portal_url: z.string(),
  findings: z.array(FindingSchema).max(15),
  summary: z.string(),
});

export const syncJurisdiction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey) throw new Error("Firecrawl is not configured");
    if (!aiKey) throw new Error("AI is not configured");

    const { data: p } = await context.supabase
      .from("projects").select("*").eq("id", data.project_id).maybeSingle();
    if (!p) throw new Error("Project not found");
    if (!p.jurisdiction) throw new Error("Add a jurisdiction to this project first (e.g. \"Los Angeles, CA\").");

    // Insert pending row so realtime shows a live "syncing" state
    const { data: pending, error: perr } = await context.supabase
      .from("jurisdiction_syncs")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        status: "searching",
        summary: `Searching official permit portal for ${p.jurisdiction}…`,
      })
      .select("*").single();
    if (perr) throw new Error(perr.message);

    try {
      // 1. Find the jurisdiction's permit portal
      const portalQuery = `${p.jurisdiction} building permit search portal site:.gov OR "permit search" OR Accela OR "energov"`;
      const portalHits = await firecrawlSearch(fcKey, portalQuery, 5);
      if (portalHits.length === 0) throw new Error(`No official permit portal found for ${p.jurisdiction}.`);

      // Prefer .gov / accela / energov / opengov
      const preferred = portalHits.find((h) => /(\.gov|accela|energov|opengov|citizenserve|permitium|mygovernmentonline)/i.test(h.url)) ?? portalHits[0];

      await context.supabase
        .from("jurisdiction_syncs").update({
          status: "scraping",
          portal_url: preferred.url,
          portal_name: preferred.title ?? preferred.url,
          source_url: preferred.url,
          summary: `Reading ${preferred.title ?? preferred.url}…`,
        }).eq("id", pending.id);

      // 2. Also search for the project itself on the portal / news
      const projectQuery = `"${p.name}" ${p.location || p.jurisdiction} permit status`;
      const projectHits = await firecrawlSearch(fcKey, projectQuery, 3).catch(() => []);

      // 3. Scrape the portal landing page
      const scraped = await firecrawlScrape(fcKey, preferred.url);
      const portalSnippet = scraped.markdown.slice(0, 4000);

      const projectSnippets = (
        await Promise.all(
          projectHits.slice(0, 2).map(async (h) => {
            try {
              const s = await firecrawlScrape(fcKey, h.url);
              return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\n${s.markdown.slice(0, 2000)}`;
            } catch {
              return `SOURCE: ${h.url}\nTITLE: ${h.title ?? ""}\nDESC: ${h.description ?? ""}`;
            }
          }),
        )
      ).join("\n\n---\n\n");

      // 4. Ask AI to extract structured findings
      const extractionPrompt = `You are analyzing live web content for the Permivio permit tracker.

PROJECT
- Name: ${p.name}
- Address / Location: ${p.location || "(not provided)"}
- Jurisdiction: ${p.jurisdiction}
- Type: ${p.project_type}

CANDIDATE PORTAL (${preferred.url})
${portalSnippet}

RELATED SEARCH RESULTS FOR THIS PROJECT
${projectSnippets || "(none)"}

TASK
Return ONLY valid JSON matching this exact shape:
{
  "portal_name": "official name of the permit portal or department",
  "portal_url": "canonical URL to search permits in this jurisdiction",
  "findings": [
    {
      "permit_or_record": "record number or permit type",
      "status": "Issued | Under Review | Submitted | Approved | Expired | Withdrawn | Unknown",
      "applicant_or_address": "if listed",
      "filed_or_updated": "date if listed",
      "notes": "1 short clause"
    }
  ],
  "summary": "2-4 sentence plain-English summary of what the live portal shows for this jurisdiction and whether any record appears to match this project. Be honest if no direct match was found — say 'No direct match; use the portal link to search by address.'"
}

RULES
- Never invent record numbers, status, or dates. If a field isn't in the source text, omit that finding or set the field to "".
- findings may be an empty array. Prefer accuracy over volume.
- portal_url must be a real URL taken from the sources above.`;

      const raw = await callLovableAI(aiKey, [
        { role: "system", content: "You extract structured permit-portal data. Output valid JSON only, no prose, no fences." },
        { role: "user", content: extractionPrompt },
      ]);
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      let parsed: z.infer<typeof SyncExtractionSchema>;
      try {
        parsed = SyncExtractionSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
      } catch {
        throw new Error("AI returned unparseable sync result. Try again.");
      }

      const { data: done, error: derr } = await context.supabase
        .from("jurisdiction_syncs").update({
          status: "complete",
          portal_name: parsed.portal_name || preferred.title || preferred.url,
          portal_url: parsed.portal_url || preferred.url,
          source_url: preferred.url,
          findings: parsed.findings,
          summary: parsed.summary,
          error: "",
        }).eq("id", pending.id).select("*").single();
      if (derr) throw new Error(derr.message);

      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: data.project_id,
        description: `Live jurisdiction sync: ${parsed.findings.length} record${parsed.findings.length === 1 ? "" : "s"} from ${parsed.portal_name || "portal"}.`,
      });

      return done;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("jurisdiction_syncs").update({
          status: "error",
          error: msg,
          summary: `Sync failed: ${msg}`,
        }).eq("id", pending.id);
      throw new Error(msg);
    }
  });

// ---- Apply sync findings to checklist ----
const MatchSchema = z.object({
  item_id: z.string().uuid(),
  finding_index: z.number().int().min(0),
  new_status: z.enum(PERMIT_STATUSES).nullable(),
  new_due_date: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  explanation: z.string().min(1).max(400),
});
const MatchResultSchema = z.object({ matches: z.array(MatchSchema).max(50) });

export const applySyncToChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sync_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) throw new Error("AI is not configured");

    const { data: sync } = await context.supabase
      .from("jurisdiction_syncs").select("*").eq("id", data.sync_id).maybeSingle();
    if (!sync) throw new Error("Sync not found");
    if (sync.status !== "complete") throw new Error("Sync is not complete yet");
    const findings = (sync.findings ?? []) as Array<{
      permit_or_record: string; status: string;
      applicant_or_address?: string; filed_or_updated?: string; notes?: string;
    }>;
    if (findings.length === 0) throw new Error("No findings to apply");

    const [{ data: project }, { data: items }] = await Promise.all([
      context.supabase.from("projects").select("*").eq("id", sync.project_id).maybeSingle(),
      context.supabase.from("permit_items").select("*").eq("project_id", sync.project_id),
    ]);
    if (!project) throw new Error("Project not found");
    if (!items || items.length === 0) throw new Error("No checklist items on this project. Generate a checklist first.");

    const prompt = `Match live permit-portal findings to the project's checklist items and decide the correct new status.

PROJECT
- Name: ${project.name}
- Address: ${project.location || "(unknown)"}
- Jurisdiction: ${project.jurisdiction}

CHECKLIST ITEMS (${items.length}) — id, category, name, current status, current due_date
${items.map((i) => `- ${i.id} | ${i.category} | ${i.name} | ${i.status} | ${i.due_date ?? "none"}`).join("\n")}

LIVE FINDINGS (index, record, status, applicant/address, date, notes)
${findings.map((f, ix) => `[${ix}] ${f.permit_or_record} | ${f.status} | ${f.applicant_or_address ?? ""} | ${f.filed_or_updated ?? ""} | ${f.notes ?? ""}`).join("\n")}

RULES
- Only match a finding to a checklist item when the finding is clearly about the SAME permit type (building, electrical, plumbing, mechanical, certificate of occupancy, zoning, fire, health, etc.) AND — when the finding names an applicant/address — plausibly the same project. Otherwise skip.
- Map portal statuses to allowed values: not_started | submitted | under_review | approved | issued. "Filed"/"Received"/"Submitted" → submitted. "In Review"/"Plan Check"/"Routing" → under_review. "Approved"/"Ready to Issue" → approved. "Issued"/"Finaled" → issued. Withdrawn/Expired/Denied → do NOT change status; instead include the fact in explanation and leave new_status null.
- Never downgrade a more advanced status (e.g. do not move "issued" back to "under_review"). If the portal reflects a lower status than the checklist, leave new_status null and note the discrepancy.
- new_due_date: only set if a real inspection/expiration/deadline date appears in the finding, formatted YYYY-MM-DD. Otherwise null.
- confidence: high (record explicitly names this project or address), medium (permit type matches and jurisdiction matches with weak identity), low (type match only — usually skip).
- explanation: one plain-English sentence citing the finding (e.g. "Portal shows record B-2024-01823 issued 2024-11-02 for 123 Main St").

Return ONLY JSON of shape:
{"matches":[{"item_id":"<uuid>","finding_index":0,"new_status":"issued"|null,"new_due_date":"YYYY-MM-DD"|null,"confidence":"high|medium|low","explanation":"..."}]}
Return {"matches":[]} if nothing confidently matches.`;

    const raw = await callLovableAI(aiKey, [
      { role: "system", content: "You match permit-portal records to checklist items. Output valid JSON only." },
      { role: "user", content: prompt },
    ]);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    let parsed: z.infer<typeof MatchResultSchema>;
    try { parsed = MatchResultSchema.parse(JSON.parse(cleaned.slice(s, e + 1))); }
    catch { throw new Error("AI returned unparseable matches. Try again."); }

    const itemById = new Map(items.map((i) => [i.id, i]));
    const stageRank: Record<string, number> = { not_started: 0, submitted: 1, under_review: 2, approved: 3, issued: 4 };
    const applied: Array<{ item_id: string; item_name: string; from_status: string; to_status: string | null; new_due_date: string | null; confidence: string; explanation: string; finding: string }> = [];
    const skipped: Array<{ reason: string; explanation: string }> = [];

    for (const m of parsed.matches) {
      const item = itemById.get(m.item_id);
      if (!item) { skipped.push({ reason: "unknown item", explanation: m.explanation }); continue; }
      if (m.confidence === "low") { skipped.push({ reason: "low confidence", explanation: m.explanation }); continue; }

      const finding = findings[m.finding_index];
      const findingLabel = finding ? `${finding.permit_or_record} (${finding.status})` : `finding #${m.finding_index}`;

      const patch: { status?: string; due_date?: string | null; notes?: string } = {};
      let nextStatus: string | null = null;
      if (m.new_status && stageRank[m.new_status] > stageRank[item.status]) {
        patch.status = m.new_status;
        nextStatus = m.new_status;
      }
      if (m.new_due_date) patch.due_date = m.new_due_date;

      const stamp = `[Live sync ${new Date().toISOString().slice(0, 10)}] ${m.explanation} — source: ${findingLabel}${sync.portal_url ? ` · ${sync.portal_url}` : ""}`;
      patch.notes = item.notes ? `${item.notes}\n\n${stamp}` : stamp;

      if (Object.keys(patch).length === 0) { skipped.push({ reason: "no change", explanation: m.explanation }); continue; }

      const { error: uerr } = await context.supabase
        .from("permit_items").update(patch).eq("id", item.id);
      if (uerr) { skipped.push({ reason: uerr.message, explanation: m.explanation }); continue; }

      applied.push({
        item_id: item.id,
        item_name: item.name,
        from_status: item.status,
        to_status: nextStatus,
        new_due_date: m.new_due_date,
        confidence: m.confidence,
        explanation: m.explanation,
        finding: findingLabel,
      });

      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: sync.project_id,
        description: `Live sync updated "${item.name}"${nextStatus ? ` → ${nextStatus.replace(/_/g, " ")}` : ""}${m.new_due_date ? ` (due ${m.new_due_date})` : ""}: ${m.explanation}`,
      });
    }

    return { applied, skipped, total_findings: findings.length };
  });
