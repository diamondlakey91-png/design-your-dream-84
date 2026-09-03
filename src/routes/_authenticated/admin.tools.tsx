import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Save, X, ShieldAlert, Search, Pencil, EyeOff, Eye } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  listServiceProductsAdmin,
  upsertServiceProduct,
  listServiceOrdersAdmin,
  updateServiceOrderAdmin,
} from "@/lib/toolsReports.functions";
import { ORDER_STATUS_LABEL, money, statusTone } from "@/lib/toolsCatalog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/tools")({
  component: AdminToolsPage,
  head: () => ({
    meta: [
      { title: "Admin · Tools & Reports Management | Permivio" },
      { name: "description", content: "Manage Permivio Tools & Reports products, pricing and client orders." },
      { property: "og:title", content: "Admin · Tools & Reports Management | Permivio" },
      { property: "og:description", content: "Manage Permivio Tools & Reports products, pricing and client orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ProductForm = {
  id?: string;
  product_key: string;
  name: string;
  client_title: string;
  client_question: string;
  description: string;
  category: string;
  base_price: string;
  professional_review_price: string;
  rush_price: string;
  turnaround_estimate: string;
  deliverables: string;
  supports_professional_review: boolean;
  active: boolean;
  display_order: string;
};

const EMPTY: ProductForm = {
  product_key: "",
  name: "",
  client_title: "",
  client_question: "",
  description: "",
  category: "report",
  base_price: "",
  professional_review_price: "",
  rush_price: "",
  turnaround_estimate: "",
  deliverables: "",
  supports_professional_review: true,
  active: true,
  display_order: "0",
};

const ORDER_STATUSES = [
  "paid",
  "processing",
  "waiting_client",
  "ai_in_progress",
  "professional_review",
  "ready",
  "delivered",
  "cancelled",
  "refunded",
] as const;

const toneClass: Record<string, string> = {
  blue: "text-brand bg-brand/10 ring-brand/30",
  green: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30",
  red: "text-red-400 bg-red-500/10 ring-red-500/30",
  gray: "text-muted-foreground bg-muted/40 ring-border",
};

function dollarsToCents(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function AdminToolsPage() {
  const adminQ = useIsAdmin();
  const productsFn = useServerFn(listServiceProductsAdmin);
  const upsertFn = useServerFn(upsertServiceProduct);
  const ordersFn = useServerFn(listServiceOrdersAdmin);
  const orderFn = useServerFn(updateServiceOrderAdmin);
  const qc = useQueryClient();

  const [tab, setTab] = useState<"products" | "orders">("products");
  const [form, setForm] = useState<ProductForm | null>(null);
  const [query, setQuery] = useState("");

  const productsQ = useQuery({
    queryKey: ["admin-service-products"],
    queryFn: () => productsFn(),
    enabled: adminQ.data === true,
  });

  const ordersQ = useQuery({
    queryKey: ["admin-service-orders"],
    queryFn: () => ordersFn(),
    enabled: adminQ.data === true && tab === "orders",
  });

  const save = useMutation({
    mutationFn: (f: ProductForm) =>
      upsertFn({
        data: {
          id: f.id,
          product_key: f.product_key.trim(),
          name: f.name.trim(),
          client_title: f.client_title.trim(),
          client_question: f.client_question.trim() || null,
          description: f.description.trim(),
          category: f.category.trim(),
          base_price_cents: dollarsToCents(f.base_price) ?? 0,
          professional_review_price_cents: dollarsToCents(f.professional_review_price),
          rush_price_cents: dollarsToCents(f.rush_price),
          turnaround_estimate: f.turnaround_estimate.trim() || null,
          deliverables: f.deliverables
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          supports_professional_review: f.supports_professional_review,
          active: f.active,
          display_order: Number(f.display_order) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Product saved");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["admin-service-products"] });
      qc.invalidateQueries({ queryKey: ["tools-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save product"),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: (typeof ORDER_STATUSES)[number] }) => orderFn({ data: v }),
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["admin-service-orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update order"),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (productsQ.data ?? []) as Array<Record<string, never>> as Array<Record<string, string | number | boolean | null>>;
    if (!q) return rows;
    return rows.filter((r) => `${r['name']} ${r['client_title']} ${r['product_key']} ${r['category']}`.toLowerCase().includes(q));
  }, [productsQ.data, query]);

  if (adminQ.isLoading) {
    return (
      <AppShell>
        <div className="p-6 text-sm text-muted-foreground">Checking permissions…</div>
      </AppShell>
    );
  }

  if (adminQ.data !== true) {
    return (
      <AppShell>
        <div className="mx-4 mt-6 space-y-3 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-brand">
            <ShieldAlert className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Restricted</span>
          </div>
          <h1 className="text-xl font-semibold">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            This page manages Tools &amp; Reports products, pricing and client orders. Ask an existing admin to grant
            your account the <code className="rounded bg-background px-1">admin</code> role.
          </p>
          <Link to="/dashboard" className="inline-block text-sm text-brand hover:underline">← Back to dashboard</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5 px-4 pb-10 pt-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-brand">
            <ShieldAlert className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Admin · Tools &amp; Reports</span>
          </div>
          <PermivioPageHeader eyebrow="Admin" title="Tools & Reports management" />
          <p className="text-sm text-muted-foreground">
            Add products, set pricing and move client orders through delivery. Payment states are set only by the
            verified payment webhook — never here.
          </p>
        </header>

        <div className="flex gap-2">
          {(["products", "orders"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider ${
                tab === t ? "border-brand text-brand" : "border-border text-muted-foreground hover:border-brand/60"
              }`}
            >
              {t === "products" ? "Products & pricing" : "Client orders"}
            </button>
          ))}
        </div>

        {tab === "products" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="pl-8" />
              </div>
              <button
                onClick={() => setForm({ ...EMPTY })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-brand-foreground"
              >
                <Plus className="size-3.5" /> New product
              </button>
            </div>

            {form && (
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{form.id ? "Edit product" : "New product"}</p>
                  <button onClick={() => setForm(null)} className="text-muted-foreground hover:text-foreground" aria-label="Close editor">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Product key</Label>
                    <Input
                      value={form.product_key}
                      onChange={(e) => setForm({ ...form, product_key: e.target.value })}
                      placeholder="site_investigation_report"
                      disabled={!!form.id}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="report" />
                  </div>
                  <div>
                    <Label className="text-xs">Internal name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Client-facing title</Label>
                    <Input value={form.client_title} onChange={(e) => setForm({ ...form, client_title: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Client question (the question this answers)</Label>
                    <Input
                      value={form.client_question}
                      onChange={(e) => setForm({ ...form, client_question: e.target.value })}
                      placeholder="What can I build on this property?"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Description</Label>
                    <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Base price (USD)</Label>
                    <Input value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} placeholder="499" />
                  </div>
                  <div>
                    <Label className="text-xs">Professional review price (USD, optional)</Label>
                    <Input
                      value={form.professional_review_price}
                      onChange={(e) => setForm({ ...form, professional_review_price: e.target.value })}
                      placeholder="1200"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Rush price (USD, optional)</Label>
                    <Input value={form.rush_price} onChange={(e) => setForm({ ...form, rush_price: e.target.value })} placeholder="250" />
                  </div>
                  <div>
                    <Label className="text-xs">Turnaround estimate</Label>
                    <Input
                      value={form.turnaround_estimate}
                      onChange={(e) => setForm({ ...form, turnaround_estimate: e.target.value })}
                      placeholder="3–5 business days"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Deliverables (one per line)</Label>
                    <Textarea
                      rows={3}
                      value={form.deliverables}
                      onChange={(e) => setForm({ ...form, deliverables: e.target.value })}
                      placeholder={"Feasibility snapshot\nAgency matrix\nPDF report"}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Display order</Label>
                    <Input value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} inputMode="numeric" />
                  </div>
                  <div className="flex items-end gap-4 text-xs">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.supports_professional_review}
                        onChange={(e) => setForm({ ...form, supports_professional_review: e.target.checked })}
                      />
                      Offers professional review
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                      Visible to clients
                    </label>
                  </div>
                </div>
                <button
                  onClick={() => save.mutate(form)}
                  disabled={save.isPending || !form.product_key || !form.name || !form.client_title || !form.description}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50"
                >
                  <Save className="size-3.5" /> {save.isPending ? "Saving…" : "Save product"}
                </button>
              </div>
            )}

            {productsQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading products…</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((p) => (
                  <div key={String(p['id'])} className="rounded-xl border border-border bg-card/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{String(p['client_title'])}</p>
                          <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                            {String(p['category'])}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ring-1 ${
                              p['active'] ? toneClass['blue'] : toneClass['gray']
                            }`}
                          >
                            {p['active'] ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                            {p['active'] ? "live" : "hidden"}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {String(p['product_key'])} · order {String(p['display_order'])}
                        </p>
                        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{String(p['description'])}</p>
                        <p className="mt-1.5 text-xs">
                          {money(Number(p['base_price_cents']), String(p['currency'] ?? "usd"))} base
                          {p['professional_review_price_cents']
                            ? ` · ${money(Number(p['professional_review_price_cents']), String(p['currency'] ?? "usd"))} professionally reviewed`
                            : ""}
                          {p['rush_price_cents'] ? ` · +${money(Number(p['rush_price_cents']), String(p['currency'] ?? "usd"))} rush` : ""}
                          {p['turnaround_estimate'] ? ` · ${String(p['turnaround_estimate'])}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          setForm({
                            id: String(p['id']),
                            product_key: String(p['product_key']),
                            name: String(p['name']),
                            client_title: String(p['client_title']),
                            client_question: p['client_question'] ? String(p['client_question']) : "",
                            description: String(p['description']),
                            category: String(p['category']),
                            base_price: String(Number(p['base_price_cents']) / 100),
                            professional_review_price: p['professional_review_price_cents']
                              ? String(Number(p['professional_review_price_cents']) / 100)
                              : "",
                            rush_price: p['rush_price_cents'] ? String(Number(p['rush_price_cents']) / 100) : "",
                            turnaround_estimate: p['turnaround_estimate'] ? String(p['turnaround_estimate']) : "",
                            deliverables: Array.isArray(p['deliverables']) ? (p['deliverables'] as string[]).join("\n") : "",
                            supports_professional_review: !!p['supports_professional_review'],
                            active: !!p['active'],
                            display_order: String(p['display_order'] ?? 0),
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </button>
                    </div>
                  </div>
                ))}
                {!filtered.length && <p className="text-sm text-muted-foreground">No products match that search.</p>}
              </div>
            )}
          </>
        )}

        {tab === "orders" && (
          <div className="space-y-2">
            {ordersQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading orders…</p>
            ) : (
              <>
                {((ordersQ.data ?? []) as Array<Record<string, never>> as Array<Record<string, string | number | boolean | null | { client_title?: string }>>).map(
                  (o) => {
                    const status = String(o['status']);
                    const product = o['service_products'] as { client_title?: string } | null;
                    return (
                      <div key={String(o['id'])} className="rounded-xl border border-border bg-card/60 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">{product?.client_title ?? "Service"}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ring-1 ${toneClass[statusTone(status)]}`}>
                                {ORDER_STATUS_LABEL[status] ?? status}
                              </span>
                              <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                                {String(o['delivery_tier']).replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              {money(Number(o['amount_cents']), String(o['currency'] ?? "usd"))} ·{" "}
                              {new Date(String(o['created_at'])).toLocaleDateString()} · {String(o['environment'])}
                              {o['rush'] ? " · rush" : ""}
                            </p>
                            {o['client_notes'] && <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{String(o['client_notes'])}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground" htmlFor={`st-${String(o['id'])}`}>
                              Status
                            </Label>
                            <select
                              id={`st-${String(o['id'])}`}
                              value={ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number]) ? status : ""}
                              onChange={(e) =>
                                setStatus.mutate({ id: String(o['id']), status: e.target.value as (typeof ORDER_STATUSES)[number] })
                              }
                              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                            >
                              <option value="" disabled>
                                {ORDER_STATUS_LABEL[status] ?? status}
                              </option>
                              {ORDER_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {ORDER_STATUS_LABEL[s] ?? s}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
                {!((ordersQ.data ?? []) as unknown[]).length && <p className="text-sm text-muted-foreground">No orders yet.</p>}
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
