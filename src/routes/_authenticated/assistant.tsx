import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listThreads, createThread, deleteThread, listProjects } from "@/lib/permits.functions";
import { ArrowLeft, Plus, MessageSquare, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "Permit Assistant — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: AssistantIndex,
});

function AssistantIndex() {
  const listFn = useServerFn(listThreads);
  const createFn = useServerFn(createThread);
  const deleteFn = useServerFn(deleteThread);
  const projectsFn = useServerFn(listProjects);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const threadsQ = useQuery({ queryKey: ["chat-threads"], queryFn: () => listFn() });
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });

  const create = useMutation({
    mutationFn: (project_id: string | null) => createFn({ data: { project_id } }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
      navigate({ to: "/assistant/$threadId", params: { threadId: t.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-threads"] }),
  });

  const threads = threadsQ.data ?? [];
  const projects = projectsQ.data ?? [];

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <span className="font-medium">Permit Assistant</span>
          <button
            onClick={() => create.mutate(null)}
            disabled={create.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-brand-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <Plus className="size-4" /> New chat
          </button>
        </header>

        <div className="p-6 space-y-6">
          <Link
            to="/assistant/analysis"
            className="block rounded-2xl p-5 bg-gradient-to-br from-sky-500/15 via-violet-500/10 to-transparent ring-1 ring-white/10 hover:ring-sky-400/40 transition"
          >
            <div className="text-[11px] font-mono uppercase tracking-widest text-sky-300/80">New</div>
            <div className="text-base font-semibold mt-1">Structured permit analysis →</div>
            <p className="text-xs text-zinc-400 mt-1">Enter a project and get a full roadmap: permits, agencies, sequence, inspections, risks, and next actions.</p>
          </Link>

          {projects.length > 0 && (
            <section>
              <h2 className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Start with a project</h2>
              <div className="grid gap-2">
                {projects.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => create.mutate(p.id)}
                    disabled={create.isPending}
                    className="text-left rounded-lg bg-zinc-900 ring-1 ring-white/5 hover:ring-brand/40 px-3 py-2.5 flex items-center gap-3"
                  >
                    <Briefcase className="size-4 text-brand" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] font-mono text-zinc-500 truncate">{p.jurisdiction || p.location || "no jurisdiction"}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Conversations</h2>
            {threadsQ.isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
            {!threadsQ.isLoading && threads.length === 0 && (
              <div className="rounded-xl bg-zinc-900 ring-1 ring-white/5 p-6 text-center">
                <MessageSquare className="size-6 mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-400">No conversations yet.</p>
                <button onClick={() => create.mutate(null)} className="mt-3 text-sm text-brand hover:underline">
                  Start your first chat →
                </button>
              </div>
            )}
            <ul className="space-y-1.5">
              {threads.map((t) => {
                const project = (t.projects as { name: string } | null);
                return (
                  <li key={t.id} className="rounded-lg bg-zinc-900 ring-1 ring-white/5 hover:ring-white/10 flex items-center">
                    <Link
                      to="/assistant/$threadId"
                      params={{ threadId: t.id }}
                      className="flex-1 min-w-0 px-3 py-2.5"
                    >
                      <div className="text-sm font-medium truncate">{t.title || "Untitled"}</div>
                      <div className="text-[11px] font-mono text-zinc-500 truncate">
                        {project ? `${project.name} · ` : ""}
                        {new Date(t.last_message_at ?? t.created_at).toLocaleString()}
                      </div>
                    </Link>
                    <button
                      onClick={() => del.mutate(t.id)}
                      className="p-3 text-zinc-600 hover:text-red-400"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
