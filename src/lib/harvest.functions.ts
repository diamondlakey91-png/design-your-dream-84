import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- Portal Harvest: operational monitoring of portal checks per project ----
// Harvest health is derived from real jurisdiction_sync rows only. Nothing is
// simulated: a project with no recorded check reads "Awaiting first harvest".

const STALE_DAYS = 7;

export type HarvestHealth =
  | "synced"
  | "stale"
  | "partial"
  | "failed"
  | "blocked"
  | "awaiting";

export const getHarvestOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: projects, error: pErr }, { data: syncs, error: sErr }, { data: creds, error: cErr }] =
      await Promise.all([
        context.supabase
          .from("projects")
          .select("id,name,jurisdiction,location,project_type,status,linked_permit_number,linked_permit_url,linked_permit_synced_at,updated_at")
          .eq("user_id", context.userId)
          .order("updated_at", { ascending: false }),
        context.supabase
          .from("jurisdiction_syncs")
          .select("id,project_id,status,portal_name,portal_url,source_url,summary,error,findings,created_at,updated_at")
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(400),
        context.supabase
          .from("portal_credentials")
          .select("id,label,kind,portal_url,jurisdiction,username,last_verified_at")
          .eq("user_id", context.userId),
      ]);

    if (pErr) throw new Error(pErr.message);
    if (sErr) throw new Error(sErr.message);
    if (cErr) throw new Error(cErr.message);

    const credentials = creds ?? [];
    const allSyncs = syncs ?? [];
    const now = Date.now();

    const norm = (v: string | null | undefined) =>
      (v ?? "").toLowerCase().replace(/[^a-z]/g, "");

    const rows = (projects ?? []).map((p) => {
      const history = allSyncs.filter((s) => s.project_id === p.id);
      const latest = history[0] ?? null;
      const credential =
        credentials.find(
          (c) => c.jurisdiction && norm(c.jurisdiction) === norm(p.jurisdiction),
        ) ??
        credentials.find(
          (c) =>
            c.jurisdiction &&
            norm(p.jurisdiction).length > 3 &&
            norm(c.jurisdiction).includes(norm(p.jurisdiction)),
        ) ??
        null;

      const findingCount = Array.isArray(latest?.findings) ? latest!.findings.length : 0;
      const lastAt = latest?.updated_at ?? latest?.created_at ?? null;
      const ageDays = lastAt ? (now - new Date(lastAt).getTime()) / 86_400_000 : null;

      let health: HarvestHealth;
      if (!latest) health = "awaiting";
      else if (latest.status === "error" || latest.error) health = "failed";
      else if (latest.status === "searching" || latest.status === "scraping") health = "partial";
      else if (findingCount === 0) health = "blocked";
      else if (ageDays !== null && ageDays > STALE_DAYS) health = "stale";
      else health = "synced";

      return {
        project_id: p.id,
        project_name: p.name,
        jurisdiction: p.jurisdiction,
        location: p.location,
        project_type: p.project_type,
        project_status: p.status,
        permit_number: p.linked_permit_number,
        permit_url: p.linked_permit_url,
        health,
        portal_name: latest?.portal_name || credential?.label || null,
        portal_url: latest?.portal_url || latest?.source_url || credential?.portal_url || null,
        summary: latest?.summary ?? null,
        error: latest?.error ?? null,
        finding_count: findingCount,
        last_checked_at: lastAt,
        check_count: history.length,
        credential_id: credential?.id ?? null,
        credential_label: credential?.label ?? null,
        credential_kind: credential?.kind ?? null,
        credential_verified_at: credential?.last_verified_at ?? null,
      };
    });

    const recent = rows
      .filter((r) => r.last_checked_at)
      .sort(
        (a, b) =>
          new Date(b.last_checked_at!).getTime() - new Date(a.last_checked_at!).getTime(),
      )
      .slice(0, 6);

    return {
      rows,
      recent,
      credentials,
      stats: {
        connected: rows.filter((r) => r.credential_id).length,
        synced: rows.filter((r) => r.health === "synced").length,
        awaiting: rows.filter((r) => r.health === "awaiting").length,
        attention: rows.filter((r) =>
          ["stale", "failed", "partial", "blocked"].includes(r.health),
        ).length,
        jurisdictions: new Set(rows.map((r) => norm(r.jurisdiction)).filter(Boolean)).size,
        checks_recorded: allSyncs.length,
      },
      stale_days: STALE_DAYS,
    };
  });
