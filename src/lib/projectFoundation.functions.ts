import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { roadmapSummary, blockers } from "./roadmapWorkflow";
import { derivePhase, nextActions, permitProgress, PHASES, type FoundationState } from "./projectFoundation";

const isPlan = (d: { name: string; mime_type: string | null }) =>
  (d.mime_type || "").startsWith("image/") || d.mime_type === "application/pdf" || d.name.toLowerCase().endsWith(".pdf");

/** Everything the project header, Overview and Next Actions need — read as the caller (RLS). */
export const getProjectFoundation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const pid = data.project_id;
    const [proj, conf, roadmaps, items, docs, comments, findings, insp, act, psets] = await Promise.all([
      sb.from("projects").select("id,name,location,jurisdiction,project_type,scope_description,occupancy_class,work_type,target_start_date").eq("id", pid).maybeSingle(),
      sb.from("jurisdiction_confirmations").select("status,jurisdiction_id,city,state,formatted_address").eq("project_id", pid).maybeSingle(),
      sb.from("permit_roadmaps").select("id").eq("project_id", pid).limit(1),
      sb.from("permit_items").select("id,name,status,required,depends_on,requirement_confidence").eq("project_id", pid),
      sb.from("project_documents").select("id,name,mime_type,plan_reviewed_at,created_at").eq("project_id", pid).order("created_at", { ascending: false }),
      sb.from("comment_responses").select("id,status").eq("project_id", pid),
      sb.from("qaqc_findings").select("id,resolved,qaqc_reviews!inner(project_id)").eq("qaqc_reviews.project_id", pid).eq("resolved", false),
      sb.from("inspections").select("id,inspection_type,scheduled_date,status").eq("project_id", pid).order("scheduled_date", { ascending: true }),
      sb.from("activity").select("id,description,action,object_type,created_at,user_id").eq("project_id", pid).order("created_at", { ascending: false }).limit(8),
      sb.from("plan_sets").select("id,title,version_number,is_current,created_at").eq("project_id", pid).eq("archived", false).order("created_at", { ascending: false }),
    ]);
    if (proj.error) throw new Error(proj.error.message);
    if (!proj.data) throw new Error("Project not found");
    const p = proj.data;

    let place: { county: string | null; municipality: string | null; state: string | null } = { county: null, municipality: null, state: conf.data?.state ?? null };
    let authorities: Array<{ official_name: string; role: string; website: string | null; verification: string }> = [];
    if (conf.data?.jurisdiction_id) {
      const [j, a] = await Promise.all([
        sb.from("jurisdictions").select("state,county,municipality").eq("id", conf.data.jurisdiction_id).maybeSingle(),
        sb.from("authorities").select("official_name,role,website,verification").eq("jurisdiction_id", conf.data.jurisdiction_id).limit(8),
      ]);
      if (j.data) place = { county: j.data.county, municipality: j.data.municipality, state: j.data.state };
      authorities = (a.data ?? []) as typeof authorities;
    }

    const req = (items.data ?? []).filter((i) => i.required && i.status !== "n_a");
    const allDocs = docs.data ?? [];
    const plans = allDocs.filter(isPlan);
    const inspections = insp.data ?? [];
    const today = new Date().toISOString().slice(0, 10);

    const allItems = items.data ?? [];
    const rs = roadmapSummary(allItems);
    const state: FoundationState = {
      hasAddress: !!(p.location ?? "").trim(),
      hasJurisdiction: !!(p.jurisdiction ?? "").trim() || !!conf.data?.jurisdiction_id,
      jurisdictionStatus: (conf.data?.status as FoundationState["jurisdictionStatus"]) ?? "none",
      hasScope: !!(p.scope_description ?? "").trim() || !!p.work_type,
      hasRoadmap: (roadmaps.data ?? []).length > 0 || (items.data ?? []).length > 0,
      permitsRequired: req.length,
      permitsSubmitted: req.filter((i) => i.status === "submitted" || i.status === "under_review").length,
      permitsApproved: req.filter((i) => i.status === "approved" || i.status === "issued").length,
      planDocs: plans.length,
      planDocsReviewed: plans.filter((d) => !!d.plan_reviewed_at).length,
      openPlanFindings: (findings.data ?? []).length,
      openCorrections: (comments.data ?? []).filter((c) => c.status !== "resolved" && c.status !== "n_a").length,
      inspectionsTotal: inspections.filter((i) => i.status !== "canceled").length,
      inspectionsPassed: inspections.filter((i) => i.status === "passed").length,
      inspectionsFailed: inspections.filter((i) => i.status === "failed").length,
      inspectionsUpcoming: inspections.filter((i) => (i.status === "scheduled" || i.status === "rescheduled") && (!i.scheduled_date || i.scheduled_date >= today)).length,
      roadmapBlocked: rs.blocked.map((i) => ({ name: i.name, waitingOn: blockers(i, allItems) })),
      roadmapNeedsVerification: rs.needsVerification.length,
      roadmapReadyToSubmit: rs.readyToSubmit.map((i) => i.name),
      roadmapCorrectionsRequired: rs.correctionsRequired.map((i) => i.name),
    };
    const sets = psets.data ?? [];
    const current = sets.find((x) => x.is_current) ?? null;

    const phase = derivePhase(state);
    return {
      state,
      phase,
      phaseLabel: PHASES.find((x) => x.key === phase)?.label ?? phase,
      progress: permitProgress(state),
      nextActions: nextActions(state),
      jurisdiction: {
        status: state.jurisdictionStatus,
        address: conf.data?.formatted_address ?? p.location,
        ...place,
        name: p.jurisdiction,
        authorities,
      },
      recentDocuments: allDocs.slice(0, 5).map((d) => ({ id: d.id, name: d.name, created_at: d.created_at, reviewed: !!d.plan_reviewed_at })),
      upcomingInspections: inspections
        .filter((i) => i.status === "scheduled" || i.status === "rescheduled")
        .slice(0, 5)
        .map((i) => ({ id: i.id, type: i.inspection_type, date: i.scheduled_date, status: i.status })),
      recentActivity: act.data ?? [],
      roadmap: { total: rs.total, done: rs.done, blocked: rs.blocked.length },
      currentPlanSet: current ? { id: current.id, title: current.title, version: current.version_number } : null,
      planSetCount: sets.length,
    };
  });
