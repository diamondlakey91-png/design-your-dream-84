import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  listPortalMappings,
  upsertPortalMapping,
  deletePortalMapping,
  type PortalMappingRow,
} from "@/lib/portals.functions";
import { PORTAL_PLATFORMS, PORTAL_REGISTRY, US_STATES } from "@/lib/portalRegistry";
import { Plus, Pencil, Trash2, Save, X, ShieldAlert, Search, ExternalLink, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/portals")({
  component: AdminPortalsPage,
});

type FormState = {
  id?: string;
  jurisdiction: string;
  state: string;
  platform: string;
  url: string;
  address_search_template: string;
  permit_search_template: string;
  plan_review_url: string;
  notes: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  jurisdiction: "",
  state: "",
  platform: "Accela",
  url: "",
  address_search_template: "",
  permit_search_template: "",
  plan_review_url: "",
  notes: "",
  is_active: true,
};

function AdminPortalsPage() {
  const adminQ = useIsAdmin();
  const listFn = useServerFn(listPortalMappings);
  const upsertFn = useServerFn(upsertPortalMapping);
  const deleteFn = useServerFn(deletePortalMapping);
  const qc = useQueryClient();

  const mappingsQ = useQuery({
    queryKey: ["portal-mappings"],
    queryFn: () => listFn(),
    enabled: adminQ.data === true,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [query, setQuery] = useState("");

  const upsertMut = useMutation({
    mutationFn: async (f: FormState) =>
      upsertFn({
        data: {
          id: f.id,
          jurisdiction: f.jurisdiction,
          state: f.state,
          platform: f.platform,
          url: f.url,
          address_search_template: f.address_search_template || null,
          permit_search_template: f.permit_search_template || null,
          plan_review_url: f.plan_review_url || null,
          notes: f.notes || null,
          is_active: f.is_active,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-mappings"] });
      setForm(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-mappings"] }),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = mappingsQ.data ?? [];
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.jurisdiction} ${r.state} ${r.platform}`.toLowerCase().includes(q),
    );
  }, [mappingsQ.data, query]);

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
        <div className="mx-4 mt-6 rounded-lg border border-border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-brand">
            <ShieldAlert className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Restricted</span>
          </div>
          <h1 className="text-xl font-semibold">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            This page lets admins add and edit jurisdiction-to-portal mappings without code changes. Ask an existing
            admin to grant your account the <code className="rounded bg-background px-1">admin</code> role in the
            backend (<code className="rounded bg-background px-1">user_roles</code> table).
          </p>
          <Link to="/dashboard" className="inline-block text-sm text-brand hover:underline">← Back to dashboard</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-4 pt-6 space-y-5 pb-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-brand">
            <ShieldAlert className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Admin · Portal Mappings</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Jurisdiction → Portal Mappings</h1>
          <p className="text-sm text-muted-foreground">
            Add new agencies and edit portal links without shipping code. DB entries override the {PORTAL_REGISTRY.length} built-in
            mappings on <code className="rounded bg-card px-1 text-[11px]">(jurisdiction, state, platform)</code>.
          </p>
        </header>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter mappings…"
              className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <button
            onClick={() => setForm({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="size-4" /> New mapping
          </button>
        </div>

        {/* Form (inline) */}
        {form && (
          <MappingForm
            value={form}
            onChange={setForm}
            onCancel={() => setForm(null)}
            onSave={() => upsertMut.mutate(form)}
            saving={upsertMut.isPending}
            error={upsertMut.error ? String((upsertMut.error as Error).message) : null}
          />
        )}

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {mappingsQ.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {!mappingsQ.isLoading && filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              No mappings yet. Click <span className="font-medium">New mapping</span> to add the first one.
            </div>
          )}
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <li key={r.id} className="p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{r.jurisdiction}</span>
                    <span className="rounded bg-background border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{r.state}</span>
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium">{r.platform}</span>
                    {!r.is_active && (
                      <span className="rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-300 px-2 py-0.5 text-[10px]">disabled</span>
                    )}
                  </div>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand hover:underline break-all"
                  >
                    {r.url} <ExternalLink className="size-3" />
                  </a>
                  {r.notes && <p className="mt-1 text-[11px] text-muted-foreground">{r.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    title={r.is_active ? "Disable" : "Enable"}
                    onClick={() =>
                      upsertMut.mutate({
                        id: r.id,
                        jurisdiction: r.jurisdiction,
                        state: r.state,
                        platform: r.platform,
                        url: r.url,
                        address_search_template: r.address_search_template ?? "",
                        permit_search_template: r.permit_search_template ?? "",
                        plan_review_url: r.plan_review_url ?? "",
                        notes: r.notes ?? "",
                        is_active: !r.is_active,
                      })
                    }
                    className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    {r.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  <button
                    title="Edit"
                    onClick={() =>
                      setForm({
                        id: r.id,
                        jurisdiction: r.jurisdiction,
                        state: r.state,
                        platform: r.platform,
                        url: r.url,
                        address_search_template: r.address_search_template ?? "",
                        permit_search_template: r.permit_search_template ?? "",
                        plan_review_url: r.plan_review_url ?? "",
                        notes: r.notes ?? "",
                        is_active: r.is_active,
                      })
                    }
                    className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete mapping for ${r.jurisdiction} (${r.state})?`)) {
                        deleteMut.mutate(r.id);
                      }
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

function MappingForm({
  value, onChange, onCancel, onSave, saving, error,
}: {
  value: FormState;
  onChange: (v: FormState) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="rounded-lg border border-brand/40 bg-brand/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{value.id ? "Edit mapping" : "New mapping"}</h2>
        <button onClick={onCancel} className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Jurisdiction" required>
          <input
            value={value.jurisdiction}
            onChange={(e) => set("jurisdiction", e.target.value)}
            placeholder="e.g. Arlington County"
            className="input"
          />
        </Field>
        <Field label="State" required>
          <select value={value.state} onChange={(e) => set("state", e.target.value)} className="input">
            <option value="">Select state…</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Platform" required>
          <select value={value.platform} onChange={(e) => set("platform", e.target.value)} className="input">
            {PORTAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Active">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="size-4"
            />
            Visible to users
          </label>
        </Field>
        <Field label="Portal home URL" required full>
          <input value={value.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…/Default.aspx" className="input" />
        </Field>
        <Field label="Address search template" full hint="Use {q} where the address goes. e.g. https://portal/Search?text={q}">
          <input value={value.address_search_template} onChange={(e) => set("address_search_template", e.target.value)} placeholder="https://portal/Search?text={q}" className="input" />
        </Field>
        <Field label="Permit # search template" full hint="Use {q} where the permit number goes.">
          <input value={value.permit_search_template} onChange={(e) => set("permit_search_template", e.target.value)} placeholder="https://portal/Search?permit={q}" className="input" />
        </Field>
        <Field label="Plan review URL (ProjectDox etc.)" full>
          <input value={value.plan_review_url} onChange={(e) => set("plan_review_url", e.target.value)} placeholder="https://…/ProjectDox/" className="input" />
        </Field>
        <Field label="Notes" full>
          <textarea value={value.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="input" />
        </Field>
      </div>

      {error && <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">Cancel</button>
        <button
          onClick={onSave}
          disabled={saving || !value.jurisdiction || !value.state || !value.url}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          <Save className="size-4" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <style>{`.input{width:100%;border-radius:8px;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:.5rem .625rem;font-size:.875rem;outline:none}.input:focus{border-color:hsl(var(--brand))}`}</style>
    </div>
  );
}

function Field({ label, children, required, full, hint }: { label: string; children: React.ReactNode; required?: boolean; full?: boolean; hint?: string }) {
  return (
    <div className={full ? "sm:col-span-2 space-y-1" : "space-y-1"}>
      <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}{required && <span className="text-brand"> *</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
