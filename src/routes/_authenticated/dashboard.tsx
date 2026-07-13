import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listProjects, listDeadlines, createProject } from "@/lib/permits.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Plus, X, AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Sites — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const listProjectsFn = useServerFn(listProjects);
  const listDeadlinesFn = useServerFn(listDeadlines);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => listProjectsFn() });
  const deadlinesQ = useQuery({ queryKey: ["deadlines"], queryFn: () => listDeadlinesFn() });

  const [showCreate, setShowCreate] = useState(false);
  const projects = projectsQ.data ?? [];
  const openCount = projects.length;
  const alertsCount = (deadlinesQ.data ?? []).filter((d) => {
    const days = differenceInCalendarDays(parseISO(d.due_date), new Date());
    return days <= 7;
  }).length;

  return (
    <AppShell>
      <header className="px-6 pt-10 pb-6 border-b border-border">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {email ? `SIGNED_IN / ${email}` : "SIGNED_IN"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Active Sites</h1>
      </header>

      <div className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Open" value={openCount} />
          <Stat label="Alerts" value={alertsCount} accent />
        </div>

        {projectsQ.isLoading ? (
          <SkeletonList />
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : (
          projects.map((p) => {
            const pct = p.permit_count > 0 ? Math.round((p.permits_issued / p.permit_count) * 100) : 0;
            const stagePct = Math.round(((p.current_stage + 1) / 5) * 100);
            return (
              <Link
                key={p.id}
                to="/projects/$id"
                params={{ id: p.id }}
                className="p-4 bg-card ring-1 ring-black/5 rounded-xl flex items-center gap-4 hover:ring-brand/40"
              >
                <div
                  className="size-12 rounded-full flex-shrink-0"
                  style={{
                    background: `conic-gradient(var(--brand) ${stagePct}%, oklch(0.9 0.004 264) 0)`,
                  }}
                >
                  <div className="size-full grid place-items-center">
                    <div className="size-8 rounded-full bg-card grid place-items-center font-mono text-[10px] font-semibold">
                      {stagePct}
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{p.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {p.permits_issued} of {p.permit_count} permits · {p.status}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            );
          })
        )}

        <button
          onClick={() => setShowCreate(true)}
          className="p-4 border-2 border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-brand"
        >
          <Plus className="size-4" /> New project
        </button>

        <div className="mt-4">
          <h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-3 px-1">
            Upcoming Deadlines
          </h4>
          {(deadlinesQ.data ?? []).length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center rounded-xl border border-dashed border-border">
              No deadlines logged yet.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
              {(deadlinesQ.data ?? []).map((d) => {
                const days = differenceInCalendarDays(parseISO(d.due_date), new Date());
                const urgent = days <= 3;
                return (
                  <div key={d.id} className="p-3 flex justify-between items-center">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{d.title}</p>
                      <p className="text-[11px] font-mono uppercase text-muted-foreground">
                        {(d as { projects?: { name?: string } }).projects?.name ?? "—"}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 text-sm font-mono ${urgent ? "text-brand" : "text-muted-foreground"}`}>
                      {urgent && <AlertTriangle className="size-3.5" />}
                      {format(parseISO(d.due_date), "MMM dd").toUpperCase()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCreate && <CreateProjectDialog onClose={() => setShowCreate(false)} />}
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
      <span className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${accent ? "text-brand" : "text-foreground"}`}>
        {String(value).padStart(2, "0")}
      </span>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="p-8 text-center rounded-xl border border-dashed border-border bg-card">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        NO_ACTIVE_SITES
      </p>
      <h3 className="mt-2 text-lg font-semibold">Nothing on file yet.</h3>
      <p className="mt-1 text-sm text-muted-foreground">Log your first permit project to get started.</p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground"
      >
        <Plus className="size-4" /> Add project
      </button>
    </div>
  );
}

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const createFn = useServerFn(createProject);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [projectType, setProjectType] = useState("Commercial");
  const [permitCount, setPermitCount] = useState(3);

  const mut = useMutation({
    mutationFn: () => createFn({ data: { name, location, jurisdiction, project_type: projectType, permit_count: permitCount } }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
      onClose();
      navigate({ to: "/projects/$id", params: { id: row.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end sm:place-items-center p-0 sm:p-6" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl p-6 pb-8 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">NEW_SITE</p>
            <h2 className="text-xl font-semibold mt-1">Add project</h2>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg border border-border">
            <X className="size-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (name) mut.mutate(); }}
          className="flex flex-col gap-3"
        >
          <Field label="Project name">
            <input required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Riverside Plaza"
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand" />
          </Field>
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Cleveland, OH"
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand" />
          </Field>
          <Field label="Jurisdiction">
            <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}
              placeholder="Cuyahoga County Planning"
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand" />
          </Field>
          <Field label="Project type">
            <select value={projectType} onChange={(e) => setProjectType(e.target.value)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand">
              <optgroup label="Commercial">
                <option>Tenant Fit-Out</option>
                <option>New Build</option>
                <option>Shell / Core-and-Shell</option>
                <option>Renovation</option>
                <option>Addition</option>
                <option>Change of Use</option>
                <option>Demolition</option>
                <option>Commercial</option>
              </optgroup>
              <optgroup label="Other">
                <option>Residential</option>
                <option>Mixed-Use</option>
                <option>Industrial</option>
                <option>Civil</option>
              </optgroup>
            </select>
          </Field>
          <Field label="Estimated permit count">
            <input type="number" min={1} max={20} value={permitCount}
              onChange={(e) => setPermitCount(parseInt(e.target.value) || 1)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-brand" />
          </Field>

          <button type="submit" disabled={mut.isPending}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-50">
            {mut.isPending ? "Creating…" : "Create project"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
