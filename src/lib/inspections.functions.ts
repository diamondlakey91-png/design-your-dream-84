import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const INSPECTION_STATUSES = ["scheduled", "passed", "failed", "rescheduled", "canceled"] as const;

export const listInspections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("inspections")
      .select("*")
      .eq("project_id", data.project_id)
      .order("scheduled_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    project_id: z.string().uuid(),
    inspection_type: z.string().min(1).max(120),
    scheduled_date: z.string().nullable().optional(),
    inspector: z.string().max(120).optional().default(""),
    permit_item_id: z.string().uuid().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("inspections")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        inspection_type: data.inspection_type,
        scheduled_date: data.scheduled_date ?? null,
        inspector: data.inspector ?? "",
        permit_item_id: data.permit_item_id ?? null,
        status: "scheduled",
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Inspection scheduled: ${data.inspection_type}${data.scheduled_date ? ` for ${data.scheduled_date}` : ""}`,
    });
    return row;
  });

export const updateInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(INSPECTION_STATUSES).optional(),
    scheduled_date: z.string().nullable().optional(),
    result_date: z.string().nullable().optional(),
    notes: z.string().max(2000).optional(),
    inspector: z.string().max(120).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const patch: {
      status?: (typeof INSPECTION_STATUSES)[number];
      scheduled_date?: string | null;
      result_date?: string | null;
      notes?: string;
      inspector?: string;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.scheduled_date !== undefined) patch.scheduled_date = data.scheduled_date;
    if (data.result_date !== undefined) patch.result_date = data.result_date;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.inspector !== undefined) patch.inspector = data.inspector;
    if (data.status === "passed" || data.status === "failed") {
      patch.result_date = data.result_date ?? new Date().toISOString().slice(0, 10);
    }
    const { data: row, error } = await context.supabase
      .from("inspections").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    if (data.status) {
      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: row.project_id,
        description: `Inspection "${row.inspection_type}" → ${data.status}`,
      });
    }
    return row;
  });

export const deleteInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("inspections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateInspectionFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    checklist: z.array(z.object({
      id: z.string(),
      label: z.string(),
      checked: z.boolean(),
      failed: z.boolean().optional().default(false),
      note: z.string().optional().default(""),
    })).optional(),
    photos: z.array(z.object({ path: z.string(), caption: z.string().optional().default("") })).optional(),
    notes: z.string().max(4000).optional(),
    result: z.string().max(40).optional(),
    status: z.enum(["scheduled", "passed", "failed", "rescheduled", "canceled"]).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const patch: {
      checklist?: typeof data.checklist;
      photos?: typeof data.photos;
      notes?: string;
      result?: string;
      status?: typeof data.status;
      result_date?: string;
    } = {};
    if (data.checklist !== undefined) patch.checklist = data.checklist;
    if (data.photos !== undefined) patch.photos = data.photos;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.result !== undefined) patch.result = data.result;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "passed" || data.status === "failed") {
        patch.result_date = new Date().toISOString().slice(0, 10);
      }
    }
    const { data: row, error } = await context.supabase
      .from("inspections")
      .update(patch as never)
      .eq("id", data.id)
      .select("*").single();
    if (error) throw new Error(error.message);
    if (data.status) {
      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: row.project_id,
        description: `Inspection "${row.inspection_type}" marked ${data.status}.`,
      });
    }
    return row;
  });

export const getInspection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("inspections").select("*, projects(name, jurisdiction, location)").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Inspection not found");
    // Sign each photo path
    const photos = Array.isArray(row.photos) ? row.photos as Array<{ path: string; caption?: string }> : [];
    const signed = await Promise.all(photos.map(async (p) => {
      const { data: s } = await context.supabase.storage.from("project-docs").createSignedUrl(p.path, 3600);
      return { ...p, url: s?.signedUrl ?? null };
    }));
    return { ...row, photos: signed };
  });
