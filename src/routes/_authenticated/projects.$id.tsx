import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getProject, updateProject } from "@/lib/projects.functions";
import { OCCUPANCY_OPTIONS, WORK_TYPE_OPTIONS } from "@/lib/intakeOptions";
import { ArrowLeft, MapPin, Landmark, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { JurisdictionAutocomplete } from "@/components/JurisdictionAutocomplete";
import { ProjectTypeSelector } from "@/components/project-type/ProjectTypeSelector";
import { setProjectTypeForProject } from "@/lib/projectTypes.functions";
import { useProjectTypes } from "@/hooks/useProjectTypes";
import { OverviewTab } from "@/components/project/OverviewTab";
import { ChecklistTab } from "@/components/project/ChecklistTab";
import { DocsTab } from "@/components/project/DocsTab";
import { DeadlinesTab } from "@/components/project/DeadlinesTab";
import { InspectionsTab } from "@/components/project/InspectionsTab";
import { TimelineTab } from "@/components/project/TimelineTab";
import { ScopeTab } from "@/components/project/ScopeTab";
import { ResponseMatrixTab } from "@/components/project/ResponseMatrixTab";
import { QaQcTab } from "@/components/project/QaQcTab";
import { PlanQaQcTab } from "@/components/project/PlanQaQcTab";
import { SiteInvestigationTab } from "@/components/project/SiteInvestigationTab";
import { IntelligenceTab } from "@/components/project/IntelligenceTab";
import { PropertyJurisdictionPanel } from "@/components/project/PropertyJurisdictionPanel";
import { RegulatoryProfilePanel } from "@/components/project/RegulatoryProfilePanel";
import { ProjectFoundationPanel, ProjectPhaseChips } from "@/components/project/ProjectFoundationPanel";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/client/ViewModeToggle";
import { ClientProjectView } from "@/components/client/ClientProjectView";
import type { ClientProjectInput } from "@/lib/clientView";

const TABS = ["overview", "intelligence", "property", "scope", "site", "checklist", "docs", "planqaqc", "qaqc", "responses", "deadlines", "inspections", "timeline"] as const;

export const Route = createFileRoute("/_authenticated/projects/$id")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    typeof search.tab === "string" && (TABS as readonly string[]).includes(search.tab)
      ? { tab: search.tab as Tab }
      : {},
  head: () => ({ meta: [{ title: "Project — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: ProjectDetail,
});

type Tab = (typeof TABS)[number];


function ProjectDetail() {
  const { id } = Route.useParams();
  const { tab: searchTab } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { mode, setMode } = useViewMode();
  const [tab, setTab] = useState<Tab>(searchTab ?? "overview");
  const [forcedPro, setForcedPro] = useState(false);
  const showPro = mode === "pro" || forcedPro;
  const [editOpen, setEditOpen] = useState(false);

  const getFn = useServerFn(getProject);
  const updateFn = useServerFn(updateProject);
  const setTypeFn = useServerFn(setProjectTypeForProject);
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
      <div className="p-6 border-b border-border">
        <PermivioPageHeader
          backTo="/dashboard"
          backLabel="Sites"
          eyebrow={showPro ? `ID ${project.id.slice(0, 8).toUpperCase()} · ${project.status.toUpperCase()}` : "Your project"}
          context={project.name}
          title={showPro ? "Project Workspace" : "Project"}
          subtitle={
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {project.jurisdiction && <span className="inline-flex items-center gap-1"><Landmark className="size-3.5" />{project.jurisdiction}</span>}
              {project.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{project.location}</span>}
              {project.project_type && <span className="inline-flex items-center gap-1">· {project.project_type}</span>}
              <ProjectPhaseChips projectId={id} />
            </span>
          }
          actions={<>
            <ViewModeToggle mode={showPro ? "pro" : "client"} onChange={(m) => { setForcedPro(false); setMode(m); }} />
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest px-2.5 py-1.5 rounded border border-border hover:border-brand hover:text-brand"
            >
              <Pencil className="size-3.5" /> Edit
            </button>
          </>}
        />
      </div>

      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSave={async (patch, typeIds) => {
          try {
            const { primary_project_type_id, additional_project_type_ids, ...rest } = patch;
            await updateFn({ data: { id, ...rest } });
            if (typeIds && typeIds.primaryId) {
              await setTypeFn({
                data: {
                  project_id: id,
                  primary_project_type_id: typeIds.primaryId,
                  additional_project_type_ids: typeIds.additionalIds ?? [],
                  source: "user_selected",
                },
              }).catch(() => {});
            }
            toast.success("Project updated");
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ["project", id] });
            qc.invalidateQueries({ queryKey: ["projects"] });
            qc.invalidateQueries({ queryKey: ["project-foundation", id] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Update failed");
          }
        }}
      />


      {!showPro && (
        <div className="p-6 space-y-6">
          <ProjectFoundationPanel projectId={id} onOpenTab={(t) => { setTab(t); setForcedPro(true); }} />
          <ClientProjectView
            project={project as unknown as ClientProjectInput}
            onOpenTab={(t) => { setTab(t as Tab); setForcedPro(true); }}
          />
        </div>
      )}

      {showPro && <>
      {/* Tabs */}
      <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex overflow-x-auto">
          {(TABS as readonly Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-xs font-mono uppercase tracking-widest whitespace-nowrap border-b-2 ${
                tab === t ? "border-brand text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              {t === "responses"
                ? "response matrix"
                : t === "qaqc"
                  ? "qa/qc gate"
                  : t === "planqaqc"
                    ? "plan review"
                    : t === "site"
                      ? "site investigation"
                      : t === "timeline"
                        ? "activity"
                        : t === "checklist"
                          ? "permit roadmap"
                          : t === "docs"
                            ? "documents"
                        : t}
            </button>
          ))}
        </div>
      </nav>

      <div className="p-6 space-y-6">
        {tab === "overview" && (
          <OverviewTab project={project} stage={stage} activity={activity} onOpenTab={(t) => setTab(t)} onChange={() => { qc.invalidateQueries({ queryKey: ["project", id] }); qc.invalidateQueries({ queryKey: ["project-foundation", id] }); }} />
        )}
        {tab === "intelligence" && <IntelligenceTab projectId={id} />}
        {tab === "property" && (
          <div className="space-y-6">
            <RegulatoryProfilePanel projectId={id} />
            <PropertyJurisdictionPanel projectId={id} defaultAddress={project.location} projectType={project.project_type} />
          </div>
        )}
        {tab === "scope" && <ScopeTab projectId={id} defaultAddress={project.location} />}
        {tab === "site" && (
          <SiteInvestigationTab projectId={id} defaultAddress={project.location} defaultProjectType={project.project_type} />
        )}
        {tab === "checklist" && <ChecklistTab projectId={id} jurisdiction={project.jurisdiction} />}
        {tab === "docs" && <DocsTab projectId={id} userId={project.user_id} />}
        {tab === "planqaqc" && <PlanQaQcTab projectId={id} userId={project.user_id} />}
        {tab === "qaqc" && <QaQcTab projectId={id} />}
        {tab === "responses" && <ResponseMatrixTab projectId={id} projectName={project.name} />}
        {tab === "deadlines" && <DeadlinesTab projectId={id} />}
        {tab === "inspections" && <InspectionsTab projectId={id} userId={project.user_id} />}
        {tab === "timeline" && <TimelineTab projectId={id} />}
      </div>
      </>}
    </AppShell>
  );
}


type EditPatch = {
  name?: string;
  location?: string;
  project_type?: string;
  jurisdiction?: string;
  permit_count?: number;
  scope_description?: string | null;
  occupancy_class?: "residential" | "commercial" | "mixed_use" | null;
  work_type?: string | null;
  target_start_date?: string | null;
  intake_notes?: string | null;
  primary_project_type_id?: string | null;
  additional_project_type_ids?: string[];
};

type TypeIds = { primaryId: string | null; additionalIds: string[] };

function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: { name: string; location: string | null; project_type: string | null; jurisdiction: string | null; permit_count: number; primary_project_type_id?: string | null; additional_project_type_ids?: string[] | null; scope_description?: string | null; occupancy_class?: string | null; work_type?: string | null; target_start_date?: string | null; intake_notes?: string | null };
  onSave: (patch: EditPatch, typeIds: TypeIds) => void | Promise<void>;
}) {
  const { byId } = useProjectTypes();
  const [name, setName] = useState(project.name);
  const [location, setLocation] = useState(project.location ?? "");
  const [primaryId, setPrimaryId] = useState<string | null>(project.primary_project_type_id ?? null);
  const [additionalIds, setAdditionalIds] = useState<string[]>(project.additional_project_type_ids ?? []);
  const [jurisdiction, setJurisdiction] = useState(project.jurisdiction ?? "");
  const [permitCount, setPermitCount] = useState(String(project.permit_count ?? 0));
  const [scope, setScope] = useState(project.scope_description ?? "");
  const [occupancy, setOccupancy] = useState(project.occupancy_class ?? "");
  const [workType, setWorkType] = useState(project.work_type ?? "");
  const [startDate, setStartDate] = useState(project.target_start_date ?? "");
  const [notes, setNotes] = useState(project.intake_notes ?? "");
  const [saving, setSaving] = useState(false);
  const selectCls = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
          <div className="space-y-1.5">
            <Label>Project type</Label>
            <ProjectTypeSelector
              mode="primary_additional"
              value={{ primaryId, additionalIds }}
              onChange={(v) => {
                setPrimaryId(v.primaryId ?? null);
                setAdditionalIds(v.additionalIds ?? []);
              }}
              label=""
              helperText=""
            />
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
          <div className="space-y-1.5">
            <Label htmlFor="edit-scope">Scope of work</Label>
            <textarea id="edit-scope" value={scope} onChange={(e) => setScope(e.target.value)} maxLength={4000} rows={3} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-occupancy">Residential / commercial</Label>
              <select id="edit-occupancy" value={occupancy} onChange={(e) => setOccupancy(e.target.value)} className={selectCls}>
                <option value="">Not sure yet</option>
                {OCCUPANCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-worktype">Type of work</Label>
              <select id="edit-worktype" value={workType} onChange={(e) => setWorkType(e.target.value)} className={selectCls}>
                <option value="">Not sure yet</option>
                {WORK_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                {workType && !WORK_TYPE_OPTIONS.some((o) => o.value === workType) && <option value={workType}>{workType.replace(/_/g, " ")}</option>}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-start">Target start date</Label>
            <Input id="edit-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notes</Label>
            <textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={2} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                const primaryLabel = primaryId ? byId.get(primaryId)?.client_label : project.project_type ?? "";
                await onSave(
                  {
                    name: name.trim(),
                    location: location.trim(),
                    project_type: (primaryLabel ?? "").trim(),
                    jurisdiction: jurisdiction.trim(),
                    permit_count: Math.max(0, Math.min(50, Number(permitCount) || 0)),
                    scope_description: scope.trim() || null,
                    occupancy_class: (occupancy || null) as EditPatch["occupancy_class"],
                    work_type: workType || null,
                    target_start_date: startDate || null,
                    intake_notes: notes.trim() || null,
                  },
                  { primaryId, additionalIds },
                );
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
