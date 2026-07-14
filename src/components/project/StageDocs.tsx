import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Paperclip } from "lucide-react";
import { registerDocument, deleteDocument, updateDocumentLinkage } from "@/lib/documents.functions";
import { supabase } from "@/integrations/supabase/client";

export function StageDocs({
  projectId, userId, stage, docs, items, defaultOpen,
}: {
  projectId: string;
  userId: string;
  stage: number;
  docs: Array<{ id: string; name: string; mime_type: string; size_bytes: number; url: string | null; stage: number | null; permit_item_id: string | null }>;
  items: Array<{ id: string; name: string; status: string }>;
  defaultOpen: boolean;
}) {
  const registerFn = useServerFn(registerDocument);
  const delFn = useServerFn(deleteDocument);
  const linkFn = useServerFn(updateDocumentLinkage);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["docs", projectId] });
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${userId}/${projectId}/stage-${stage}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert: false });
      if (error) throw error;
      await registerFn({
        data: {
          project_id: projectId,
          name: file.name,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          stage,
        },
      });
      invalidate();
      toast.success(`Attached to Stage ${stage + 1}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDelete = async (id: string) => {
    try {
      await delFn({ data: { id } });
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onLink = async (id: string, permit_item_id: string | null) => {
    try {
      await linkFn({ data: { id, permit_item_id } });
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="size-3" /> Stage documents {docs.length > 0 && <span className="text-brand">({docs.length})</span>}
        </button>
        <label className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-brand hover:opacity-80 cursor-pointer">
          <Upload className="size-3" /> {uploading ? "Uploading…" : "Attach"}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
          />
        </label>
      </div>

      {open && (
        <div className="mt-2 space-y-1.5">
          {docs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No documents attached to this stage yet.</p>
          ) : (
            docs.map((d) => (
              <div key={d.id} className="rounded-lg border border-border bg-background/60 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate text-foreground hover:text-brand hover:underline flex-1">
                      {d.name}
                    </a>
                  ) : (
                    <span className="truncate flex-1">{d.name}</span>
                  )}
                  <button
                    onClick={() => onDelete(d.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    title="Remove document"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Links to:</span>
                  <select
                    value={d.permit_item_id ?? ""}
                    onChange={(e) => onLink(d.id, e.target.value || null)}
                    className="flex-1 min-w-0 rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
                  >
                    <option value="">— None —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
