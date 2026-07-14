import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { FileText, Trash2 } from "lucide-react";
import { analyzeDocument } from "@/lib/documents.functions";
import { reviewPlan, addPlanReviewFixesToChecklist, draftReviewerResponse, generateRedlinedPdf } from "@/lib/planReview.functions";

export function DocRow({ doc, projectId, onDelete }: { doc: { id: string; name: string; url: string | null; size_bytes: number; created_at: string; mime_type: string; ai_summary?: string | null; ai_action_items?: unknown; analyzed_at?: string | null; plan_review?: unknown; plan_reviewed_at?: string | null }; projectId: string; onDelete: () => void }) {
  const analyzeFn = useServerFn(analyzeDocument);
  const reviewFn = useServerFn(reviewPlan);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const canAnalyze = (doc.mime_type || "").startsWith("image/") || (doc.mime_type || "") === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { id: doc.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs", projectId] }); qc.invalidateQueries({ queryKey: ["activity", projectId] }); setOpen(true); toast.success("AI analysis complete"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Analysis failed"),
  });
  const review = useMutation({
    mutationFn: () => reviewFn({ data: { id: doc.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs", projectId] }); qc.invalidateQueries({ queryKey: ["activity", projectId] }); setReviewOpen(true); toast.success("Plan review complete"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Plan review failed"),
  });
  const addFixesFn = useServerFn(addPlanReviewFixesToChecklist);
  const draftFn = useServerFn(draftReviewerResponse);
  const [letter, setLetter] = useState<string | null>(null);
  const addFixes = useMutation({
    mutationFn: () => addFixesFn({ data: { document_id: doc.id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["permit_items", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      toast.success(`Added ${r.inserted_count} fix${r.inserted_count === 1 ? "" : "es"} to checklist`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add fixes"),
  });
  const draft = useMutation({
    mutationFn: () => draftFn({ data: { document_id: doc.id } }),
    onSuccess: (r) => { setLetter(r.letter); toast.success("Response letter drafted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to draft response"),
  });
  const redlineFn = useServerFn(generateRedlinedPdf);
  const redline = useMutation({
    mutationFn: () => redlineFn({ data: { id: doc.id } }),
    onSuccess: (r) => {
      toast.success(`Redlined PDF ready — ${r.markups} markup${r.markups === 1 ? "" : "s"}`);
      window.open(r.url, "_blank", "noopener,noreferrer");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to generate redlined PDF"),
  });
  const items = Array.isArray(doc.ai_action_items) ? doc.ai_action_items as Array<{ reviewer?: string; discipline?: string; request: string; reference?: string }> : [];
  const pr = (doc.plan_review && typeof doc.plan_review === "object") ? doc.plan_review as {
    overall_summary?: string;
    overall_risk?: "low"|"medium"|"high";
    sheets_detected?: string[];
    jurisdiction_context?: { jurisdiction?: string; applied_amendments?: string[]; source_urls?: string[] };
    findings?: Array<{ category: string; severity: "low"|"medium"|"high"; title: string; detail: string; code_reference?: string; local_amendment?: string; sheet_reference?: string; recommendation?: string; confidence?: "low"|"medium"|"high"; evidence_quote?: string; needs_manual_verification?: boolean }>;
  } : null;
  const findings = pr?.findings ?? [];
  const categoryLabel: Record<string, string> = {
    missing_exits: "Missing Exits",
    ada: "ADA",
    fire_code: "Fire Code",
    permitting_mistake: "Permitting",
    other: "Other",
  };
  const sevClass: Record<string, string> = {
    high: "bg-destructive/15 text-destructive",
    medium: "bg-brand/15 text-brand",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <li className="p-3 bg-card ring-1 ring-black/5 rounded-xl">
      <div className="flex items-center gap-3">
        <FileText className="size-5 text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          {doc.url ? (
            <a href={doc.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-brand truncate block">{doc.name}</a>
          ) : (
            <span className="text-sm font-medium truncate block">{doc.name}</span>
          )}
          <p className="text-[11px] font-mono uppercase text-muted-foreground">
            {(doc.size_bytes / 1024).toFixed(1)} KB · {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
            {doc.analyzed_at && <> · <span className="text-brand">AI analyzed</span></>}
            {doc.plan_reviewed_at && <> · <span className="text-brand">Plan reviewed</span></>}
          </p>
        </div>
        {canAnalyze && (
          <>
            <button
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending}
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-brand/15 text-brand hover:bg-brand/25 disabled:opacity-50"
            >
              {analyze.isPending ? "Reading…" : doc.analyzed_at ? "Re-analyze" : "Analyze"}
            </button>
            <button
              onClick={() => review.mutate()}
              disabled={review.isPending}
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50"
              title="AI Plan Review: exits, ADA, fire code, permitting mistakes"
            >
              {review.isPending ? "Reviewing…" : doc.plan_reviewed_at ? "Re-review plan" : "Plan Review"}
            </button>
          </>
        )}
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
          <Trash2 className="size-4" />
        </button>
      </div>
      {doc.ai_summary && (
        <div className="mt-3 pl-8">
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80">
            {open ? "Hide" : "Show"} AI reading ({items.length} action{items.length === 1 ? "" : "s"})
          </button>
          {open && (
            <div className="mt-2 p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-2">
              <p className="text-sm text-foreground leading-relaxed">{doc.ai_summary}</p>
              {items.length > 0 && (
                <ul className="space-y-1.5">
                  {items.map((it, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-brand mt-1">•</span>
                      <span>
                        {(it.reviewer || it.discipline) && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1.5">
                            [{it.discipline || it.reviewer}]
                          </span>
                        )}
                        {it.request}
                        {it.reference && <span className="text-muted-foreground text-xs"> — {it.reference}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {pr && (
        <div className="mt-2 pl-8">
          <button onClick={() => setReviewOpen((v) => !v)} className="text-[11px] font-mono uppercase tracking-wider text-destructive hover:opacity-80">
            {reviewOpen ? "Hide" : "Show"} plan review ({findings.length} finding{findings.length === 1 ? "" : "s"}
            {pr.overall_risk ? ` · ${pr.overall_risk} risk` : ""})
          </button>
          {reviewOpen && (
            <div className="mt-2 p-3 rounded-lg bg-background ring-1 ring-black/5 space-y-3">
              {pr.overall_summary && <p className="text-sm text-foreground leading-relaxed">{pr.overall_summary}</p>}
              {pr.sheets_detected && pr.sheets_detected.length > 0 && (
                <p className="text-[11px] font-mono uppercase text-muted-foreground">
                  Sheets: {pr.sheets_detected.join(", ")}
                </p>
              )}
              {pr.jurisdiction_context && (pr.jurisdiction_context.jurisdiction || (pr.jurisdiction_context.applied_amendments?.length ?? 0) > 0) && (
                <div className="p-2 rounded-md bg-brand/5 ring-1 ring-brand/20 space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-brand">
                    Jurisdiction: {pr.jurisdiction_context.jurisdiction || "—"}
                  </p>
                  {(pr.jurisdiction_context.applied_amendments?.length ?? 0) > 0 && (
                    <p className="text-xs text-foreground/80">
                      Applied: {pr.jurisdiction_context.applied_amendments!.join(" · ")}
                    </p>
                  )}
                  {(pr.jurisdiction_context.source_urls?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pr.jurisdiction_context.source_urls!.slice(0, 5).map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-brand hover:underline truncate max-w-[220px]">
                          {new URL(u).hostname}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issues flagged.</p>
              ) : (
                <ul className="space-y-2">
                  {findings.map((f, i) => (
                    <li key={i} className="p-2 rounded-md ring-1 ring-black/5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${sevClass[f.severity] || sevClass.medium}`}>
                          {f.severity}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          {categoryLabel[f.category] || f.category}
                        </span>
                        {f.sheet_reference && (
                          <span className="text-[10px] font-mono text-muted-foreground">Sheet {f.sheet_reference}</span>
                        )}
                        {f.code_reference && (
                          <span className="text-[10px] font-mono text-muted-foreground">{f.code_reference}</span>
                        )}
                        {f.local_amendment && (
                          <span className="text-[10px] font-mono text-brand">Local: {f.local_amendment}</span>
                        )}
                        {f.confidence && (
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${f.confidence === "high" ? "bg-brand/10 text-brand" : f.confidence === "low" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                            {f.confidence} conf
                          </span>
                        )}
                        {f.needs_manual_verification && (
                          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
                            verify manually
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-1">{f.title}</p>
                      <p className="text-sm text-foreground/80 mt-0.5">{f.detail}</p>
                      {f.evidence_quote && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{f.evidence_quote}"</p>
                      )}
                      {f.recommendation && (
                        <p className="text-xs text-muted-foreground mt-1"><span className="uppercase font-mono tracking-wider">Fix:</span> {f.recommendation}</p>
                      )}

                    </li>
                  ))}
                </ul>
              )}
              {findings.length > 0 && (
                <div className="pt-2 border-t border-border/50 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => addFixes.mutate()}
                      disabled={addFixes.isPending}
                      className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-brand/15 text-brand hover:bg-brand/25 disabled:opacity-50"
                    >
                      {addFixes.isPending ? "Adding…" : `Add ${findings.length} fix${findings.length === 1 ? "" : "es"} to checklist`}
                    </button>
                    <button
                      onClick={() => draft.mutate()}
                      disabled={draft.isPending}
                      className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-brand/15 text-brand hover:bg-brand/25 disabled:opacity-50"
                    >
                      {draft.isPending ? "Drafting…" : "Draft reviewer response"}
                    </button>
                    <button
                      onClick={() => redline.mutate()}
                      disabled={redline.isPending}
                      className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50"
                    >
                      {redline.isPending ? "Generating…" : "Download redlined PDF"}
                    </button>
                  </div>
                  {letter && (
                    <div className="p-3 rounded-lg bg-muted/40 ring-1 ring-black/5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Draft response letter</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { navigator.clipboard.writeText(letter); toast.success("Copied"); }}
                            className="text-[10px] font-mono uppercase tracking-wider text-brand hover:opacity-80"
                          >Copy</button>
                          <button
                            onClick={() => {
                              const blob = new Blob([letter], { type: "text/plain" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `${doc.name.replace(/\.[^.]+$/, "")}-response.txt`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="text-[10px] font-mono uppercase tracking-wider text-brand hover:opacity-80"
                          >Download</button>
                          <button
                            onClick={() => setLetter(null)}
                            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:opacity-80"
                          >Close</button>
                        </div>
                      </div>
                      <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-auto">{letter}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
