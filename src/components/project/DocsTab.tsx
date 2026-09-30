import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Sparkles, Upload } from "lucide-react";
import { listDocuments, registerDocument, deleteDocument, updateDocumentLinkage } from "@/lib/documents.functions";
import { listPermitItems } from "@/lib/checklist.functions";
import { DOCUMENT_GROUPS, DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL } from "@/lib/roadmapWorkflow";
import { PlanSetVersions } from "@/components/project/PlanSetVersions";
import { batchReviewPlans } from "@/lib/planReview.functions";
import { supabase } from "@/integrations/supabase/client";
import { BatchReport } from "@/components/project/BatchReport";
import { DocRow } from "@/components/project/DocRow";

export function DocsTab({ projectId, userId }: { projectId: string; userId: string }) {
  const listFn = useServerFn(listDocuments);
  const registerFn = useServerFn(registerDocument);
  const delFn = useServerFn(deleteDocument);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const q = useQuery({ queryKey: ["docs", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });
  const itemsFn = useServerFn(listPermitItems);
  const itemsQ = useQuery({ queryKey: ["permit_items", projectId], queryFn: () => itemsFn({ data: { project_id: projectId } }) });
  const linkFn = useServerFn(updateDocumentLinkage);
  const link = useMutation({
    mutationFn: (v: { id: string; document_category?: (typeof DOCUMENT_CATEGORIES)[number]; permit_item_id?: string | null }) => linkFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["docs", projectId] }); qc.invalidateQueries({ queryKey: ["project-foundation", projectId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const [group, setGroup] = useState("all");

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${userId}/${projectId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert: false });
      if (error) throw error;
      await registerFn({
        data: {
          project_id: projectId,
          name: file.name,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      qc.invalidateQueries({ queryKey: ["docs", projectId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-foundation", projectId] });
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs", projectId] }),
  });

  const docs = q.data ?? [];

  const batchFn = useServerFn(batchReviewPlans);
  const [report, setReport] = useState<Awaited<ReturnType<typeof batchReviewPlans>> | null>(null);
  const [forceRerun, setForceRerun] = useState(false);
  const batch = useMutation({
    mutationFn: () => batchFn({ data: { project_id: projectId, force: forceRerun } }),
    onSuccess: (r) => {
      setReport(r);
      qc.invalidateQueries({ queryKey: ["docs", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      qc.invalidateQueries({ queryKey: ["health", projectId] });
      toast.success(`Batch review complete — ${r.total_findings} findings across ${r.documents_reviewed} plan(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Batch review failed"),
  });

  const planCount = docs.filter((d) => (d.mime_type || "").startsWith("image/") || (d.mime_type || "") === "application/pdf" || d.name.toLowerCase().endsWith(".pdf")).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Document Center</p>
          <p className="text-xs text-muted-foreground">Plans, applications, corrections, approvals — private to you and your project team.</p>
        </div>
        <div className="flex items-center gap-3">
          {planCount > 0 && (
            <>
              <label className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={forceRerun} onChange={(e) => setForceRerun(e.target.checked)} className="size-3" />
                Re-run all
              </label>
              <button
                onClick={() => batch.mutate()}
                disabled={batch.isPending}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 disabled:opacity-50"
                title="One-click AI review of every uploaded plan + consolidated PermitHealth report"
              >
                <Sparkles className="size-3" /> {batch.isPending ? "Batch reviewing…" : `Batch review (${planCount})`}
              </button>
            </>
          )}
          <label className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 cursor-pointer">
            <Upload className="size-3" /> {uploading ? "Uploading…" : "Upload"}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
            />
          </label>
        </div>
      </div>

      {report && <BatchReport report={report} projectId={projectId} onClose={() => setReport(null)} />}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Document groups">
        {DOCUMENT_GROUPS.map((g) => {
          const n = g.cats ? docs.filter((d) => g.cats!.includes((d as { document_category?: string }).document_category ?? "other")).length : docs.length;
          return (
            <button key={g.key} role="tab" aria-selected={group === g.key} onClick={() => setGroup(g.key)}
              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded ${group === g.key ? "bg-brand/15 text-brand ring-1 ring-brand/40" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
              {g.label} ({n})
            </button>
          );
        })}
      </div>

      {group === "plans" && <PlanSetVersions projectId={projectId} docs={docs.map((d) => ({ id: d.id, name: d.name, category: (d as { document_category?: string }).document_category ?? "other" }))} />}

      {(() => {
        const g = DOCUMENT_GROUPS.find((x) => x.key === group)!;
        const shown = g.cats ? docs.filter((d) => g.cats!.includes((d as { document_category?: string }).document_category ?? "other")) : docs;
        const items = itemsQ.data ?? [];
        if (shown.length === 0) return <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No documents here yet.</div>;
        return (
          <ul className="space-y-2">
            {shown.map((d) => {
              const cat = (d as { document_category?: string }).document_category ?? "other";
              const status = d.plan_reviewed_at ? "Plan reviewed" : d.analyzed_at ? "AI analyzed" : "Not analyzed";
              return (
                <li key={d.id} className="space-y-1">
                  <DocRow doc={d} projectId={projectId} onDelete={() => del.mutate(d.id)} />
                  <div className="flex flex-wrap items-center gap-2 px-3 text-[11px] text-muted-foreground">
                    <select aria-label={`Category for ${d.name}`} value={cat} onChange={(e) => link.mutate({ id: d.id, document_category: e.target.value as (typeof DOCUMENT_CATEGORIES)[number] })}
                      className="h-7 rounded border border-input bg-card px-1.5 text-[11px]">
                      {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>)}
                    </select>
                    <select aria-label={`Roadmap item for ${d.name}`} value={d.permit_item_id ?? ""} onChange={(e) => link.mutate({ id: d.id, permit_item_id: e.target.value || null })}
                      className="h-7 max-w-[14rem] rounded border border-input bg-card px-1.5 text-[11px]">
                      <option value="">Not linked to a roadmap item</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <span>{status}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        );
      })()}
    </div>
  );
}
