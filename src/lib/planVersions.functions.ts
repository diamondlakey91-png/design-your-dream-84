// PERMIVIO — project plan-set versions (Phase 2B).
// Versions are additive: making a set current never deletes older sets, sheets,
// reviews or findings. Historical reviews stay linked via plan_sets.source_review_id.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProjectPlanSets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sets, error } = await context.supabase
      .from("plan_sets")
      .select("id,title,version_number,is_current,superseded_at,issue_date,revision_label,document_ids,sheet_count,source_review_id,created_at, plan_set_sheets(id,sheet_number,sheet_title,discipline,page_index,document_id)")
      .eq("project_id", data.project_id)
      .eq("archived", false)
      .order("version_number", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return sets ?? [];
  });

export const createPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      document_ids: z.array(z.string().uuid()).min(1).max(100),
      revision_date: z.string().max(20).nullable().optional(),
      make_current: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const ok = await sb.rpc("can_write_project", { _project_id: data.project_id });
    if (!ok.data) throw new Error("You can't edit this project");
    const { data: docs } = await sb.from("project_documents").select("id").eq("project_id", data.project_id).in("id", data.document_ids);
    if ((docs ?? []).length !== data.document_ids.length) throw new Error("Every file must belong to this project");
    const { data: prev } = await sb.from("plan_sets").select("version_number").eq("project_id", data.project_id).order("version_number", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const version = (prev?.version_number ?? 0) + 1;
    // reuse existing sheet extraction (Plan QA/QC) — never re-run ingestion here
    const { data: sheets } = await sb.from("qaqc_sheets").select("document_id,sheet_number,sheet_title,discipline,revision_number,revision_date").in("document_id", data.document_ids);
    const disciplines = [...new Set((sheets ?? []).map((x) => x.discipline).filter((d): d is string => !!d))];
    const { data: row, error } = await sb.from("plan_sets").insert({
      user_id: context.userId,
      project_id: data.project_id,
      title: data.title?.trim() || `Plan Set V${version}`,
      version_number: version,
      revision_label: `V${version}`,
      issue_date: data.revision_date?.trim() ? data.revision_date : null,
      document_ids: data.document_ids,
      sheet_count: (sheets ?? []).length,
      disciplines,
    }).select("id").single();
    if (error) throw new Error(error.message);
    if ((sheets ?? []).length) {
      await sb.from("plan_set_sheets").insert((sheets ?? []).map((x, i) => ({ ...x, plan_set_id: row.id, user_id: context.userId, page_index: i })));
    }
    if (data.make_current) await makeCurrent(sb, data.project_id, row.id);
    return { id: row.id, version };
  });

async function makeCurrent(sb: any, projectId: string, setId: string) {
  const now = new Date().toISOString();
  const { error: e1 } = await sb.from("plan_sets").update({ is_current: false, superseded_at: now }).eq("project_id", projectId).eq("is_current", true).neq("id", setId);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await sb.from("plan_sets").update({ is_current: true, superseded_at: null }).eq("id", setId).eq("project_id", projectId);
  if (e2) throw new Error(e2.message);
}

export const setCurrentPlanSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid(), plan_set_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: set } = await context.supabase.from("plan_sets").select("id").eq("id", data.plan_set_id).eq("project_id", data.project_id).maybeSingle();
    if (!set) throw new Error("Plan set not found on this project");
    await makeCurrent(context.supabase, data.project_id, data.plan_set_id);
    return { ok: true };
  });

/** Correct an extracted sheet's number/title/discipline. */
export const updatePlanSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      sheet_number: z.string().max(40).nullable().optional(),
      sheet_title: z.string().max(200).nullable().optional(),
      discipline: z.string().max(60).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase.from("plan_set_sheets").update(patch).eq("id", id).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sheet not found");
    return { ok: true };
  });
