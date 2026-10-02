import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listDocuments, registerDocument } from "@/lib/documents.functions";
import { PlanSetVersions } from "@/components/project/PlanSetVersions";

const PLAN_CATS = new Set(["drawings", "specifications", "survey", "engineering"]);

/** Step 1: upload drawings. Step 2: group them into a plan set (version). Step 3 (below): run the review. */
export function PlanReviewSetup({ projectId, userId, hasPlanSets }: { projectId: string; userId: string; hasPlanSets: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(!hasPlanSets);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listFn = useServerFn(listDocuments);
  const registerFn = useServerFn(registerDocument);
  const docsQ = useQuery({ queryKey: ["docs", projectId], queryFn: () => listFn({ data: { project_id: projectId } }) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs = ((docsQ.data as any)?.documents ?? docsQ.data ?? []) as Array<{ id: string; name: string; document_category?: string | null }>;
  const planDocs = docs.filter((d) => PLAN_CATS.has(d.document_category ?? "") || /\.pdf$/i.test(d.name));

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let ok = 0;
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const path = `${userId}/${projectId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert: false });
        if (error) throw error;
        await registerFn({ data: { project_id: projectId, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size, document_category: "drawings" } });
        ok++;
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "Upload failed"}`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["docs", projectId] });
    qc.invalidateQueries({ queryKey: ["project-foundation", projectId] });
    if (ok) toast.success(`${ok} drawing file${ok === 1 ? "" : "s"} uploaded`);
  };

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Set up a review</p>
          <h3 className="mt-1 text-base font-semibold">Upload drawings and create a plan set</h3>
        </div>
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold">1 · Upload drawings</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF sheets or a full binder. Files are saved to this project's Documents → Plans.</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" multiple accept=".pdf,application/pdf,image/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />
              <button onClick={() => fileRef.current?.click()} disabled={!!uploading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50">
                <Upload className="size-3.5" /> {uploading ? `Uploading ${uploading.slice(0, 28)}…` : "Upload drawings"}
              </button>
              <span className="text-xs text-muted-foreground">{planDocs.length} plan file{planDocs.length === 1 ? "" : "s"} in this project</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold">2 · Create a plan set</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose which files make up this version. The newest set becomes Current; older sets and reviews stay as history.</p>
            <div className="mt-2">
              <PlanSetVersions projectId={projectId} docs={docs.map((d) => ({ id: d.id, name: d.name, category: d.document_category ?? "other" }))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">3 · Run the review</span> on the Current set below, then send findings to the Permit Roadmap.</p>
        </div>
      )}
    </div>
  );
}
