import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getEntitlement, requireProjectQuota } from "@/lib/entitlements";

// ---- Projects ----
export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [p, act] = await Promise.all([
      context.supabase.from("projects").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("activity")
        .select("*")
        .eq("project_id", data.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (p.error) throw new Error(p.error.message);
    return { project: p.data, activity: act.data ?? [] };
  });

const CreateProjectInput = z.object({
  name: z.string().min(1).max(200),
  location: z.string().max(200).default(""),
  project_type: z.string().max(80).default("Commercial"),
  jurisdiction: z.string().max(200).default(""),
  permit_count: z.number().int().min(0).max(50).default(3),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const ent = await getEntitlement(context.supabase, context.userId);
    await requireProjectQuota(context.supabase, context.userId, ent);
    const { data: row, error } = await context.supabase

      .from("projects")
      .insert({
        user_id: context.userId,
        name: data.name,
        location: data.location,
        project_type: data.project_type,
        jurisdiction: data.jurisdiction,
        permit_count: data.permit_count,
        permits_issued: 0,
        current_stage: 0,
        status: "Pre-Planning",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: row.id,
      description: `Project "${row.name}" created.`,
    });
    return row;
  });

const UpdateProjectInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().max(200).optional(),
  project_type: z.string().trim().max(80).optional(),
  jurisdiction: z.string().trim().max(200).optional(),
  permit_count: z.number().int().min(0).max(50).optional(),
});

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: eErr } = await context.supabase
      .from("projects").select("id, user_id, jurisdiction, name, location, project_type, permit_count")
      .eq("id", data.id).maybeSingle();
    if (eErr) throw new Error(eErr.message);
    if (!existing) throw new Error("Project not found");
    if (existing.user_id !== context.userId) throw new Error("Forbidden");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const changes: string[] = [];
    (["name", "location", "project_type", "jurisdiction", "permit_count"] as const).forEach((k) => {
      if (data[k] !== undefined && data[k] !== (existing as any)[k]) {
        patch[k] = data[k];
        changes.push(`${k.replace("_", " ")} → ${data[k]}`);
      }
    });

    if (Object.keys(patch).length === 1) return existing;

    const { data: updated, error } = await context.supabase
      .from("projects").update(patch as any).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.id,
      description: `Project updated: ${changes.join(", ")}`,
    });
    return updated;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify ownership
    const { data: proj, error: pErr } = await context.supabase
      .from("projects").select("id, user_id, name").eq("id", data.id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proj) throw new Error("Project not found");
    if (proj.user_id !== context.userId) throw new Error("Forbidden");

    // Delete related rows first (in case FKs don't cascade)
    const tables = [
      "activity", "deadlines", "permit_items", "project_documents",
      "inspections", "chat_messages", "chat_threads", "permit_analyses",
      "jurisdiction_syncs", "permit_sync_history", "report_shares",
    ] as const;
    for (const t of tables) {
      await (context.supabase as any).from(t).delete().eq("project_id", data.id);
    }

    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const advanceStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase
      .from("projects").select("*").eq("id", data.id).maybeSingle();
    if (!p) throw new Error("Project not found");
    const next = Math.min(4, p.current_stage + 1);
    const stageNames = ["Pre-Planning", "Plans Submitted", "In Review", "Approved", "Issued"];
    const permits_issued = next === 4 ? p.permit_count : p.permits_issued;
    const { data: updated, error } = await context.supabase
      .from("projects")
      .update({ current_stage: next, status: stageNames[next], permits_issued, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.id,
      description: `Advanced to ${stageNames[next]}.`,
    });
    return updated;
  });

// ---- Deadlines ----
export const listDeadlines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("deadlines")
      .select("*, projects(name)")
      .order("due_date", { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      title: z.string().min(1).max(200),
      due_date: z.string(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("deadlines")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        title: data.title,
        due_date: data.due_date,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Deadline added: ${data.title} (due ${data.due_date})`,
    });
    return row;
  });

export const deleteDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("deadlines").select("title, project_id").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("deadlines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.project_id) {
      await context.supabase.from("activity").insert({
        user_id: context.userId,
        project_id: row.project_id,
        description: `Deadline removed: ${row.title}`,
      });
    }
    return { ok: true };
  });

// ---- Activity timeline ----
export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("activity")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---- Project health score ----
export const computeProjectHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [proj, items, dls, insp] = await Promise.all([
      context.supabase.from("projects").select("current_stage, permit_count, permits_issued").eq("id", data.project_id).maybeSingle(),
      context.supabase.from("permit_items").select("status, required").eq("project_id", data.project_id),
      context.supabase.from("deadlines").select("due_date").eq("project_id", data.project_id),
      context.supabase.from("inspections").select("status").eq("project_id", data.project_id),
    ]);
    const project = proj.data;
    const permits = items.data ?? [];
    const deadlines = dls.data ?? [];
    const inspections = insp.data ?? [];

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdue = deadlines.filter((d) => d.due_date && new Date(d.due_date) < today).length;
    const upcoming7 = deadlines.filter((d) => {
      if (!d.due_date) return false;
      const diff = (new Date(d.due_date).getTime() - today.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length;

    const requiredCount = permits.filter((p) => p.required).length || permits.length;
    const doneCount = permits.filter((p) => p.status === "issued" || p.status === "approved").length;
    const notStarted = permits.filter((p) => p.status === "not_started").length;
    const inspFailed = inspections.filter((i) => i.status === "failed").length;
    const inspPassed = inspections.filter((i) => i.status === "passed").length;

    // Score: start 100, subtract penalties
    let score = 100;
    score -= overdue * 12;
    score -= upcoming7 * 3;
    score -= inspFailed * 8;
    if (requiredCount > 0) {
      const stalled = notStarted / requiredCount;
      score -= Math.round(stalled * 20);
      const progress = doneCount / requiredCount;
      score += Math.round((progress - 0.5) * 10); // bonus for >50% done, penalty <50%
    }
    if (project && project.permit_count > 0 && project.permits_issued === project.permit_count) score = Math.max(score, 92);
    score = Math.max(0, Math.min(100, score));

    let risk: "low" | "medium" | "high" = "low";
    if (score < 50 || overdue >= 2 || inspFailed >= 2) risk = "high";
    else if (score < 75 || overdue >= 1 || inspFailed >= 1 || upcoming7 >= 3) risk = "medium";

    const reasons: string[] = [];
    if (overdue) reasons.push(`${overdue} overdue deadline${overdue === 1 ? "" : "s"}`);
    if (upcoming7) reasons.push(`${upcoming7} due this week`);
    if (inspFailed) reasons.push(`${inspFailed} failed inspection${inspFailed === 1 ? "" : "s"}`);
    if (inspPassed) reasons.push(`${inspPassed} passed inspection${inspPassed === 1 ? "" : "s"}`);
    if (requiredCount > 0) reasons.push(`${doneCount}/${requiredCount} permits complete`);
    if (reasons.length === 0) reasons.push("No signals yet — add checklist items and deadlines.");

    return { score, risk, reasons, overdue, upcoming7, inspFailed, inspPassed, requiredCount, doneCount };
  });
