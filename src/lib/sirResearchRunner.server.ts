/**
 * The Lead SIR Agent research pass, shared by the public intake, the signed-in
 * SIR workspace and the admin re-run action. Server-only: it uses the admin
 * client because it also runs in the background after a request returns.
 */
/** Resolve jurisdiction → research official sources → persist the structured scope. */
export async function runResearch(requestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runSirLeadAgent, SIR_LEAD_AGENT_MODEL } = await import("@/lib/sirLeadAgent.server");

  const { data: row } = await supabaseAdmin.from("sir_requests").select("*").eq("id", requestId).maybeSingle();
  if (!row) throw new Error("Request not found");

  await supabaseAdmin.from("sir_requests").update({ research_status: "running", research_error: null, qa_status: "pending", review_stage: "draft" }).eq("id", requestId);

  try {
    // The Lead Project Intelligence Agent orchestrates the specialist research
    // passes and gates every claim against the harvested official evidence.
    const { resolved, research, sources, audit } = await runSirLeadAgent(row);

    // Lead SIR Agent, second half: compile the final draft, run the QA/QC gate
    // and queue it for internal professional review (or hold it as QA-blocked).
    const { leadCompileAndGate } = await import("@/lib/sirLeadOrchestrator.server");
    const gate = leadCompileAndGate(research, { sources, audit });

    const { error } = await supabaseAdmin
      .from("sir_requests")
      .update({
        research_status: "complete",
        compiled_report: gate.compiled as never,
        compiled_at: new Date().toISOString(),
        qa_report: gate.qa as never,
        qa_status: gate.qa.status,
        review_stage: gate.review_stage,
        submitted_for_review_at: gate.review_stage === "professional_review_pending" ? new Date().toISOString() : null,
        research: research as never,
        resolved_jurisdiction: resolved as never,
        research_sources: sources as never,
        research_model: SIR_LEAD_AGENT_MODEL,
        research_audit: audit as never,
        researched_at: new Date().toISOString(),
        research_error: null,
      })
      .eq("id", requestId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (err) {
    await supabaseAdmin
      .from("sir_requests")
      .update({ research_status: "failed", research_error: (err as Error).message.slice(0, 500) })
      .eq("id", requestId);
    throw err;
  }
}
