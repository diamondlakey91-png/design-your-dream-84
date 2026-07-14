import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { scrapePermitByNumber } from "@/lib/permitLookup.functions";

// Nightly auto-sync: refresh every project that has a linked live permit so
// users see up-to-date status without hitting "Refresh" manually. Called by
// pg_cron via net.http_post; authenticated with the project anon key so the
// route is safe to leave under /api/public/.
export const Route = createFileRoute("/api/public/hooks/refresh-linked-permits")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!auth || auth !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        const fcKey = process.env.FIRECRAWL_API_KEY;
        const aiKey = process.env.LOVABLE_API_KEY;
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!fcKey || !aiKey || !url || !serviceKey) {
          return new Response(JSON.stringify({ error: "missing_config" }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

        // Refresh anything with a linked permit, oldest sync first. Cap per
        // run so a single cron tick can't exhaust Firecrawl quota.
        const { data: rows, error } = await admin
          .from("projects")
          .select("id, user_id, jurisdiction, linked_permit_number, linked_permit_synced_at")
          .not("linked_permit_number", "is", null)
          .order("linked_permit_synced_at", { ascending: true, nullsFirst: true })
          .limit(50);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        let ok = 0;
        let failed = 0;
        for (const p of rows ?? []) {
          if (!p.jurisdiction || !p.linked_permit_number) continue;
          try {
            const { parsed } = await scrapePermitByNumber(fcKey, aiKey, p.jurisdiction, p.linked_permit_number);
            await admin.from("projects").update({
              linked_permit_url: parsed.source_url || null,
              linked_permit_data: parsed,
              linked_permit_synced_at: new Date().toISOString(),
            }).eq("id", p.id);
            await admin.from("permit_sync_history").insert({
              user_id: p.user_id,
              project_id: p.id,
              permit_number: p.linked_permit_number,
              jurisdiction: p.jurisdiction,
              status: parsed.status || "",
              found: !!parsed.found,
              source_url: parsed.source_url || null,
              portal_name: parsed.portal_name || null,
              snapshot: parsed,
              trigger: "cron",
            });
            ok++;
          } catch (e) {
            failed++;
            console.error("cron refresh failed", p.id, e);
          }
        }

        return new Response(JSON.stringify({ processed: (rows ?? []).length, ok, failed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
