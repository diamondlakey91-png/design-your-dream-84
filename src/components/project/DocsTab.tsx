import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Sparkles, Upload } from "lucide-react";
import { listDocuments, registerDocument, deleteDocument } from "@/lib/documents.functions";
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
          <p className="text-sm font-semibold">Project documents</p>
          <p className="text-xs text-muted-foreground">Plans, permits, correspondence — private to you.</p>
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

      {docs.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No documents yet.</div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} projectId={projectId} onDelete={() => del.mutate(d.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
