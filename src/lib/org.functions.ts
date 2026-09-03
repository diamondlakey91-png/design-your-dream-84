import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Organization + role context for the signed-in user.
 * Phase 1 foundation: real roles replace the previously hard-coded "client" mode.
 * Reads are scoped by RLS (organization_members / organizations policies).
 */
export type OrgRole =
  | "client"
  | "client_admin"
  | "project_manager"
  | "permit_manager"
  | "researcher"
  | "qaqc_reviewer"
  | "authorized_reviewer"
  | "org_admin";

/** Roles that get the detailed professional workspace rather than the simplified client view. */
export const PROFESSIONAL_ROLES: OrgRole[] = [
  "project_manager",
  "permit_manager",
  "researcher",
  "qaqc_reviewer",
  "authorized_reviewer",
  "org_admin",
];

export type OrgMembership = {
  organization_id: string;
  role: OrgRole;
  title: string | null;
  credentials: string | null;
  organization: { id: string; name: string; slug: string; kind: string } | null;
};

export type OrgContext = {
  memberships: OrgMembership[];
  activeOrganizationId: string | null;
  roles: OrgRole[];
  isPlatformAdmin: boolean;
  /** "client" = simplified experience, "pro" = professional workspace. */
  experience: "client" | "pro";
};

export const getOrgContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgContext> => {
    const { supabase, userId } = context;

    const [{ data: rows, error }, { data: isAdmin }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("organization_id, role, title, credentials, organizations(id, name, slug, kind)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (error) throw new Error(error.message);

    const memberships: OrgMembership[] = (rows ?? []).map((r) => ({
      organization_id: r.organization_id as string,
      role: r.role as OrgRole,
      title: (r.title as string | null) ?? null,
      credentials: (r.credentials as string | null) ?? null,
      organization: (r as { organizations?: OrgContext["memberships"][number]["organization"] }).organizations ?? null,
    }));

    const roles = memberships.map((m) => m.role);
    const isPlatformAdmin = isAdmin === true;
    const experience: "client" | "pro" =
      isPlatformAdmin || roles.some((r) => PROFESSIONAL_ROLES.includes(r)) ? "pro" : "client";

    return {
      memberships,
      activeOrganizationId: memberships[0]?.organization_id ?? null,
      roles,
      isPlatformAdmin,
      experience,
    };
  });

/**
 * Creates the caller's organization the first time they need one, and makes them
 * its administrator. Existing organizations are never modified.
 */
export const ensureOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1);
    if (existing && existing.length > 0) {
      return { organizationId: existing[0]!.organization_id as string, created: false };
    }

    const slug = `org-${userId.replace(/-/g, "")}`;
    const { data: org, error } = await supabase
      .from("organizations")
      .insert({ name: data.name?.trim() || "My Organization", slug, kind: "client", created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: mErr } = await supabase
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: userId, role: "org_admin" });
    if (mErr) throw new Error(mErr.message);

    return { organizationId: org.id as string, created: true };
  });

// ---------------------------------------------------------------------------
// Phase 3: organization team management (shared project record)
// ---------------------------------------------------------------------------

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

export type OrgTeamMember = {
  id: string;
  user_id: string;
  role: OrgRole;
  title: string | null;
  credentials: string | null;
  email: string | null;
  isYou: boolean;
  created_at: string;
};

export type OrgTeam = {
  organization: { id: string; name: string; slug: string; kind: string } | null;
  members: OrgTeamMember[];
  yourRole: OrgRole | null;
  canManage: boolean;
  projectCount: number;
};

async function resolveOrg(supabase: any, userId: string, organizationId?: string) {
  const query = supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const { data } = organizationId ? await query.eq("organization_id", organizationId) : await query;
  const row = (data ?? [])[0];
  if (!row) return null;
  return { organizationId: row.organization_id as string, role: row.role as OrgRole };
}

/** Team roster for the caller's organization. Emails are resolved server-side only. */
export const getOrgTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<OrgTeam> => {
    const { supabase, userId } = context;
    const mine = await resolveOrg(supabase, userId, data.organizationId);
    if (!mine) {
      return { organization: null, members: [], yourRole: null, canManage: false, projectCount: 0 };
    }

    const [{ data: org }, { data: rows }, { count }] = await Promise.all([
      supabase.from("organizations").select("id, name, slug, kind").eq("id", mine.organizationId).maybeSingle(),
      supabase
        .from("organization_members")
        .select("id, user_id, role, title, credentials, created_at")
        .eq("organization_id", mine.organizationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", mine.organizationId),
    ]);

    const canManage = mine.role === "org_admin";
    let emails = new Map<string, string>();
    if (canManage) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const ids = new Set((rows ?? []).map((r: any) => r.user_id as string));
      const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      emails = new Map(
        (listed?.users ?? [])
          .filter((u) => ids.has(u.id))
          .map((u) => [u.id, u.email ?? ""] as [string, string]),
      );
    }

    return {
      organization: (org as OrgTeam["organization"]) ?? null,
      yourRole: mine.role,
      canManage,
      projectCount: count ?? 0,
      members: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        user_id: r.user_id as string,
        role: r.role as OrgRole,
        title: (r.title as string | null) ?? null,
        credentials: (r.credentials as string | null) ?? null,
        email: r.user_id === userId ? null : emails.get(r.user_id as string) ?? null,
        isYou: r.user_id === userId,
        created_at: r.created_at as string,
      })),
    };
  });

/** Rename the organization. Organization administrators only (enforced by policy too). */
export const renameOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => {
    const name = String(input?.name ?? "").trim();
    if (name.length < 2 || name.length > 120) throw new Error("Enter an organization name (2-120 characters).");
    return { name };
  })
  .handler(async ({ data, context }) => {
    const mine = await resolveOrg(context.supabase, context.userId);
    if (!mine || mine.role !== "org_admin") throw new Error("Only an organization administrator can rename it.");
    const { error } = await context.supabase
      .from("organizations")
      .update({ name: data.name })
      .eq("id", mine.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true, name: data.name };
  });

/** Invite a teammate by email; they receive an invitation and are added with the chosen role. */
export const inviteOrgMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; role: OrgRole; title?: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
    const role = ORG_ROLES.includes(input?.role as OrgRole) ? (input.role as OrgRole) : "client";
    return { email, role, title: String(input?.title ?? "").trim().slice(0, 120) };
  })
  .handler(async ({ data, context }) => {
    const mine = await resolveOrg(context.supabase, context.userId);
    if (!mine || mine.role !== "org_admin") throw new Error("Only an organization administrator can invite teammates.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let target = (listed?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === data.email);
    let invited = false;

    if (!target) {
      const { data: inv, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
      if (invErr || !inv?.user) throw new Error(invErr?.message ?? "Could not send the invitation.");
      target = inv.user;
      invited = true;
    }

    const { error } = await context.supabase.from("organization_members").insert({
      organization_id: mine.organizationId,
      user_id: target.id,
      role: data.role,
      title: data.title || null,
      invited_by: context.userId,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);

    return { ok: true, invited, email: data.email };
  });

/** Change a teammate's role. */
export const updateOrgMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { memberId: string; role: OrgRole }) => {
    if (!input?.memberId) throw new Error("Missing member.");
    if (!ORG_ROLES.includes(input.role)) throw new Error("Unknown role.");
    return { memberId: input.memberId, role: input.role };
  })
  .handler(async ({ data, context }) => {
    const mine = await resolveOrg(context.supabase, context.userId);
    if (!mine || mine.role !== "org_admin") throw new Error("Only an organization administrator can change roles.");
    const { error } = await context.supabase
      .from("organization_members")
      .update({ role: data.role })
      .eq("id", data.memberId)
      .eq("organization_id", mine.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove a teammate. The last administrator cannot be removed. */
export const removeOrgMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { memberId: string }) => {
    if (!input?.memberId) throw new Error("Missing member.");
    return { memberId: input.memberId };
  })
  .handler(async ({ data, context }) => {
    const mine = await resolveOrg(context.supabase, context.userId);
    if (!mine || mine.role !== "org_admin") throw new Error("Only an organization administrator can remove teammates.");

    const { data: admins } = await context.supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", mine.organizationId)
      .eq("role", "org_admin");
    const isLastAdmin =
      (admins ?? []).length <= 1 && (admins ?? []).some((a: { id: string }) => a.id === data.memberId);
    if (isLastAdmin) throw new Error("Assign another administrator before removing this one.");

    const { error } = await context.supabase
      .from("organization_members")
      .delete()
      .eq("id", data.memberId)
      .eq("organization_id", mine.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
