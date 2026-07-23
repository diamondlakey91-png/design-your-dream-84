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

    // Load confirmed jurisdiction context (required for verified labels).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: confirmation } = await (supabase.from("jurisdiction_confirmations") as any)
      .select("*").eq("project_id", data.project_id).maybeSingle();
    let jurisdiction_context: import("./permitRules").JurisdictionContext | null = null;
    if (confirmation?.jurisdiction_id) {
      const { data: j } = await supabase
        .from("jurisdictions")
        .select("state, county, municipality, incorporated")
        .eq("id", confirmation.jurisdiction_id)
        .maybeSingle();
      if (j) {
        jurisdiction_context = {
          municipality: j.municipality,
          county: j.county,
          state: j.state,
          incorporated: !!j.incorporated,
          confirmed: confirmation.status === "user_confirmed" || confirmation.status === "human_verified",
        };
      }
    }

    // Run rule engine
    const draft = buildRoadmapDraft({
      ...(scope as unknown as ScopeInputForRules),
      jurisdiction_context,
    });


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

    // ---------- Checklist (permit_items) ----------
    // Seed the project checklist from required/likely permits so users have
    // actionable tasks without an extra button click.
    let checklist_added = 0;
    const checklistRows = draft.permits
      .filter((p) => p.likelihood === "required" || p.likelihood === "likely")
      .map((p, idx) => ({
        user_id: context.userId,
        project_id: scope.project_id,
        name: p.name,
        category: (p.category ?? "other") as string,
        required: p.likelihood === "required",
        notes: [p.agency, p.notes].filter(Boolean).join(" · ").slice(0, 500),
        sort_order: 1000 + idx,
      }));
    if (checklistRows.length) {
      const { data: existing } = await supabase
        .from("permit_items").select("name").eq("project_id", scope.project_id);
      const known = new Set((existing ?? []).map((r) => (r.name as string).trim().toLowerCase()));
      const toInsert = checklistRows.filter((r) => !known.has(r.name.trim().toLowerCase()));
      if (toInsert.length) {
        const { error: ciErr } = await supabase.from("permit_items").insert(toInsert);
        if (!ciErr) checklist_added = toInsert.length;
      }
    }

    // ---------- Timeline rollup ----------
    // Sum critical-path review windows to compute overall review timeline.
    const critPermits = draft.permits.filter((p) => p.critical_path);
    const rollupPermits = critPermits.length ? critPermits : draft.permits;
    const total_min = rollupPermits.reduce((s, p) => s + (p.review_days_min ?? 0), 0);
    const total_max = rollupPermits.reduce((s, p) => s + (p.review_days_max ?? 0), 0);
    // Typical review cycles: 1 for straightforward, 2 for complex/new construction
    const review_cycles_expected = draft.permits.some(
      (p) => p.category === "building" && p.likelihood === "required",
    ) ? 2 : 1;

    // ---------- Milestone deadlines (tasks) ----------
    // Only create deadlines when scope has target dates and we haven't already.
    let deadlines_added = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetStart = (scope as any).target_start_date as string | null | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetOpen = (scope as any).target_open_date as string | null | undefined;
    const milestones: { title: string; due_date: string }[] = [];
    if (targetStart) {
      const start = new Date(targetStart);
      // Submit application ~ total_min days before start
      if (Number.isFinite(start.getTime()) && total_min > 0) {
        const submit = new Date(start);
        submit.setDate(submit.getDate() - total_max);
        milestones.push({
          title: "Submit permit application package",
          due_date: submit.toISOString().slice(0, 10),
        });
      }
      milestones.push({ title: "Target construction start", due_date: targetStart });
    }
    if (targetOpen) {
      milestones.push({ title: "Final inspections & Certificate of Occupancy", due_date: targetOpen });
    }
    if (milestones.length) {
      const { data: existingD } = await supabase
        .from("deadlines").select("title, due_date").eq("project_id", scope.project_id);
      const seen = new Set((existingD ?? []).map((d) => `${d.title}|${d.due_date}`));
      const toInsert = milestones
        .filter((m) => !seen.has(`${m.title}|${m.due_date}`))
        .map((m) => ({
          user_id: context.userId,
          project_id: scope.project_id,
          title: m.title,
          due_date: m.due_date,
        }));
      if (toInsert.length) {
        const { error: dErr } = await supabase.from("deadlines").insert(toInsert);
        if (!dErr) deadlines_added = toInsert.length;
      }
    }

    // Persist timeline rollup on roadmap summary meta.
    const timelineLine = `Estimated review window: ${total_min}–${total_max} business days · ${review_cycles_expected} review cycle${review_cycles_expected > 1 ? "s" : ""} typical.`;
    await supabase.from("permit_roadmaps").update({
      summary: (draft.summary ? draft.summary + "\n\n" : "") + timelineLine,
    }).eq("id", roadmap.id);

    // Activity log
    await supabase.from("activity").insert({
      user_id: context.userId,
      project_id: scope.project_id,
      description: `Permit Roadmap built — ${draft.permits.length} permits, ${draft.agencies.length} agencies, ${checklist_added} checklist tasks, ${deadlines_added} deadlines.`,
    });

    // Mark scope complete (or needs_followup if there are follow-ups)
    await supabase
      .from("scope_of_work")
      .update({ status: draft.followups.length ? "needs_followup" : "complete" })
      .eq("id", scope.id);

    return {
      roadmap_id: roadmap.id,
      counts: {
        permits: draft.permits.length,
        agencies: draft.agencies.length,
        documents: draft.documents.length,
        checklist_added,
        deadlines_added,
        review_cycles_expected,
        timeline_days_min: total_min,
        timeline_days_max: total_max,
      },
    };
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
