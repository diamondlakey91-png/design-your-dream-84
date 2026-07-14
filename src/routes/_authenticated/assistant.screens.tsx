import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, X, Layers, Trash2, Loader2, ArrowUpRight } from "lucide-react";
import { listScreenSets, createScreenSet, deleteScreenSet } from "@/lib/screenSets.functions";

export const Route = createFileRoute("/_authenticated/assistant/screens")({
  head: () => ({ meta: [{ title: "Site Comparisons — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: ScreensPage,
});

function ScreensPage() {
  const listFn = useServerFn(listScreenSets);
  const createFn = useServerFn(createScreenSet);
  const deleteFn = useServerFn(deleteScreenSet);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["screen-sets"], queryFn: () => listFn() });
  const [showCreate, setShowCreate] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screen-sets"] });
      toast.success("Comparison deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const sets = q.data ?? [];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#05070d] via-[#080b16] to-[#0a0f22] text-zinc-100">
      <header className="border-b border-white/5 backdrop-blur bg-black/30 sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/assistant" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" /> Assistant
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-violet-600 hover:opacity-90 text-white text-sm font-medium px-3 py-1.5"
          >
            <Plus className="size-4" /> New comparison
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-4">
        <div>
          <div className="flex items-center gap-2 text-sky-300/80">
            <Layers className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Site Screening</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Candidate Site Comparisons</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Screen multiple candidate sites side by side before committing to a tracked project for any of them.
          </p>
        </div>

        {q.isLoading && <div className="text-sm text-zinc-400">Loading…</div>}

        {!q.isLoading && sets.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <p className="text-sm text-zinc-400">No comparisons yet.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10 px-3 py-1.5 text-sm"
            >
              <Plus className="size-4" /> Start a comparison
            </button>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {sets.map((s) => (
            <Link
              key={s.id}
              to="/assistant/screens/$id"
              params={{ id: s.id }}
              className="group relative rounded-2xl bg-white/[0.03] ring-1 ring-white/10 hover:ring-sky-500/30 p-4 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{s.name}</h3>
                  {s.notes && <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{s.notes}</p>}
                </div>
                <ArrowUpRight className="size-4 text-zinc-500 shrink-0 group-hover:text-sky-300" />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                <span>{s.candidate_count} candidate{s.candidate_count === 1 ? "" : "s"}</span>
                <span>{new Date(s.updated_at).toLocaleDateString()}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (window.confirm(`Delete comparison "${s.name}"? Candidate analyses inside are kept, just ungrouped.`)) {
                    deleteMut.mutate(s.id);
                  }
                }}
                disabled={deleteMut.isPending}
                aria-label={`Delete comparison ${s.name}`}
                className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-red-300 hover:bg-red-500/10 transition disabled:opacity-50"
              >
                {deleteMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </Link>
          ))}
        </div>
      </div>

      {showCreate && <CreateScreenSetDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateScreenSetDialog({ onClose }: { onClose: () => void }) {
  const createFn = useServerFn(createScreenSet);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () => createFn({ data: { name, notes } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screen-sets"] });
      toast.success("Comparison created");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0f1e] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New comparison</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg border border-white/10">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="flex flex-col gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">Name</label>
            <input
              required autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Q3 Retail Candidates"
              className="w-full h-11 rounded-lg bg-white/5 ring-1 ring-white/10 px-3 text-sm outline-none focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">Notes (optional)</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="What are you screening for?"
              className="w-full rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={mut.isPending || !name.trim()}
            className="mt-2 h-11 rounded-lg bg-gradient-to-r from-sky-500 to-violet-600 hover:opacity-90 text-white text-sm font-medium disabled:opacity-50"
          >
            {mut.isPending ? "Creating…" : "Create comparison"}
          </button>
        </form>
      </div>
    </div>
  );
}
