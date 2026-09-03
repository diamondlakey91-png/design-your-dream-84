import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { requestProfessionalReview } from "@/lib/professionalReview.functions";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function ProfessionalReviewButton({
  projectId,
  targetType,
  targetId,
  existing,
  onDone,
}: {
  projectId: string;
  targetType: "qaqc_review" | "site_investigation" | "qaqc_finding";
  targetId: string;
  existing?: { status: string; reviewer_name: string | null; reviewer_notes: string | null } | null;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [reviewer, setReviewer] = useState("");
  const requestFn = useServerFn(requestProfessionalReview);

  const req = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          project_id: projectId,
          target_type: targetType,
          target_id: targetId,
          requested_notes: notes || undefined,
          reviewer_name: reviewer || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Human professional review requested");
      setOpen(false);
      setNotes("");
      onDone?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Request failed"),
  });

  if (existing && existing.status !== "declined") {
    return (
      <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-xs">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Human professional review</p>
        <p className="mt-0.5 font-medium capitalize">{existing.status.replace(/_/g, " ")}{existing.reviewer_name ? ` · ${existing.reviewer_name}` : ""}</p>
        {existing.reviewer_notes && <p className="mt-1 text-muted-foreground">{existing.reviewer_notes}</p>}
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand"
        >
          <UserCheck className="size-3.5" /> Request professional review
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
          <p className="text-xs text-muted-foreground">
            Flag this for a licensed design professional. PERMIVIO findings are pre-submission quality control, not a professional determination.
          </p>
          <Input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Reviewer / firm (optional)" />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What should the reviewer focus on?" rows={3} />
          <div className="flex gap-2">
            <button
              onClick={() => req.mutate()}
              disabled={req.isPending}
              className="rounded-lg bg-brand px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50"
            >
              {req.isPending ? "Sending…" : "Submit request"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
