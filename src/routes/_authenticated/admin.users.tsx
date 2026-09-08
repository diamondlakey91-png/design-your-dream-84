import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { Input } from "@/components/ui/input";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { listAllUsersAdmin, setOrgMemberRoleAdmin, setPlatformAdminAdmin } from "@/lib/adminUsers.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
  head: () => ({
    meta: [
      { title: "Admin · People & Roles | Permivio" },
      { name: "description", content: "Review every Permivio account, its organization roles and which dashboard it opens, and correct misassigned roles." },
      { property: "og:title", content: "Admin · People & Roles | Permivio" },
      { property: "og:description", content: "Review Permivio accounts, organization roles and dashboard modes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const ROLE_LABEL: Record<string, string> = {
  client: "Client",
  client_admin: "Client administrator",
  project_manager: "Project manager",
  permit_manager: "Permit manager",
  researcher: "Researcher",
  qaqc_reviewer: "QA/QC reviewer",
  authorized_reviewer: "Authorized reviewer",
  org_admin: "Organization administrator",
};

function AdminUsersPage() {
  const adminQ = useIsAdmin();
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listAllUsersAdmin);
  const saveRole = useServerFn(setOrgMemberRoleAdmin);
  const savePlatform = useServerFn(setPlatformAdminAdmin);
  const [q, setQ] = useState("");

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    enabled: adminQ.data === true,
  });

  const roleMutation = useMutation({
    mutationFn: (v: { membershipId: string; role: string }) => saveRole({ data: v as never }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["org-context"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not update that role."),
  });

  const platformMutation = useMutation({
    mutationFn: (v: { userId: string; isAdmin: boolean }) => savePlatform({ data: v }),
    onSuccess: () => {
      toast.success("Administrator access updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["is-admin"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not change access."),
  });

  const rows = useMemo(() => {
    const list = usersQ.data?.users ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((u) =>
      [u.email, u.full_name, u.company, ...u.memberships.map((m) => m.organization_name)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [usersQ.data, q]);

  if (adminQ.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">Checking access…</div>
      </AppShell>
    );
  }

  if (adminQ.data !== true) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-3xl border border-border bg-card p-6">
            <ShieldAlert className="size-5 text-primary" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">Administrator access required</h1>
            <p className="mt-2 text-sm text-muted-foreground">This page is limited to Permivio platform administrators.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const orgRoles = usersQ.data?.orgRoles ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <PermivioPageHeader
          title="People & Roles"
          subtitle="Every account, its organization roles, and the dashboard it opens today. Change a role to correct a misassignment."
        />

        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email, name, company or organization"
            className="border-0 bg-transparent focus-visible:ring-0"
          />
          <span className="shrink-0 text-xs text-muted-foreground">{rows.length} of {usersQ.data?.users.length ?? 0}</span>
        </div>

        {usersQ.isLoading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading accounts…
          </div>
        )}
        {usersQ.error && (
          <p className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
            {usersQ.error instanceof Error ? usersQ.error.message : "Could not load accounts."}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {rows.map((u) => (
            <article key={u.user_id} className="rounded-3xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-foreground">{u.email ?? "(no email)"}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[u.full_name, u.company].filter(Boolean).join(" · ") || "No profile details yet"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {u.projectCount} project{u.projectCount === 1 ? "" : "s"} ·{" "}
                    {u.last_sign_in_at ? `last signed in ${new Date(u.last_sign_in_at).toLocaleDateString()}` : "never signed in"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      u.experience === "pro"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Users className="size-3.5" />
                    {u.experience === "pro" ? "Professional dashboard" : "Client dashboard"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{u.experienceReason}</span>
                  <button
                    onClick={() => platformMutation.mutate({ userId: u.user_id, isAdmin: !u.isPlatformAdmin })}
                    disabled={platformMutation.isPending}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                      u.isPlatformAdmin
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ShieldCheck className="size-3.5" />
                    {u.isPlatformAdmin ? "Platform administrator" : "Make administrator"}
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {u.memberships.length === 0 && (
                  <p className="text-xs text-muted-foreground">No organization yet — one is created the first time they start a project.</p>
                )}
                {u.memberships.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background/40 px-3 py-2">
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-medium text-foreground">{m.organization_name ?? "Organization"}</p>
                      <p className="text-muted-foreground">
                        {m.organization_kind ? `${m.organization_kind} organization` : "organization"}
                        {m.title ? ` · ${m.title}` : ""}
                      </p>
                    </div>
                    <select
                      value={m.role}
                      onChange={(e) => roleMutation.mutate({ membershipId: m.id, role: e.target.value })}
                      disabled={roleMutation.isPending}
                      className="rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                      aria-label={`Role in ${m.organization_name ?? "organization"}`}
                    >
                      {orgRoles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r] ?? r}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!usersQ.isLoading && rows.length === 0 && (
            <p className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">No accounts match that search.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
