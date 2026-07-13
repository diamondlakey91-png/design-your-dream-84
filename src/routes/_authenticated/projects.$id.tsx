import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import {
  getProject,
  advanceStage,
  summarizeProjectNextSteps,
  listPermitItems,
  updatePermitItem,
  addPermitItem,
  deletePermitItem,
  generatePermitChecklist,
  listDocuments,
  registerDocument,
  deleteDocument,
  updateDocumentLinkage,
  addDeadline,
  deleteDeadline,
  listDeadlines,
  listActivity,
  syncJurisdiction,
  listJurisdictionSyncs,
  applySyncToChecklist,
  analyzeDocument,
  reviewPlan,
  batchReviewPlans,
  addPlanReviewFixesToChecklist,
  draftReviewerResponse,
  generateRedlinedPdf,
  computeProjectHealth,
  listInspections,
  addInspection,
  deleteInspection,
  draftClientUpdate,
  summarizeReviewerComments,
  generateMeetingAgenda,
  flagScheduleRisks,
  generateBatchReportPdf,
  linkPermitToProject,
  refreshLinkedPermit,
  unlinkPermit,
  listPermitSyncHistory,
} from "@/lib/permits.functions";
import { createBatchReportShare, listBatchReportShares, revokeBatchReportShare } from "@/lib/reportShares.functions";
import {
  ArrowLeft,
  MapPin,
  Building2,
  Landmark,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  Upload,
  FileText,
  CalendarClock,
  Radio,
  Info,
  CheckCircle2,
  Circle,
  Loader2,
  Milestone,
  Paperclip,
} from "lucide-react";
import { STAGES } from "@/lib/permits";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useRef, useEffect, useMemo } from "react";
import { findPortalDeepLinks, buildEntryFromMapping } from "@/lib/portalRegistry";
import { listPortalMappings } from "@/lib/portals.functions";


import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: ProjectDetail,
});

type Tab = "overview" | "checklist" | "docs" | "deadlines" | "inspections" | "timeline";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  issued: "Issued",
  n_a: "N/A",
};
const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  under_review: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  issued: "bg-brand/20 text-brand",
  n_a: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 line-through",
};

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  const getFn = useServerFn(getProject);
  const q = useQuery({ queryKey: ["project", id], queryFn: () => getFn({ data: { id } }) });

  if (q.isLoading) return <AppShell><div className="p-6 text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (!q.data?.project) {
    return (
      <AppShell>
        <div className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Project not found.</p>
          <Link to="/dashboard" className="mt-3 inline-block text-sm text-brand">Back to sites</Link>
        </div>
      </AppShell>
    );
  }

  const { project, activity } = q.data;
  const stage = project.current_stage;

  return (
    <AppShell>
      <header className="p-6 border-b border-border">
        <button onClick={() => navigate({ to: "/dashboard" })} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Sites
        </button>
        <div className="flex items-center gap-2 mt-4 mb-2">
          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">ID: {project.id.slice(0, 8).toUpperCase()}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/15 text-brand">{project.status.toUpperCase()}</span>
        </div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <div className="mt-1 text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          {project.jurisdiction && <span className="inline-flex items-center gap-1"><Landmark className="size-3.5" />{project.jurisdiction}</span>}
          {project.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{project.location}</span>}
        </div>
      </header>

      {/* Tabs */}
      <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex overflow-x-auto">
          {(["overview", "checklist", "docs", "deadlines", "inspections", "timeline"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-xs font-mono uppercase tracking-widest whitespace-nowrap border-b-2 ${
                tab === t ? "border-brand text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>

      <div className="p-6 space-y-6">
        {tab === "overview" && (
          <OverviewTab project={project} stage={stage} activity={activity} onChange={() => qc.invalidateQueries({ queryKey: ["project", id] })} />
        )}
        {tab === "checklist" && <ChecklistTab projectId={id} jurisdiction={project.jurisdiction} />}
        {tab === "docs" && <DocsTab projectId={id} userId={project.user_id} />}
        {tab === "deadlines" && <DeadlinesTab projectId={id} />}
        {tab === "inspections" && <InspectionsTab projectId={id} userId={project.user_id} />}
        {tab === "timeline" && <TimelineTab projectId={id} />}
      </div>
    </AppShell>
  );
}

/* ---------------- Overview ---------------- */
function OverviewTab({
  project, stage, activity, onChange,
}: {
  project: { id: string; user_id: string; name: string; project_type: string; location: string; jurisdiction: string; current_stage: number; permit_count: number; permits_issued: number; linked_permit_number?: string | null; linked_permit_url?: string | null; linked_permit_data?: unknown; linked_permit_synced_at?: string | null };
  stage: number;
  activity: Array<{ id: string; description: string; created_at: string }>;
  onChange: () => void;
}) {
  const advanceFn = useServerFn(advanceStage);
  const summarizeFn = useServerFn(summarizeProjectNextSteps);
  const qc = useQueryClient();

  const advance = useMutation({
    mutationFn: () => advanceFn({ data: { id: project.id } }),
    onSuccess: () => { onChange(); qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Stage advanced"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const summary = useMutation({
    mutationFn: () => summarizeFn({ data: { id: project.id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <HealthScoreCard projectId={project.id} />
      <PermitRoadmap
        projectId={project.id}
        userId={project.user_id}
        stage={stage}
        onAdvance={() => advance.mutate()}
        advancing={advance.isPending}
      />


      {/* Live jurisdiction tracking */}
      <LivePermitCard project={project} onChange={onChange} />

      {/* Live jurisdiction tracking */}
      <LiveJurisdictionSync projectId={project.id} jurisdiction={project.jurisdiction} />

      {/* AI Copilot */}
      <AiCopilotPanel projectId={project.id} />




      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI_NEXT_STEPS</p>
          <button
            onClick={() => summary.mutate()}
            disabled={summary.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
          >
            {summary.data ? <RefreshCw className="size-3" /> : <Sparkles className="size-3" />}
            {summary.isPending ? "Thinking…" : summary.data ? "Regenerate" : "Generate"}
          </button>
        </div>
        {summary.data ? (
          <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
            <div className="text-sm text-foreground leading-relaxed
              [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
              [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5
              [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5
              [&_li]:marker:text-brand
              [&_strong]:text-foreground [&_strong]:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.data.summary}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl text-sm text-muted-foreground">
            Generate an AI summary of the next concrete steps for this project.
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3">
        <MetaCard icon={<MapPin className="size-4" />} label="Location" value={project.location || "—"} />
        <MetaCard icon={<Building2 className="size-4" />} label="Project Type" value={project.project_type} />
        <MetaCard icon={<Landmark className="size-4" />} label="Jurisdiction" value={project.jurisdiction || "—"} />
      </section>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">RECENT_ACTIVITY</p>
        {activity.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center rounded-xl border border-dashed border-border">No activity yet.</div>
        ) : (
          <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl divide-y divide-border">
            {activity.map((a) => (
              <div key={a.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                <div className="size-2 mt-1.5 rounded-full bg-brand shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{a.description}</p>
                  <p className="text-[11px] font-mono uppercase text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ---------------- Permit Roadmap ---------------- */
const STAGE_BLURB: Record<number, string> = {
  0: "Confirm scope, jurisdiction, and the full set of permits required for this project type.",
  1: "Applications filed with the AHJ. Track intake receipts and assigned reviewer.",
  2: "Under plan review — expect reviewer comments and revision cycles.",
  3: "Plans approved. Pay fees, print card, and prepare for issuance.",
  4: "Permits issued. Schedule inspections and drive to Certificate of Occupancy.",
};

function PermitRoadmap({
  projectId, userId, stage, onAdvance, advancing,
}: {
  projectId: string; userId: string; stage: number; onAdvance: () => void; advancing: boolean;
}) {
  const itemsFn = useServerFn(listPermitItems);
  const deadlinesFn = useServerFn(listDeadlines);
  const docsFn = useServerFn(listDocuments);

  const itemsQ = useQuery({
    queryKey: ["permit_items", projectId],
    queryFn: () => itemsFn({ data: { project_id: projectId } }),
  });
  const deadlinesQ = useQuery({
    queryKey: ["deadlines", "roadmap"],
    queryFn: () => deadlinesFn(),
  });
  const docsQ = useQuery({
    queryKey: ["docs", projectId],
    queryFn: () => docsFn({ data: { project_id: projectId } }),
  });

  const items = (itemsQ.data ?? []) as Array<{ id: string; name: string; status: string; due_date: string | null }>;
  const openItems = items.filter((i) => i.status !== "issued" && i.status !== "approved" && i.status !== "n_a");
  const nextUp = openItems.slice(0, 4);

  const upcoming = (deadlinesQ.data ?? [])
    .filter((d: { project_id?: string | null; due_date: string }) => d.project_id === projectId && new Date(d.due_date).getTime() > Date.now() - 86400000)
    .slice(0, 3) as Array<{ id: string; title: string; due_date: string }>;

  const allDocs = (docsQ.data ?? []) as Array<{ id: string; name: string; storage_path: string; mime_type: string; size_bytes: number; url: string | null; stage: number | null; permit_item_id: string | null }>;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-brand">
          <Milestone className="size-4" />
          <p className="font-mono text-[10px] uppercase tracking-widest">Permit Roadmap</p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Stage {stage + 1} of {STAGES.length}
        </span>
      </div>

      <div className="rounded-xl bg-card ring-1 ring-black/5 p-4">
        <ol className="relative">
          {STAGES.map((label, i) => {
            const done = i < stage;
            const current = i === stage;
            const isLast = i === STAGES.length - 1;
            const stageDocs = allDocs.filter((d) => d.stage === i);
            return (
              <li key={label} className="relative pl-9 pb-5 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[13px] top-6 bottom-0 w-px ${done ? "bg-brand/60" : "bg-border"}`}
                  />
                )}
                <span
                  className={`absolute left-0 top-0 grid size-7 place-items-center rounded-full ring-2 ${
                    done
                      ? "bg-brand text-brand-foreground ring-brand/40"
                      : current
                      ? "bg-brand/15 text-brand ring-brand animate-pulse"
                      : "bg-muted text-muted-foreground ring-border"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="size-4" />
                  ) : current ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                </span>

                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-semibold ${current ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground"}`}>
                    {label}
                  </p>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${
                    done ? "bg-brand/15 text-brand" : current ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"
                  }`}>
                    {done ? "Complete" : current ? "In progress" : "Upcoming"}
                  </span>
                  {stageDocs.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider">
                      <Paperclip className="size-2.5" /> {stageDocs.length}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{STAGE_BLURB[i]}</p>

                {current && (
                  <div className="mt-3 space-y-2">
                    {nextUp.length > 0 && (
                      <div className="rounded-lg border border-border bg-background/60 p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-brand">
                          <ArrowRight className="size-3" /> Next up
                        </p>
                        <ul className="space-y-1.5">
                          {nextUp.map((it) => (
                            <li key={it.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate text-foreground">{it.name}</span>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase ${STATUS_COLOR[it.status] ?? "bg-muted"}`}>
                                {STATUS_LABEL[it.status] ?? it.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {openItems.length > nextUp.length && (
                          <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            +{openItems.length - nextUp.length} more in Checklist
                          </p>
                        )}
                      </div>
                    )}
                    {upcoming.length > 0 && (
                      <div className="rounded-lg border border-border bg-background/60 p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-brand">
                          <CalendarClock className="size-3" /> Upcoming deadlines
                        </p>
                        <ul className="space-y-1.5">
                          {upcoming.map((d) => (
                            <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate text-foreground">{d.title}</span>
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                {format(new Date(d.due_date), "MMM d")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {nextUp.length === 0 && upcoming.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No pending items — you're clear to advance.</p>
                    )}
                  </div>
                )}

                <StageDocs
                  projectId={projectId}
                  userId={userId}
                  stage={i}
                  docs={stageDocs}
                  items={items}
                  defaultOpen={current}
                />
              </li>
            );
          })}
        </ol>

        {stage < STAGES.length - 1 && (
          <button
            onClick={onAdvance}
            disabled={advancing}
            className="mt-2 w-full inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {advancing ? "Advancing…" : <>Advance to {STAGES[stage + 1]} <ArrowRight className="size-4" /></>}
          </button>
        )}
      </div>
    </section>
  );
}

function StageDocs({
  projectId, userId, stage, docs, items, defaultOpen,
}: {
  projectId: string;
  userId: string;
  stage: number;
  docs: Array<{ id: string; name: string; mime_type: string; size_bytes: number; url: string | null; stage: number | null; permit_item_id: string | null }>;
  items: Array<{ id: string; name: string; status: string }>;
  defaultOpen: boolean;
}) {
  const registerFn = useServerFn(registerDocument);
  const delFn = useServerFn(deleteDocument);
  const linkFn = useServerFn(updateDocumentLinkage);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["docs", projectId] });
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${userId}/${projectId}/stage-${stage}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert: false });
      if (error) throw error;
      await registerFn({
        data: {
          project_id: projectId,
          name: file.name,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          stage,
        },
      });
      invalidate();
      toast.success(`Attached to Stage ${stage + 1}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDelete = async (id: string) => {
    try {
      await delFn({ data: { id } });
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onLink = async (id: string, permit_item_id: string | null) => {
    try {
      await linkFn({ data: { id, permit_item_id } });
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="size-3" /> Stage documents {docs.length > 0 && <span className="text-brand">({docs.length})</span>}
        </button>
        <label className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-brand hover:opacity-80 cursor-pointer">
          <Upload className="size-3" /> {uploading ? "Uploading…" : "Attach"}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
          />
        </label>
      </div>

      {open && (
        <div className="mt-2 space-y-1.5">
          {docs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No documents attached to this stage yet.</p>
          ) : (
            docs.map((d) => (
              <div key={d.id} className="rounded-lg border border-border bg-background/60 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate text-foreground hover:text-brand hover:underline flex-1">
                      {d.name}
                    </a>
                  ) : (
                    <span className="truncate flex-1">{d.name}</span>
                  )}
                  <button
                    onClick={() => onDelete(d.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    title="Remove document"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Links to:</span>
                  <select
                    value={d.permit_item_id ?? ""}
                    onChange={(e) => onLink(d.id, e.target.value || null)}
                    className="flex-1 min-w-0 rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
                  >
                    <option value="">— None —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}


/* ---------------- Checklist ---------------- */
function ChecklistTab({ projectId, jurisdiction }: { projectId: string; jurisdiction: string }) {
  const listFn = useServerFn(listPermitItems);
  const genFn = useServerFn(generatePermitChecklist);
  const addFn = useServerFn(addPermitItem);
  const updateFn = useServerFn(updatePermitItem);
  const delFn = useServerFn(deletePermitItem);
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");

  const q = useQuery({ queryKey: ["permit_items", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });

  useEffect(() => {
    const channel = supabase
      .channel(`permit_items:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "permit_items", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["permit_items", projectId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, qc]);

  const generate = useMutation({
    mutationFn: () => genFn({ data: { project_id: projectId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permit_items", projectId] }); toast.success("Checklist generated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const add = useMutation({
    mutationFn: (name: string) => addFn({ data: { project_id: projectId, name, category: "Building", required: true } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permit_items", projectId] }); setNewName(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permit_items", projectId] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permit_items", projectId] }),
  });

  const items = q.data ?? [];
  const total = items.length;
  const done = items.filter((i) => i.status === "issued" || i.status === "approved" || i.status === "n_a").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            Permit checklist
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{done}/{total} approved or issued</p>
        </div>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
        >
          {items.length > 0 ? <RefreshCw className="size-3" /> : <Sparkles className="size-3" />}
          {generate.isPending ? "Building…" : items.length > 0 ? "Regenerate" : "AI generate"}
        </button>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border">
          <Info className="size-5 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No permit items yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Generate a jurisdiction-specific checklist{jurisdiction ? ` for ${jurisdiction}` : ""} with AI, or add one below.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="p-3 bg-card ring-1 ring-black/5 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{it.category}</span>
                    {it.required && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-brand/15 text-brand">Required</span>}
                  </div>
                  <p className="text-sm font-medium mt-1">{it.name}</p>
                  {it.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.notes}</p>}
                </div>
                <button onClick={() => del.mutate(it.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(["not_started", "submitted", "under_review", "approved", "issued", "n_a"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus.mutate({ id: it.id, status: s })}
                    className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded ${
                      it.status === s ? STATUS_COLOR[s] + " ring-1 ring-current/40" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (newName.trim()) add.mutate(newName.trim()); }}
        className="flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add permit item…"
          className="flex-1 h-10 px-3 rounded-lg bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
        />
        <button className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
          <Plus className="size-4" /> Add
        </button>
      </form>
    </div>
  );
}

/* ---------------- Documents ---------------- */
function DocsTab({ projectId, userId }: { projectId: string; userId: string }) {
  const listFn = useServerFn(listDocuments);
  const registerFn = useServerFn(registerDocument);
  const delFn = useServerFn(deleteDocument);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const q = useQuery({ queryKey: ["docs", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${userId}/${projectId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert: false });
      if (error) throw error;
      await registerFn({
        data: {
          project_id: projectId,
          name: file.name,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      qc.invalidateQueries({ queryKey: ["docs", projectId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs", projectId] }),
  });

  const docs = q.data ?? [];

  const batchFn = useServerFn(batchReviewPlans);
  const [report, setReport] = useState<Awaited<ReturnType<typeof batchReviewPlans>> | null>(null);
  const [forceRerun, setForceRerun] = useState(false);
  const batch = useMutation({
    mutationFn: () => batchFn({ data: { project_id: projectId, force: forceRerun } }),
    onSuccess: (r) => {
      setReport(r);
      qc.invalidateQueries({ queryKey: ["docs", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      qc.invalidateQueries({ queryKey: ["health", projectId] });
      toast.success(`Batch review complete — ${r.total_findings} findings across ${r.documents_reviewed} plan(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Batch review failed"),
  });

  const planCount = docs.filter((d) => (d.mime_type || "").startsWith("image/") || (d.mime_type || "") === "application/pdf" || d.name.toLowerCase().endsWith(".pdf")).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Project documents</p>
          <p className="text-xs text-muted-foreground">Plans, permits, correspondence — private to you.</p>
        </div>
        <div className="flex items-center gap-3">
          {planCount > 0 && (
            <>
              <label className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={forceRerun} onChange={(e) => setForceRerun(e.target.checked)} className="size-3" />
                Re-run all
              </label>
              <button
                onClick={() => batch.mutate()}
                disabled={batch.isPending}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
                title="One-click AI review of every uploaded plan + consolidated PermitHealth report"
              >
                <Sparkles className="size-3" /> {batch.isPending ? "Batch reviewing…" : `Batch review (${planCount})`}
              </button>
            </>
          )}
          <label className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 cursor-pointer">
            <Upload className="size-3" /> {uploading ? "Uploading…" : "Upload"}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
            />
          </label>
        </div>
      </div>

      {report && <BatchReport report={report} projectId={projectId} onClose={() => setReport(null)} />}

      {docs.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No documents yet.</div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} projectId={projectId} onDelete={() => del.mutate(d.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BatchReport({ report, projectId, onClose }: { report: Awaited<ReturnType<typeof batchReviewPlans>>; projectId: string; onClose: () => void }) {
  const riskColor = report.overall_risk === "high" ? "text-destructive" : report.overall_risk === "medium" ? "text-amber-600" : "text-emerald-600";
  const [shareOpen, setShareOpen] = useState(false);
  const pdfFn = useServerFn(generateBatchReportPdf);
  const pdf = useMutation({
    mutationFn: () => pdfFn({ data: { project_id: projectId, report: report as never } }),
    onSuccess: (r: unknown) => {
      const url = (r as { url: string }).url;
      window.open(url, "_blank", "noopener");
      toast.success("Report PDF ready");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to export PDF"),
  });
  return (
    <div className="rounded-xl border border-brand/40 bg-brand/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-brand">Consolidated PermitHealth Report</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {report.documents_reviewed} plan{report.documents_reviewed === 1 ? "" : "s"} analyzed
            {report.documents_newly_reviewed > 0 ? ` · ${report.documents_newly_reviewed} newly reviewed` : ""}
            {report.jurisdictions.length > 0 ? ` · ${report.jurisdictions.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => pdf.mutate()} disabled={pdf.isPending} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50">
            {pdf.isPending ? "Exporting…" : "Export PDF"}
          </button>
          <button onClick={() => setShareOpen(true)} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80">Share</button>
          <button onClick={onClose} className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">Close</button>
        </div>
      </div>
      {shareOpen && <ShareReportDialog projectId={projectId} report={report} onClose={() => setShareOpen(false)} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Plan Health</p>
          <p className={`text-2xl font-bold ${riskColor}`}>{report.plan_health_score}</p>
          <p className="text-[10px] uppercase text-muted-foreground">{report.overall_risk} risk</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Findings</p>
          <p className="text-2xl font-bold">{report.total_findings}</p>
          <p className="text-[10px] uppercase text-destructive">{report.by_severity.high} high</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Medium</p>
          <p className="text-2xl font-bold text-amber-600">{report.by_severity.medium}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Low</p>
          <p className="text-2xl font-bold text-emerald-600">{report.by_severity.low}</p>
        </div>
      </div>

      {Object.keys(report.by_category).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(report.by_category).map(([k, v]) => (
            <span key={k} className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border border-border bg-background">
              {k.replace(/_/g, " ")} · {v}
            </span>
          ))}
        </div>
      )}

      {report.documents_failed.length > 0 && (
        <div className="text-xs text-destructive">
          Failed to review: {report.documents_failed.map((f) => f.name).join(", ")}
        </div>
      )}

      {report.top_findings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Top findings</p>
          <ul className="space-y-1.5">
            {report.top_findings.map((f, i) => (
              <li key={i} className="text-xs rounded-md border border-border bg-background p-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${f.severity === "high" ? "bg-destructive/15 text-destructive" : f.severity === "medium" ? "bg-amber-500/15 text-amber-700 dark:text-amber-500" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-500"}`}>{f.severity}</span>
                  <span className="text-[9px] font-mono uppercase text-muted-foreground">{f.category.replace(/_/g, " ")}</span>
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{f.detail}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {f.document_name}{f.sheet_reference ? ` · ${f.sheet_reference}` : ""}{f.code_reference ? ` · ${f.code_reference}` : ""}{f.local_amendment ? ` · Local: ${f.local_amendment}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.applied_amendments.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Applied amendments: {report.applied_amendments.slice(0, 6).join(" · ")}
        </p>
      )}
    </div>
  );
}

function ShareReportDialog({ projectId, report, onClose }: { projectId: string; report: Awaited<ReturnType<typeof batchReviewPlans>>; onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createBatchReportShare);
  const listFn = useServerFn(listBatchReportShares);
  const revokeFn = useServerFn(revokeBatchReportShare);
  const [password, setPassword] = useState("");
  const [expiresDays, setExpiresDays] = useState<string>("30");

  const list = useQuery({
    queryKey: ["report-shares", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: {
      project_id: projectId,
      report: report as unknown as Record<string, unknown>,
      password: password.trim() ? password.trim() : undefined,
      expires_in_days: expiresDays ? Number(expiresDays) : undefined,
    }}),
    onSuccess: async (r: unknown) => {
      const path = (r as { path: string }).path;
      const url = `${window.location.origin}${path}`;
      try { await navigator.clipboard.writeText(url); toast.success("Share link copied to clipboard"); }
      catch { toast.success("Share link created"); }
      setPassword("");
      qc.invalidateQueries({ queryKey: ["report-shares", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create share link"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => { toast.success("Link revoked"); qc.invalidateQueries({ queryKey: ["report-shares", projectId] }); },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-background border border-border p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-brand">Share PermitHealth Report</p>
            <p className="text-xs text-muted-foreground mt-0.5">Send reviewers a read-only link. Optional password and expiration.</p>
          </div>
          <button onClick={onClose} className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">Close</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs space-y-1">
            <span className="text-[10px] font-mono uppercase text-muted-foreground">Password (optional)</span>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank for open link" className="w-full h-9 px-2 rounded-md bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand" />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-[10px] font-mono uppercase text-muted-foreground">Expires in (days)</span>
            <select value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} className="w-full h-9 px-2 rounded-md bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand">
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="">Never</option>
            </select>
          </label>
        </div>

        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create share link"}
        </button>

        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Existing links</p>
          {list.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No share links yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {((list.data ?? []) as Array<{ id: string; path: string; token: string; expires_at: string | null; revoked_at: string | null; password_protected: boolean; view_count: number }>).map((s) => {
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}${s.path}`;
                const revoked = !!s.revoked_at;
                const expired = s.expires_at && new Date(s.expires_at).getTime() < Date.now();
                return (
                  <li key={s.id} className="rounded-md border border-border bg-card p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <code className="truncate text-[10px]">{url}</code>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}
                          className="text-[10px] font-mono uppercase text-brand hover:opacity-80"
                        >Copy</button>
                        {!revoked && (
                          <button
                            onClick={() => revoke.mutate(s.id)}
                            className="text-[10px] font-mono uppercase text-destructive hover:opacity-80"
                          >Revoke</button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {s.view_count} view{s.view_count === 1 ? "" : "s"}
                      {s.password_protected ? " · password" : ""}
                      {s.expires_at ? ` · expires ${new Date(s.expires_at).toLocaleDateString()}` : " · never expires"}
                      {revoked ? " · revoked" : expired ? " · expired" : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}



function DocRow({ doc, projectId, onDelete }: { doc: { id: string; name: string; url: string | null; size_bytes: number; created_at: string; mime_type: string; ai_summary?: string | null; ai_action_items?: unknown; analyzed_at?: string | null; plan_review?: unknown; plan_reviewed_at?: string | null }; projectId: string; onDelete: () => void }) {
  const analyzeFn = useServerFn(analyzeDocument);
  const reviewFn = useServerFn(reviewPlan);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const canAnalyze = (doc.mime_type || "").startsWith("image/") || (doc.mime_type || "") === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { id: doc.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs", projectId] }); qc.invalidateQueries({ queryKey: ["activity", projectId] }); setOpen(true); toast.success("AI analysis complete"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Analysis failed"),
  });
  const review = useMutation({
    mutationFn: () => reviewFn({ data: { id: doc.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs", projectId] }); qc.invalidateQueries({ queryKey: ["activity", projectId] }); setReviewOpen(true); toast.success("Plan review complete"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Plan review failed"),
  });
  const addFixesFn = useServerFn(addPlanReviewFixesToChecklist);
  const draftFn = useServerFn(draftReviewerResponse);
  const [letter, setLetter] = useState<string | null>(null);
  const addFixes = useMutation({
    mutationFn: () => addFixesFn({ data: { document_id: doc.id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["permit_items", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      toast.success(`Added ${r.inserted_count} fix${r.inserted_count === 1 ? "" : "es"} to checklist`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add fixes"),
  });
  const draft = useMutation({
    mutationFn: () => draftFn({ data: { document_id: doc.id } }),
    onSuccess: (r) => { setLetter(r.letter); toast.success("Response letter drafted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to draft response"),
  });
  const redlineFn = useServerFn(generateRedlinedPdf);
  const redline = useMutation({
    mutationFn: () => redlineFn({ data: { id: doc.id } }),
    onSuccess: (r) => {
      toast.success(`Redlined PDF ready — ${r.markups} markup${r.markups === 1 ? "" : "s"}`);
      window.open(r.url, "_blank", "noopener,noreferrer");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to generate redlined PDF"),
  });
  const items = Array.isArray(doc.ai_action_items) ? doc.ai_action_items as Array<{ reviewer?: string; discipline?: string; request: string; reference?: string }> : [];
  const pr = (doc.plan_review && typeof doc.plan_review === "object") ? doc.plan_review as {
    overall_summary?: string;
    overall_risk?: "low"|"medium"|"high";
    sheets_detected?: string[];
    jurisdiction_context?: { jurisdiction?: string; applied_amendments?: string[]; source_urls?: string[] };
    findings?: Array<{ category: string; severity: "low"|"medium"|"high"; title: string; detail: string; code_reference?: string; local_amendment?: string; sheet_reference?: string; recommendation?: string; confidence?: "low"|"medium"|"high"; evidence_quote?: string; needs_manual_verification?: boolean }>;
  } : null;
  const findings = pr?.findings ?? [];
  const categoryLabel: Record<string, string> = {
    missing_exits: "Missing Exits",
    ada: "ADA",
    fire_code: "Fire Code",
    permitting_mistake: "Permitting",
    other: "Other",
  };
  const sevClass: Record<string, string> = {
    high: "bg-destructive/15 text-destructive",
    medium: "bg-brand/15 text-brand",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <li className="p-3 bg-card ring-1 ring-black/5 rounded-xl">
      <div className="flex items-center gap-3">
        <FileText className="size-5 text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          {doc.url ? (
            <a href={doc.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-brand truncate block">{doc.name}</a>
          ) : (
            <span className="text-sm font-medium truncate block">{doc.name}</span>
          )}
          <p className="text-[11px] font-mono uppercase text-muted-foreground">
            {(doc.size_bytes / 1024).toFixed(1)} KB · {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
            {doc.analyzed_at && <> · <span className="text-brand">AI analyzed</span></>}
            {doc.plan_reviewed_at && <> · <span className="text-brand">Plan reviewed</span></>}
          </p>
        </div>
        {canAnalyze && (
          <>
            <button
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending}
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-brand/15 text-brand hover:bg-brand/25 disabled:opacity-50"
            >
              {analyze.isPending ? "Reading…" : doc.analyzed_at ? "Re-analyze" : "Analyze"}
            </button>
            <button
              onClick={() => review.mutate()}
              disabled={review.isPending}
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50"
              title="AI Plan Review: exits, ADA, fire code, permitting mistakes"
            >
              {review.isPending ? "Reviewing…" : doc.plan_reviewed_at ? "Re-review plan" : "Plan Review"}
            </button>
          </>
        )}
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
          <Trash2 className="size-4" />
        </button>
      </div>
      {doc.ai_summary && (
        <div className="mt-3 pl-8">
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80">
            {open ? "Hide" : "Show"} AI reading ({items.length} action{items.length === 1 ? "" : "s"})
          </button>
          {open && (
            <div className="mt-2 p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-2">
              <p className="text-sm text-foreground leading-relaxed">{doc.ai_summary}</p>
              {items.length > 0 && (
                <ul className="space-y-1.5">
                  {items.map((it, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-brand mt-1">•</span>
                      <span>
                        {(it.reviewer || it.discipline) && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1.5">
                            [{it.discipline || it.reviewer}]
                          </span>
                        )}
                        {it.request}
                        {it.reference && <span className="text-muted-foreground text-xs"> — {it.reference}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {pr && (
        <div className="mt-2 pl-8">
          <button onClick={() => setReviewOpen((v) => !v)} className="text-[11px] font-mono uppercase tracking-wider text-destructive hover:opacity-80">
            {reviewOpen ? "Hide" : "Show"} plan review ({findings.length} finding{findings.length === 1 ? "" : "s"}
            {pr.overall_risk ? ` · ${pr.overall_risk} risk` : ""})
          </button>
          {reviewOpen && (
            <div className="mt-2 p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-3">
              {pr.overall_summary && <p className="text-sm text-foreground leading-relaxed">{pr.overall_summary}</p>}
              {pr.sheets_detected && pr.sheets_detected.length > 0 && (
                <p className="text-[11px] font-mono uppercase text-muted-foreground">
                  Sheets: {pr.sheets_detected.join(", ")}
                </p>
              )}
              {pr.jurisdiction_context && (pr.jurisdiction_context.jurisdiction || (pr.jurisdiction_context.applied_amendments?.length ?? 0) > 0) && (
                <div className="p-2 rounded-md bg-brand/5 ring-1 ring-brand/20 space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-brand">
                    Jurisdiction: {pr.jurisdiction_context.jurisdiction || "—"}
                  </p>
                  {(pr.jurisdiction_context.applied_amendments?.length ?? 0) > 0 && (
                    <p className="text-xs text-foreground/80">
                      Applied: {pr.jurisdiction_context.applied_amendments!.join(" · ")}
                    </p>
                  )}
                  {(pr.jurisdiction_context.source_urls?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pr.jurisdiction_context.source_urls!.slice(0, 5).map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-brand hover:underline truncate max-w-[220px]">
                          {new URL(u).hostname}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issues flagged.</p>
              ) : (
                <ul className="space-y-2">
                  {findings.map((f, i) => (
                    <li key={i} className="p-2 rounded-md ring-1 ring-black/5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${sevClass[f.severity] || sevClass.medium}`}>
                          {f.severity}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          {categoryLabel[f.category] || f.category}
                        </span>
                        {f.sheet_reference && (
                          <span className="text-[10px] font-mono text-muted-foreground">Sheet {f.sheet_reference}</span>
                        )}
                        {f.code_reference && (
                          <span className="text-[10px] font-mono text-muted-foreground">{f.code_reference}</span>
                        )}
                        {f.local_amendment && (
                          <span className="text-[10px] font-mono text-brand">Local: {f.local_amendment}</span>
                        )}
                        {f.confidence && (
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${f.confidence === "high" ? "bg-brand/10 text-brand" : f.confidence === "low" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                            {f.confidence} conf
                          </span>
                        )}
                        {f.needs_manual_verification && (
                          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
                            verify manually
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-1">{f.title}</p>
                      <p className="text-sm text-foreground/80 mt-0.5">{f.detail}</p>
                      {f.evidence_quote && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{f.evidence_quote}"</p>
                      )}
                      {f.recommendation && (
                        <p className="text-xs text-muted-foreground mt-1"><span className="uppercase font-mono tracking-wider">Fix:</span> {f.recommendation}</p>
                      )}

                    </li>
                  ))}
                </ul>
              )}
              {findings.length > 0 && (
                <div className="pt-2 border-t border-border/50 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => addFixes.mutate()}
                      disabled={addFixes.isPending}
                      className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-brand/15 text-brand hover:bg-brand/25 disabled:opacity-50"
                    >
                      {addFixes.isPending ? "Adding…" : `Add ${findings.length} fix${findings.length === 1 ? "" : "es"} to checklist`}
                    </button>
                    <button
                      onClick={() => draft.mutate()}
                      disabled={draft.isPending}
                      className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-brand/15 text-brand hover:bg-brand/25 disabled:opacity-50"
                    >
                      {draft.isPending ? "Drafting…" : "Draft reviewer response"}
                    </button>
                    <button
                      onClick={() => redline.mutate()}
                      disabled={redline.isPending}
                      className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50"
                    >
                      {redline.isPending ? "Generating…" : "Download redlined PDF"}
                    </button>
                  </div>
                  {letter && (
                    <div className="p-3 rounded-lg bg-muted/40 ring-1 ring-black/5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Draft response letter</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { navigator.clipboard.writeText(letter); toast.success("Copied"); }}
                            className="text-[10px] font-mono uppercase tracking-wider text-brand hover:opacity-80"
                          >Copy</button>
                          <button
                            onClick={() => {
                              const blob = new Blob([letter], { type: "text/plain" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `${doc.name.replace(/\.[^.]+$/, "")}-response.txt`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="text-[10px] font-mono uppercase tracking-wider text-brand hover:opacity-80"
                          >Download</button>
                          <button
                            onClick={() => setLetter(null)}
                            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:opacity-80"
                          >Close</button>
                        </div>
                      </div>
                      <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-auto">{letter}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ---------------- Deadlines ---------------- */
function DeadlinesTab({ projectId }: { projectId: string }) {
  const listFn = useServerFn(listDeadlines);
  const addFn = useServerFn(addDeadline);
  const delFn = useServerFn(deleteDeadline);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  const q = useQuery({ queryKey: ["deadlines"], queryFn: () => listFn() });
  const ours = (q.data ?? []).filter((d) => d.project_id === projectId);

  useEffect(() => {
    const channel = supabase
      .channel(`deadlines:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deadlines", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["deadlines"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, qc]);

  const add = useMutation({
    mutationFn: () => addFn({ data: { project_id: projectId, title: title.trim(), due_date: date } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deadlines"] }); setTitle(""); setDate(""); toast.success("Deadline added"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deadlines"] }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold flex items-center gap-2">
        Deadlines & reminders
        <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
      </p>

      {ours.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No deadlines yet.</div>
      ) : (
        <ul className="space-y-2">
          {ours.map((d) => {
            const due = new Date(d.due_date);
            const overdue = due.getTime() < Date.now();
            return (
              <li key={d.id} className="p-3 bg-card ring-1 ring-black/5 rounded-xl flex items-center gap-3">
                <CalendarClock className={`size-5 shrink-0 ${overdue ? "text-destructive" : "text-brand"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className={`text-[11px] font-mono uppercase ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                    {format(due, "MMM d, yyyy")} · {formatDistanceToNow(due, { addSuffix: true })}
                  </p>
                </div>
                <button onClick={() => del.mutate(d.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (title.trim() && date) add.mutate(); }}
        className="space-y-2 p-3 bg-card ring-1 ring-black/5 rounded-xl"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Deadline title (e.g. Plans resubmittal)"
          className="w-full h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
          />
          <button
            disabled={add.isPending || !title.trim() || !date}
            className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

function MetaCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-foreground font-medium mt-1 block">{value}</span>
    </div>
  );
}

/* ---------------- Timeline ---------------- */
function TimelineTab({ projectId }: { projectId: string }) {
  const listFn = useServerFn(listActivity);
  const qc = useQueryClient();
  const [flashId, setFlashId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["activity", projectId],
    queryFn: () => listFn({ data: { project_id: projectId, limit: 100 } }),
  });

  useEffect(() => {
    const channel = supabase
      .channel(`activity:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const id = (payload.new as { id?: string })?.id;
          if (id) {
            setFlashId(id);
            setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 2000);
          }
          qc.invalidateQueries({ queryKey: ["activity", projectId] });
          qc.invalidateQueries({ queryKey: ["project", projectId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, qc]);

  const items = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            Audit timeline
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Every checklist, deadline, and stage change on this project.</p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{items.length} events</span>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No activity yet.</div>
      ) : (
        <ol className="relative border-l border-border ml-2 space-y-4 pl-5">
          {items.map((a) => {
            const isNew = a.id === flashId;
            return (
              <li key={a.id} className="relative">
                <span className={`absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-2 ring-background ${isNew ? "bg-emerald-500 animate-ping" : "bg-brand"}`} />
                <span className={`absolute -left-[26px] top-1.5 size-2.5 rounded-full ${isNew ? "bg-emerald-500" : "bg-brand"}`} />
                <div className={`p-3 bg-card ring-1 ring-black/5 rounded-xl transition-colors ${isNew ? "ring-emerald-500/50 bg-emerald-500/5" : ""}`}>
                  <p className="text-sm text-foreground">{a.description}</p>
                  <p className="text-[11px] font-mono uppercase text-muted-foreground mt-0.5">
                    {format(new Date(a.created_at), "MMM d, yyyy · h:mm a")} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ---------------- Live Jurisdiction Sync ---------------- */
type SyncRow = {
  id: string;
  status: string;
  portal_name: string;
  portal_url: string;
  source_url: string;
  summary: string;
  error: string;
  findings: Array<{ permit_or_record: string; status: string; applicant_or_address?: string; filed_or_updated?: string; notes?: string }>;
  updated_at: string;
  created_at: string;
};

function LiveJurisdictionSync({ projectId, jurisdiction }: { projectId: string; jurisdiction: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listJurisdictionSyncs);
  const syncFn = useServerFn(syncJurisdiction);

  const q = useQuery({
    queryKey: ["jurisdiction_syncs", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }) as unknown as Promise<SyncRow[]>,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`jsync-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jurisdiction_syncs", filter: `project_id=eq.${projectId}` }, () => {
        qc.invalidateQueries({ queryKey: ["jurisdiction_syncs", projectId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, qc]);

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { project_id: projectId } }),
    onSuccess: () => toast.success("Live sync complete"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const applyFn = useServerFn(applySyncToChecklist);
  const [applyReport, setApplyReport] = useState<{
    applied: Array<{ item_name: string; from_status: string; to_status: string | null; new_due_date: string | null; confidence: string; explanation: string; finding: string }>;
    skipped: Array<{ reason: string; explanation: string }>;
    total_findings: number;
  } | null>(null);
  const apply = useMutation({
    mutationFn: (syncId: string) => applyFn({ data: { sync_id: syncId } }) as unknown as Promise<NonNullable<typeof applyReport>>,
    onSuccess: (res) => {
      setApplyReport(res);
      qc.invalidateQueries({ queryKey: ["permit_items", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      toast.success(res.applied.length ? `Applied ${res.applied.length} update${res.applied.length === 1 ? "" : "s"} to checklist` : "No confident matches to apply");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Apply failed"),
  });

  const latest = q.data?.[0];
  const inflight = sync.isPending || (latest && (latest.status === "searching" || latest.status === "scraping"));

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">LIVE_JURISDICTION_SYNC</p>
          {inflight && <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>}
        </div>
        <button
          onClick={() => sync.mutate()}
          disabled={!!inflight || !jurisdiction}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
          title={!jurisdiction ? "Add a jurisdiction first" : ""}
        >
          {inflight ? <RefreshCw className="size-3 animate-spin" /> : <Radio className="size-3" />}
          {inflight ? "Syncing…" : latest ? "Re-sync" : "Sync now"}
        </button>
      </div>

      {!jurisdiction ? (
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl text-sm text-muted-foreground">
          Add a jurisdiction to this project (e.g. "Los Angeles, CA") to enable live portal sync.
        </div>
      ) : !latest ? (
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
          <p className="text-sm text-muted-foreground">
            No sync yet. Tap <span className="font-mono text-brand">Sync now</span> to scan {jurisdiction}'s official permit portal and pull matching records for this project.
          </p>
        </div>
      ) : (
        <div className={`p-4 bg-card ring-1 rounded-xl ${latest.status === "error" ? "ring-red-500/40" : "ring-black/5"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {latest.portal_name || (latest.status === "error" ? "Sync failed" : "Working…")}
              </p>
              {latest.portal_url && (
                <a href={latest.portal_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[11px] font-mono text-brand hover:underline break-all">
                  {latest.portal_url}
                </a>
              )}
            </div>
            <span className="shrink-0 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {latest.status}
            </span>
          </div>

          {latest.summary && (
            <p className="mt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{latest.summary}</p>
          )}

          {latest.error && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{latest.error}</p>
          )}

          {latest.findings?.length > 0 && (
            <ul className="mt-4 space-y-2">
              {latest.findings.map((f, i) => (
                <li key={i} className="p-3 rounded-lg bg-background ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{f.permit_or_record}</p>
                    <span className="shrink-0 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-brand/15 text-brand">{f.status}</span>
                  </div>
                  {(f.applicant_or_address || f.filed_or_updated) && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[f.applicant_or_address, f.filed_or_updated].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {f.notes && <p className="mt-1 text-xs text-muted-foreground">{f.notes}</p>}
                </li>
              ))}
            </ul>
          )}

          {latest.status === "complete" && latest.findings?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-black/5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Auto-match to checklist
                </p>
                <button
                  onClick={() => apply.mutate(latest.id)}
                  disabled={apply.isPending}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
                >
                  {apply.isPending ? <RefreshCw className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  {apply.isPending ? "Matching…" : "Apply to checklist"}
                </button>
              </div>
              {applyReport && (
                <div className="mt-3 space-y-2">
                  {applyReport.applied.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No confident matches to apply. {applyReport.skipped.length > 0 ? `${applyReport.skipped.length} finding${applyReport.skipped.length === 1 ? "" : "s"} skipped (low confidence or no change).` : ""}
                    </p>
                  )}
                  {applyReport.applied.map((a, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-emerald-500/5 ring-1 ring-emerald-500/20">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{a.item_name}</p>
                        <span className="shrink-0 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{a.confidence}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                        {a.from_status.replace(/_/g, " ")}
                        {a.to_status ? ` → ${a.to_status.replace(/_/g, " ")}` : " (status kept)"}
                        {a.new_due_date ? ` · due ${a.new_due_date}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-foreground/80">{a.explanation}</p>
                      <p className="mt-1 text-[10px] font-mono text-muted-foreground">source: {a.finding}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="mt-3 text-[10px] font-mono uppercase text-muted-foreground">
            Updated {formatDistanceToNow(new Date(latest.updated_at), { addSuffix: true })}
          </p>
        </div>
      )}
    </section>
  );
}


/* ---------------- Health Score ---------------- */
function HealthScoreCard({ projectId }: { projectId: string }) {
  const healthFn = useServerFn(computeProjectHealth);
  const q = useQuery({
    queryKey: ["health", projectId],
    queryFn: () => healthFn({ data: { project_id: projectId } }),
    refetchInterval: 30000,
  });

  if (q.isLoading || !q.data) {
    return (
      <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Permit Health</p>
        <p className="text-sm text-muted-foreground mt-1">Calculating…</p>
      </section>
    );
  }
  const { score, risk, reasons } = q.data;
  const riskColor =
    risk === "low" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15" :
    risk === "medium" ? "text-amber-700 dark:text-amber-300 bg-amber-500/15" :
    "text-destructive bg-destructive/15";
  const scoreColor = score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-destructive";
  return (
    <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg viewBox="0 0 60 60" className="size-16 -rotate-90">
            <circle cx="30" cy="30" r="26" strokeWidth="6" className="stroke-muted" fill="none" />
            <circle
              cx="30" cy="30" r="26" strokeWidth="6" fill="none"
              strokeLinecap="round"
              className={scoreColor}
              stroke="currentColor"
              strokeDasharray={`${(score / 100) * 163.4} 163.4`}
            />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center text-xl font-bold ${scoreColor}`}>{score}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Permit Health</p>
            <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${riskColor}`}>
              {risk} risk
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {reasons.slice(0, 4).map((r, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {r}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Inspections ---------------- */
type InspectionRow = {
  id: string;
  inspection_type: string;
  status: string;
  scheduled_date: string | null;
  inspector: string | null;
  result: string | null;
};

function InspectionsTab({ projectId, userId }: { projectId: string; userId: string }) {
  void userId;
  const listFn = useServerFn(listInspections);
  const addFn = useServerFn(addInspection);
  const delFn = useServerFn(deleteInspection);
  const qc = useQueryClient();
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [inspector, setInspector] = useState("");

  const q = useQuery({ queryKey: ["inspections", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });

  useEffect(() => {
    const ch = supabase
      .channel(`insp:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inspections", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["inspections", projectId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, qc]);

  const add = useMutation({
    mutationFn: () => addFn({ data: { project_id: projectId, inspection_type: type.trim(), scheduled_date: date || null, inspector } }),
    onSuccess: () => { setType(""); setDate(""); setInspector(""); toast.success("Inspection scheduled"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspections", projectId] }),
  });

  const rows = (q.data ?? []) as InspectionRow[];
  const statusColor: Record<string, string> = {
    scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    passed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    failed: "bg-destructive/15 text-destructive",
    rescheduled: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    canceled: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">On-site inspections</p>
        <p className="text-xs text-muted-foreground">Tap any inspection to enter mobile Inspection Mode.</p>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No inspections yet.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((i) => (
            <li key={i.id} className="p-3 bg-card ring-1 ring-black/5 rounded-xl flex items-center gap-3">
              <Link to="/inspections/$id" params={{ id: i.id }} className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{i.inspection_type}</p>
                <p className="text-[11px] font-mono uppercase text-muted-foreground">
                  {i.scheduled_date ? format(new Date(i.scheduled_date), "MMM d, yyyy") : "unscheduled"}
                  {i.inspector ? ` · ${i.inspector}` : ""}
                </p>
              </Link>
              <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${statusColor[i.status] ?? "bg-muted"}`}>{i.status}</span>
              <button onClick={() => del.mutate(i.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (type.trim()) add.mutate(); }}
        className="space-y-2 p-3 bg-card ring-1 ring-black/5 rounded-xl"
      >
        <input
          value={type} onChange={(e) => setType(e.target.value)}
          placeholder="Inspection type (e.g. Rough Electrical)"
          className="w-full h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
        />
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="flex-1 h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand" />
          <input value={inspector} onChange={(e) => setInspector(e.target.value)}
            placeholder="Inspector"
            className="flex-1 h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand" />
        </div>
        <button disabled={add.isPending || !type.trim()}
          className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
          Schedule inspection
        </button>
      </form>
    </div>
  );
}

/* ---------------- AI Copilot ---------------- */
type CopilotTool = "update" | "review" | "agenda" | "risk";

function AiCopilotPanel({ projectId }: { projectId: string }) {
  const [tool, setTool] = useState<CopilotTool | null>(null);
  const [tone, setTone] = useState<"formal" | "friendly" | "brief">("friendly");
  const [meetingType, setMeetingType] = useState<"kickoff" | "weekly_status" | "pre_submittal" | "review_response" | "inspection_prep">("weekly_status");

  const draftFn = useServerFn(draftClientUpdate);
  const reviewFn = useServerFn(summarizeReviewerComments);
  const agendaFn = useServerFn(generateMeetingAgenda);
  const riskFn = useServerFn(flagScheduleRisks);

  const draft = useMutation({ mutationFn: () => draftFn({ data: { project_id: projectId, tone, audience: "Client / owner" } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const review = useMutation({ mutationFn: () => reviewFn({ data: { project_id: projectId } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const agenda = useMutation({ mutationFn: () => agendaFn({ data: { project_id: projectId, meeting_type: meetingType } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const risk = useMutation({ mutationFn: () => riskFn({ data: { project_id: projectId } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); };

  const tools: Array<{ id: CopilotTool; label: string; desc: string }> = [
    { id: "update", label: "Client update", desc: "Draft status email" },
    { id: "review", label: "Reviewer summary", desc: "Group comments by discipline" },
    { id: "agenda", label: "Meeting agenda", desc: "Generate a tight agenda" },
    { id: "risk", label: "Schedule risks", desc: "Flag delays & bottlenecks" },
  ];

  return (
    <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid size-7 place-items-center rounded-md bg-brand/15 text-brand">
          <Sparkles className="size-4" />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI_COPILOT</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(tool === t.id ? null : t.id)}
            className={`text-left rounded-lg p-3 ring-1 transition ${tool === t.id ? "ring-brand bg-brand/5" : "ring-black/5 bg-background hover:ring-brand/40"}`}
          >
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
          </button>
        ))}
      </div>

      {tool === "update" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Tone:</span>
            {(["friendly", "formal", "brief"] as const).map((t) => (
              <button key={t} onClick={() => setTone(t)} className={`px-2 py-1 rounded font-mono uppercase text-[10px] tracking-wider ${tone === t ? "bg-brand text-brand-foreground" : "bg-muted"}`}>{t}</button>
            ))}
            <button onClick={() => draft.mutate()} disabled={draft.isPending} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50">
              {draft.isPending ? "Drafting…" : draft.data ? <><RefreshCw className="size-3" /> Regenerate</> : <><Sparkles className="size-3" /> Generate</>}
            </button>
          </div>
          {draft.data && (
            <div className="p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-2">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Subject</div>
              <div className="text-sm font-medium">{draft.data.subject}</div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground pt-2">Body</div>
              <div className="text-sm prose-sm [&_p]:my-2 [&_ul]:pl-5 [&_ul]:list-disc"><ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.data.body_markdown}</ReactMarkdown></div>
              <button onClick={() => copy(`${draft.data!.subject}\n\n${draft.data!.body_markdown}`)} className="text-[11px] font-mono uppercase tracking-wider text-brand">Copy</button>
            </div>
          )}
        </div>
      )}

      {tool === "review" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Consolidate reviewer comments from analyzed docs</span>
            <button onClick={() => review.mutate()} disabled={review.isPending} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand disabled:opacity-50">
              {review.isPending ? "Thinking…" : review.data ? <><RefreshCw className="size-3" /> Regenerate</> : <><Sparkles className="size-3" /> Generate</>}
            </button>
          </div>
          {review.data && (
            <div className="p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-3 text-sm">
              {(review.data.top_themes ?? []).length > 0 && (
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Top themes</div>
                  <ul className="list-disc pl-5 space-y-0.5">{(review.data.top_themes ?? []).map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
              )}
              {(review.data.by_discipline ?? []).map((d, i) => (
                <div key={i}>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">{d.discipline}</div>
                  <ul className="list-disc pl-5 space-y-0.5">{(d.items ?? []).map((it, j) => <li key={j}>{it}</li>)}</ul>
                </div>
              ))}
              {(review.data.suggested_response_order ?? []).length > 0 && (
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Suggested response order</div>
                  <ol className="list-decimal pl-5 space-y-0.5">{(review.data.suggested_response_order ?? []).map((t, i) => <li key={i}>{t}</li>)}</ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tool === "agenda" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-muted-foreground">Type:</span>
            {(["weekly_status", "kickoff", "pre_submittal", "review_response", "inspection_prep"] as const).map((t) => (
              <button key={t} onClick={() => setMeetingType(t)} className={`px-2 py-1 rounded font-mono uppercase text-[10px] tracking-wider ${meetingType === t ? "bg-brand text-brand-foreground" : "bg-muted"}`}>{t.replace(/_/g, " ")}</button>
            ))}
            <button onClick={() => agenda.mutate()} disabled={agenda.isPending} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand disabled:opacity-50">
              {agenda.isPending ? "Building…" : agenda.data ? <><RefreshCw className="size-3" /> Regenerate</> : <><Sparkles className="size-3" /> Generate</>}
            </button>
          </div>
          {agenda.data && (
            <div className="p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-2 text-sm">
              <div className="font-semibold">{agenda.data.title} <span className="text-xs text-muted-foreground font-normal">· {agenda.data.duration_minutes} min</span></div>
              {(agenda.data.attendees_suggested ?? []).length > 0 && (
                <div className="text-xs text-muted-foreground">Attendees: {(agenda.data.attendees_suggested ?? []).join(", ")}</div>
              )}
              <ol className="space-y-1.5 mt-2">
                {(agenda.data.agenda ?? []).map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-mono text-xs text-muted-foreground w-10 shrink-0 pt-0.5">{a.minutes}m</span>
                    <div>
                      <div>{a.topic}</div>
                      {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              {(agenda.data.decisions_needed ?? []).length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Decisions needed</div>
                  <ul className="list-disc pl-5 space-y-0.5">{(agenda.data.decisions_needed ?? []).map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tool === "risk" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Analyze deadlines, permits, and inspections for risks</span>
            <button onClick={() => risk.mutate()} disabled={risk.isPending} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand disabled:opacity-50">
              {risk.isPending ? "Analyzing…" : risk.data ? <><RefreshCw className="size-3" /> Rerun</> : <><Sparkles className="size-3" /> Analyze</>}
            </button>
          </div>
          {risk.data && (
            <div className="p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Overall risk</span>
                <span className={`text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded ${risk.data.overall_risk === "high" ? "bg-red-500/15 text-red-600" : risk.data.overall_risk === "medium" ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700"}`}>{risk.data.overall_risk}</span>
              </div>
              {(risk.data.risks ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground">No risks detected from current data.</div>
              ) : (
                <ul className="space-y-2">
                  {(risk.data.risks ?? []).map((r, i) => (
                    <li key={i} className="p-2 rounded bg-card ring-1 ring-black/5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${r.severity === "high" ? "bg-red-500/15 text-red-600" : r.severity === "medium" ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700"}`}>{r.severity}</span>
                        <div className="font-medium">{r.title}</div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{r.detail}</div>
                      {r.mitigation && <div className="text-xs mt-1"><span className="text-muted-foreground">Mitigation:</span> {r.mitigation}</div>}
                      {r.related && <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">{r.related}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------- Live Permit Card (per-project number tracking) ---------------- */
type LivePermitData = {
  permit_number?: string;
  permit_type?: string;
  status?: string;
  address?: string;
  applicant?: string;
  filed_date?: string;
  updated_date?: string;
  issued_date?: string;
  expiration_date?: string;
  next_inspection?: string;
  description?: string;
  fees_due?: string;
  reviewers?: Array<{ discipline: string; status: string; name?: string }>;
  timeline?: Array<{ date: string; event: string }>;
  source_url?: string;
  portal_name?: string;
  jurisdiction?: string;
  found?: boolean;
  no_match_reason?: string;
};

function LivePermitCard({
  project,
  onChange,
}: {
  project: { id: string; jurisdiction: string; linked_permit_number?: string | null; linked_permit_url?: string | null; linked_permit_data?: unknown; linked_permit_synced_at?: string | null };
  onChange: () => void;
}) {
  const linkFn = useServerFn(linkPermitToProject);
  const refreshFn = useServerFn(refreshLinkedPermit);
  const unlinkFnCall = useServerFn(unlinkPermit);
  const historyFn = useServerFn(listPermitSyncHistory);
  const [permitNumber, setPermitNumber] = useState("");
  const [jurisdictionOverride, setJurisdictionOverride] = useState(project.jurisdiction || "");
  const [showHistory, setShowHistory] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const historyQ = useQuery({
    queryKey: ["permit_sync_history", project.id, project.linked_permit_synced_at ?? ""],
    queryFn: () => historyFn({ data: { project_id: project.id, limit: 25 } }),
    enabled: showHistory && Boolean(project.linked_permit_number),
  });

  const link = useMutation({
    mutationFn: () => linkFn({ data: { project_id: project.id, permit_number: permitNumber.trim(), jurisdiction: jurisdictionOverride.trim() || undefined } }),
    onSuccess: (r) => {
      onChange();
      setPermitNumber("");
      toast.success(r.linked.found ? `Linked ${r.linked.permit_number} — ${r.linked.status}` : "Linked. No live record found yet.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to link permit"),
  });
  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { project_id: project.id } }),
    onSuccess: (r) => { onChange(); toast.success(`Refreshed — ${r.linked.status}`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Refresh failed"),
  });
  const unlink = useMutation({
    mutationFn: () => unlinkFnCall({ data: { project_id: project.id } }),
    onSuccess: () => { onChange(); toast.success("Unlinked"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unlink failed"),
  });

  const d = (project.linked_permit_data ?? null) as LivePermitData | null;
  const linked = Boolean(project.linked_permit_number);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">LIVE_PERMIT_TRACKING</p>
        {linked && (
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Syncing…" : "Refresh"}
          </button>
        )}
      </div>

      {!linked ? (
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter an official permit / record number to pull live status directly from the jurisdiction portal.
          </p>
          <div className="grid gap-2">
            <input
              value={permitNumber}
              onChange={(e) => setPermitNumber(e.target.value)}
              placeholder="Permit # (e.g. B2024-01234)"
              className="h-10 px-3 rounded-lg bg-background ring-1 ring-border text-sm"
            />
            <input
              value={jurisdictionOverride}
              onChange={(e) => setJurisdictionOverride(e.target.value)}
              placeholder="Jurisdiction (City, ST or County, ST)"
              className="h-10 px-3 rounded-lg bg-background ring-1 ring-border text-sm"
            />
            <button
              onClick={() => link.mutate()}
              disabled={link.isPending || permitNumber.trim().length < 2}
              className="h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {link.isPending ? "Fetching live status…" : "Link & fetch live status"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">PERMIT_NUMBER</p>
              <p className="text-base font-semibold truncate">{project.linked_permit_number}</p>
              {d?.portal_name && <p className="text-[11px] text-muted-foreground mt-0.5">{d.portal_name}</p>}
            </div>
            <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded ${
              d?.status && /issued|approved|finaled|ready/i.test(d.status) ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
              d?.status && /review|submitted|pending|plan/i.test(d.status) ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
              d?.status && /expired|withdrawn|rejected/i.test(d.status) ? "bg-red-500/15 text-red-600 dark:text-red-400" :
              "bg-muted text-muted-foreground"
            }`}>
              {d?.status || "Unknown"}
            </span>
          </div>

          {d && !d.found && d.no_match_reason && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{d.no_match_reason}</p>
          )}

          {d && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {d.permit_type && <div><span className="text-muted-foreground">Type: </span><span className="font-medium">{d.permit_type}</span></div>}
              {d.address && <div className="col-span-2"><span className="text-muted-foreground">Address: </span><span className="font-medium">{d.address}</span></div>}
              {d.applicant && <div className="col-span-2"><span className="text-muted-foreground">Applicant: </span><span className="font-medium">{d.applicant}</span></div>}
              {d.filed_date && <div><span className="text-muted-foreground">Filed: </span><span className="font-medium">{d.filed_date}</span></div>}
              {d.issued_date && <div><span className="text-muted-foreground">Issued: </span><span className="font-medium">{d.issued_date}</span></div>}
              {d.updated_date && <div><span className="text-muted-foreground">Updated: </span><span className="font-medium">{d.updated_date}</span></div>}
              {d.expiration_date && <div><span className="text-muted-foreground">Expires: </span><span className="font-medium">{d.expiration_date}</span></div>}
              {d.next_inspection && <div className="col-span-2"><span className="text-muted-foreground">Next inspection: </span><span className="font-medium">{d.next_inspection}</span></div>}
              {d.fees_due && <div className="col-span-2"><span className="text-muted-foreground">Fees due: </span><span className="font-medium">{d.fees_due}</span></div>}
            </div>
          )}

          {d?.description && <p className="text-xs text-muted-foreground">{d.description}</p>}

          {d?.reviewers && d.reviewers.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">REVIEWERS</p>
              <div className="grid gap-1">
                {d.reviewers.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span>{r.discipline}{r.name ? ` — ${r.name}` : ""}</span>
                    <span className={`font-mono uppercase text-[10px] px-1.5 py-0.5 rounded ${
                      /approv/i.test(r.status) ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                      /reject/i.test(r.status) ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                      "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d?.timeline && d.timeline.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">TIMELINE</p>
              <ul className="space-y-1 text-xs">
                {d.timeline.slice(0, 8).map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-muted-foreground w-24 shrink-0">{t.date}</span>
                    <span>{t.event}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-[10px] font-mono uppercase text-muted-foreground">
              {project.linked_permit_synced_at ? `Synced ${formatDistanceToNow(new Date(project.linked_permit_synced_at), { addSuffix: true })}` : ""}
            </div>
            <div className="flex items-center gap-3">
              {(project.linked_permit_url || d?.source_url) && (
                <a href={project.linked_permit_url || d?.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80">
                  Open portal ↗
                </a>
              )}
              <button
                onClick={() => unlink.mutate()}
                disabled={unlink.isPending}
                className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-red-500 disabled:opacity-50"
              >
                Unlink
              </button>
            </div>
          </div>

          <PortalDeepLinks
            jurisdiction={project.jurisdiction}
            permitNumber={project.linked_permit_number ?? ""}
            address={d?.address ?? ""}
          />



          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setShowHistory((s) => !s)}
              className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {showHistory ? "▾ Hide sync history" : "▸ Sync history"}
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1.5">
                {historyQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                {historyQ.data && historyQ.data.history.length === 0 && (
                  <p className="text-xs text-muted-foreground">No syncs recorded yet.</p>
                )}
                {historyQ.data?.history.map((h) => {
                  const isOpen = expandedRow === h.id;
                  const snap = h.snapshot as LivePermitData | null;
                  const fields = snap
                    ? [
                        snap.permit_type && ["Type", snap.permit_type],
                        snap.address && ["Address", snap.address],
                        snap.applicant && ["Applicant", snap.applicant],
                        snap.filed_date && ["Filed", snap.filed_date],
                        snap.issued_date && ["Issued", snap.issued_date],
                        snap.updated_date && ["Updated", snap.updated_date],
                        snap.expiration_date && ["Expires", snap.expiration_date],
                        snap.next_inspection && ["Next inspection", snap.next_inspection],
                        snap.fees_due && ["Fees due", snap.fees_due],
                      ].filter(Boolean) as [string, string][]
                    : [];
                  return (
                    <div key={h.id} className="rounded-lg bg-background ring-1 ring-border overflow-hidden">
                      <button
                        onClick={() => setExpandedRow(isOpen ? null : h.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase text-muted-foreground w-4 shrink-0">{isOpen ? "▾" : "▸"}</span>
                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-muted-foreground shrink-0">· {h.trigger}</span>
                          <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ml-1 truncate ${
                            /issued|approved|finaled|ready/i.test(h.status) ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                            /review|submitted|pending|plan/i.test(h.status) ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                            /expired|withdrawn|rejected/i.test(h.status) ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                            "bg-muted text-muted-foreground"
                          }`}>{h.status || (h.found ? "Found" : "No match")}</span>
                        </div>
                        {h.source_url && (
                          <a href={h.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] font-mono uppercase text-brand hover:opacity-80 shrink-0">Portal ↗</a>
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">
                          {h.portal_name && <p className="text-[11px] text-muted-foreground">{h.portal_name} · {h.jurisdiction}</p>}
                          {fields.length > 0 && (
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              {fields.map(([k, v]) => (
                                <div key={k} className={k === "Address" || k === "Applicant" || k === "Next inspection" || k === "Fees due" ? "col-span-2" : ""}>
                                  <span className="text-muted-foreground">{k}: </span>
                                  <span className="font-medium">{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {snap?.description && <p className="text-xs text-muted-foreground">{snap.description}</p>}
                          <details className="text-[11px]">
                            <summary className="cursor-pointer font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">Raw portal response</summary>
                            <pre className="mt-1.5 p-2 rounded bg-muted text-[10px] overflow-x-auto max-h-64">{JSON.stringify(snap, null, 2)}</pre>
                          </details>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PortalDeepLinks({ jurisdiction, permitNumber, address }: { jurisdiction: string; permitNumber: string; address: string }) {
  const listFn = useServerFn(listPortalMappings);
  const mappingsQ = useQuery({ queryKey: ["portal-mappings"], queryFn: () => listFn(), staleTime: 60_000 });
  const extra = useMemo(
    () => (mappingsQ.data ?? []).filter((m) => m.is_active).map(buildEntryFromMapping),
    [mappingsQ.data],
  );
  const matches = useMemo(
    () => findPortalDeepLinks(jurisdiction, { permitNumber: permitNumber || undefined, address: address || undefined, limit: 4, extra }),
    [jurisdiction, permitNumber, address, extra],
  );
  if (matches.length === 0) return null;

  return (
    <div className="pt-2 border-t border-border">
      <p className="text-[10px] font-mono uppercase tracking-widest text-brand mb-1.5">DIRECT PORTAL DEEP LINKS</p>
      <div className="flex flex-wrap gap-1.5">
        {matches.map((m, i) => (
          <a
            key={`${m.entry.jurisdiction}-${i}`}
            href={m.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:border-brand"
            title={`${m.entry.platform} — ${m.linkKind === "permit" ? "permit# prefilled" : m.linkKind === "address" ? "address prefilled" : "portal home"}`}
          >
            <span className="font-medium">{m.entry.jurisdiction}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{m.entry.state}</span>
            {m.linkKind === "permit" && <span className="font-mono text-[10px] text-brand">#</span>}
            {m.linkKind === "address" && <span className="font-mono text-[10px] text-brand">@</span>}
          </a>
        ))}
        <Link
          to="/portals"
          search={{ q: jurisdiction, state: "", platform: "", address, permit: permitNumber }}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          More portals →
        </Link>
      </div>
    </div>
  );
}



