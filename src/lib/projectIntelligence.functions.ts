import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  computeCriticalPath,
  computeHealth,
  detectMixedRevisions,
  partyFromText,
  partyForPermitItem,
  readinessScore,
  type ActionItem,
  type ReadinessCheck,
  type ResponsibleParty,
} from "@/lib/projectIntelligence";

// ---------------------------------------------------------------------------
// Project Intelligence Core
// One aggregation of everything Permivio already knows about a project, so the
// dashboard, roadmap, QA/QC and client views all read the same record instead
// of asking the client for the same facts again.
// ---------------------------------------------------------------------------

const DONE = new Set(["approved", "issued", "complete", "completed", "closed", "passed"]);
const NA = new Set(["n_a", "na", "not_required"]);

type ExpectedDoc = { key: string; label: string; match: RegExp; blocking: boolean; agency: string };

const EXPECTED_DOCS: Record<string, ExpectedDoc[]> = {
  building: [
    { key: "arch", label: "Architectural plans", match: /arch|a[0-9]|floor plan/i, blocking: true, agency: "Building" },
    { key: "mep", label: "MEP plans", match: /mech|elec|plumb|mep|m[0-9]|e[0-9]|p[0-9]/i, blocking: true, agency: "Building" },
    { key: "struct", label: "Structural calculations", match: /struct|calc|s[0-9]/i, blocking: false, agency: "Building" },
    { key: "owner_auth", label: "Owner authorization", match: /owner|authoriz|loa|agent/i, blocking: true, agency: "Building" },
  ],
  health: [
    { key: "equip", label: "Equipment plan / schedule", match: /equip/i, blocking: true, agency: "Health" },
    { key: "menu", label: "Menu", match: /menu/i, blocking: false, agency: "Health" },
    { key: "food_app", label: "Food-service application", match: /food|health app/i, blocking: true, agency: "Health" },
  ],
  fire: [
    { key: "alarm", label: "Fire alarm plans", match: /alarm|fa[0-9]/i, blocking: false, agency: "Fire" },
    { key: "sprinkler", label: "Sprinkler drawings", match: /sprinkler|fp[0-9]/i, blocking: false, agency: "Fire" },
  ],
  site: [
    { key: "site_plan", label: "Site plan", match: /site plan|c[0-9]|civil/i, blocking: true, agency: "Site development" },
    { key: "survey", label: "Survey", match: /survey|plat/i, blocking: false, agency: "Site development" },
  ],
};

export const getProjectIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const pid = data.project_id;

    const [projectRes, scopeRes, itemsRes, docsRes, deadlinesRes, inspRes, commentsRes, findingsRes, roadmapRes, confirmRes] =
      await Promise.all([
        sb.from("projects").select("*").eq("id", pid).maybeSingle(),
        sb.from("scope_of_work").select("*").eq("project_id", pid).order("created_at", { ascending: false }).limit(1),
        sb.from("permit_items").select("id,name,category,status,due_date,required,notes").eq("project_id", pid).order("sort_order"),
        sb.from("project_documents").select("id,name,created_at,ai_summary,stage").eq("project_id", pid).order("created_at", { ascending: false }),
        sb.from("deadlines").select("id,title,due_date").eq("project_id", pid).order("due_date"),
        sb.from("inspections").select("id,inspection_type,status,result,scheduled_date").eq("project_id", pid),
        sb.from("comment_responses").select("id,comment_no,comment_text,discipline,sheet_reference,status,assignee,severity").eq("project_id", pid),
        sb.from("qaqc_findings").select("id,summary,responsible_discipline,severity,resolved,sheet_number").eq("user_id", context.userId).limit(200),
        sb.from("permit_roadmaps").select("id,summary,status,health_score,confidence,updated_at").eq("project_id", pid).order("updated_at", { ascending: false }).limit(1),
        sb.from("jurisdiction_confirmations").select("id,status,updated_at").eq("project_id", pid).order("updated_at", { ascending: false }).limit(1),
      ]);

    const project = projectRes.data;
    if (!project) throw new Error("Project not found");

    const scope = scopeRes.data?.[0] ?? null;
    const items = itemsRes.data ?? [];
    const docs = docsRes.data ?? [];
    const deadlines = deadlinesRes.data ?? [];
    const inspections = inspRes.data ?? [];
    const comments = commentsRes.data ?? [];
    const roadmap = roadmapRes.data?.[0] ?? null;
    const confirmation = confirmRes.data?.[0] ?? null;

    // QA/QC findings are scoped by review; keep only ones tied to this project's reviews.
    let findings: Array<{ id: string; summary: string; responsible_discipline: string | null; severity: string; resolved: boolean; sheet_number: string | null }> = [];
    const { data: reviews } = await sb.from("qaqc_reviews").select("id").eq("project_id", pid);
    const reviewIds = new Set((reviews ?? []).map((r) => r.id));
    if (reviewIds.size > 0) {
      const { data: scoped } = await sb
        .from("qaqc_findings")
        .select("id,summary,responsible_discipline,severity,resolved,sheet_number,review_id")
        .in("review_id", Array.from(reviewIds));
      findings = scoped ?? [];
    } else {
      findings = (findingsRes.data ?? []).slice(0, 0);
    }

    const today = new Date();
    const dayMs = 86400000;
    const openComments = comments.filter((c) => c.status !== "resolved" && c.status !== "closed");
    const unresolvedFindings = findings.filter((f) => !f.resolved);
    const pendingInspections = inspections.filter((i) => i.result !== "pass" && i.status !== "passed");
    const failedInspections = inspections.filter((i) => i.result === "fail");
    const utilityItems = items.filter((i) => i.category === "utility" && !DONE.has(i.status) && !NA.has(i.status));
    const overdueDeadlines = deadlines.filter((d) => new Date(d.due_date).getTime() < today.getTime());
    const dueSoonDeadlines = deadlines.filter((d) => {
      const t = new Date(d.due_date).getTime();
      return t >= today.getTime() && t - today.getTime() <= 7 * dayMs;
    });

    // ---- Missing documents (scope + permit matrix driven) ----
    const activeCategories = new Set(items.filter((i) => !NA.has(i.status)).map((i) => i.category));
    const missingByAgency: Record<string, Array<{ label: string; blocking: boolean }>> = {};
    const presentByAgency: Record<string, string[]> = {};
    for (const [cat, expected] of Object.entries(EXPECTED_DOCS)) {
      if (!activeCategories.has(cat) && !(cat === "building" && activeCategories.size === 0)) continue;
      for (const e of expected) {
        const found = docs.some((d) => e.match.test(d.name));
        if (found) (presentByAgency[e.agency] ??= []).push(e.label);
        else (missingByAgency[e.agency] ??= []).push({ label: e.label, blocking: e.blocking });
      }
    }
    const missingBlocking = Object.values(missingByAgency).flat().filter((m) => m.blocking);

    // ---- Responsibility matrix ----
    const actions: ActionItem[] = [];
    for (const i of items) {
      if (DONE.has(i.status) || NA.has(i.status)) continue;
      actions.push({
        id: `permit:${i.id}`,
        title: i.name,
        detail: `${i.category} permit — ${i.status.replace(/_/g, " ")}`,
        party: partyForPermitItem(i.category, i.status),
        source: "permit",
        due_date: i.due_date,
        blocking: i.required,
      });
    }
    for (const c of openComments) {
      actions.push({
        id: `comment:${c.id}`,
        title: `Comment ${c.comment_no}${c.sheet_reference ? ` — ${c.sheet_reference}` : ""}`,
        detail: c.comment_text.slice(0, 160),
        party: partyFromText(c.assignee ?? c.discipline, "architect"),
        source: "comment",
        due_date: null,
        blocking: true,
      });
    }
    for (const f of unresolvedFindings) {
      actions.push({
        id: `finding:${f.id}`,
        title: f.summary.slice(0, 120),
        detail: f.sheet_number ? `Sheet ${f.sheet_number}` : null,
        party: partyFromText(f.responsible_discipline, "architect"),
        source: "qaqc",
        due_date: null,
        blocking: f.severity === "high",
      });
    }
    for (const m of Object.entries(missingByAgency)) {
      for (const doc of m[1]) {
        actions.push({
          id: `doc:${m[0]}:${doc.label}`,
          title: `Provide ${doc.label}`,
          detail: `${m[0]} submission requirement`,
          party: doc.label.toLowerCase().includes("owner") ? "client" : "architect",
          source: "document",
          due_date: null,
          blocking: doc.blocking,
        });
      }
    }
    for (const i of pendingInspections) {
      if (!i.scheduled_date) continue;
      actions.push({
        id: `insp:${i.id}`,
        title: `${i.inspection_type} inspection`,
        detail: `Scheduled ${i.scheduled_date}`,
        party: "gc",
        source: "inspection",
        due_date: i.scheduled_date,
        blocking: false,
      });
    }
    for (const d of deadlines) {
      actions.push({ id: `dl:${d.id}`, title: d.title, party: "permivio", source: "deadline", due_date: d.due_date, blocking: false });
    }

    const byParty: Record<string, ActionItem[]> = {};
    for (const a of actions) (byParty[a.party] ??= []).push(a);

    // ---- Submission readiness gate ----
    const jurisdictionConfirmed = confirmation?.status === "user_confirmed" || confirmation?.status === "human_verified";
    const hasSeals = docs.some((d) => /seal|stamp|signed/i.test(d.name) || /seal|stamp/i.test(d.ai_summary ?? ""));
    const checks: ReadinessCheck[] = [
      { key: "jurisdiction", label: "Correct jurisdiction confirmed", passed: jurisdictionConfirmed, blocking: true, note: jurisdictionConfirmed ? undefined : "Confirm the authorities having jurisdiction" },
      { key: "application", label: "Application / permit matrix built", passed: items.length > 0, blocking: true },
      { key: "plans", label: "Required plans uploaded", passed: docs.length > 0 && !missingBlocking.some((m) => /plan/i.test(m.label)), blocking: true },
      { key: "forms", label: "Required forms on file", passed: !missingByAgency["Building"]?.some((m) => /application|form/i.test(m.label)), blocking: true },
      { key: "owner_auth", label: "Owner authorization", passed: docs.some((d) => /owner|authoriz|loa|agent/i.test(d.name)), blocking: true },
      { key: "licensing", label: "Contractor licensing on file", passed: docs.some((d) => /licen/i.test(d.name)), blocking: false },
      { key: "seals", label: "Professional seals present", passed: hasSeals, blocking: true },
      { key: "calcs", label: "Required calculations", passed: docs.some((d) => /calc/i.test(d.name)), blocking: false },
      { key: "support", label: "Supporting documents", passed: Object.values(missingByAgency).flat().length === 0, blocking: false },
      { key: "agency", label: "Prerequisite agency approvals cleared", passed: items.filter((i) => ["zoning", "site"].includes(i.category)).every((i) => DONE.has(i.status) || NA.has(i.status)), blocking: true },
      { key: "qaqc", label: "QA/QC complete", passed: reviewIds.size > 0 && unresolvedFindings.length === 0, blocking: true },
      { key: "fees", label: "Applicable fees identified", passed: items.some((i) => /fee/i.test(i.notes ?? "")), blocking: false },
      { key: "portal", label: "Submission portal identified", passed: Boolean(project.jurisdiction), blocking: true },
    ];
    const readiness = {
      score: readinessScore(checks),
      checks,
      outstanding: checks.filter((c) => !c.passed).map((c) => c.label),
      blocking_outstanding: checks.filter((c) => !c.passed && c.blocking).map((c) => c.label),
    };

    // ---- Critical path ----
    const criticalPath = computeCriticalPath({
      permitItems: items.map((i) => ({ id: i.id, name: i.name, category: i.category, status: i.status, due_date: i.due_date, required: i.required })),
      openComments: openComments.length,
      unresolvedFindings: unresolvedFindings.length,
      utilityOpen: utilityItems.length > 0,
      pendingInspections: pendingInspections.length,
    });

    // ---- Health ----
    const expiringPermits = deadlines.filter((d) => {
      const t = new Date(d.due_date).getTime() - today.getTime();
      return /expir/i.test(d.title) && t > 0 && t <= 45 * dayMs;
    });
    const health = computeHealth({
      missingBlockingDocs: missingBlocking.length,
      overdueDeadlines: overdueDeadlines.length,
      dueSoonDeadlines: dueSoonDeadlines.length,
      openComments: openComments.length,
      failedInspections: failedInspections.length,
      utilityOpen: utilityItems.length > 0,
      clientActions: (byParty["client"] ?? []).length,
      expiringPermits: expiringPermits.length,
    });

    // ---- Revision control ----
    const revisions = detectMixedRevisions(docs.map((d) => ({ name: d.name })));

    // ---- Opening / CO readiness ----
    const coItems = items.filter((i) => ["co", "tco"].includes(i.category));
    const finalSteps = [
      { label: "Fire final", done: inspections.some((i) => /fire/i.test(i.inspection_type) && i.result === "pass") },
      { label: "Health final", done: inspections.some((i) => /health/i.test(i.inspection_type) && i.result === "pass") },
      { label: "Electrical final", done: inspections.some((i) => /elec/i.test(i.inspection_type) && i.result === "pass") },
      { label: "Building final", done: inspections.some((i) => /building|final/i.test(i.inspection_type) && i.result === "pass") },
      { label: "CO application", done: coItems.some((i) => i.status !== "not_started") },
    ];
    const openingReadiness = {
      score: Math.round((finalSteps.filter((s) => s.done).length / finalSteps.length) * 100),
      remaining: finalSteps.filter((s) => !s.done).map((s) => s.label),
    };

    return {
      core: {
        project_id: project.id,
        name: project.name,
        address: project.location,
        client: null as string | null,
        project_type: project.project_type,
        primary_project_type_id: project.primary_project_type_id,
        scope_text: scope?.scope_text ?? scope?.plain_scope ?? null,
        occupancy_existing: scope?.occupancy_existing ?? null,
        occupancy_proposed: scope?.occupancy_proposed ?? null,
        jurisdiction: project.jurisdiction,
        jurisdiction_confirmed: jurisdictionConfirmed,
        construction_value_cents: scope?.construction_value_cents ?? null,
        target_start_date: scope?.target_start_date ?? null,
        target_open_date: scope?.target_open_date ?? null,
        roadmap_id: roadmap?.id ?? null,
        roadmap_status: roadmap?.status ?? null,
        counts: {
          permits: items.length,
          documents: docs.length,
          open_comments: openComments.length,
          unresolved_findings: unresolvedFindings.length,
          inspections: inspections.length,
          deadlines: deadlines.length,
        },
      },
      criticalPath,
      responsibility: Object.entries(byParty)
        .map(([party, list]) => ({ party: party as ResponsibleParty, count: list.length, items: list.slice(0, 8) }))
        .sort((a, b) => b.count - a.count),
      readiness,
      missingDocuments: Object.entries(missingByAgency).map(([agency, list]) => ({
        agency,
        present: presentByAgency[agency] ?? [],
        missing: list,
      })),
      health,
      revisions,
      openingReadiness,
      verification: "ai_suggested" as const,
    };
  });
