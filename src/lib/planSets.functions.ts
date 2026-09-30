// PERMIVIO — plan set library.
//
// A searchable record of every plan set that has been uploaded, so a past set
// can be found by jurisdiction, project type, discipline, sheet number or tag
// and reused on a new project instead of being re-uploaded from scratch.
//
// Reuse copies the document records into the target project; the stored files
// themselves are never duplicated or altered.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlanSetSheet = {
  id: string;
  sheet_number: string | null;
  sheet_title: string | null;
  discipline: string | null;
  revision_number: string | null;
  revision_date: string | null;
  page_index: number | null;
  document_id: string | null;
};

export type PlanSet = {
  id: string;
  project_id: string | null;
  title: string;
  jurisdiction: string | null;
  project_type: string | null;
  occupancy: string | null;
  revision_label: string | null;
  issue_date: string | null;
  sheet_count: number;
  disciplines: string[];
  tags: string[];
  notes: string | null;
  document_ids: string[];
  reused_from_id: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

const SearchInput = z.object({
  q: z.string().max(200).optional(),
  jurisdiction: z.string().max(120).optional(),
  discipline: z.string().max(60).optional(),
  project_type: z.string().max(120).optional(),
  sheet_number: z.string().max(40).optional(),
  include_archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/** Search the plan set library. Only sets the caller can access are returned. */
export const searchPlanSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let matchingIds: string[] | null = null;
    if (data.sheet_number?.trim()) {
      const { data: sheets } = await supabase
        .from("plan_set_sheets")
        .select("plan_set_id")
        .ilike("sheet_number", `%${data.sheet_number.trim()}%`)
        .limit(500);
      matchingIds = [...new Set((sheets ?? []).map((s) => s.plan_set_id))];
      if (!matchingIds.length) return { sets: [] as PlanSet[], projects: [] as Array<{ id: string; name: string }> };
    }

    let query = supabase
      .from("plan_sets")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 50);

    if (!data.include_archived) query = query.eq("archived", false);
    if (matchingIds) query = query.in("id", matchingIds);
    if (data.jurisdiction?.trim()) query = query.ilike("jurisdiction", `%${data.jurisdiction.trim()}%`);
    if (data.project_type?.trim()) query = query.ilike("project_type", `%${data.project_type.trim()}%`);
    if (data.discipline?.trim()) query = query.contains("disciplines", [data.discipline.trim()]);
    if (data.q?.trim()) {
      const t = data.q.trim().replace(/[,%]/g, " ");
      query = query.or(
        [`title.ilike.%${t}%`, `jurisdiction.ilike.%${t}%`, `project_type.ilike.%${t}%`, `notes.ilike.%${t}%`].join(","),
      );
    }

    const { data: sets, error } = await query;
    if (error) throw new Error(error.message);

    const { data: projects } = await supabase.from("projects").select("id, name").order("name");
    return { sets: (sets ?? []) as unknown as PlanSet[], projects: (projects ?? []) as Array<{ id: string; name: string }> };
  });

/** One plan set with its full sheet index. */
export const getPlanSet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: set, error }, { data: sheets }, { data: docs }] = await Promise.all([
      supabase.from("plan_sets").select("*").eq("id", data.id).maybeSingle(),
      supabase
        .from("plan_set_sheets")
        .select("id, sheet_number, sheet_title, discipline, revision_number, revision_date, page_index, document_id")
        .eq("plan_set_id", data.id)
        .order("sheet_number"),
      supabase.from("project_documents").select("id, name, size_bytes, created_at").limit(200),
    ]);
    if (error) throw new Error(error.message);
    if (!set) throw new Error("That plan set could not be found.");
    const ids = new Set(((set as unknown as PlanSet).document_ids ?? []) as string[]);
    return {
      set: set as unknown as PlanSet,
      sheets: (sheets ?? []) as PlanSetSheet[],
      documents: (docs ?? []).filter((d) => ids.has(d.id)),
    };
  });

const SaveInput = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(200),
  jurisdiction: z.string().max(160).nullable().optional(),
  project_type: z.string().max(160).nullable().optional(),
  occupancy: z.string().max(120).nullable().optional(),
  revision_label: z.string().max(80).nullable().optional(),
  issue_date: z.string().max(20).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  notes: z.string().max(4000).nullable().optional(),
  document_ids: z.array(z.string().uuid()).max(50).optional(),
  source_review_id: z.string().uuid().nullable().optional(),
  archived: z.boolean().optional(),
});

/**
 * Create or update a plan set entry. When documents are supplied, the sheet
 * index is rebuilt from whatever the Plan QA/QC inventory already recorded for
 * those documents — no sheet is invented.
 */
export const savePlanSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const documentIds = data.document_ids ?? [];

    // Pull any sheet inventory Plan QA/QC already produced for these documents.
    let sheetRows: Array<{
      document_id: string | null;
      sheet_number: string | null;
      sheet_title: string | null;
      discipline: string | null;
      revision_number: string | null;
      revision_date: string | null;
    }> = [];
    if (documentIds.length) {
      const { data: rows } = await supabase
        .from("qaqc_sheets")
        .select("document_id, sheet_number, sheet_title, discipline, revision_number, revision_date")
        .in("document_id", documentIds);
      sheetRows = rows ?? [];
    }

    const seen = new Set<string>();
    const sheets = sheetRows.filter((r) => {
      const key = `${r.document_id ?? ""}|${r.sheet_number ?? ""}|${r.sheet_title ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const disciplines = [...new Set(sheets.map((s) => s.discipline).filter((d): d is string => !!d))];

    const payload = {
      project_id: data.project_id ?? null,
      title: data.title,
      jurisdiction: data.jurisdiction ?? null,
      project_type: data.project_type ?? null,
      occupancy: data.occupancy ?? null,
      revision_label: data.revision_label ?? null,
      issue_date: data.issue_date?.trim() ? data.issue_date : null,
      tags: data.tags ?? [],
      notes: data.notes ?? null,
      document_ids: documentIds,
      source_review_id: data.source_review_id ?? null,
      sheet_count: sheets.length,
      disciplines,
      ...(data.archived === undefined ? {} : { archived: data.archived }),
    };

    let setId = data.id ?? null;
    if (setId) {
      const { error } = await supabase.from("plan_sets").update(payload).eq("id", setId);
      if (error) throw new Error(error.message);
      await supabase.from("plan_set_sheets").delete().eq("plan_set_id", setId);
    } else {
      const { data: row, error } = await supabase
        .from("plan_sets")
        .insert({ ...payload, user_id: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      setId = row.id;
    }

    if (sheets.length && setId) {
      const { error } = await supabase.from("plan_set_sheets").insert(
        sheets.map((s, i) => ({
          plan_set_id: setId!,
          user_id: userId,
          document_id: s.document_id,
          sheet_number: s.sheet_number,
          sheet_title: s.sheet_title,
          discipline: s.discipline,
          revision_number: s.revision_number,
          revision_date: s.revision_date,
          page_index: i,
        })),
      );
      if (error) throw new Error(error.message);
    }

    return { ok: true, id: setId, sheet_count: sheets.length };
  });

/**
 * Reuse a past plan set on another project: the document records are attached
 * to the target project and a linked library entry is created. The underlying
 * files are shared, not copied.
 */
export const reusePlanSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ plan_set_id: z.string().uuid(), project_id: z.string().uuid(), revision_label: z.string().max(80).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: set } = await supabase.from("plan_sets").select("*").eq("id", data.plan_set_id).maybeSingle();
    if (!set) throw new Error("That plan set could not be found.");
    const source = set as unknown as PlanSet;

    const { data: project } = await supabase.from("projects").select("id, name, location").eq("id", data.project_id).maybeSingle();
    if (!project) throw new Error("You do not have access to that project.");

    const { data: docs } = await supabase
      .from("project_documents")
      .select("name, storage_path, mime_type, size_bytes, stage")
      .in("id", source.document_ids.length ? source.document_ids : ["00000000-0000-0000-0000-000000000000"]);

    let newDocIds: string[] = [];
    if (docs?.length) {
      const { data: inserted, error } = await supabase
        .from("project_documents")
        .insert(
          docs.map((d) => ({
            user_id: userId,
            project_id: data.project_id,
            name: d.name,
            storage_path: d.storage_path,
            mime_type: d.mime_type,
            size_bytes: d.size_bytes,
            stage: d.stage,
          })),
        )
        .select("id");
      if (error) throw new Error(error.message);
      newDocIds = (inserted ?? []).map((r) => r.id);
    }

    const { data: created, error: setError } = await supabase
      .from("plan_sets")
      .insert({
        user_id: userId,
        project_id: data.project_id,
        title: `${source.title} — reused on ${project.name}`,
        jurisdiction: source.jurisdiction,
        project_type: source.project_type,
        occupancy: source.occupancy,
        revision_label: data.revision_label ?? source.revision_label,
        tags: source.tags,
        notes: source.notes,
        document_ids: newDocIds,
        sheet_count: source.sheet_count,
        disciplines: source.disciplines,
        reused_from_id: source.id,
      })
      .select("id")
      .single();
    if (setError) throw new Error(setError.message);

    const { data: sheets } = await supabase
      .from("plan_set_sheets")
      .select("sheet_number, sheet_title, discipline, revision_number, revision_date, page_index")
      .eq("plan_set_id", source.id);
    if (sheets?.length) {
      await supabase.from("plan_set_sheets").insert(
        sheets.map((s) => ({ ...s, plan_set_id: created.id, user_id: userId })),
      );
    }

    await supabase.from("activity").insert({
      user_id: userId,
      project_id: data.project_id,
      description: `Reused plan set "${source.title}" (${newDocIds.length} file${newDocIds.length === 1 ? "" : "s"}) from the plan library.`,
    });

    return { ok: true, id: created.id, documents_attached: newDocIds.length };
  });

/** Documents available to index into a plan set, for one project. */
export const listProjectPlanDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: docs, error } = await context.supabase
      .from("project_documents")
      .select("id, name, size_bytes, mime_type, created_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { documents: docs ?? [] };
  });

export const deletePlanSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("plan_sets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
