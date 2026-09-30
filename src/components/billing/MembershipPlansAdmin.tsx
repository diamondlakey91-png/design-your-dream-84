import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adjustCreditsAdmin, listPlansAdmin, setPlanEntitlementAdmin, upsertPlanAdmin } from "@/lib/commerce.functions";
import { ENTITLEMENT_LABEL, ENTITLEMENT_ORDER, type EntitlementKey } from "@/lib/commerceLabels";

type PlanRow = {
  id: string;
  plan_key: string;
  name: string;
  description: string | null;
  monthly_price_cents: number | null;
  active: boolean;
  display_order: number;
  plan_entitlements: Array<{ entitlement_key: EntitlementKey; limit_value: number | null; period: string }>;
};

/** Admin-only: configure membership plans, their limits and allowances. */
export function MembershipPlansAdmin() {
  const listFn = useServerFn(listPlansAdmin);
  const q = useQuery({ queryKey: ["admin-plans"], queryFn: () => listFn() });
  const plans = (q.data ?? []) as unknown as PlanRow[];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        The plan key must match the payment price lookup key. Allowances marked “monthly” are granted only when a verified
        payment confirms a new or renewed billing period. Leave a limit blank for unlimited; remove it to not offer it.
      </p>
      {plans.map((p) => (
        <PlanCard key={p.id} plan={p} />
      ))}
      <AdjustCredits />
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanRow }) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertPlanAdmin);
  const setEnt = useServerFn(setPlanEntitlementAdmin);
  const [name, setName] = useState(plan.name);
  const [desc, setDesc] = useState(plan.description ?? "");
  const [price, setPrice] = useState(plan.monthly_price_cents != null ? String(plan.monthly_price_cents / 100) : "");
  const [active, setActive] = useState(plan.active);

  const savePlan = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: plan.id,
          plan_key: plan.plan_key,
          name: name.trim(),
          description: desc.trim() || null,
          monthly_price_cents: price.trim() ? Math.round(Number(price) * 100) : null,
          active,
          display_order: plan.display_order,
        },
      }),
    onSuccess: () => {
      toast.success("Plan saved");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save plan"),
  });

  const saveEnt = useMutation({
    mutationFn: (v: { key: EntitlementKey; limit: string; period: string; remove?: boolean }) =>
      setEnt({
        data: {
          plan_id: plan.id,
          entitlement_key: v.key,
          limit_value: v.limit.trim() === "" ? null : Math.max(0, Number(v.limit) || 0),
          period: v.period as "none" | "monthly",
          remove: !!v.remove,
        },
      }),
    onSuccess: () => {
      toast.success("Limit saved");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save limit"),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{plan.plan_key}</p>
        <label className="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Offered
        </label>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Displayed monthly price ($)</Label>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Not set" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>
      <button
        onClick={() => savePlan.mutate()}
        disabled={savePlan.isPending}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50"
      >
        <Save className="size-3.5" /> Save plan
      </button>

      <div className="mt-4 divide-y divide-border rounded-xl border border-border">
        {ENTITLEMENT_ORDER.map((key) => {
          const cur = plan.plan_entitlements.find((e) => e.entitlement_key === key);
          return (
            <EntRow
              key={`${key}-${cur?.limit_value ?? "x"}-${cur?.period ?? "x"}`}
              label={ENTITLEMENT_LABEL[key]}
              configured={!!cur}
              limit={cur ? (cur.limit_value == null ? "" : String(cur.limit_value)) : ""}
              period={cur?.period ?? (key.endsWith("_credits") || key === "ai_queries" ? "monthly" : "none")}
              onSave={(limit, period) => saveEnt.mutate({ key, limit, period })}
              onRemove={() => saveEnt.mutate({ key, limit: "", period: "none", remove: true })}
            />
          );
        })}
      </div>
    </div>
  );
}

function EntRow(props: {
  label: string;
  configured: boolean;
  limit: string;
  period: string;
  onSave: (limit: string, period: string) => void;
  onRemove: () => void;
}) {
  const [limit, setLimit] = useState(props.limit);
  const [period, setPeriod] = useState(props.period);
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 text-xs">
      <span className="min-w-[180px] flex-1 text-foreground">{props.label}</span>
      <span className="text-muted-foreground">{props.configured ? "" : "Not offered"}</span>
      <Input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Unlimited" className="h-8 w-24" inputMode="numeric" />
      <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2">
        <option value="none">Limit</option>
        <option value="monthly">Monthly allowance</option>
      </select>
      <button onClick={() => props.onSave(limit, period)} className="rounded-md border border-border px-2 py-1 hover:border-brand hover:text-brand">
        Save
      </button>
      {props.configured && (
        <button onClick={props.onRemove} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground">
          Remove
        </button>
      )}
    </div>
  );
}

function AdjustCredits() {
  const fn = useServerFn(adjustCreditsAdmin);
  const [userId, setUserId] = useState("");
  const [type, setType] = useState("report_credits");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () =>
      fn({ data: { user_id: userId.trim(), credit_type: type as never, quantity: Number(qty) || 0, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success("Adjustment recorded in the credit ledger");
      setReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not adjust credits"),
  });
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">Manual credit adjustment</p>
      <p className="mt-1 text-xs text-muted-foreground">Recorded permanently in the customer's credit history with your reason.</p>
      <div className="mt-2 grid gap-2 md:grid-cols-4">
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Customer user ID" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {ENTITLEMENT_ORDER.filter((k) => k.endsWith("_credits") || k === "ai_queries").map((k) => (
            <option key={k} value={k}>{ENTITLEMENT_LABEL[k]}</option>
          ))}
        </select>
        <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="+/- quantity" inputMode="numeric" />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
      </div>
      <button
        onClick={() => m.mutate()}
        disabled={m.isPending || !userId || reason.trim().length < 3 || !Number(qty)}
        className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50"
      >
        Record adjustment
      </button>
    </div>
  );
}
