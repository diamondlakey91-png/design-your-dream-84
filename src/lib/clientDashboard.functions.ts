import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Read-only aggregation for the simplified client dashboard.
 *
 * Reuses the existing project, checklist, deadline, inspection, document, and
 * activity tables — nothing new is stored. Translation into plain language
 * happens in src/lib/clientView.ts so the professional views keep raw fields.
 */
export const getClientDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [profile, projects, items, deadlines, inspections, docs, activity, featured] = await Promise.all([
      context.supabase
        .from("user_settings")
        .select("full_name,company")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("projects")
        .select("id,name,status,current_stage,jurisdiction,location,project_type,permit_count,permits_issued,created_at,updated_at")
        .order("updated_at", { ascending: false }),
      context.supabase
        .from("permit_items")
        .select("id,project_id,name,category,status,required,due_date,notes"),
      context.supabase.from("deadlines").select("id,project_id,title,due_date"),
      context.supabase.from("inspections").select("id,project_id,status,inspection_type"),
      context.supabase.from("project_documents").select("id,project_id"),
      context.supabase
        .from("activity")
        .select("id,project_id,description,created_at")
        .order("created_at", { ascending: false })
        .limit(40),
      // Featured client-facing reports for the Tools & Reports card. Pricing and
      // turnaround always come from the configured product records.
      context.supabase
        .from("service_products")
        .select("id,product_key,client_title,client_question,base_price_cents,currency,turnaround_estimate")
        .eq("active", true)
        .eq("category", "feasibility")
        .order("display_order"),
    ]);

    const firstError = [projects.error, items.error, deadlines.error, inspections.error, docs.error, activity.error].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    return {
      profile: { full_name: profile.data?.full_name ?? null, company: profile.data?.company ?? null },
      projects: projects.data ?? [],
      items: items.data ?? [],
      deadlines: deadlines.data ?? [],
      inspections: inspections.data ?? [],
      documents: docs.data ?? [],
      activity: activity.data ?? [],
      featuredProducts: featured.data ?? [],
    };
  });

/** Same signals, scoped to one project, for the client project view. */
export const getClientProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const pid = data.project_id;
    const [items, deadlines, inspections, docs, activity] = await Promise.all([
      context.supabase
        .from("permit_items")
        .select("id,project_id,name,category,status,required,due_date,notes")
        .eq("project_id", pid),
      context.supabase.from("deadlines").select("id,project_id,title,due_date").eq("project_id", pid),
      context.supabase.from("inspections").select("id,project_id,status,inspection_type").eq("project_id", pid),
      context.supabase.from("project_documents").select("id,project_id").eq("project_id", pid),
      context.supabase
        .from("activity")
        .select("id,project_id,description,created_at")
        .eq("project_id", pid)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    const firstError = [items.error, deadlines.error, inspections.error, docs.error, activity.error].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    return {
      items: items.data ?? [],
      deadlines: deadlines.data ?? [],
      inspections: inspections.data ?? [],
      documentCount: (docs.data ?? []).length,
      activity: activity.data ?? [],
    };
  });
