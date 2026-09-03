import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, FileDown, Trash2, ListPlus, ShieldAlert, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listDocuments, registerDocument } from "@/lib/documents.functions";
import {
  runQaQcReview,
  listQaQcReviews,
  getQaQcReview,
  setQaQcFindingResolved,
  deleteQaQcReview,
  addQaQcGapsToChecklist,
  generateQaQcReportPdf,
} from "@/lib/qaqcReview.functions";
import { PERMIVIO_PROFESSIONAL_DISCLAIMER, readinessMeta, severityMeta } from "@/lib/qaqcConfig";
import { QaQcInventoryTable, type QaQcSheetRow } from "@/components/project/QaQcInventoryTable";
import { QaQcFindingList, type QaQcFindingRow } from "@/components/project/QaQcFindingList";
import { ProfessionalReviewButton } from "@/components/project/ProfessionalReviewButton";
import { Input } from "@/components/ui/input";

export function PlanQaQcTab({ projectId, userId }: { projectId: string; userId: string }) {
  const qc = useQueryClient();
  const docsFn = useServerFn(listDocuments);
  const registerFn = useServerFn(registerDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const listFn = useServerFn(listQaQcReviews);
  const getFn = useServerFn(getQaQcReview);
  const runFn = useServerFn(runQaQcReview);
  const resolveFn = useServerFn(setQaQcFindingResolved);
  const delFn = useServerFn(deleteQaQcReview);
  const gapsFn = useServerFn(addQaQcGapsToChecklist);
  const pdfFn = useServerFn(generateQaQcReportPdf);

  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState("Rev A");
  const [activeReview, setActiveReview] = useState<string | null>(null);

  const docs = useQuery({
    queryKey: ["docs", projectId],
    queryFn: () => docsFn({ data: { project_id: projectId } }),
  });

  const reviews = useQuery({
    queryKey: ["qaqc-reviews", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }),
  });

  const currentId = activeReview ?? reviews.data?.reviews.find((r) => r.status === "complete")?.id ?? null;

  const review = useQuery({
    queryKey: ["qaqc-review", currentId],
    queryFn: () => getFn({ data: { review_id: currentId as string } }),
    enabled: !!currentId,
  });

  const planDocs = (docs.data ?? []).filter(
    (d) => d.mime_type === "application/pdf" || (d.mime_type ?? "").startsWith("image/") || d.name.toLowerCase().endsWith(".pdf"),
  );

  const onUploadPlans = async (files: FileList) => {
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const path = `${userId}/${projectId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert: false });
        if (error) throw error;
        const doc = await registerFn({
          data: { project_id: projectId, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size },
        });
        const id = (doc as { id?: string } | null)?.id;
        if (id) added.push(id);
      }
      await qc.invalidateQueries({ queryKey: ["docs", projectId] });
      setSelected((prev) => [...prev, ...added].slice(0, 8));
      toast.success(`${added.length} plan file(s) uploaded and selected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const run = useMutation({
    mutationFn: () => runFn({ data: { project_id: projectId, document_ids: selected, revision_label: revision || "Rev A" } }),
    onSuccess: (res) => {
      toast.success(`QA/QC complete — ${res.findings} findings`);
      setActiveReview(res.review_id);
      qc.invalidateQueries({ queryKey: ["qaqc-reviews", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "QA/QC review failed"),
  });

  const resolve = useMutation({
    mutationFn: (v: { id: string; resolved: boolean }) => resolveFn({ data: { finding_id: v.id, resolved: v.resolved } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qaqc-review", currentId] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { review_id: id } }),
    onSuccess: () => {
      setActiveReview(null);
      qc.invalidateQueries({ queryKey: ["qaqc-reviews", projectId] });
    },
  });

  const addGaps = useMutation({
    mutationFn: () => gapsFn({ data: { review_id: currentId as string } }),
    onSuccess: (r) => {
      toast.success(r.added ? `${r.added} item(s) added to the checklist` : "No new checklist items");
      qc.invalidateQueries({ queryKey: ["checklist", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update checklist"),
  });

  const exportPdf = useMutation({
    mutationFn: () => pdfFn({ data: { review_id: currentId as string } }),
    onSuccess: (res) => {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "PDF export failed"),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = review.data as any;
  const rm = d?.review ? readinessMeta(d.review.readiness_category) : null;
  const findings = (d?.findings ?? []) as QaQcFindingRow[];
  const sheets = (d?.sheets ?? []) as QaQcSheetRow[];
  const sevCount = (s: string) => findings.filter((f) => f.severity === s && !f.resolved).length;

  return (
    <div className="space-y-6">
      {/* Run panel */}
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Jurisdiction-specific plan QA/QC</p>
            <h3 className="mt-1 text-lg font-semibold">Pre-submission review</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Select the plan set (PDF or image sheets) to inventory and review across all 12 QA/QC categories against the codes adopted by
              this project's authority having jurisdiction. {PERMIVIO_PROFESSIONAL_DISCLAIMER}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input value={revision} onChange={(e) => setRevision(e.target.value)} className="h-9 w-28" placeholder="Rev A" />
            <button
              onClick={() => run.mutate()}
              disabled={run.isPending || selected.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50"
            >
              <Sparkles className="size-3.5" /> {run.isPending ? "Reviewing…" : "Run QA/QC review"}
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {docs.isLoading && <p className="text-sm text-muted-foreground">Loading documents…</p>}
          {!docs.isLoading && planDocs.length === 0 && (
            <p className="text-sm text-muted-foreground">Upload plan sheets in the Docs tab first (PDF or image).</p>
          )}
          {planDocs.slice(0, 30).map((doc) => (
            <label key={doc.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={selected.includes(doc.id)}
                onChange={(e) =>
                  setSelected((prev) => (e.target.checked ? [...prev, doc.id].slice(0, 8) : prev.filter((x) => x !== doc.id)))
                }
              />
              <span className="truncate font-medium">{doc.name}</span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {new Date(doc.created_at).toLocaleDateString()}
              </span>
            </label>
          ))}
          {selected.length >= 8 && <p className="text-[11px] text-sky-400">Maximum of 8 documents per review run.</p>}
        </div>
      </div>

      {/* Review history */}
      {(reviews.data?.reviews.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {reviews.data!.reviews.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveReview(r.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider ${
                currentId === r.id ? "border-brand text-brand" : "border-border text-muted-foreground hover:border-brand/60"
              }`}
            >
              {r.revision_label} · {r.status === "complete" ? `${r.readiness_score ?? 0}/100` : r.status} ·{" "}
              {new Date(r.created_at).toLocaleDateString()}
            </button>
          ))}
        </div>
      )}

      {review.isLoading && currentId && <p className="text-sm text-muted-foreground">Loading review…</p>}

      {d?.review && (
        <>
          {/* Readiness */}
          <div className={`rounded-xl border p-4 ring-1 ${rm!.klass}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider opacity-80">Permit readiness (not a code determination)</p>
                <p className="mt-1 text-2xl font-semibold">
                  {rm!.label} · {d.review.readiness_score ?? 0}/100
                </p>
                <p className="mt-1 text-xs opacity-80">{rm!.definition}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {["critical", "high", "medium", "low", "informational"]
                    .map((s) => `${sevCount(s)} ${severityMeta(s).label.toLowerCase()}`)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => addGaps.mutate()}
                  disabled={addGaps.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  <ListPlus className="size-3.5" /> Add gaps to checklist
                </button>
                <button
                  onClick={() => exportPdf.mutate()}
                  disabled={exportPdf.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  <FileDown className="size-3.5" /> {exportPdf.isPending ? "Building…" : "QA/QC report PDF"}
                </button>
                <button
                  onClick={() => remove.mutate(d.review.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            </div>
          </div>

          {d.review.executive_summary && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Executive summary</p>
              <p className="mt-1.5 text-sm">{d.review.executive_summary}</p>
            </div>
          )}

          {/* Codes researched */}
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Jurisdiction codes used for this review</p>
            {((d.review.codes_researched ?? []) as Array<Record<string, string>>).length === 0 ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                No verified adopted-code records were available. Jurisdiction-specific items in this review are marked “Agency confirmation
                required.”
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-xs">
                {((d.review.codes_researched ?? []) as Array<Record<string, string>>).map((c, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="text-foreground capitalize">{c['discipline']}</span>: {c['code_family']} {c['edition']}
                    {c['effective_date'] ? ` (effective ${c['effective_date']})` : ""} · {String(c['verification'] ?? "").replace(/_/g, " ")}
                    {c['source_url'] && (
                      <a href={c['source_url']} target="_blank" rel="noreferrer" className="ml-2 text-brand hover:underline">
                        source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Inventory */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Drawing set inventory</p>
            <QaQcInventoryTable sheets={sheets} />
          </div>

          {/* Findings */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Findings by category</p>
            <QaQcFindingList findings={findings} onToggleResolved={(id, resolved) => resolve.mutate({ id, resolved })} />
          </div>

          {/* Missing docs / submission issues */}
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { label: "Missing documents", items: ((d.review.missing_documents ?? []) as Array<{ name: string; reason?: string }>).map((m) => `${m.name}${m.reason ? ` — ${m.reason}` : ""}`) },
              { label: "Likely submission issues", items: (d.review.submission_issues ?? []) as string[] },
              { label: "Needs professional confirmation", items: (d.review.needs_professional_confirmation ?? []) as string[] },
            ].map((block) => (
              <div key={block.label} className="rounded-xl border border-border bg-card/60 p-4">
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{block.label}</p>
                {block.items.length === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">None identified.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {block.items.map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {((d.review.recommended_actions ?? []) as string[]).length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Recommended actions before submission</p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {((d.review.recommended_actions ?? []) as string[]).map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card/40 p-4">
            <p className="flex max-w-2xl items-start gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-sky-400" />
              {PERMIVIO_PROFESSIONAL_DISCLAIMER} PERMIVIO does not certify plans, approve designs, or replace jurisdiction review.
            </p>
            <ProfessionalReviewButton
              projectId={projectId}
              targetType="qaqc_review"
              targetId={d.review.id}
              existing={d.professional_review}
              onDone={() => qc.invalidateQueries({ queryKey: ["qaqc-review", currentId] })}
            />
          </div>
        </>
      )}

      {d?.review?.status === "error" && <p className="text-sm text-destructive">{d.review.error}</p>}
    </div>
  );
}
