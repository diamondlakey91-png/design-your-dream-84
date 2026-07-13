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
  addDeadline,
  deleteDeadline,
  listDeadlines,
  listActivity,
  syncJurisdiction,
  listJurisdictionSyncs,
  applySyncToChecklist,
  analyzeDocument,
  reviewPlan,
  computeProjectHealth,
  listInspections,
  addInspection,
  deleteInspection,
  draftClientUpdate,
  summarizeReviewerComments,
  generateMeetingAgenda,
  flagScheduleRisks,
} from "@/lib/permits.functions";
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
} from "lucide-react";
import { STAGES } from "@/lib/permits";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useRef, useEffect } from "react";
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
};
const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  under_review: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  issued: "bg-brand/20 text-brand",
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
  project: { id: string; name: string; project_type: string; location: string; jurisdiction: string; current_stage: number; permit_count: number; permits_issued: number };
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
      <section>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">PERMIT_PIPELINE</p>
        <div className="flex gap-1 mb-4">
          {STAGES.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < stage ? "bg-brand" : i === stage ? "bg-brand/40" : "bg-muted"}`} />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1 text-center">
          {STAGES.map((s, i) => (
            <div key={s} className={`text-[9px] font-mono uppercase tracking-tight leading-tight ${i <= stage ? "text-foreground" : "text-muted-foreground"}`}>
              {s.replace(" ", "\n")}
            </div>
          ))}
        </div>
        {stage < 4 && (
          <button
            onClick={() => advance.mutate()}
            disabled={advance.isPending}
            className="mt-5 w-full inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {advance.isPending ? "Advancing…" : <>Advance to {STAGES[stage + 1]} <ArrowRight className="size-4" /></>}
          </button>
        )}
      </section>

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
  const done = items.filter((i) => i.status === "issued" || i.status === "approved").length;

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
                {(["not_started", "submitted", "under_review", "approved", "issued"] as const).map((s) => (
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Project documents</p>
          <p className="text-xs text-muted-foreground">Plans, permits, correspondence — private to you.</p>
        </div>
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
  const items = Array.isArray(doc.ai_action_items) ? doc.ai_action_items as Array<{ reviewer?: string; discipline?: string; request: string; reference?: string }> : [];
  const pr = (doc.plan_review && typeof doc.plan_review === "object") ? doc.plan_review as {
    overall_summary?: string;
    overall_risk?: "low"|"medium"|"high";
    sheets_detected?: string[];
    jurisdiction_context?: { jurisdiction?: string; applied_amendments?: string[]; source_urls?: string[] };
    findings?: Array<{ category: string; severity: "low"|"medium"|"high"; title: string; detail: string; code_reference?: string; local_amendment?: string; sheet_reference?: string; recommendation?: string }>;
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
                      </div>
                      <p className="text-sm font-medium mt-1">{f.title}</p>
                      <p className="text-sm text-foreground/80 mt-0.5">{f.detail}</p>
                      {f.recommendation && (
                        <p className="text-xs text-muted-foreground mt-1"><span className="uppercase font-mono tracking-wider">Fix:</span> {f.recommendation}</p>
                      )}
                    </li>
                  ))}
                </ul>
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

