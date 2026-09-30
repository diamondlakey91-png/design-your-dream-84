import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, Copy, Layers, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import {
  deletePlanSet,
  listProjectPlanDocuments,
  reusePlanSet,
  savePlanSet,
  searchPlanSets,
  type PlanSet,
} from "@/lib/planSets.functions";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({
    meta: [
      { title: "Plan Set Library — Permivio" },
      {
        name: "description",
        content:
          "Search every plan set you have uploaded by jurisdiction, project type, discipline or sheet number, and reuse a past set on a new project.",
      },
      { property: "og:title", content: "Permivio Plan Set Library" },
      {
        property: "og:description",
        content: "A searchable record of past building plans, with sheet indexes and one-click reuse on a new project.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanLibraryPage,
});

const inputClass =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

function PlanLibraryPage() {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchPlanSets);
  const saveFn = useServerFn(savePlanSet);
  const reuseFn = useServerFn(reusePlanSet);
  const deleteFn = useServerFn(deletePlanSet);

  const [filters, setFilters] = useState({ q: "", jurisdiction: "", discipline: "", sheet_number: "" });
  const [applied, setApplied] = useState(filters);
  const [adding, setAdding] = useState(false);

  const q = useQuery({
    queryKey: ["plan-sets", applied],
    queryFn: () => searchFn({ data: applied }),
  });

  const sets = (q.data?.sets ?? []) as PlanSet[];
  const projects = q.data?.projects ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["plan-sets"] });

  const reuse = useMutation({
    mutationFn: (v: { plan_set_id: string; project_id: string }) => reuseFn({ data: v }),
    onSuccess: (r: { documents_attached?: number } | null) => {
      toast.success(`Plan set reused — ${r?.documents_attached ?? 0} file(s) attached to the project.`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed from the library.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (s: PlanSet) =>
      saveFn({
        data: {
          id: s.id,
          title: s.title,
          project_id: s.project_id,
          jurisdiction: s.jurisdiction,
          project_type: s.project_type,
          occupancy: s.occupancy,
          revision_label: s.revision_label,
          tags: s.tags,
          notes: s.notes,
          document_ids: s.document_ids,
          archived: !s.archived,
        },
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const disciplines = useMemo(
    () => [...new Set(sets.flatMap((s) => s.disciplines))].sort(),
    [sets],
  );

  return (
    <AppShell>
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PermivioPageHeader
          eyebrow="Plan Set Library"
          title="Past plan sets, searchable and reusable"
          subtitle="Every plan set you index here keeps its jurisdiction, project type, disciplines and sheet list, so you can find a past set and reuse it on a new project instead of uploading it again."
        />

        <section className="rounded-2xl border border-border bg-card/60 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(filters);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <label className="grid gap-1 text-xs text-muted-foreground lg:col-span-2">
              Search
              <input
                className={inputClass}
                placeholder="Title, project type, notes…"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Jurisdiction
              <input
                className={inputClass}
                value={filters.jurisdiction}
                onChange={(e) => setFilters({ ...filters, jurisdiction: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Discipline
              <input
                className={inputClass}
                placeholder={disciplines[0] ?? "Architectural"}
                value={filters.discipline}
                onChange={(e) => setFilters({ ...filters, discipline: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Sheet number
              <input
                className={inputClass}
                placeholder="A-101"
                value={filters.sheet_number}
                onChange={(e) => setFilters({ ...filters, sheet_number: e.target.value })}
              />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/50 px-4 text-sm font-semibold text-primary"
              >
                <Search className="size-4" /> Search library
              </button>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-4" /> Index a plan set
              </button>
            </div>
          </form>
        </section>

        {adding && (
          <IndexForm
            projects={projects}
            onDone={() => {
              setAdding(false);
              invalidate();
            }}
          />
        )}

        <section className="grid gap-3">
          {q.isPending && (
            <div className="grid place-items-center rounded-2xl border border-border bg-card/40 py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!q.isPending && sets.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
              <Layers className="mx-auto size-6 text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">
                No plan sets indexed yet. Index the documents from a project and they become searchable here.
              </p>
            </div>
          )}
          {sets.map((s) => (
            <article key={s.id} className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{s.title}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[s.jurisdiction, s.project_type, s.occupancy, s.revision_label].filter(Boolean).join(" · ") ||
                      "No jurisdiction recorded"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {s.sheet_count} sheet{s.sheet_count === 1 ? "" : "s"} · {s.document_ids.length} file
                    {s.document_ids.length === 1 ? "" : "s"}
                  </span>
                  {s.archived && (
                    <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Archived
                    </span>
                  )}
                </div>
              </div>

              {s.disciplines.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.disciplines.map((d) => (
                    <span key={d} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-primary">
                      {d}
                    </span>
                  ))}
                </div>
              )}

              {s.notes && <p className="mt-3 text-sm text-muted-foreground">{s.notes}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) reuse.mutate({ plan_set_id: s.id, project_id: e.target.value });
                    e.target.value = "";
                  }}
                  className="h-9 rounded-xl border border-border bg-background/50 px-3 text-xs text-foreground"
                >
                  <option value="">Reuse on project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {reuse.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                <button
                  onClick={() => archive.mutate(s)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Archive className="size-3.5" /> {s.archived ? "Restore" : "Archive"}
                </button>
                <button
                  onClick={() => remove.mutate(s.id)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-destructive/40 px-3 text-xs text-destructive"
                >
                  <Trash2 className="size-3.5" /> Remove
                </button>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Copy className="size-3" /> Reuse attaches the same stored files to the target project — the originals are
                never modified.
              </p>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function IndexForm({
  projects,
  onDone,
}: {
  projects: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const saveFn = useServerFn(savePlanSet);
  const docsFn = useServerFn(listProjectPlanDocuments);
  const [projectId, setProjectId] = useState("");
  const [form, setForm] = useState({
    title: "",
    jurisdiction: "",
    project_type: "",
    occupancy: "",
    revision_label: "",
    notes: "",
    tags: "",
  });
  const [picked, setPicked] = useState<string[]>([]);

  const docsQ = useQuery({
    queryKey: ["plan-docs", projectId],
    queryFn: () => docsFn({ data: { project_id: projectId } }),
    enabled: !!projectId,
  });
  const documents = docsQ.data?.documents ?? [];

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          project_id: projectId || null,
          title: form.title,
          jurisdiction: form.jurisdiction || null,
          project_type: form.project_type || null,
          occupancy: form.occupancy || null,
          revision_label: form.revision_label || null,
          notes: form.notes || null,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          document_ids: picked,
        },
      }),
    onSuccess: (r: { sheet_count?: number } | null) => {
      toast.success(
        r?.sheet_count
          ? `Indexed with ${r.sheet_count} sheet(s) from the Plan QA/QC inventory.`
          : "Indexed. Sheet-level detail appears once Plan QA/QC has read the set.",
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <h2 className="text-sm font-semibold text-foreground">Index a plan set</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick the project and the files that make up the set. Sheet numbers and disciplines come from the drawing inventory
        Plan QA/QC already produced — nothing is invented.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Project
          <select className={inputClass} value={projectId} onChange={(e) => { setProjectId(e.target.value); setPicked([]); }}>
            <option value="">Not linked to a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Set title
          <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Jurisdiction
          <input
            className={inputClass}
            value={form.jurisdiction}
            onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Project type
          <input
            className={inputClass}
            value={form.project_type}
            onChange={(e) => setForm({ ...form, project_type: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Occupancy
          <input className={inputClass} value={form.occupancy} onChange={(e) => setForm({ ...form, occupancy: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Revision label
          <input
            className={inputClass}
            value={form.revision_label}
            onChange={(e) => setForm({ ...form, revision_label: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
          Tags (comma separated)
          <input className={inputClass} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
          Notes
          <textarea className={`${inputClass} min-h-20`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
      </div>

      {projectId && (
        <div className="mt-4">
          <p className="text-xs font-medium text-foreground">Files in this set</p>
          {docsQ.isPending ? (
            <Loader2 className="mt-2 size-4 animate-spin text-muted-foreground" />
          ) : documents.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">This project has no uploaded documents yet.</p>
          ) : (
            <ul className="mt-2 grid max-h-64 gap-1 overflow-auto">
              {documents.map((d) => (
                <li key={d.id}>
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={picked.includes(d.id)}
                      onChange={(e) =>
                        setPicked((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))
                      }
                    />
                    <span className="truncate text-foreground">{d.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        disabled={save.isPending || form.title.trim().length < 2}
        onClick={() => save.mutate()}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-primary/50 px-4 text-sm font-semibold text-primary disabled:opacity-40"
      >
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Save to library
      </button>
    </section>
  );
}
