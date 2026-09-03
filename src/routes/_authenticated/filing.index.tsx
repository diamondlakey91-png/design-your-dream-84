import { createFileRoute, Link } from "@tanstack/react-router";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  createFiling,
  deleteFiling,
  listFilings,
  updateFiling,
} from "@/lib/filings.functions";
import {
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/filing/")({
  head: () => ({
    meta: [
      { title: "Permit Filing — Permivio" },
      {
        name: "description",
        content:
          "Prepare, approve, submit and monitor permit filings across every jurisdiction from one filing workspace.",
      },
      { property: "og:title", content: "Permit Filing — Permivio" },
      {
        property: "og:description",
        content:
          "Pre-flight checks, human approval, portal submission and status monitoring for each permit filing.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FilingPage,
});

type PreflightItem = { label: string; done: boolean };

type Filing = {
  id: string;
  title: string;
  project_id: string | null;
  jurisdiction: string;
  permit_type: string;
  portal_name: string | null;
  portal_url: string | null;
  applicant_of_record: string | null;
  target_submittal_date: string | null;
  notes: string | null;
  status: string;
  preflight: PreflightItem[] | null;
  approved_by: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  confirmation_number: string | null;
  status_source: string | null;
  created_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
  jurisdiction: string | null;
  location: string | null;
  project_type: string | null;
};

const STAGES = [
  { key: "draft", label: "Draft" },
  { key: "preflight", label: "Pre-flight" },
  { key: "awaiting_approval", label: "Awaiting approval" },
  { key: "ready_to_submit", label: "Ready to submit" },
  { key: "submitted", label: "Submitted" },
  { key: "monitoring", label: "Monitoring" },
  { key: "issued", label: "Issued" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  preflight: "border-primary/40 text-primary",
  awaiting_approval: "border-[oklch(0.85_0.16_72)]/50 text-[oklch(0.85_0.16_72)]",
  ready_to_submit: "border-primary/50 text-primary",
  submitted: "border-[oklch(0.7_0.16_290)]/50 text-[oklch(0.78_0.14_290)]",
  monitoring: "border-[oklch(0.7_0.16_290)]/50 text-[oklch(0.78_0.14_290)]",
  issued: "border-[oklch(0.75_0.16_155)]/50 text-[oklch(0.75_0.16_155)]",
  withdrawn: "border-destructive/50 text-destructive",
};

function label(status: string) {
  return STAGES.find((s) => s.key === status)?.label ?? "Withdrawn";
}

function FilingPage() {
  const listFn = useServerFn(listFilings);
  const createFn = useServerFn(createFiling);
  const updateFn = useServerFn(updateFiling);
  const deleteFn = useServerFn(deleteFiling);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["filings"], queryFn: () => listFn() });
  const filings = (q.data?.filings ?? []) as unknown as Filing[];
  const projects = (q.data?.projects ?? []) as unknown as ProjectRow[];

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = filings.find((f) => f.id === selectedId) ?? null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["filings"] });

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      createFn({ data: input } as never),
    onSuccess: (row: { id?: string } | null) => {
      setOpen(false);
      setSelectedId(row?.id ?? null);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      updateFn({ data: input } as never),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      setSelectedId(null);
      invalidate();
    },
  });

  const stats = useMemo(() => {
    const municipalities = new Set(
      filings.map((f) => f.jurisdiction.trim().toLowerCase()).filter(Boolean),
    );
    return {
      total: filings.length,
      awaiting: filings.filter((f) => f.status === "awaiting_approval").length,
      live: filings.filter((f) => f.status === "submitted" || f.status === "monitoring").length,
      municipalities: municipalities.size,
    };
  }, [filings]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="grid gap-4">
          <PermivioPageHeader
            eyebrow="Permit Filing"
            title={<span className="flex flex-wrap items-center gap-3">
              Filing workflow
              <span className="rounded-full border border-primary/40 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary">
                Human approved
              </span>
            </span>}
            subtitle="Multi-jurisdiction filing workspace: pre-flight checks, a required human approval step, manual portal submission with a deep link, and status monitoring with a named source."
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => q.refetch()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {q.isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </button>
            <button
              onClick={() => setOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary-foreground"
              style={{
                background: "linear-gradient(90deg, oklch(0.66 0.19 258), oklch(0.68 0.19 305))",
              }}
            >
              <Plus className="size-4" /> Start new filing
            </button>
          </div>
        </header>

        <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-foreground">Submission is never automated</p>
          <p className="mt-1 text-muted-foreground">
            Permivio prepares the package and opens the jurisdiction portal for you. Nothing is
            filed on your behalf and no portal status is simulated — every status you record here
            carries the source you entered it from.
          </p>
        </div>

        {/* Stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Total filings"
            value={stats.total}
            hint="All jurisdictions"
            icon={<FileSignature className="size-4 text-primary" />}
          />
          <Stat
            label="Awaiting approval"
            value={stats.awaiting}
            hint={stats.awaiting ? "Needs a human sign-off" : "Nothing pending review"}
            icon={<UserCheck className="size-4 text-[oklch(0.85_0.16_72)]" />}
          />
          <Stat
            label="Live at portal"
            value={stats.live}
            hint="Submitted or monitoring"
            icon={<Send className="size-4 text-[oklch(0.78_0.14_290)]" />}
          />
          <Stat
            label="Municipalities"
            value={stats.municipalities}
            hint="Distinct jurisdictions in this view"
            icon={<Globe className="size-4 text-[oklch(0.75_0.16_155)]" />}
          />
        </div>

        {/* Content */}
        {q.isLoading ? (
          <div className="mt-8 grid place-items-center rounded-3xl border border-border bg-card/60 py-20">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : filings.length === 0 ? (
          <div className="mt-8 grid place-items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
            <div className="grid size-14 place-items-center rounded-2xl border border-border bg-card">
              <FileSignature className="size-6 text-primary" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-foreground">
              Get started with permit filing
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Create a filing for any project, run the pre-flight checklist, get it approved, then
              submit at the jurisdiction portal and log the confirmation number.
            </p>
            <button
              onClick={() => setOpen(true)}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-primary-foreground"
              style={{
                background: "linear-gradient(90deg, oklch(0.66 0.19 258), oklch(0.68 0.19 305))",
              }}
            >
              <Plus className="size-4" /> Start new filing
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <ul className="space-y-3">
              {filings.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => setSelectedId(f.id)}
                    className={`w-full rounded-2xl border bg-card/60 p-4 text-left transition-colors ${
                      selectedId === f.id
                        ? "border-primary/60"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate font-semibold text-foreground">{f.title}</span>
                      <span
                        className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${
                          STATUS_STYLE[f.status] ?? STATUS_STYLE.draft
                        }`}
                      >
                        {label(f.status)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {[f.permit_type, f.jurisdiction].filter(Boolean).join(" · ") ||
                        "No jurisdiction set"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span>
                        Pre-flight {(f.preflight ?? []).filter((i) => i.done).length}/
                        {(f.preflight ?? []).length}
                      </span>
                      {f.target_submittal_date && <span>Target {f.target_submittal_date}</span>}
                      {f.confirmation_number && <span>Conf {f.confirmation_number}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <div className="lg:sticky lg:top-24 lg:self-start">
              {selected ? (
                <FilingDetail
                  filing={selected}
                  busy={update.isPending || remove.isPending}
                  onPatch={(patch) => update.mutate({ id: selected.id, ...patch })}
                  onDelete={() => remove.mutate(selected.id)}
                />
              ) : (
                <div className="rounded-3xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
                  Select a filing to see its pre-flight checklist, approval record and portal
                  submission details.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {open && (
        <NewFilingDialog
          projects={projects}
          busy={create.isPending}
          error={create.error ? String((create.error as Error).message) : null}
          onClose={() => setOpen(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      )}
    </AppShell>
  );
}

function Stat({
  label: l,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {l}
        </span>
        <span className="grid size-9 place-items-center rounded-xl border border-border bg-background/60">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function FilingDetail({
  filing,
  busy,
  onPatch,
  onDelete,
}: {
  filing: Filing;
  busy: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const preflight = filing.preflight ?? [];
  const allDone = preflight.length > 0 && preflight.every((i) => i.done);
  const [approver, setApprover] = useState("");
  const [conf, setConf] = useState("");
  const [source, setSource] = useState("");

  const toggle = (idx: number) => {
    const next = preflight.map((item, i) => (i === idx ? { ...item, done: !item.done } : item));
    const status =
      filing.status === "draft" || filing.status === "preflight"
        ? next.every((i) => i.done)
          ? "awaiting_approval"
          : "preflight"
        : filing.status;
    onPatch({ preflight: next, status });
  };

  return (
    <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">{filing.title}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {[filing.permit_type, filing.jurisdiction].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${
            STATUS_STYLE[filing.status] ?? STATUS_STYLE.draft
          }`}
        >
          {label(filing.status)}
        </span>
      </div>

      {/* Stage rail */}
      <ol className="mt-5 space-y-2">
        {STAGES.map((s) => {
          const idx = STAGES.findIndex((x) => x.key === filing.status);
          const here = STAGES.findIndex((x) => x.key === s.key);
          const state = idx < 0 ? "todo" : here < idx ? "done" : here === idx ? "active" : "todo";
          return (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <span
                className={`size-2 rounded-full ${
                  state === "done"
                    ? "bg-[oklch(0.75_0.16_155)]"
                    : state === "active"
                      ? "bg-primary"
                      : "bg-muted-foreground/40"
                }`}
              />
              <span className={state === "todo" ? "text-muted-foreground" : "text-foreground"}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Pre-flight */}
      <section className="mt-6">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Pre-flight checks
        </h3>
        <ul className="mt-3 space-y-2">
          {preflight.map((item, i) => (
            <li key={item.label}>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={busy}
                  onChange={() => toggle(i)}
                  className="mt-0.5 size-4 accent-[oklch(0.66_0.19_258)]"
                />
                <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
                  {item.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {/* Approval */}
      <section className="mt-6 rounded-2xl border border-border bg-background/40 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-4 text-primary" /> Human approval
        </h3>
        {filing.approved_at ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Approved by {filing.approved_by || "—"} on{" "}
            {new Date(filing.approved_at).toLocaleString()}
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              placeholder="Approver name"
              className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
            />
            <button
              disabled={busy || !allDone || !approver.trim()}
              onClick={() =>
                onPatch({
                  approved_by: approver.trim(),
                  approved_at: new Date().toISOString(),
                  status: "ready_to_submit",
                })
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/50 px-4 text-sm font-semibold text-primary disabled:opacity-40"
            >
              <CheckCircle2 className="size-4" /> Approve
            </button>
            {!allDone && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Complete every pre-flight check before approving.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Submission */}
      <section className="mt-4 rounded-2xl border border-border bg-background/40 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Send className="size-4 text-primary" /> Portal submission
        </h3>
        {filing.portal_url ? (
          <a
            href={filing.portal_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            Open {filing.portal_name || "jurisdiction portal"}
            <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No portal link saved. Find it in the{" "}
            <Link to="/portals" className="text-primary hover:underline">
              portal directory
            </Link>
            .
          </p>
        )}

        {filing.submitted_at ? (
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p>Submitted {new Date(filing.submitted_at).toLocaleString()}</p>
            <p>Confirmation: {filing.confirmation_number || "—"}</p>
            <p>Status source: {filing.status_source || "manual entry"}</p>
            {filing.status !== "issued" && (
              <button
                disabled={busy}
                onClick={() => onPatch({ status: "issued" })}
                className="mt-2 inline-flex h-9 items-center gap-2 rounded-xl border border-[oklch(0.75_0.16_155)]/50 px-3 text-xs font-semibold uppercase tracking-widest text-[oklch(0.75_0.16_155)]"
              >
                Mark issued
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            <input
              value={conf}
              onChange={(e) => setConf(e.target.value)}
              placeholder="Portal confirmation / application number"
              className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
            />
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Status source (e.g. Fairfax CitizenAccess, phone call with plans reviewer)"
              className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
            />
            <button
              disabled={busy || !filing.approved_at || !conf.trim() || !source.trim()}
              onClick={() =>
                onPatch({
                  submitted_at: new Date().toISOString(),
                  confirmation_number: conf.trim(),
                  status_source: source.trim(),
                  status: "monitoring",
                })
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              style={{
                background: "linear-gradient(90deg, oklch(0.66 0.19 258), oklch(0.68 0.19 305))",
              }}
            >
              Record submission
            </button>
            {!filing.approved_at && (
              <p className="text-xs text-muted-foreground">
                A filing must be approved by a person before you record a submission.
              </p>
            )}
          </div>
        )}
      </section>

      <div className="mt-5 flex items-center justify-between">
        {filing.project_id ? (
          <Link
            to="/projects/$id"
            params={{ id: filing.project_id }}
            className="text-sm text-primary hover:underline"
          >
            Open project
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">No linked project</span>
        )}
        <button
          disabled={busy}
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline"
        >
          <Trash2 className="size-4" /> Delete
        </button>
      </div>
    </div>
  );
}

function NewFilingDialog({
  projects,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  projects: ProjectRow[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [permitType, setPermitType] = useState("Building Permit");
  const [portalName, setPortalName] = useState("");
  const [portalUrl, setPortalUrl] = useState("");
  const [applicant, setApplicant] = useState("");
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");

  const pickProject = (id: string) => {
    setProjectId(id);
    const p = projects.find((x) => x.id === id);
    if (p) {
      if (!title.trim()) setTitle(`${p.name} — ${permitType}`);
      if (!jurisdiction.trim()) setJurisdiction(p.jurisdiction || p.location || "");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Start new filing</h2>
            <p className="text-sm text-muted-foreground">
              Permivio prepares the package; you submit at the portal.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <Field label="Project">
            <select
              value={projectId}
              onChange={(e) => pickProject(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">No linked project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Filing title">
            <Input value={title} onChange={setTitle} placeholder="e.g. 1200 Main St — Building Permit" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Permit type">
              <Input value={permitType} onChange={setPermitType} placeholder="Building Permit" />
            </Field>
            <Field label="Jurisdiction (AHJ)">
              <Input value={jurisdiction} onChange={setJurisdiction} placeholder="Fairfax County, VA" />
            </Field>
            <Field label="Portal name">
              <Input value={portalName} onChange={setPortalName} placeholder="Fairfax CitizenAccess" />
            </Field>
            <Field label="Portal URL">
              <Input value={portalUrl} onChange={setPortalUrl} placeholder="https://…" />
            </Field>
            <Field label="Applicant of record">
              <Input value={applicant} onChange={setApplicant} placeholder="Name on the application" />
            </Field>
            <Field label="Target submittal date">
              <input
                type="date"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Scope, submittal requirements, reviewer contacts…"
              className="w-full rounded-xl border border-input bg-background/60 p-3 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-10 rounded-xl border border-border px-4 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            disabled={busy || !title.trim()}
            onClick={() =>
              onSubmit({
                title: title.trim(),
                project_id: projectId || null,
                jurisdiction: jurisdiction.trim(),
                permit_type: permitType.trim(),
                portal_name: portalName.trim() || null,
                portal_url: portalUrl.trim() || null,
                applicant_of_record: applicant.trim() || null,
                target_submittal_date: target || null,
                notes: notes.trim() || null,
              })
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            style={{
              background: "linear-gradient(90deg, oklch(0.66 0.19 258), oklch(0.68 0.19 305))",
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create filing
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {l}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary"
    />
  );
}
