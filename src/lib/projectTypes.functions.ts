import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

// ---------- Types (public DTOs) ----------
export type ProjectTypeCategoryDTO = {
  id: string;
  category_name: string;
  description: string | null;
  icon: string | null;
  display_order: number;
};

export type ProjectTypeDTO = {
  id: string;
  category_id: string;
  category_name: string;
  client_label: string;
  internal_name: string;
  short_description: string | null;
  residential_or_commercial: "residential" | "commercial" | "mixed_use";
  common_scope_triggers: string[];
  follow_up_question_ids: string[];
  possible_permit_categories: string[];
  possible_agency_categories: string[];
  possible_document_categories: string[];
  display_order: number;
  aliases: string[];
};

// ---------- Publishable server client ----------
function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

// ---------- List catalog (public read) ----------
export const listProjectTypes = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [{ data: cats, error: cErr }, { data: types, error: tErr }, { data: aliases, error: aErr }] = await Promise.all([
    sb.from("project_type_categories").select("id, category_name, description, icon, display_order").eq("active_status", true).order("display_order"),
    sb.from("project_types").select("id, category_id, client_label, internal_name, short_description, residential_or_commercial, common_scope_triggers, follow_up_question_ids, possible_permit_categories, possible_agency_categories, possible_document_categories, display_order").eq("active_status", true).order("display_order"),
    sb.from("project_type_aliases").select("project_type_id, alias"),
  ]);
  if (cErr || tErr || aErr) throw new Error(cErr?.message || tErr?.message || aErr?.message || "Catalog fetch failed");

  const catMap = new Map((cats ?? []).map((c) => [c.id, c.category_name]));
  const aliasMap = new Map<string, string[]>();
  for (const row of aliases ?? []) {
    const list = aliasMap.get(row.project_type_id) ?? [];
    list.push(row.alias);
    aliasMap.set(row.project_type_id, list);
  }
  const dto: ProjectTypeDTO[] = (types ?? []).map((t) => ({
    id: t.id,
    category_id: t.category_id,
    category_name: catMap.get(t.category_id) ?? "Other",
    client_label: t.client_label,
    internal_name: t.internal_name,
    short_description: t.short_description,
    residential_or_commercial: t.residential_or_commercial as ProjectTypeDTO["residential_or_commercial"],
    common_scope_triggers: (t.common_scope_triggers ?? []) as string[],
    follow_up_question_ids: (t.follow_up_question_ids ?? []) as string[],
    possible_permit_categories: (t.possible_permit_categories ?? []) as string[],
    possible_agency_categories: (t.possible_agency_categories ?? []) as string[],
    possible_document_categories: (t.possible_document_categories ?? []) as string[],
    display_order: t.display_order,
    aliases: aliasMap.get(t.id) ?? [],
  }));

  const catDto: ProjectTypeCategoryDTO[] = (cats ?? []).map((c) => ({
    id: c.id,
    category_name: c.category_name,
    description: c.description,
    icon: c.icon,
    display_order: c.display_order,
  }));

  return { categories: catDto, types: dto };
});

// ---------- Save project type selection ----------
const SetInput = z.object({
  project_id: z.string().uuid(),
  primary_project_type_id: z.string().uuid().nullable(),
  additional_project_type_ids: z.array(z.string().uuid()).default([]),
  custom_project_type_description: z.string().max(500).optional().nullable(),
  source: z.enum(["user_selected", "ai_recommended", "document_extracted", "imported", "admin_selected"]).default("user_selected"),
  confidence: z.number().min(0).max(1).optional().nullable(),
});

export const setProjectTypeForProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Also update the legacy text field with the client_label of the primary type for back-compat display.
    let legacyLabel: string | null = null;
    if (data.primary_project_type_id) {
      const { data: t } = await supabase.from("project_types").select("client_label").eq("id", data.primary_project_type_id).maybeSingle();
      legacyLabel = t?.client_label ?? null;
    } else if (data.custom_project_type_description) {
      legacyLabel = data.custom_project_type_description.slice(0, 80);
    }

    const patch = {
      primary_project_type_id: data.primary_project_type_id,
      additional_project_type_ids: data.additional_project_type_ids,
      custom_project_type_description: data.custom_project_type_description ?? null,
      project_type_source: data.source,
      project_type_confidence: data.confidence ?? null,
      project_type_confirmed_at: new Date().toISOString(),
      project_type_confirmed_by: userId,
      ...(legacyLabel ? { project_type: legacyLabel } : {}),
    };

    const { error } = await supabase.from("projects").update(patch).eq("id", data.project_id);
    if (error) throw new Error(error.message);

    // Mirror onto scope_of_work if the row exists
    await supabase
      .from("scope_of_work")
      .update({
        primary_project_type_id: data.primary_project_type_id,
        additional_project_type_ids: data.additional_project_type_ids,
      })
      .eq("project_id", data.project_id);

    return { ok: true };
  });

// ---------- Legacy backfill (admin) ----------
export const backfillProjectTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const [{ data: types }, { data: aliases }] = await Promise.all([
      supabase.from("project_types").select("id, client_label, internal_name"),
      supabase.from("project_type_aliases").select("project_type_id, alias"),
    ]);
    if (!types) return { mapped: 0, unmatched: 0 };

    const pairs: Array<[string, string]> = [];
    for (const t of types) {
      pairs.push([t.client_label.toLowerCase(), t.id]);
      pairs.push([t.internal_name.toLowerCase(), t.id]);
    }
    for (const a of aliases ?? []) pairs.push([a.alias.toLowerCase(), a.project_type_id]);

    const { data: projects } = await supabase
      .from("projects")
      .select("id, project_type, primary_project_type_id")
      .is("primary_project_type_id", null);

    let mapped = 0;
    let unmatched = 0;
    for (const p of projects ?? []) {
      const raw = (p.project_type ?? "").trim().toLowerCase();
      if (!raw) { unmatched++; continue; }
      const hit = pairs.find(([k]) => k === raw) ?? pairs.find(([k]) => raw.includes(k) || k.includes(raw));
      if (!hit) { unmatched++; continue; }
      await supabase.from("projects").update({
        primary_project_type_id: hit[1],
        project_type_source: "imported",
        project_type_confidence: 0.9,
      }).eq("id", p.id);
      mapped++;
    }
    return { mapped, unmatched };
  });
