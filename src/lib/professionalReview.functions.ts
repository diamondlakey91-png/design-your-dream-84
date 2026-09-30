import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const requestProfessionalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      project_id: z.string().uuid().optional(),
      target_type: z.enum(["qaqc_review", "site_investigation", "qaqc_finding"]),
      target_id: z.string().uuid(),
      requested_notes: z.string().max(2000).optional(),
      reviewer_name: z.string().max(160).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // Reviewer identity is reviewer-controlled; a customer's preferred reviewer is kept as a request note.
    const pref = data.reviewer_name?.trim();
    const notes = [pref ? `Preferred reviewer: ${pref}` : null, data.requested_notes?.trim() || null]
      .filter(Boolean)
      .join("\n") || null;
    const { data: row, error } = await sb
      .from("professional_reviews")
      .insert({
        user_id: context.userId,
        project_id: data.project_id ?? null,
        target_type: data.target_type,
        target_id: data.target_id,
        requested_notes: notes,
        status: "requested",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (data.project_id) {
      await sb.from("activity").insert({
        project_id: data.project_id,
        user_id: context.userId,
        description: `Human professional review requested for ${data.target_type.replace(/_/g, " ")}`,
      });
    }
    return { review: row };
  });

export const listProfessionalReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("professional_reviews").select("*").order("created_at", { ascending: false }).limit(100);
    if (data.project_id) q = q.eq("project_id", data.project_id);
    const { data: rows } = await q;
    return { reviews: rows ?? [] };
  });

/** Reviewer/admin only — customers cannot set status, reviewer or reviewer notes. */
export const updateProfessionalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["requested", "in_review", "completed", "declined"]),
      reviewer_name: z.string().max(160).optional(),
      reviewer_notes: z.string().max(4000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only Permivio reviewers can update a professional review.");
    const { error } = await context.supabase
      .from("professional_reviews")
      .update({
        status: data.status,
        reviewer_name: data.reviewer_name ?? null,
        reviewer_notes: data.reviewer_notes ?? null,
        reviewed_at: data.status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
