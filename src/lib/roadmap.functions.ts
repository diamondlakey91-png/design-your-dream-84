import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildRoadmapDraft, type ScopeInputForRules } from "./permitRules";

const RULE_ENGINE_VERSION = "rules-v1";

export const generateRoadmapFromRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Load scope
    const { data: scope, error: sErr } = await supabase
      .from("scope_of_work")
      .select("*")
      .eq("project_id", data.project_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!scope) throw new Error("Scope not found — save the intake first.");

    // Run rule engine
    const draft = buildRoadmapDraft(scope as unknown as ScopeInputForRules);

    // Delete any prior roadmaps for this scope (cascade removes children)
    await supabase.from("permit_roadmaps").delete().eq("scope_id", scope.id);

    // Insert roadmap
    const { data: roadmap, error: rErr } = await supabase
      .from("permit_roadmaps")
      .insert({
        scope_id: scope.id,
        project_id: scope.project_id,
        summary: draft.summary,
        health_score: draft.health_score,
        confidence: draft.confidence,
        generated_by_model: "rule-engine",
        prompt_version: RULE_ENGINE_VERSION,
        authority_stack: draft.authority_stack,
      })
      .select("*")
      .single();
    if (rErr) throw new Error(rErr.message);

    // Insert permits (two-pass so we can resolve depends_on keys → uuids)
    const permitRows = draft.permits.map((p) => ({
      roadmap_id: roadmap.id,
      name: p.name,
      agency: p.agency,
      level: p.level,
      category: p.category,
      likelihood: p.likelihood,
      verification: p.verification,
      review_days_min: p.review_days_min,
      review_days_max: p.review_days_max,
      sequence_order: p.sequence_order,
      critical_path: p.critical_path,
      notes: p.notes ?? null,
      source_ids: [] as string[],
      depends_on: [] as string[],
      concurrent_with: [] as string[],
    }));

    const { data: insertedPermits, error: pErr } = await supabase
      .from("roadmap_permits")
      .insert(permitRows)
      .select("id, name, sequence_order");
    if (pErr) throw new Error(pErr.message);

    // Map draft.key → uuid using name+sequence_order alignment
    const keyToId = new Map<string, string>();
    draft.permits.forEach((p, i) => {
      const row = insertedPermits?.[i];
      if (row) keyToId.set(p.key, row.id);
    });

    // Second pass: update depends_on / concurrent_with with uuids
    for (const p of draft.permits) {
      const id = keyToId.get(p.key);
      if (!id) continue;
      const deps = p.depends_on.map((k) => keyToId.get(k)).filter(Boolean) as string[];
      const conc = p.concurrent_with.map((k) => keyToId.get(k)).filter(Boolean) as string[];
      if (deps.length || conc.length) {
        await supabase
          .from("roadmap_permits")
          .update({ depends_on: deps, concurrent_with: conc })
          .eq("id", id);
      }
    }

    // Documents
    if (draft.documents.length) {
      const docRows = draft.documents.map((d) => ({
        roadmap_id: roadmap.id,
        permit_id: d.permit_key ? keyToId.get(d.permit_key) ?? null : null,
        name: d.name,
        description: d.description ?? null,
        required: d.required,
        verification: d.verification,
        source_ids: [] as string[],
      }));
      await supabase.from("roadmap_documents").insert(docRows);
    }

    // Agencies
    if (draft.agencies.length) {
      await supabase.from("roadmap_agencies").insert(
        draft.agencies.map((a) => ({
          roadmap_id: roadmap.id,
          name: a.name,
          level: a.level,
          jurisdiction: a.jurisdiction ?? null,
          role: a.role ?? null,
          verification: a.verification,
        })),
      );
    }

    // Risks
    if (draft.risks.length) {
      await supabase.from("roadmap_risks").insert(
        draft.risks.map((r) => ({
          roadmap_id: roadmap.id,
          severity: r.severity,
          category: r.category ?? null,
          message: r.message,
          mitigation: r.mitigation ?? null,
        })),
      );
    }

    // Follow-ups
    if (draft.followups.length) {
      await supabase.from("roadmap_followups").insert(
        draft.followups.map((f) => ({
          roadmap_id: roadmap.id,
          question: f.question,
          field_hint: f.field_hint ?? null,
        })),
      );
    }

    // Mark scope complete (or needs_followup if there are follow-ups)
    await supabase
      .from("scope_of_work")
      .update({ status: draft.followups.length ? "needs_followup" : "complete" })
      .eq("id", scope.id);

    return { roadmap_id: roadmap.id };
  });

export const getRoadmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: roadmap } = await supabase
      .from("permit_roadmaps")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!roadmap) return { roadmap: null, permits: [], documents: [], agencies: [], risks: [], followups: [] };

    const [permits, documents, agencies, risks, followups] = await Promise.all([
      supabase.from("roadmap_permits").select("*").eq("roadmap_id", roadmap.id).order("sequence_order", { ascending: true }),
      supabase.from("roadmap_documents").select("*").eq("roadmap_id", roadmap.id),
      supabase.from("roadmap_agencies").select("*").eq("roadmap_id", roadmap.id),
      supabase.from("roadmap_risks").select("*").eq("roadmap_id", roadmap.id),
      supabase.from("roadmap_followups").select("*").eq("roadmap_id", roadmap.id),
    ]);

    return {
      roadmap,
      permits: permits.data ?? [],
      documents: documents.data ?? [],
      agencies: agencies.data ?? [],
      risks: risks.data ?? [],
      followups: followups.data ?? [],
    };
  });
