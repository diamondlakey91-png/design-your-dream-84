import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getProject, advanceStage } from "@/lib/permits.functions";
import { ArrowLeft, MapPin, Building2, Landmark, ArrowRight } from "lucide-react";
import { STAGES } from "@/lib/permits";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getProject);
  const advanceFn = useServerFn(advanceStage);
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["project", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const advance = useMutation({
    mutationFn: () => advanceFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Stage advanced");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) {
    return <AppShell><div className="p-6 text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
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
          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            ID: {project.id.slice(0, 8).toUpperCase()}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/15 text-brand">
            {project.status.toUpperCase()}
          </span>
        </div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
      </header>

      <div className="p-6 space-y-6">
        {/* Pipeline */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            PERMIT_PIPELINE
          </p>
          <div className="flex gap-1 mb-4">
            {STAGES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < stage ? "bg-brand" : i === stage ? "bg-brand/40" : "bg-muted"
                }`}
              />
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

        {/* Metadata */}
        <section className="grid grid-cols-1 gap-3">
          <MetaCard icon={<MapPin className="size-4" />} label="Location" value={project.location || "—"} />
          <MetaCard icon={<Building2 className="size-4" />} label="Project Type" value={project.project_type} />
          <MetaCard icon={<Landmark className="size-4" />} label="Jurisdiction" value={project.jurisdiction || "—"} />
        </section>

        {/* Activity */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            RECENT_ACTIVITY
          </p>
          {activity.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center rounded-xl border border-dashed border-border">
              No activity yet.
            </div>
          ) : (
            <div className="p-4 bg-card ring-1 ring-black/5 rounded-xl divide-y divide-border">
              {activity.map((a) => (
                <div key={a.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                  <div className="size-2 mt-1.5 rounded-full bg-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{a.description}</p>
                    <p className="text-[11px] font-mono uppercase text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
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
