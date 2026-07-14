import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getProject, updateProject } from "@/lib/projects.functions";
import { ArrowLeft, MapPin, Landmark, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { OverviewTab } from "@/components/project/OverviewTab";
import { ChecklistTab } from "@/components/project/ChecklistTab";
import { DocsTab } from "@/components/project/DocsTab";
import { DeadlinesTab } from "@/components/project/DeadlinesTab";
import { InspectionsTab } from "@/components/project/InspectionsTab";
import { TimelineTab } from "@/components/project/TimelineTab";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: ProjectDetail,
});

type Tab = "overview" | "checklist" | "docs" | "deadlines" | "inspections" | "timeline";

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);

  const getFn = useServerFn(getProject);
  const updateFn = useServerFn(updateProject);
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
