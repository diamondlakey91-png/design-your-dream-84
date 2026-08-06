import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getUserSettings,
  updateUserSettings,
  listPortalCredentials,
  savePortalCredential,
  deletePortalCredential,
  markPortalCredentialVerified,
  getCleanupCounts,
  runDataCleanup,
} from "@/lib/settings.functions";
import {
  User, Lock, Bell, KeyRound, PenLine, Database, Loader2, Plus, Trash2, ExternalLink,
  ShieldCheck, Check, Settings2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Workspace Settings — Permivio" },
      {
        name: "description",
        content:
          "Manage your Permivio profile, security, notifications, portal credentials, report branding, and data cleanup.",
      },
      { property: "og:title", content: "Workspace Settings — Permivio" },
      {
        property: "og:description",
        content:
          "Profile, security, notifications, portal credentials, branding, and data cleanup for your Permivio workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <AppShell>
        <div className="space-y-3 p-6">
          <h1 className="text-lg font-semibold">Settings unavailable</h1>
          <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
          <button
            className="rounded bg-brand px-3 py-2 text-sm text-brand-foreground"
            onClick={() => {
              reset();
              router.invalidate();
            }}
          >
            Retry
          </button>
        </div>
      </AppShell>
    );
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="p-6">Not found.</div>
    </AppShell>
  ),
});

type TabKey = "profile" | "security" | "notifications" | "credentials" | "branding" | "cleanup";

const TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "security", label: "Security", icon: Lock },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "credentials", label: "Portal Credentials", icon: KeyRound },
  { key: "branding", label: "Report Branding", icon: PenLine },
  { key: "cleanup", label: "Clean Up Data", icon: Database },
];

// ---------- shared primitives (existing Permivio card/typography language) ----------

function Panel({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: typeof User;
  title: string;
  description: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Icon className="size-4 text-brand" />
            {title}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand";

function PrimaryButton({
  children,
  pending,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || pending}
      className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-background/40 px-4 py-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[12px] text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked ? "border-brand bg-brand" : "border-border bg-muted"
        }`}
      >
        <span
          className={`block size-4 rounded-full bg-background transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

// ---------- page ----------

function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("profile");

  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 lg:px-0">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-brand">
            <Settings2 className="size-3" /> Workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage your profile, security, notifications, portal logins, report branding, and data
            cleanup — for both permit expediting and utility coordination work.
          </p>
        </header>

        {/* Tab rail */}
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card/60 p-2 shadow-sm backdrop-blur"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-brand/15 text-brand"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {tab === "profile" ? <ProfileSection /> : null}
        {tab === "security" ? <SecuritySection /> : null}
        {tab === "notifications" ? <NotificationsSection /> : null}
        {tab === "credentials" ? <CredentialsSection /> : null}
        {tab === "branding" ? <BrandingSection /> : null}
        {tab === "cleanup" ? <CleanupSection /> : null}
      </div>
    </AppShell>
  );
}

function useSettings() {
  const get = useServerFn(getUserSettings);
  return useQuery({ queryKey: ["user-settings"], queryFn: () => get() });
}

function useSaveSettings() {
  const qc = useQueryClient();
  const update = useServerFn(updateUserSettings);
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => update({ data: patch }),
    onSuccess: (row) => {
      qc.setQueryData(["user-settings"], row);
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Profile ----------

function ProfileSection() {
  const { data, isLoading } = useSettings();
  const save = useSaveSettings();
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    company: "",
    job_title: "",
    phone: "",
    timezone: "America/New_York",
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: u }) => setEmail(u.user?.email ?? ""));
  }, []);

  useEffect(() => {
    if (!data) return;
    setForm({
      full_name: data.full_name ?? "",
      company: data.company ?? "",
      job_title: data.job_title ?? "",
      phone: data.phone ?? "",
      timezone: data.timezone ?? "America/New_York",
    });
  }, [data]);

  return (
    <Panel
      icon={User}
      title="Profile"
      description="Your name and company appear on generated permit correspondence, response letters, and compliance reports."
    >
      {isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input
                className={inputClass}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Jordan Reyes"
              />
            </Field>
            <Field label="Email" hint="Change your sign-in email under Security.">
              <input className={`${inputClass} opacity-70`} value={email} readOnly />
            </Field>
            <Field label="Company">
              <input
                className={inputClass}
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Reyes Permitting Group"
              />
            </Field>
            <Field label="Role / title">
              <input
                className={inputClass}
                value={form.job_title}
                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                placeholder="Permit Expeditor"
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(410) 555-0142"
              />
            </Field>
            <Field label="Timezone" hint="Used for deadline reminders and inspection scheduling.">
              <select
                className={inputClass}
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                {[
                  "America/New_York",
                  "America/Chicago",
                  "America/Denver",
                  "America/Phoenix",
                  "America/Los_Angeles",
                  "America/Anchorage",
                  "Pacific/Honolulu",
                ].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace("America/", "").replace("Pacific/", "").replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <PrimaryButton pending={save.isPending} onClick={() => save.mutate(form)}>
            Save changes
          </PrimaryButton>
        </div>
      )}
    </Panel>
  );
}

// ---------- Security ----------

function SecuritySection() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const changePassword = async () => {
    if (pw.length < 8) return toast.error("Use at least 8 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPw("");
    setConfirm("");
    toast.success("Password updated");
  };

  const signOutEverywhere = async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setSigningOut(false);
    if (error) return toast.error(error.message);
    toast.success("Signed out of all other devices");
  };

  return (
    <div className="space-y-4">
      <Panel
        icon={Lock}
        title="Password"
        description="Set a new password for your Permivio account. You stay signed in on this device."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="At least 8 characters"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </div>
          <PrimaryButton pending={busy} onClick={changePassword}>
            Update password
          </PrimaryButton>
        </div>
      </Panel>

      <Panel
        icon={ShieldCheck}
        title="Active sessions"
        description="If you signed in on a shared or lost device, sign out everywhere else. Your current session is kept."
      >
        <GhostButton onClick={signOutEverywhere} disabled={signingOut}>
          {signingOut ? <Loader2 className="size-4 animate-spin" /> : null}
          Sign out of other devices
        </GhostButton>
      </Panel>
    </div>
  );
}

// ---------- Notifications ----------

function NotificationsSection() {
  const { data, isLoading } = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState({
    notify_email_digest: true,
    notify_permit_status: true,
    notify_deadlines: true,
    notify_corrections: true,
    notify_inspections: true,
    digest_frequency: "weekly" as "daily" | "weekly" | "off",
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      notify_email_digest: data.notify_email_digest,
      notify_permit_status: data.notify_permit_status,
      notify_deadlines: data.notify_deadlines,
      notify_corrections: data.notify_corrections,
      notify_inspections: data.notify_inspections,
      digest_frequency: (data.digest_frequency as "daily" | "weekly" | "off") ?? "weekly",
    });
  }, [data]);

  return (
    <Panel
      icon={Bell}
      title="Notifications"
      description="Choose what Permivio tells you about. These preferences apply to every project in your workspace."
    >
      {isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <Toggle
              label="Permit status changes"
              description="A tracked permit moves stage in the jurisdiction portal."
              checked={form.notify_permit_status}
              onChange={(v) => setForm({ ...form, notify_permit_status: v })}
            />
            <Toggle
              label="Deadline reminders"
              description="Expiring permits, resubmittal windows, and response due dates."
              checked={form.notify_deadlines}
              onChange={(v) => setForm({ ...form, notify_deadlines: v })}
            />
            <Toggle
              label="Correction letters & reviewer comments"
              description="New comments detected or parsed into your Response Matrix."
              checked={form.notify_corrections}
              onChange={(v) => setForm({ ...form, notify_corrections: v })}
            />
            <Toggle
              label="Inspection reminders"
              description="Scheduled inspections and outstanding sign-offs before C of O."
              checked={form.notify_inspections}
              onChange={(v) => setForm({ ...form, notify_inspections: v })}
            />
            <Toggle
              label="Email digest"
              description="A rollup of portfolio activity across all active projects."
              checked={form.notify_email_digest}
              onChange={(v) => setForm({ ...form, notify_email_digest: v })}
            />
            <div className="rounded-xl border border-border/70 bg-background/40 px-4 py-3">
              <Field label="Digest frequency">
                <select
                  className={inputClass}
                  value={form.digest_frequency}
                  disabled={!form.notify_email_digest}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      digest_frequency: e.target.value as "daily" | "weekly" | "off",
                    })
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="off">Off</option>
                </select>
              </Field>
            </div>
          </div>
          <PrimaryButton pending={save.isPending} onClick={() => save.mutate(form)}>
            Save preferences
          </PrimaryButton>
        </div>
      )}
    </Panel>
  );
}

// ---------- Portal credentials ----------

const KIND_LABEL: Record<string, string> = {
  permit: "Permit portal",
  utility: "Utility provider",
  fire: "Fire marshal",
  health: "Health department",
  other: "Other",
};

type CredForm = {
  id?: string;
  label: string;
  kind: "permit" | "utility" | "fire" | "health" | "other";
  jurisdiction: string;
  portal_url: string;
  username: string;
  password: string;
  notes: string;
};

const emptyCred: CredForm = {
  label: "",
  kind: "permit",
  jurisdiction: "",
  portal_url: "",
  username: "",
  password: "",
  notes: "",
};

function CredentialsSection() {
  const qc = useQueryClient();
  const list = useServerFn(listPortalCredentials);
  const saveFn = useServerFn(savePortalCredential);
  const delFn = useServerFn(deletePortalCredential);
  const verifyFn = useServerFn(markPortalCredentialVerified);

  const { data: creds, isLoading } = useQuery({
    queryKey: ["portal-credentials"],
    queryFn: () => list(),
  });

  const [form, setForm] = useState<CredForm | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["portal-credentials"] });

  const save = useMutation({
    mutationFn: (f: CredForm) =>
      saveFn({
        data: {
          id: f.id,
          label: f.label.trim(),
          kind: f.kind,
          jurisdiction: f.jurisdiction.trim() || null,
          portal_url: f.portal_url.trim() || null,
          username: f.username.trim(),
          password: f.password || null,
          notes: f.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      setForm(null);
      invalidate();
      toast.success("Credential saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Credential removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Marked as verified");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel
      icon={KeyRound}
      title="Portal Credentials"
      description="Add and manage logins for jurisdiction permit portals and priority utility provider portals. Passwords are encrypted before storage and are never shown back."
      action={
        <PrimaryButton onClick={() => setForm({ ...emptyCred })}>
          <Plus className="size-4" /> Add new
        </PrimaryButton>
      }
    >
      <div className="space-y-4">
        {form ? (
          <div className="rounded-xl border border-brand/40 bg-background/50 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Label">
                <input
                  className={inputClass}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Baltimore City ePermits"
                />
              </Field>
              <Field label="Portal type">
                <select
                  className={inputClass}
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as CredForm["kind"] })}
                >
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Jurisdiction or provider">
                <input
                  className={inputClass}
                  value={form.jurisdiction}
                  onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
                  placeholder="Baltimore City, MD"
                />
              </Field>
              <Field label="Portal URL">
                <input
                  className={inputClass}
                  value={form.portal_url}
                  onChange={(e) => setForm({ ...form, portal_url: e.target.value })}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Username">
                <input
                  className={inputClass}
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </Field>
              <Field
                label="Password"
                hint={form.id ? "Leave blank to keep the saved password." : "Stored encrypted."}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Notes" hint="MFA method, account owner, filing contact — anything your team needs.">
                <textarea
                  rows={2}
                  className={inputClass}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <PrimaryButton
                pending={save.isPending}
                disabled={!form.label.trim() || !form.username.trim()}
                onClick={() => save.mutate(form)}
              >
                Save credential
              </PrimaryButton>
              <GhostButton onClick={() => setForm(null)}>Cancel</GhostButton>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <Loading />
        ) : (creds ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No credentials saved. Click “Add new” to add permit or utility portal logins.
          </p>
        ) : (
          <ul className="space-y-2">
            {(creds ?? []).map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{c.label}</p>
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {KIND_LABEL[c.kind] ?? c.kind}
                    </span>
                    {c.has_password ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand">
                        <Lock className="size-2.5" /> Encrypted
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {c.username}
                    {c.jurisdiction ? ` · ${c.jurisdiction}` : ""}
                    {c.last_verified_at
                      ? ` · verified ${new Date(c.last_verified_at).toLocaleDateString()}`
                      : " · not verified"}
                  </p>
                  {c.notes ? (
                    <p className="truncate text-[12px] text-muted-foreground">{c.notes}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.portal_url ? (
                    <a
                      href={c.portal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${c.label}`}
                      className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  ) : null}
                  <button
                    onClick={() => verify.mutate(c.id)}
                    aria-label={`Mark ${c.label} verified`}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
                  >
                    <Check className="size-4" />
                  </button>
                  <GhostButton
                    onClick={() =>
                      setForm({
                        id: c.id,
                        label: c.label,
                        kind: (c.kind as CredForm["kind"]) ?? "permit",
                        jurisdiction: c.jurisdiction ?? "",
                        portal_url: c.portal_url ?? "",
                        username: c.username,
                        password: "",
                        notes: c.notes ?? "",
                      })
                    }
                  >
                    Edit
                  </GhostButton>
                  <button
                    onClick={() => remove.mutate(c.id)}
                    aria-label={`Delete ${c.label}`}
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground">
          Permivio never simulates a portal login. Saved credentials are for your own reference and
          for future authenticated portal syncs you explicitly trigger.
        </p>
      </div>
    </Panel>
  );
}

// ---------- Branding ----------

function BrandingSection() {
  const { data, isLoading } = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState({
    brand_company_name: "",
    brand_license_number: "",
    brand_contact_email: "",
    brand_contact_phone: "",
    brand_address: "",
    brand_accent_color: "#3B82F6",
    brand_logo_url: "",
    brand_footer_note: "",
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      brand_company_name: data.brand_company_name ?? "",
      brand_license_number: data.brand_license_number ?? "",
      brand_contact_email: data.brand_contact_email ?? "",
      brand_contact_phone: data.brand_contact_phone ?? "",
      brand_address: data.brand_address ?? "",
      brand_accent_color: data.brand_accent_color ?? "#3B82F6",
      brand_logo_url: data.brand_logo_url ?? "",
      brand_footer_note: data.brand_footer_note ?? "",
    });
  }, [data]);

  return (
    <Panel
      icon={PenLine}
      title="Report Branding"
      description="Applied to exported compliance reports, response letters, and roadmap PDFs so submittals go out on your letterhead."
    >
      {isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name on reports">
              <input
                className={inputClass}
                value={form.brand_company_name}
                onChange={(e) => setForm({ ...form, brand_company_name: e.target.value })}
                placeholder="Reyes Permitting Group, LLC"
              />
            </Field>
            <Field label="License / registration number">
              <input
                className={inputClass}
                value={form.brand_license_number}
                onChange={(e) => setForm({ ...form, brand_license_number: e.target.value })}
              />
            </Field>
            <Field label="Contact email">
              <input
                className={inputClass}
                value={form.brand_contact_email}
                onChange={(e) => setForm({ ...form, brand_contact_email: e.target.value })}
              />
            </Field>
            <Field label="Contact phone">
              <input
                className={inputClass}
                value={form.brand_contact_phone}
                onChange={(e) => setForm({ ...form, brand_contact_phone: e.target.value })}
              />
            </Field>
            <Field label="Logo URL" hint="A public https image URL. Used in PDF headers.">
              <input
                className={inputClass}
                value={form.brand_logo_url}
                onChange={(e) => setForm({ ...form, brand_logo_url: e.target.value })}
                placeholder="https://..."
              />
            </Field>
            <Field label="Accent color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Accent color"
                  className="size-9 shrink-0 rounded-lg border border-border bg-background/60"
                  value={/^#[0-9a-fA-F]{6}$/.test(form.brand_accent_color) ? form.brand_accent_color : "#3B82F6"}
                  onChange={(e) => setForm({ ...form, brand_accent_color: e.target.value })}
                />
                <input
                  className={inputClass}
                  value={form.brand_accent_color}
                  onChange={(e) => setForm({ ...form, brand_accent_color: e.target.value })}
                />
              </div>
            </Field>
          </div>
          <Field label="Mailing address">
            <textarea
              rows={2}
              className={inputClass}
              value={form.brand_address}
              onChange={(e) => setForm({ ...form, brand_address: e.target.value })}
            />
          </Field>
          <Field label="Footer note" hint="Appears at the bottom of every exported report page.">
            <textarea
              rows={2}
              className={inputClass}
              value={form.brand_footer_note}
              onChange={(e) => setForm({ ...form, brand_footer_note: e.target.value })}
              placeholder="Prepared by Reyes Permitting Group. Preliminary — subject to AHJ confirmation."
            />
          </Field>
          <PrimaryButton pending={save.isPending} onClick={() => save.mutate(form)}>
            Save branding
          </PrimaryButton>
        </div>
      )}
    </Panel>
  );
}

// ---------- Cleanup ----------

const CLEANUP_ITEMS: { key: string; label: string; description: string }[] = [
  { key: "chat", label: "Assistant chat history", description: "All AI Assistant threads and messages." },
  { key: "sync_history", label: "Permit sync history", description: "Logged portal sync attempts and results." },
  { key: "activity", label: "Activity timeline", description: "Project audit entries across your workspace." },
  { key: "reports", label: "Compliance reports", description: "Saved compliance report generations." },
  { key: "analyses", label: "AI plan review results", description: "Stored plan review findings for uploaded documents." },
  { key: "share_links", label: "Report share links", description: "Public share links you created for reports." },
];

function CleanupSection() {
  const qc = useQueryClient();
  const counts = useServerFn(getCleanupCounts);
  const run = useServerFn(runDataCleanup);
  const { data, isLoading } = useQuery({ queryKey: ["cleanup-counts"], queryFn: () => counts() });
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const mut = useMutation({
    mutationFn: (keys: string[]) => run({ data: { keys: keys as never[] } }),
    onSuccess: (deleted) => {
      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      setSelected([]);
      setConfirming(false);
      qc.invalidateQueries();
      toast.success(`Removed ${total} record${total === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  return (
    <Panel
      icon={Database}
      title="Clean Up Data"
      description="Permanently remove workspace history you no longer need. Projects, permits, checklists, and uploaded documents are never touched here."
    >
      {isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <ul className="grid gap-2 lg:grid-cols-2">
            {CLEANUP_ITEMS.map((item) => {
              const count = (data as Record<string, number> | undefined)?.[item.key] ?? 0;
              const checked = selected.includes(item.key);
              return (
                <li key={item.key}>
                  <button
                    onClick={() => toggle(item.key)}
                    disabled={count === 0}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                      checked ? "border-destructive/60 bg-destructive/10" : "border-border/70 bg-background/40"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-[12px] text-muted-foreground">{item.description}</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {confirming ? (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
              <p className="text-sm">
                This permanently deletes {selected.length} selected data set
                {selected.length === 1 ? "" : "s"}. It cannot be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => mut.mutate(selected)}
                  disabled={mut.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
                >
                  {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Delete permanently
                </button>
                <GhostButton onClick={() => setConfirming(false)}>Cancel</GhostButton>
              </div>
            </div>
          ) : (
            <GhostButton disabled={selected.length === 0} onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" /> Clean up selected
            </GhostButton>
          )}
        </div>
      )}
    </Panel>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </div>
  );
}
