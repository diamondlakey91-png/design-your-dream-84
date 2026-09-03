import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, Download, RefreshCw, FileDown, Copy } from "lucide-react";
import {
  listCommentResponses,
  addCommentResponse,
  updateCommentResponse,
  deleteCommentResponse,
  importCommentsFromDocuments,
  draftMatrixResponse,
} from "@/lib/responseMatrix.functions";

const STATUSES = ["open", "in_progress", "drafted", "responded", "resolved", "n_a"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  drafted: "Drafted",
  responded: "Responded",
  resolved: "Resolved",
  n_a: "N/A",
};
const STATUS_COLOR: Record<string, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  drafted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  responded: "bg-brand/20 text-brand",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  n_a: "bg-zinc-500/15 text-zinc-500 line-through",
};
const SEVERITY_COLOR: Record<string, string> = {
  high: "bg-red-500/15 text-red-600 dark:text-red-400",
  medium: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};
const VERIFICATION_LABEL: Record<string, string> = {
  verified_requirement: "Verified requirement",
  ai_suggested_issue: "AI suggested issue",
  needs_human_review: "Needs human review",
};

export function ResponseMatrixTab({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCommentResponses);
  const addFn = useServerFn(addCommentResponse);
  const updateFn = useServerFn(updateCommentResponse);
  const delFn = useServerFn(deleteCommentResponse);
  const importFn = useServerFn(importCommentsFromDocuments);
  const draftFn = useServerFn(draftMatrixResponse);

  const [filter, setFilter] = useState<"all" | Status>("all");
  const [newComment, setNewComment] = useState("");
  const [newDiscipline, setNewDiscipline] = useState("General");
  const [newSheet, setNewSheet] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const key = ["comment_responses", projectId];
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { project_id: projectId } }) });
  const rows = q.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed");

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          project_id: projectId,
          comment_text: newComment.trim(),
          discipline: newDiscipline || "General",
          sheet_reference: newSheet.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setNewComment("");
      setNewSheet("");
      invalidate();
    },
    onError: fail,
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; status?: Status; response_text?: string; discipline?: string }) => updateFn({ data: v }),
    onSuccess: invalidate,
    onError: fail,
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: invalidate,
    onError: fail,
  });
  const importDocs = useMutation({
    mutationFn: () => importFn({ data: { project_id: projectId } }),
    onSuccess: (r) => {
      toast.success(r.inserted_count > 0 ? `Imported ${r.inserted_count} comment${r.inserted_count === 1 ? "" : "s"}` : "No new comments found in analyzed documents");
      invalidate();
    },
    onError: fail,
  });
  const draft = useMutation({
    mutationFn: (v: { id: string; tone: "formal" | "concise" }) => draftFn({ data: v }),
    onSuccess: (row) => {
      setDrafts((d) => ({ ...d, [row.id]: row.response_text ?? "" }));
      toast.success("Response drafted");
      invalidate();
    },
    onError: fail,
  });

  const filtered = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const openCount = rows.filter((r) => r.status !== "resolved" && r.status !== "n_a").length;

  const exportMatrix = () => {
    const head = ["#", "Discipline", "Sheet", "Code", "Severity", "Status", "Comment", "Response"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.map(esc).join(","), ...rows.map((r) => [r.comment_no, r.discipline, r.sheet_reference, r.code_reference, r.severity, STATUS_LABEL[r.status] ?? r.status, r.comment_text, r.response_text].map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `response-matrix-${(projectName ?? "project").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyLetter = () => {
    const letter = rows
      .map((r) => `Comment #${r.comment_no} — ${r.discipline}${r.sheet_reference ? ` (Sheet ${r.sheet_reference})` : ""}\n${r.comment_text}\n\nResponse: ${r.response_text || "[pending]"}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(letter);
    toast.success("Response letter copied");
  };

  return (
    <div className="space-y-4">
      <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">RESPONSE_MATRIX</p>
            <h3 className="text-lg font-semibold mt-0.5">Manage and draft official responses to permit comments</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {rows.length} comment{rows.length === 1 ? "" : "s"} · {openCount} still needing a response
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => importDocs.mutate()}
              disabled={importDocs.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ring-1 ring-black/5 bg-background text-[11px] font-mono uppercase tracking-wider hover:ring-brand/40 disabled:opacity-50"
            >
              {importDocs.isPending ? <RefreshCw className="size-3 animate-spin" /> : <FileDown className="size-3" />}
              Import from docs
            </button>
            <button onClick={copyLetter} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ring-1 ring-black/5 bg-background text-[11px] font-mono uppercase tracking-wider hover:ring-brand/40 disabled:opacity-50">
              <Copy className="size-3" /> Copy letter
            </button>
            <button onClick={exportMatrix} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[11px] font-mono uppercase tracking-wider hover:opacity-90 disabled:opacity-50">
              <Download className="size-3" /> Export
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-4">
          {(["all", ...STATUSES] as Array<"all" | Status>).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2 py-1 rounded font-mono uppercase text-[10px] tracking-wider ${filter === s ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {s === "all" ? `All ${rows.length}` : `${STATUS_LABEL[s]} ${counts[s] ?? 0}`}
            </button>
          ))}
        </div>
      </section>

      <section className="p-4 bg-card ring-1 ring-black/5 rounded-xl">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">ADD_COMMENT</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Paste the reviewer's comment…"
            className="flex-1 min-w-[240px] px-3 py-2 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand/50"
          />
          <input
            value={newDiscipline}
            onChange={(e) => setNewDiscipline(e.target.value)}
            placeholder="Discipline"
            className="w-36 px-3 py-2 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand/50"
          />
          <input
            value={newSheet}
            onChange={(e) => setNewSheet(e.target.value)}
            placeholder="Sheet"
            className="w-28 px-3 py-2 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand/50"
          />
          <button
            onClick={() => newComment.trim() && add.mutate()}
            disabled={add.isPending || !newComment.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-brand-foreground text-[11px] font-mono uppercase tracking-wider disabled:opacity-50"
          >
            <Plus className="size-3" /> Add
          </button>
        </div>
      </section>

      {q.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground bg-card ring-1 ring-black/5 rounded-xl">Loading comments…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 bg-card ring-1 ring-black/5 rounded-xl text-sm text-muted-foreground">
          No comments here yet. Add one above, or import findings from documents you've already analyzed.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isOpen = expanded === r.id;
            const value = drafts[r.id] ?? r.response_text ?? "";
            return (
              <article key={r.id} className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
                <div className="p-4 flex flex-wrap items-start gap-3">
                  <span className="font-mono text-xs text-muted-foreground pt-0.5 w-8 shrink-0">#{r.comment_no}</span>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.discipline}</span>
                      {r.sheet_reference && <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Sheet {r.sheet_reference}</span>}
                      <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${SEVERITY_COLOR[r.severity] ?? SEVERITY_COLOR.medium}`}>{r.severity}</span>
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet/15 text-violet">{VERIFICATION_LABEL[r.verification] ?? r.verification}</span>
                    </div>
                    <p className="text-sm mt-2">{r.comment_text}</p>
                    {r.code_reference && <p className="text-[11px] font-mono text-muted-foreground mt-1">{r.code_reference}</p>}
                    {r.response_text && !isOpen && <p className="text-xs text-muted-foreground mt-2 line-clamp-2"><span className="text-foreground">Response:</span> {r.response_text}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={r.status}
                      onChange={(e) => patch.mutate({ id: r.id, status: e.target.value as Status })}
                      className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded outline-none ${STATUS_COLOR[r.status] ?? STATUS_COLOR.open}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                    <button onClick={() => setExpanded(isOpen ? null : r.id)} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80">
                      {isOpen ? "Close" : "Respond"}
                    </button>
                    <button onClick={() => del.mutate(r.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete comment">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                    <textarea
                      value={value}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                      rows={5}
                      placeholder="Write the official response to this comment…"
                      className="w-full px-3 py-2 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand/50"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => draft.mutate({ id: r.id, tone: "formal" })}
                        disabled={draft.isPending}
                        className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand disabled:opacity-50"
                      >
                        {draft.isPending ? <RefreshCw className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                        {r.response_text ? "Redraft with AI" : "Draft with AI"}
                      </button>
                      <button
                        onClick={() => draft.mutate({ id: r.id, tone: "concise" })}
                        disabled={draft.isPending}
                        className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        Concise
                      </button>
                      <button
                        onClick={() => patch.mutate({ id: r.id, response_text: value, status: value.trim() ? "responded" : r.status as Status })}
                        disabled={patch.isPending}
                        className="ml-auto px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[11px] font-mono uppercase tracking-wider disabled:opacity-50"
                      >
                        Save response
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      AI drafts are suggestions — review against the reviewer's letter and applicable code before submitting.
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
