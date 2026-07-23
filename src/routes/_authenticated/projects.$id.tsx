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
import { JurisdictionAutocomplete } from "@/components/JurisdictionAutocomplete";
import { OverviewTab } from "@/components/project/OverviewTab";
import { ChecklistTab } from "@/components/project/ChecklistTab";
import { DocsTab } from "@/components/project/DocsTab";
import { DeadlinesTab } from "@/components/project/DeadlinesTab";
import { InspectionsTab } from "@/components/project/InspectionsTab";
import { TimelineTab } from "@/components/project/TimelineTab";
import { ScopeTab } from "@/components/project/ScopeTab";

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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <div className="mt-1 text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
              {project.jurisdiction && <span className="inline-flex items-center gap-1"><Landmark className="size-3.5" />{project.jurisdiction}</span>}
              {project.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{project.location}</span>}
              {project.project_type && <span className="inline-flex items-center gap-1">· {project.project_type}</span>}
            </div>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest px-2.5 py-1.5 rounded border border-border hover:border-brand hover:text-brand"
          >
            <Pencil className="size-3.5" /> Edit
          </button>
        </div>
      </header>

      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSave={async (patch) => {
          try {
            await updateFn({ data: { id, ...patch } });
            toast.success("Project updated");
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ["project", id] });
            qc.invalidateQueries({ queryKey: ["projects"] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Update failed");
          }
        }}
      />

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

type EditPatch = {
  name?: string;
  location?: string;
  project_type?: string;
  jurisdiction?: string;
  permit_count?: number;
};

function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: { name: string; location: string | null; project_type: string | null; jurisdiction: string | null; permit_count: number };
  onSave: (patch: EditPatch) => void | Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [location, setLocation] = useState(project.location ?? "");
  const [projectType, setProjectType] = useState(project.project_type ?? "");
  const [jurisdiction, setJurisdiction] = useState(project.jurisdiction ?? "");
  const [permitCount, setPermitCount] = useState(String(project.permit_count ?? 0));
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Project name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Jurisdiction</Label>
            <JurisdictionAutocomplete value={jurisdiction} onChange={setJurisdiction} />
            <p className="text-[11px] text-muted-foreground">
              Pick from the library to guarantee the AI uses the right codes, portals, and amendments.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Address / location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project type</Label>
              <Input value={projectType} onChange={(e) => setProjectType(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label>Permit count</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={permitCount}
                onChange={(e) => setPermitCount(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  name: name.trim(),
                  location: location.trim(),
                  project_type: projectType.trim(),
                  jurisdiction: jurisdiction.trim(),
                  permit_count: Math.max(0, Math.min(50, Number(permitCount) || 0)),
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
