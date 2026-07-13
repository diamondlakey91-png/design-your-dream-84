import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listThreadMessages,
  listThreads,
  listProjects,
  setThreadProject,
  renameThread,
  intakeGenerateChecklist,
  extractChecklistFromMessage,
  addPermitItemsBulk,
} from "@/lib/permits.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send, Briefcase, X, Edit3, ClipboardList, Sparkles, ListPlus, Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const listThreadsFn = useServerFn(listThreads);
  const projectsFn = useServerFn(listProjects);
  const setProjectFn = useServerFn(setThreadProject);
  const renameFn = useServerFn(renameThread);

  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [extractOpen, setExtractOpen] = useState<null | { messageId: string; content: string }>(null);
  const [streaming, setStreaming] = useState<{ user: string; assistant: string } | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const intakeFn = useServerFn(intakeGenerateChecklist);


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

  const streamSend = useCallback(async (content: string) => {
    setSending(true);
    setStreaming({ user: content, assistant: "" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const resp = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ thread_id: threadId, content }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Request failed (${resp.status})`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreaming({ user: content, assistant: acc });
      }
      await qc.invalidateQueries({ queryKey: ["chat-thread", threadId] });
      await qc.invalidateQueries({ queryKey: ["chat-threads"] });
      setStreaming(null);
      setInput("");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        toast.error(e instanceof Error ? e.message : "Send failed");
      }
      setStreaming(null);
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [qc, threadId]);

  const send = { isPending: sending };

  const setProject = useMutation({
    mutationFn: (project_id: string | null) => setProjectFn({ data: { id: threadId, project_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-threads"] }),
  });

  const rename = useMutation({
    mutationFn: (title: string) => renameFn({ data: { id: threadId, title } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-threads"] }),
  });

  const intake = useMutation({
    mutationFn: (payload: {
      name: string; project_type: string; location: string; jurisdiction: string;
      scope: string; size: string; occupancy: string; work_type: string;
    }) => intakeFn({ data: { thread_id: threadId, ...payload } }),
    onSuccess: (res) => {
      toast.success(`Created "${res.project.name}" with ${res.items.length} checklist items.`);
      setIntakeOpen(false);
      qc.invalidateQueries({ queryKey: ["chat-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Intake failed"),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, streaming?.assistant, sending]);

  useEffect(() => { textareaRef.current?.focus(); }, [threadId]);

  const submit = () => {
    const v = input.trim();
    if (!v || sending) return;
    void streamSend(v);
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

          {!activeProject && (
            <button
              onClick={() => setIntakeOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full ring-1 ring-brand/40 bg-brand/10 px-2.5 py-1 text-xs text-brand hover:bg-brand/20"
            >
              <ClipboardList className="size-3" /> Guided intake → checklist
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

          {intakeOpen && !activeProject && (
            <IntakePanel
              busy={intake.isPending}
              onCancel={() => setIntakeOpen(false)}
              onSubmit={(payload) => intake.mutate(payload)}
            />
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
                <div className="max-w-[92%] space-y-2">
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
                  {activeProject && (
                    <button
                      onClick={() => setExtractOpen({ messageId: m.id, content: m.content })}
                      className="inline-flex items-center gap-1.5 rounded-full ring-1 ring-brand/40 bg-brand/10 hover:bg-brand/20 px-2.5 py-1 text-[11px] text-brand"
                    >
                      <ListPlus className="size-3" /> Add to checklist
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}


          {streaming && (
            <>
              <div className="flex justify-end">
                <div className="bg-brand text-brand-foreground rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm whitespace-pre-wrap">{streaming.user}</p>
                </div>
              </div>
              <div className="max-w-[92%] space-y-2">
                {streaming.assistant ? (
                  <div
                    className="text-sm text-zinc-200 leading-relaxed
                      [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                      [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5
                      [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5
                      [&_li]:marker:text-brand
                      [&_strong]:text-white [&_strong]:font-semibold
                      [&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
                      [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming.assistant}</ReactMarkdown>
                    <span className="inline-block w-1.5 h-4 bg-brand/70 align-middle ml-0.5 animate-pulse" />
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:0ms]" />
                    <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:150ms]" />
                    <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            </>
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

      {extractOpen && activeProject && (
        <ExtractChecklistModal
          projectId={activeProject.id}
          projectName={activeProject.name}
          content={extractOpen.content}
          onClose={() => setExtractOpen(null)}
          onAdded={() => {
            setExtractOpen(null);
            qc.invalidateQueries({ queryKey: ["permit-items", activeProject.id] });
            qc.invalidateQueries({ queryKey: ["project", activeProject.id] });
          }}
        />
      )}
    </div>
  );
}

function ExtractChecklistModal({
  projectId,
  projectName,
  content,
  onClose,
  onAdded,
}: {
  projectId: string;
  projectName: string;
  content: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const extractFn = useServerFn(extractChecklistFromMessage);
  const addFn = useServerFn(addPermitItemsBulk);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const extractQ = useQuery({
    queryKey: ["extract-checklist", projectId, content.slice(0, 100)],
    queryFn: () => extractFn({ data: { project_id: projectId, content } }),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (extractQ.data?.items) {
      setSelected(new Set(extractQ.data.items.map((_, i) => i)));
    }
  }, [extractQ.data]);

  const items = extractQ.data?.items ?? [];

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          project_id: projectId,
          items: items.filter((_, i) => selected.has(i)),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Added ${res.inserted.length} item${res.inserted.length === 1 ? "" : "s"} to ${projectName}.`);
      onAdded();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add items"),
  });

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-zinc-900 ring-1 ring-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]"
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
          <ListPlus className="size-4 text-brand" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">Add to checklist</h3>
            <p className="text-[11px] text-zinc-500 truncate">→ {projectName}</p>
          </div>
          <button onClick={onClose} className="size-7 grid place-items-center rounded hover:bg-white/10" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {extractQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-8 justify-center">
              <Loader2 className="size-4 animate-spin" /> Extracting permit items…
            </div>
          )}
          {extractQ.isError && (
            <p className="text-sm text-red-400 py-4">
              {extractQ.error instanceof Error ? extractQ.error.message : "Failed to extract."}
            </p>
          )}
          {extractQ.data && items.length === 0 && (
            <p className="text-sm text-zinc-400 py-6 text-center">
              No new permit items detected in this reply (or all already exist in your checklist).
            </p>
          )}
          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((it, i) => {
                const isOn = selected.has(i);
                return (
                  <li key={i}>
                    <button
                      onClick={() => toggle(i)}
                      className={`w-full text-left rounded-lg ring-1 p-3 transition ${
                        isOn ? "bg-brand/10 ring-brand/50" : "bg-zinc-950 ring-white/10 hover:ring-white/20"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 size-4 rounded grid place-items-center flex-shrink-0 ${
                            isOn ? "bg-brand text-brand-foreground" : "ring-1 ring-white/20"
                          }`}
                        >
                          {isOn && <Check className="size-3" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white">{it.name}</span>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                              {it.category}
                            </span>
                            {it.required ? (
                              <span className="text-[10px] font-mono uppercase text-brand">required</span>
                            ) : (
                              <span className="text-[10px] font-mono uppercase text-zinc-500">conditional</span>
                            )}
                          </div>
                          {it.why && <p className="mt-1 text-xs text-zinc-400">{it.why}</p>}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-500">
            {items.length > 0 ? `${selected.size} of ${items.length} selected` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={() => add.mutate()}
              disabled={selected.size === 0 || add.isPending || extractQ.isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-xs font-medium disabled:opacity-40"
            >
              {add.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Confirm & add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



type IntakePayload = {
  name: string; project_type: string; location: string; jurisdiction: string;
  scope: string; size: string; occupancy: string; work_type: string;
};

const PROJECT_TYPES = ["Commercial", "Residential", "Mixed-use", "Industrial", "Institutional", "Tenant Improvement", "ADU", "Other"];
const WORK_TYPES = ["New construction", "Tenant improvement", "Renovation / alteration", "Addition", "Change of use", "Demolition", "MEP-only", "Sign only"];

function IntakePanel({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (p: IntakePayload) => void;
}) {
  const [form, setForm] = useState<IntakePayload>({
    name: "",
    project_type: "Commercial",
    location: "",
    jurisdiction: "",
    scope: "",
    size: "",
    occupancy: "",
    work_type: "New construction",
  });
  const set = <K extends keyof IntakePayload>(k: K, v: IntakePayload[K]) => setForm((f) => ({ ...f, [k]: v }));

  const canSubmit =
    form.name.trim().length > 0 &&
    form.location.trim().length > 0 &&
    form.scope.trim().length >= 10 &&
    !busy;

  return (
    <div className="basis-full mt-3 rounded-xl bg-zinc-900 ring-1 ring-white/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-4 text-brand" />
        <h3 className="text-sm font-semibold">Project intake</h3>
        <span className="text-[11px] text-zinc-500 font-mono">→ instant checklist</span>
        <button onClick={onCancel} className="ml-auto size-6 grid place-items-center rounded hover:bg-white/10" aria-label="Close intake">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Project name *">
          <input value={form.name} onChange={(e) => set("name", e.target.value)}
            placeholder="Sunset Retail Center" className={inputCls} />
        </Field>
        <Field label="Project type">
          <select value={form.project_type} onChange={(e) => set("project_type", e.target.value)} className={inputCls}>
            {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Location (city, state) *">
          <input value={form.location} onChange={(e) => set("location", e.target.value)}
            placeholder="Dallas, TX" className={inputCls} />
        </Field>
        <Field label="Jurisdiction / department">
          <input value={form.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)}
            placeholder="City of Dallas — Development Services" className={inputCls} />
        </Field>
        <Field label="Work type">
          <select value={form.work_type} onChange={(e) => set("work_type", e.target.value)} className={inputCls}>
            {WORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Size (sq ft / units)">
          <input value={form.size} onChange={(e) => set("size", e.target.value)}
            placeholder="4,800 sq ft" className={inputCls} />
        </Field>
        <Field label="Occupancy / use" className="col-span-2">
          <input value={form.occupancy} onChange={(e) => set("occupancy", e.target.value)}
            placeholder="Restaurant (Type A-2), 60 occupants" className={inputCls} />
        </Field>
      </div>

      <Field label="Scope of work *">
        <textarea value={form.scope} onChange={(e) => set("scope", e.target.value)}
          rows={4}
          placeholder="Describe what you're building: structural changes, new MEP, exterior work, signage, site work, ADA upgrades, etc."
          className={inputCls + " resize-none"} />
      </Field>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-zinc-500">Creates a project, attaches it to this chat, and generates a jurisdiction-aware checklist.</p>
        <button
          onClick={() => onSubmit(form)}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-xs font-medium disabled:opacity-40"
        >
          <Sparkles className="size-3.5" />
          {busy ? "Generating…" : "Generate checklist"}
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full bg-zinc-950 ring-1 ring-white/10 rounded-md px-2.5 py-1.5 text-sm placeholder:text-zinc-600 outline-none focus:ring-brand/50";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

