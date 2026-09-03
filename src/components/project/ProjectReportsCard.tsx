import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Circle, Link2, Loader2, ShoppingBag } from "lucide-react";
import { attachOrderToProject, listAttachableOrders } from "@/lib/projectReports.functions";

type ReportVersion = {
  id: string;
  title: string;
  summary: string | null;
  version: number;
  delivery_tier: string;
  professionally_reviewed: boolean;
  created_at: string;
  key_findings: string[];
  risks: string[];
  next_steps: string[];
};

type OrderSummary = {
  id: string;
  title: string;
  status: string;
  delivery_tier: string;
  rush: boolean;
  created_at: string;
  version_count: number;
};

const STATUS_LABEL: Record<string, string> = {
  payment_required: "Awaiting payment",
  paid: "Paid — starting",
  processing: "In progress",
  waiting_client: "Waiting on you",
  ai_in_progress: "AI research in progress",
  professional_review: "In professional review",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function List({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <ul className="mt-1 space-y-1 text-sm text-foreground">
        {items.map((i, idx) => (
          <li key={idx} className="flex gap-2">
            <Circle className="mt-1.5 size-1.5 shrink-0 fill-current text-muted-foreground" />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Purchased tools & reports attached to this project, plus an attach control. */
export function ProjectReportsCard({
  projectId,
  orders,
  versions,
}: {
  projectId: string;
  orders: OrderSummary[];
  versions: ReportVersion[];
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAttachableOrders);
  const attachFn = useServerFn(attachOrderToProject);
  const [selected, setSelected] = useState("");

  const available = useQuery({ queryKey: ["attachable-orders"], queryFn: () => listFn() });
  const unattached = (available.data ?? []).filter((o) => o.project_id !== projectId);

  const attach = useMutation({
    mutationFn: (orderId: string) => attachFn({ data: { order_id: orderId, project_id: projectId } }),
    onSuccess: (r) => {
      toast.success(`${r.title} attached to this project`);
      setSelected("");
      qc.invalidateQueries({ queryKey: ["project-intelligence", projectId] });
      qc.invalidateQueries({ queryKey: ["attachable-orders"] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not attach that purchase"),
  });

  const detach = useMutation({
    mutationFn: (orderId: string) => attachFn({ data: { order_id: orderId, project_id: null } }),
    onSuccess: () => {
      toast.success("Purchase detached from this project");
      qc.invalidateQueries({ queryKey: ["project-intelligence", projectId] });
      qc.invalidateQueries({ queryKey: ["attachable-orders"] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not detach that purchase"),
  });

  return (
    <section className="rounded-xl border border-border bg-card/60 p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          <ShoppingBag className="size-3.5" /> Purchased reports & services
        </h3>
        <Link to="/tools" className="text-xs text-brand hover:underline">
          Browse Tools &amp; Reports →
        </Link>
      </header>

      {orders.length === 0 && versions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No purchased reports are attached to this project yet. Attach an existing purchase below, or order one from Tools &amp;
          Reports.
        </p>
      )}

      {orders.length > 0 && (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm text-foreground">{o.title}</div>
                <div className="text-xs text-muted-foreground">
                  {STATUS_LABEL[o.status] ?? o.status}
                  {o.delivery_tier === "professional_review" ? " · professionally reviewed tier" : " · AI-assisted tier"}
                  {o.rush ? " · rush" : ""}
                  {o.version_count > 0 ? ` · ${o.version_count} report version${o.version_count === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <button
                onClick={() => detach.mutate(o.id)}
                disabled={detach.isPending}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Detach
              </button>
            </li>
          ))}
        </ul>
      )}

      {versions.length > 0 && (
        <div className="mt-4 space-y-3">
          {versions.map((v) => (
            <article key={v.id} className="rounded-lg border border-border/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-foreground">
                  {v.title} <span className="text-muted-foreground">· v{v.version}</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono uppercase tracking-widest ${
                    v.professionally_reviewed
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-brand/40 bg-brand/10 text-brand"
                  }`}
                >
                  {v.professionally_reviewed ? <BadgeCheck className="size-3" /> : null}
                  {v.professionally_reviewed ? "Professionally reviewed" : "AI-assisted"}
                </span>
              </div>
              {v.summary && <p className="mt-2 text-sm text-muted-foreground">{v.summary}</p>}
              <List label="Key findings" items={v.key_findings} />
              <List label="Risks" items={v.risks} />
              <List label="Recommended next steps" items={v.next_steps} />
            </article>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-border/60 pt-4">
        <label htmlFor="attach-order" className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          Attach an existing purchase
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            id="attach-order"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-56 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">
              {available.isLoading
                ? "Loading your purchases…"
                : unattached.length === 0
                  ? "No other purchases available"
                  : "Select a purchase…"}
            </option>
            {unattached.map((o) => (
              <option key={o.id} value={o.id}>
                {o.product_title} — {STATUS_LABEL[o.status] ?? o.status}
                {o.project_id ? " (currently on another project)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => selected && attach.mutate(selected)}
            disabled={!selected || attach.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
          >
            {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            Attach to project
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Attaching moves the purchase, its report versions and its access rights to this project and records the change on the
          project timeline. Report findings are research and decision support, not a jurisdiction determination.
        </p>
      </div>
    </section>
  );
}
