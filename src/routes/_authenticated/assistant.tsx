import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listChatMessages, sendChatMessage, clearChat } from "@/lib/permits.functions";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "Permit Assistant — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: Assistant,
});

function Assistant() {
  const listFn = useServerFn(listChatMessages);
  const sendFn = useServerFn(sendChatMessage);
  const clearFn = useServerFn(clearChat);
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const q = useQuery({ queryKey: ["chat"], queryFn: () => listFn() });
  const messages = q.data ?? [];

  const send = useMutation({
    mutationFn: (content: string) => sendFn({ data: { content } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat"] });
      setInput("");
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  const clear = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat"] });
      toast.success("Conversation cleared");
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, send.isPending]);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const submit = () => {
    const value = input.trim();
    if (!value || send.isPending) return;
    send.mutate(value);
  };

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col flex-1">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-brand grid place-items-center">
              <div className="size-3 rounded-full bg-zinc-950" />
            </div>
            <span className="font-medium">Permit Assistant</span>
          </div>
          <button onClick={() => clear.mutate()} className="text-zinc-500 hover:text-zinc-300" aria-label="Clear">
            <Trash2 className="size-4" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="mx-auto size-14 rounded-2xl bg-brand grid place-items-center mb-4">
                <div className="size-5 rounded-md bg-zinc-950" />
              </div>
              <h2 className="text-lg font-semibold">Ask about any permit.</h2>
              <p className="mt-2 text-sm text-zinc-400 max-w-sm mx-auto">
                Describe your project and jurisdiction — I'll list the permits you're likely to need.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                {[
                  "Coffee shop in Dallas, TX. What permits do I need?",
                  "3,000 sq ft concrete pour in Akron, OH",
                  "Residential ADU in Los Angeles — required permits?",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="px-3 py-1.5 text-[11px] rounded-full bg-zinc-900 ring-1 ring-white/10 text-zinc-300 hover:ring-brand/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <div className="bg-zinc-800 rounded-2xl rounded-tr-none p-4 max-w-[85%]">
                  <p className="text-sm text-zinc-100 whitespace-pre-wrap">{m.content}</p>
                </div>
              ) : (
                <div className="bg-zinc-800/50 ring-1 ring-white/5 rounded-2xl p-4 max-w-[85%]">
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>
              )}
            </div>
          ))}

          {send.isPending && (
            <div className="bg-zinc-800/50 ring-1 ring-white/5 rounded-2xl p-4 max-w-[85%]">
              <div className="flex gap-1.5">
                <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:0ms]" />
                <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:150ms]" />
                <span className="size-2 rounded-full bg-brand animate-pulse [animation-delay:300ms]" />
              </div>
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
              placeholder="Ask about specific code…"
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
            AI responses are guidance. Verify with your local jurisdiction.
          </p>
        </div>
      </div>
    </div>
  );
}
