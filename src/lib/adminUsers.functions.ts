import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PROFESSIONAL_ROLES, type OrgRole } from "@/lib/org.functions";

/**
 * Platform-admin user directory.
 *
 * Read-only aggregation of accounts, their organization roles and the dashboard
 * mode each account currently opens, plus bounded role corrections. Nothing here
 * changes project data — only role assignments.
 */

const ORG_ROLES: OrgRole[] = [
  "client",
  "client_admin",
  "project_manager",
  "permit_manager",
  "researcher",
  "qaqc_reviewer",
  "authorized_reviewer",
  "org_admin",
];

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  isPlatformAdmin: boolean;
  projectCount: number;
  memberships: Array<{
    id: string;
    organization_id: string;
    organization_name: string | null;
    organization_kind: string | null;
    role: OrgRole;
    title: string | null;
  }>;
  /** Which dashboard the account opens today, using the live resolution rules. */
  experience: "client" | "pro";
  experienceReason: string;
};

async function assertAdmin(supabase: { rpc: (...args: never[]) => unknown }, userId: string) {
  const call = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
  const { data } = await call("has_role", { _user_id: userId, _role: "admin" });
  if (data !== true) throw new Error("Administrator access required.");
}

/** Same rules as getOrgContext, kept in one place so the panel never lies. */
function resolveExperience(
  isPlatformAdmin: boolean,
  memberships: AdminUserRow["memberships"],
): { experience: "client" | "pro"; experienceReason: string } {
  if (isPlatformAdmin) return { experience: "pro", experienceReason: "Platform administrator" };
  const pro = memberships.find((m) => PROFESSIONAL_ROLES.includes(m.role));
  if (pro) return { experience: "pro", experienceReason: `Professional role: ${pro.role.replace(/_/g, " ")}` };
  const firmAdmin = memberships.find(
    (m) => m.role === "org_admin" && (m.organization_kind === "professional" || m.organization_kind === "platform"),
  );
  if (firmAdmin) {
    return {
      experience: "pro",
      experienceReason: `Administrator of ${firmAdmin.organization_name ?? "a permitting firm"}`,
    };
  }
  return { experience: "client", experienceReason: "Client — simplified dashboard" };
}

export const listAllUsersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUserRow[]; orgRoles: OrgRole[] }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: listed }, members, orgs, roles, settings, projects] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("organization_members").select("id,user_id,organization_id,role,title"),
      supabaseAdmin.from("organizations").select("id,name,kind"),
      supabaseAdmin.from("user_roles").select("user_id,role"),
      supabaseAdmin.from("user_settings").select("user_id,full_name,company"),
      supabaseAdmin.from("projects").select("user_id"),
    ]);

    const orgById = new Map((orgs.data ?? []).map((o) => [o.id as string, o]));
    const admins = new Set((roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id as string));
    const settingsBy = new Map((settings.data ?? []).map((s) => [s.user_id as string, s]));
    const projectCount = new Map<string, number>();
    for (const p of projects.data ?? []) {
      const k = p.user_id as string;
      projectCount.set(k, (projectCount.get(k) ?? 0) + 1);
    }

    const users: AdminUserRow[] = (listed?.users ?? []).map((u) => {
      const memberships = (members.data ?? [])
        .filter((m) => m.user_id === u.id)
        .map((m) => {
          const org = orgById.get(m.organization_id as string);
          return {
            id: m.id as string,
            organization_id: m.organization_id as string,
            organization_name: (org?.name as string | undefined) ?? null,
            organization_kind: (org?.kind as string | undefined) ?? null,
            role: m.role as OrgRole,
            title: (m.title as string | null) ?? null,
          };
        });
      const isPlatformAdmin = admins.has(u.id);
      const { experience, experienceReason } = resolveExperience(isPlatformAdmin, memberships);
      const s = settingsBy.get(u.id);
      return {
        user_id: u.id,
        email: u.email ?? null,
        full_name: (s?.full_name as string | null) ?? null,
        company: (s?.company as string | null) ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        isPlatformAdmin,
        projectCount: projectCount.get(u.id) ?? 0,
        memberships,
        experience,
        experienceReason,
      };
    });

    users.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    return { users, orgRoles: ORG_ROLES };
  });

/** Correct a misassigned organization role. */
export const setOrgMemberRoleAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ membershipId: z.string().uuid(), role: z.enum(ORG_ROLES as [OrgRole, ...OrgRole[]]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ role: data.role })
      .eq("id", data.membershipId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Grant or remove platform administrator access. */
export const setPlatformAdminAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid(), isAdmin: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && !data.isAdmin) {
      throw new Error("You cannot remove your own administrator access.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.isAdmin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
