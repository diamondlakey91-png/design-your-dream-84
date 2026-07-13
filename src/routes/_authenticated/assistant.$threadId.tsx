import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listThreadMessages,
  sendChatMessage,
  listThreads,
  listProjects,
  setThreadProject,
  renameThread,
} from "@/lib/permits.functions";
import { ArrowLeft, Send, Briefcase, X, Edit3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/_authenticated/assistant/$threadId")({
  head: () => ({ meta: [{ title: "Chat — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: ThreadView,
});

function ThreadView() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const listMsgs = useServerFn(listThreadMessages);
  const sendFn = useServerFn(sendChatMessage);
  const listThreadsFn = useServerFn(listThreads);
  const projectsFn = useServerFn(listProjects);
  const setProjectFn = useServerFn(setThreadProject);
  const renameFn = useServerFn(renameThread);

  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messagesQ = useQuery({
    queryKey: ["chat-thread", threadId],
    queryFn: () => listMsgs({ data: { thread_id: threadId } }),
  });
  const threadsQ = useQuery({ queryKey: ["chat-threads"], queryFn: () => listThreadsFn() });
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });

  const thread = useMemo(
    () => (threadsQ.data ?? []).find((t) => t.id === threadId) ?? null,
    [threadsQ.data, threadId],
  );
  const projects = projectsQ.data ?? [];
  const activeProject = projects.find((p) => p.id === thread?.project_id) ?? null;
  const messages = messagesQ.data ?? [];

  const send = useMutation({
    mutationFn: (content: string) => sendFn({ data: { thread_id: threadId, content } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
      setInput("");
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  const setProject = useMutation({
    mutationFn: (project_id: string | null) => setProjectFn({ data: { id: threadId, project_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-threads"] }),
  });

  const rename = useMutation({
    mutationFn: (title: string) => renameFn({ data: { id: threadId, title } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-threads"] }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, send.isPending]);

  useEffect(() => { textareaRef.current?.focus(); }, [threadId]);

  const submit = () => {
    const v = input.trim();
    if (!v || send.isPending) return;
    send.mutate(v);
  };

  const suggestions = activeProject
    ? [
        `What are the next steps for ${activeProject.name}?`,
        `Which permits still need to be pulled for this project?`,
        `What commonly delays projects in ${activeProject.jurisdiction || activeProject.location || "this jurisdiction"}?`,
      ]
    : [
        "Coffee shop tenant improvement in Dallas, TX — what permits do I need?",
        "Detached ADU in Los Angeles — required permits and approvals?",
        "New 4-story mixed-use in Brooklyn, NY — permit checklist?",
      ];

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col flex-1">
        <header className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/assistant" })}
            className="text-zinc-400 hover:text-white"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  if (titleDraft.trim() && titleDraft !== thread?.title) rename.mutate(titleDraft.trim());
                  setEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="w-full bg-transparent text-sm font-medium outline-none border-b border-brand/50"
              />
            ) : (
              <button
                onClick={() => { setTitleDraft(thread?.title ?? ""); setEditingTitle(true); }}
                className="flex items-center gap-1.5 text-sm font-medium hover:text-brand"
              >
                <span className="truncate">{thread?.title || "New chat"}</span>
                <Edit3 className="size-3 opacity-50" />
              </button>
            )}
          </div>
        </header>

        {/* Project context bar */}
        <div className="px-6 py-2.5 border-b border-white/5 flex items-center gap-2 flex-wrap">
          {activeProject ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-brand/15 ring-1 ring-brand/40 pl-2.5 pr-1.5 py-1 text-xs">
              <Briefcase className="size-3 text-brand" />
              <span className="text-zinc-100">{activeProject.name}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">{activeProject.jurisdiction || activeProject.location || "no jurisdiction"}</span>
              <button
                onClick={() => setProject.mutate(null)}
                className="ml-1 size-4 grid place-items-center rounded-full hover:bg-white/10"
                aria-label="Detach project"
              >
                <X className="size-3" />
              </button>
            </span>
          ) : (
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full ring-1 ring-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:ring-white/20"
            >
              <Briefcase className="size-3" /> Attach a project
            </button>
          )}

          {pickerOpen && !activeProject && (
            <div className="basis-full mt-2 rounded-lg bg-zinc-900 ring-1 ring-white/10 divide-y divide-white/5 max-h-56 overflow-y-auto">
              {projects.length === 0 && <div className="p-3 text-xs text-zinc-500">No projects yet.</div>}
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProject.mutate(p.id); setPickerOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                >
                  <div className="font-medium text-zinc-100">{p.name}</div>
                  <div className="text-[11px] text-zinc-500 font-mono">{p.jurisdiction || p.location || "no jurisdiction"} · {p.project_type}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && !send.isPending && (
            <div className="text-center py-10">
              <div className="mx-auto size-14 rounded-2xl bg-brand grid place-items-center mb-4">
                <div className="size-5 rounded-md bg-zinc-950" />
              </div>
              <h2 className="text-lg font-semibold">Ask about any permit.</h2>
              <p className="mt-2 text-sm text-zinc-400 max-w-sm mx-auto">
                Describe your project and jurisdiction — I'll list the permits and approvals you'll likely need, department by department.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <div className="bg-brand text-brand-foreground rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                </div>
              ) : (
                <div className="max-w-[92%]">
                  <div
                    className="text-sm text-zinc-200 leading-relaxed
                      [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                      [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5
                      [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5
                      [&_li]:marker:text-brand
                      [&_strong]:text-white [&_strong]:font-semibold
                      [&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
                      [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2
                      [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-zinc-400 [&_h2]:mt-4 [&_h2]:mb-2
                      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-3 [&_h3]:mb-1
                      [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}

          {send.isPending && (
            <div className="max-w-[85%]">
              <div className="flex gap-1.5">
                <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:0ms]" />
                <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:150ms]" />
                <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {messages.length === 0 && !send.isPending && (
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="px-3 py-1.5 text-[11px] rounded-full bg-zinc-900 ring-1 ring-white/10 text-zinc-300 hover:ring-brand/50 text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-zinc-900/80 backdrop-blur border-t border-white/5">
          <div className="rounded-xl bg-zinc-900 ring-1 ring-white/10 flex items-end gap-2 p-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder={activeProject ? `Ask about ${activeProject.name}…` : "Describe your project and jurisdiction…"}
              rows={1}
              className="flex-1 bg-transparent resize-none px-2 py-2 text-sm placeholder:text-zinc-500 outline-none max-h-32"
            />
            <button
              onClick={submit}
              disabled={!input.trim() || send.isPending}
              className="size-9 grid place-items-center rounded-lg bg-brand text-brand-foreground disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600 text-center">
            AI guidance. Verify with your local jurisdiction.
          </p>
        </div>
      </div>
    </div>
  );
}
