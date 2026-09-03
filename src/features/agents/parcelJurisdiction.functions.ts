// PERMIVIO agent framework — server functions for the Property, Parcel &
// Jurisdiction Agent. Execution is server-side only; the browser never sees
// prompts, models, token counts or raw errors.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyError, clientSafeMessage } from "./errors";
import { toClientFindings } from "./client-view";
import { getAgent } from "./registry";

const inputSchema = z.object({
  address: z.string().min(5).max(300),
  parcelId: z.string().max(80).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  projectType: z.string().max(120).nullable().optional(),
  scope: z.string().max(4000).optional(),
  clientObjective: z.string().max(1000).optional(),
});

/**
 * Runs the agent and persists the run, task, sources, findings and questions.
 * Returns the jurisdictional-responsibility matrix and client-safe findings.
 */
export const runParcelJurisdiction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const def = getAgent("parcel_jurisdiction");

    // Authorization: organization scope comes from the project when supplied.
    let organizationId: string | null = null;
    if (data.projectId) {
      const { data: proj, error } = await supabase
        .from("projects")
        .select("id, organization_id")
        .eq("id", data.projectId)
        .maybeSingle();
      if (error || !proj) return { ok: false as const, error: "You do not have access to this project." };
      organizationId = proj.organization_id ?? null;
    } else {
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      organizationId = mem?.organization_id ?? null;
    }

    const { data: run, error: runErr } = await supabase
      .from("agent_runs")
      .insert({
        workflow_key: "property_snapshot",
        workflow_version: "1.0.0",
        organization_id: organizationId,
        project_id: data.projectId ?? null,
        requested_by: userId,
        requested_deliverable: "Property, parcel and jurisdictional-responsibility matrix",
        status: "researching",
        client_stage: "Confirming the property",
        professional_review_required: def.humanReviewRequired,
        started_at: new Date().toISOString(),
        context_snapshot: {
          address: data.address,
          parcel_id: data.parcelId ?? null,
          project_type: data.projectType ?? null,
          scope: data.scope ?? null,
        },
      })
      .select("id")
      .single();
    if (runErr || !run) return { ok: false as const, error: "Could not start the property research." };

    const { data: task } = await supabase
      .from("agent_tasks")
      .insert({
        agent_run_id: run.id,
        agent_key: "parcel_jurisdiction",
        agent_version: def.version,
        prompt_version: def.promptVersion,
        model: def.model.id,
        sequence: 1,
        parallel_group: 1,
        dependencies: [],
        status: "running",
        started_at: new Date().toISOString(),
        max_attempts: def.maxAttempts,
      })
      .select("id")
      .single();

    try {
      const { runParcelJurisdictionAgent } = await import("./agents/parcelJurisdiction.server");
      const result = await runParcelJurisdictionAgent({
        address: data.address,
        parcelId: data.parcelId ?? null,
        projectType: data.projectType ?? null,
        ...(data.scope ? { scope: data.scope } : {}),
        ...(data.clientObjective ? { clientObjective: data.clientObjective } : {}),
      });

      // Sources first so findings can reference their ids.
      const sourceIdByKey = new Map<string, string>();
      if (result.output.sources.length) {
        const { data: rows } = await supabase
          .from("agent_sources")
          .insert(
            result.output.sources.map((s) => ({
              agent_run_id: run.id,
              agent_task_id: task?.id ?? null,
              source_key: s.source_key,
              source_type: s.source_type,
              title: s.title,
              publisher: s.publisher,
              url: s.url,
              code_section: s.code_section,
              page_reference: s.page_reference,
              map_layer: s.map_layer,
              effective_date: s.effective_date,
              accessed_at: s.accessed_at,
              geographic_scope: s.geographic_scope,
              authority_level: s.authority_level,
              retrieved: s.retrieved,
            })),
          )
          .select("id, source_key");
        for (const r of rows ?? []) sourceIdByKey.set(r.source_key, r.id);
      }

      if (result.output.findings.length) {
        const { data: fRows } = await supabase
          .from("agent_findings")
          .insert(
            result.output.findings.map((f) => ({
              agent_run_id: run.id,
              agent_task_id: task?.id ?? null,
              agent_key: "parcel_jurisdiction",
              finding_key: f.finding_key,
              module: f.module,
              category: f.category,
              title: f.title,
              finding: f.finding,
              analysis: f.analysis,
              applicability: f.applicability,
              verification_status: f.verification_status,
              confidence: f.confidence,
              agency: f.agency,
              geographic_scope: f.geographic_scope,
              risk_level: f.risk_level,
              cost_impact: f.cost_impact,
              schedule_impact: f.schedule_impact,
              recommendation: f.recommendation,
              confirmation_required: f.confirmation_required,
              responsible_party: f.responsible_party,
              client_visible: f.client_visible,
            })),
          )
          .select("id, finding_key");
        const findingIdByKey = new Map((fRows ?? []).map((r) => [r.finding_key, r.id]));
        const links = result.output.findings.flatMap((f) =>
          f.source_refs
            .filter((r) => sourceIdByKey.has(r.source_key) && findingIdByKey.has(f.finding_key))
            .map((r) => ({
              agent_finding_id: findingIdByKey.get(f.finding_key)!,
              agent_source_id: sourceIdByKey.get(r.source_key)!,
              supporting_excerpt: r.supporting_excerpt,
              support_description: r.support_description,
              primary_source: r.primary_source,
            })),
        );
        if (links.length) await supabase.from("agent_finding_sources").insert(links);
      }

      if (result.output.client_questions.length) {
        await supabase.from("agent_client_questions").insert(
          result.output.client_questions.map((q) => ({
            agent_run_id: run.id,
            agent_key: "parcel_jurisdiction",
            question_key: q.question_key,
            question: q.question,
            why_it_matters: q.why_it_matters,
            blocking: q.blocking,
            who_can_answer: q.who_can_answer,
          })),
        );
      }

      const blocking = result.output.client_questions.filter((q) => q.blocking).length;
      const needsClient = result.output.status === "needs_client_input" || blocking > 0;

      await supabase
        .from("agent_tasks")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          output_snapshot: {
            address_normalization: result.addressNormalization,
            parcels: result.parcels,
            jurisdiction_matrix: result.jurisdictionMatrix,
            overlays_and_districts: result.overlays,
            geocode: result.geocode,
            geography: result.geography,
            downgrades: result.downgrades,
            evidence: result.evidence.map((e) => ({
              source_key: e.source_key,
              url: e.url,
              retrieved: e.retrieved,
              type: e.guessedType,
            })),
          },
        })
        .eq("id", task?.id ?? "");

      await supabase
        .from("agent_runs")
        .update({
          status: needsClient ? "waiting_for_client" : "analyzing",
          client_stage: needsClient ? "Information needed from you" : "Identifying the responsible agencies",
          blocking_question_count: blocking,
          progress_percent: needsClient ? 40 : 55,
        })
        .eq("id", run.id);

      return {
        ok: true as const,
        runId: run.id,
        addressNormalization: result.addressNormalization,
        parcels: result.parcels,
        jurisdictionMatrix: result.jurisdictionMatrix,
        overlays: result.overlays,
        geocode: result.geocode,
        geography: {
          determination: result.geography.determination,
          census: result.geography.census,
          flood: result.geography.flood,
          unavailable: result.geography.unavailable,
          sources: result.geography.evidence.map((e) => ({ source_key: e.source_key, title: e.title, url: e.url })),
        },
        findings: toClientFindings(
          result.output.findings.map((f) => ({
            title: f.title,
            finding: f.finding,
            analysis: f.analysis,
            verification_status: f.verification_status,
            agency: f.agency,
            risk_level: f.risk_level,
            recommendation: f.recommendation,
            confirmation_required: f.confirmation_required,
            client_visible: f.client_visible,
            superseded_by: null,
          })),
        ),
        clientQuestions: result.output.client_questions,
        missingInformation: result.output.missing_information,
        conflicts: result.output.conflicts,
        summary: result.output.completion_summary,
        professionalConfirmationRequired: true,
      };
    } catch (e) {
      const err = classifyError(e);
      await supabase
        .from("agent_tasks")
        .update({ status: "failed", error: err.message.slice(0, 500), completed_at: new Date().toISOString() })
        .eq("id", task?.id ?? "");
      await supabase
        .from("agent_runs")
        .update({ status: "failed", client_stage: "We hit a problem — our team is looking at it", failure_reason: err.message.slice(0, 500) })
        .eq("id", run.id);
      return { ok: false as const, error: clientSafeMessage(err) };
    }
  });
