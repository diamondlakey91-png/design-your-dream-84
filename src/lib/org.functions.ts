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
