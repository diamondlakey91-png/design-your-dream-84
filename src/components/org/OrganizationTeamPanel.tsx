import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Loader2, Mail, ShieldCheck, Trash2, Users } from "lucide-react";
import {
  getOrgTeam,
  inviteOrgMember,
  removeOrgMember,
  renameOrganization,
  updateOrgMemberRole,
  type OrgRole,
} from "@/lib/org.functions";

const ROLE_OPTIONS: { value: OrgRole; label: string; note: string }[] = [
  { value: "client", label: "Client", note: "Simplified view. Read-only on shared project records." },
  { value: "client_admin", label: "Client Admin", note: "Client-side lead. Can edit shared project records." },
  { value: "project_manager", label: "Project Manager", note: "Full project workspace." },
  { value: "permit_manager", label: "Permit Manager", note: "Permits, filings and inspections." },
  { value: "researcher", label: "Researcher", note: "Jurisdiction and site research." },
  { value: "qaqc_reviewer", label: "QA/QC Reviewer", note: "Plan QA/QC and correction checks." },
  { value: "authorized_reviewer", label: "Authorized Reviewer", note: "Signs off professional reviews." },
  { value: "org_admin", label: "Organization Admin", note: "Manages the team and organization settings." },
];

const inputClass =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand";

function roleLabel(role: OrgRole) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function OrganizationTeamPanel() {
  const qc = useQueryClient();
  const fetchTeam = useServerFn(getOrgTeam);
  const rename = useServerFn(renameOrganization);
  const invite = useServerFn(inviteOrgMember);
  const setRole = useServerFn(updateOrgMemberRole);
  const remove = useServerFn(removeOrgMember);

  const { data, isLoading } = useQuery({
    queryKey: ["org-team"],
    queryFn: () => fetchTeam({ data: {} }),
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("project_manager");
  const [title, setTitle] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["org-team"] });
    qc.invalidateQueries({ queryKey: ["org-context"] });
  };

  const renameMut = useMutation({
    mutationFn: (next: string) => rename({ data: { name: next } }),
    onSuccess: () => {
      toast.success("Organization renamed.");
      setName("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMut = useMutation({
    mutationFn: () => invite({ data: { email, role: inviteRole, title } }),
    onSuccess: (r) => {
      toast.success(r.invited ? `Invitation sent to ${r.email}.` : `${r.email} added to your team.`);
      setEmail("");
      setTitle("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (v: { memberId: string; role: OrgRole }) => setRole({ data: v }),
    onSuccess: () => {
      toast.success("Role updated.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (memberId: string) => remove({ data: { memberId } }),
    onSuccess: () => {
      toast.success("Teammate removed.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading your organization…
      </div>
    );
  }

  const org = data?.organization;
  const canManage = data?.canManage ?? false;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Building2 className="size-4 text-brand" />
              {org?.name ?? "No organization yet"}
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Projects belong to your organization, so everyone you add works from the same project record —
              documents, permits, inspections, reviews and reports.
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-right">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your role</div>
            <div className="text-sm font-medium">{data?.yourRole ? roleLabel(data.yourRole) : "—"}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {data?.projectCount ?? 0} shared project{(data?.projectCount ?? 0) === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {canManage && org ? (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 space-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Organization name
              </span>
              <input
                className={inputClass}
                value={name}
                placeholder={org.name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              disabled={!name.trim() || renameMut.isPending}
              onClick={() => renameMut.mutate(name.trim())}
            >
              {renameMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save name
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm backdrop-blur">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Users className="size-4 text-brand" />
          Team
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          Roles decide what each person sees. Clients get the simplified workspace and read-only access to shared
          records; every other role can work the project.
        </p>

        <div className="mt-4 divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
          {(data?.members ?? []).map((m) => (
            <div key={m.id} className="flex flex-col gap-3 bg-background/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {m.isYou ? "You" : m.email || "Teammate"}
                  {m.role === "org_admin" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand">
                      <ShieldCheck className="size-3" /> Admin
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {m.title ? `${m.title} · ` : ""}
                  {roleLabel(m.role)}
                </div>
              </div>
              {canManage ? (
                <div className="flex items-center gap-2">
                  <select
                    className={inputClass + " sm:w-52"}
                    value={m.role}
                    disabled={roleMut.isPending}
                    onChange={(e) => roleMut.mutate({ memberId: m.id, role: e.target.value as OrgRole })}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {m.isYou ? null : (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted/40 disabled:opacity-50"
                      disabled={removeMut.isPending}
                      onClick={() => removeMut.mutate(m.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
          {(data?.members ?? []).length === 0 ? (
            <div className="bg-background/40 px-4 py-6 text-sm text-muted-foreground">
              No teammates yet. Start a project and Permivio creates your organization automatically.
            </div>
          ) : null}
        </div>

        {canManage ? (
          <div className="mt-5 space-y-3 rounded-xl border border-border/70 bg-background/40 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mail className="size-4 text-brand" /> Invite a teammate
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className={inputClass}
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <select
                className={inputClass}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {ROLE_OPTIONS.find((r) => r.value === inviteRole)?.note}
            </p>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              disabled={!email.trim() || inviteMut.isPending}
              onClick={() => inviteMut.mutate()}
            >
              {inviteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Send invitation
            </button>
          </div>
        ) : (
          <p className="mt-4 text-[11px] text-muted-foreground">
            Ask an organization administrator to invite people or change roles.
          </p>
        )}
      </section>
    </div>
  );
}
