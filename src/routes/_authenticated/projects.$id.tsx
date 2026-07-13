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
  computeProjectHealth,
  listInspections,
  addInspection,
  deleteInspection,
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

function DocRow({ doc, projectId, onDelete }: { doc: { id: string; name: string; url: string | null; size_bytes: number; created_at: string; mime_type: string; ai_summary?: string | null; ai_action_items?: unknown; analyzed_at?: string | null }; projectId: string; onDelete: () => void }) {
  const analyzeFn = useServerFn(analyzeDocument);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const canAnalyze = (doc.mime_type || "").startsWith("image/") || (doc.mime_type || "") === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { id: doc.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs", projectId] }); qc.invalidateQueries({ queryKey: ["activity", projectId] }); setOpen(true); toast.success("AI analysis complete"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Analysis failed"),
  });
  const items = Array.isArray(doc.ai_action_items) ? doc.ai_action_items as Array<{ reviewer?: string; discipline?: string; request: string; reference?: string }> : [];
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
          </p>
        </div>
        {canAnalyze && (
          <button
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending}
            className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-brand/15 text-brand hover:bg-brand/25 disabled:opacity-50"
          >
            {analyze.isPending ? "Reading…" : doc.analyzed_at ? "Re-analyze" : "Analyze"}
          </button>
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

