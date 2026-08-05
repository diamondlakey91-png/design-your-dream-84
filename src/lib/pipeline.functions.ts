import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildPipelineStages } from "./pipeline.server";

export const getIntakePipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [p, docs, items, syncs] = await Promise.all([
      sb
        .from("projects")
        .select("id,name,jurisdiction,location,linked_permit_number,linked_permit_synced_at")
        .eq("id", data.project_id)
        .maybeSingle(),
      sb
        .from("project_documents")
        .select("ai_summary,analyzed_at,plan_review,plan_reviewed_at")
        .eq("project_id", data.project_id),
      sb.from("permit_items").select("status,required").eq("project_id", data.project_id),
      sb
        .from("jurisdiction_syncs")
        .select("status,portal_name,created_at")
        .eq("project_id", data.project_id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (p.error) throw new Error(p.error.message);
    if (!p.data) throw new Error("Project not found");

    return {
      project: { id: p.data.id, name: p.data.name, jurisdiction: p.data.jurisdiction },
      stages: buildPipelineStages({
        project: p.data,
        documents: docs.data ?? [],
        items: items.data ?? [],
        latestSync: syncs.data?.[0] ?? null,
      }),
    };
  });
