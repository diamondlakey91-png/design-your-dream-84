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

type Tab = "overview" | "checklist" | "docs" | "deadlines" | "timeline";

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
          {(["overview", "checklist", "docs", "deadlines", "timeline"] as Tab[]).map((t) => (
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
            <li key={d.id} className="p-3 bg-card ring-1 ring-black/5 rounded-xl flex items-center gap-3">
              <FileText className="size-5 text-brand shrink-0" />
              <div className="flex-1 min-w-0">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-brand truncate block">{d.name}</a>
                ) : (
                  <span className="text-sm font-medium truncate block">{d.name}</span>
                )}
                <p className="text-[11px] font-mono uppercase text-muted-foreground">
                  {(d.size_bytes / 1024).toFixed(1)} KB · {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                </p>
              </div>
              <button onClick={() => del.mutate(d.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
