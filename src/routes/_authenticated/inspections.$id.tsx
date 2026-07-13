import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getInspection, updateInspectionFields } from "@/lib/permits.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Camera, Check, X, Trash2, Plus } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inspections/$id")({
  head: () => ({ meta: [{ title: "Inspection — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: InspectionMode,
});

type ChecklistItem = { id: string; label: string; checked: boolean; failed?: boolean; note?: string };
type Photo = { path: string; caption?: string; url?: string | null };

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: crypto.randomUUID(), label: "Address & permit number posted on site", checked: false },
  { id: crypto.randomUUID(), label: "Approved plans on site", checked: false },
  { id: crypto.randomUUID(), label: "Prior corrections addressed", checked: false },
  { id: crypto.randomUUID(), label: "Work matches approved scope", checked: false },
];

function InspectionMode() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getInspection);
  const saveFn = useServerFn(updateInspectionFields);

  const q = useQuery({ queryKey: ["inspection", id], queryFn: () => getFn({ data: { id } }) });

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState("");
  const [newItem, setNewItem] = useState("");
  const [uploading, setUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.data || hydrated) return;
    const cl = Array.isArray(q.data.checklist) && (q.data.checklist as unknown[]).length > 0
      ? (q.data.checklist as ChecklistItem[])
      : DEFAULT_CHECKLIST;
    setChecklist(cl);
    setPhotos((q.data.photos ?? []) as Photo[]);
    setNotes((q.data as { notes?: string }).notes ?? "");
    setHydrated(true);
  }, [q.data, hydrated]);

  const save = useMutation({
    mutationFn: (patch: { checklist?: ChecklistItem[]; photos?: { path: string; caption: string }[]; notes?: string; status?: "passed" | "failed" }) =>
      saveFn({ data: { id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspection", id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const persist = (patch: { checklist?: ChecklistItem[]; photos?: Photo[]; notes?: string }) => {
    const clean = patch.photos ? patch.photos.map(({ path, caption }) => ({ path, caption: caption ?? "" })) : undefined;
    save.mutate({ id, ...patch, photos: clean });
  };

  const toggleItem = (itemId: string, field: "checked" | "failed") => {
    const next = checklist.map((c) => c.id === itemId ? { ...c, [field]: !c[field], ...(field === "checked" && !c.checked ? { failed: false } : {}), ...(field === "failed" && !c.failed ? { checked: false } : {}) } : c);
    setChecklist(next);
    persist({ checklist: next });
  };
  const removeItem = (itemId: string) => {
    const next = checklist.filter((c) => c.id !== itemId);
    setChecklist(next); persist({ checklist: next });
  };
  const addItem = () => {
    if (!newItem.trim()) return;
    const next = [...checklist, { id: crypto.randomUUID(), label: newItem.trim(), checked: false }];
    setChecklist(next); setNewItem(""); persist({ checklist: next });
  };

  const uploadPhoto = async (file: File) => {
    if (!q.data) return;
    setUploading(true);
    try {
      const path = `${q.data.user_id}/${q.data.project_id}/inspections/${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert: false });
      if (error) throw error;
      const next = [...photos, { path, caption: "" }];
      setPhotos(next);
      persist({ photos: next });
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const deletePhoto = (path: string) => {
    const next = photos.filter((p) => p.path !== path);
    setPhotos(next); persist({ photos: next });
  };

  const complete = useMutation({
    mutationFn: (status: "passed" | "failed") =>
      saveFn({ data: { id, status, notes, checklist, photos: photos.map(({ path, caption }) => ({ path, caption: caption ?? "" })) } }),
    onSuccess: (_r, status) => {
      toast.success(`Inspection marked ${status}`);
      qc.invalidateQueries({ queryKey: ["inspection", id] });
      if (q.data) navigate({ to: "/projects/$id", params: { id: q.data.project_id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) return <AppShell><div className="p-6 text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (!q.data) return <AppShell><div className="p-6 text-sm text-muted-foreground">Inspection not found.</div></AppShell>;

  const insp = q.data as { inspection_type: string; status: string; scheduled_date: string | null; inspector: string | null; project_id: string; projects?: { name: string; location: string } | null };
  const project = insp.projects;
  const failedCount = checklist.filter((c) => c.failed).length;

  return (
    <AppShell>
      <header className="p-6 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <Link to="/projects/$id" params={{ id: insp.project_id }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to project
        </Link>
        <div className="flex items-center gap-2 mt-4 mb-2">
          <span className="text-[10px] font-mono bg-brand/15 text-brand px-1.5 py-0.5 rounded uppercase tracking-widest">Inspection Mode</span>
          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase">{insp.status}</span>
        </div>
        <h1 className="text-xl font-semibold">{insp.inspection_type}</h1>
        {project && (
          <p className="text-sm text-muted-foreground mt-1">{project.name} · {project.location}</p>
        )}
      </header>

      <div className="p-6 space-y-6 pb-32">
        {/* Checklist */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">On-site checklist</p>
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c.id} className={`p-3 bg-card ring-1 rounded-xl flex items-center gap-2 ${c.failed ? "ring-destructive/40" : c.checked ? "ring-emerald-500/40" : "ring-black/5"}`}>
                <button
                  onClick={() => toggleItem(c.id, "checked")}
                  className={`size-9 rounded-lg flex items-center justify-center ring-1 shrink-0 ${c.checked ? "bg-emerald-500/20 text-emerald-600 ring-emerald-500/40" : "bg-background ring-black/10 text-muted-foreground"}`}
                  aria-label="Pass"
                >
                  <Check className="size-4" />
                </button>
                <button
                  onClick={() => toggleItem(c.id, "failed")}
                  className={`size-9 rounded-lg flex items-center justify-center ring-1 shrink-0 ${c.failed ? "bg-destructive/20 text-destructive ring-destructive/40" : "bg-background ring-black/10 text-muted-foreground"}`}
                  aria-label="Fail"
                >
                  <X className="size-4" />
                </button>
                <span className={`flex-1 text-sm ${c.checked ? "line-through text-muted-foreground" : ""}`}>{c.label}</span>
                <button onClick={() => removeItem(c.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              value={newItem} onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
              placeholder="Add checklist item"
              className="flex-1 h-10 px-3 rounded-lg bg-background ring-1 ring-black/5 text-sm outline-none focus:ring-brand"
            />
            <button onClick={addItem} className="h-10 px-4 rounded-lg bg-muted text-foreground text-sm font-medium inline-flex items-center gap-1">
              <Plus className="size-4" /> Add
            </button>
          </div>
        </section>

        {/* Photos */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Photos ({photos.length})</p>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand hover:opacity-80 cursor-pointer">
              <Camera className="size-3" /> {uploading ? "Uploading…" : "Capture"}
              <input
                ref={fileRef} type="file" accept="image/*" capture="environment"
                className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }}
              />
            </label>
          </div>
          {photos.length === 0 ? (
            <div className="p-6 text-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              Tap Capture to take a photo.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {photos.map((p) => (
                <div key={p.path} className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-black/5 bg-muted">
                  {p.url ? (
                    <img src={p.url} alt={p.caption || "Inspection photo"} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
                  )}
                  <button
                    onClick={() => deletePhoto(p.path)}
                    className="absolute top-1.5 right-1.5 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                    aria-label="Delete photo"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Notes */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => persist({ notes })}
            rows={4}
            placeholder="Findings, corrections requested, follow-ups…"
            className="w-full p-3 rounded-lg bg-card ring-1 ring-black/5 text-sm outline-none focus:ring-brand resize-none"
          />
        </section>
      </div>

      {/* Fixed action bar */}
      <div className="fixed bottom-16 left-0 right-0 border-t border-border bg-background/95 backdrop-blur p-3 flex gap-2 max-w-md mx-auto">
        <button
          onClick={() => complete.mutate("failed")}
          disabled={complete.isPending}
          className="flex-1 h-12 rounded-lg bg-destructive/15 text-destructive text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <X className="size-4" /> Fail{failedCount > 0 ? ` (${failedCount})` : ""}
        </button>
        <button
          onClick={() => complete.mutate("passed")}
          disabled={complete.isPending}
          className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Check className="size-4" /> Pass
        </button>
      </div>
    </AppShell>
  );
}
