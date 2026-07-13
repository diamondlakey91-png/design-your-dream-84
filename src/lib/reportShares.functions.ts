import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// URL-safe token, ~176 bits of entropy.
function mintToken(): string {
  return randomBytes(22).toString("base64url");
}

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw, "utf8").digest("hex");
}

function passwordMatches(input: string, storedHash: string): boolean {
  const a = Buffer.from(hashPassword(input), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* -------------------- OWNER: mint a share -------------------- */

export const createBatchReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      report: z.record(z.string(), z.unknown()),
      password: z.string().min(4).max(200).optional(),
      expires_in_days: z.number().int().min(1).max(365).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Verify caller owns the project (RLS also enforces this).
    const { data: project, error: pErr } = await context.supabase
      .from("projects")
      .select("id, name, jurisdiction, address, project_type")
      .eq("id", data.project_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Project not found");

    const token = mintToken();
    const expires_at = data.expires_in_days
      ? new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString()
      : null;

    const { data: row, error } = await context.supabase
      .from("report_shares")
      .insert({
        project_id: data.project_id,
        user_id: context.userId,
        token,
        report: data.report,
        project_snapshot: {
          name: project.name,
          jurisdiction: project.jurisdiction,
          address: project.address,
          project_type: project.project_type,
        },
        password_hash: data.password ? hashPassword(data.password) : null,
        expires_at,
      })
      .select("id, token, expires_at, password_hash")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Created shareable batch review link${data.password ? " (password protected)" : ""}${expires_at ? ` — expires ${new Date(expires_at).toLocaleDateString()}` : ""}.`,
    });

    return {
      id: row.id,
      token: row.token,
      path: `/share/reports/${row.token}`,
      expires_at: row.expires_at,
      password_protected: !!row.password_hash,
    };
  });

/* -------------------- OWNER: list / revoke -------------------- */

export const listBatchReportShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("report_shares")
      .select("id, token, expires_at, revoked_at, password_hash, view_count, last_viewed_at, created_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      token: r.token,
      path: `/share/reports/${r.token}`,
      expires_at: r.expires_at,
      revoked_at: r.revoked_at,
      password_protected: !!r.password_hash,
      view_count: r.view_count,
      last_viewed_at: r.last_viewed_at,
      created_at: r.created_at,
    }));
  });

export const revokeBatchReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("report_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id, project_id")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: row.project_id,
      description: "Revoked shareable batch review link.",
    });
    return { ok: true };
  });

/* -------------------- PUBLIC: resolve a share -------------------- */

// Public — no auth middleware. Uses supabaseAdmin (loaded inside the handler)
// to bypass RLS and read the share row by opaque token. Sensitive fields
// (password_hash, user_id) are stripped before returning.
export const getSharedBatchReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: z.string().min(8).max(128),
      password: z.string().max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("report_shares")
      .select("id, token, project_id, report, project_snapshot, password_hash, expires_at, revoked_at, view_count, created_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return { status: "not_found" as const };
    }
    if (row.revoked_at) {
      return { status: "revoked" as const };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { status: "expired" as const };
    }
    if (row.password_hash) {
      if (!data.password) {
        return {
          status: "password_required" as const,
          project: row.project_snapshot,
        };
      }
      if (!passwordMatches(data.password, row.password_hash)) {
        return { status: "bad_password" as const };
      }
    }

    // Increment view counter (best-effort, non-blocking on failure).
    await supabaseAdmin
      .from("report_shares")
      .update({
        view_count: (row.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return {
      status: "ok" as const,
      report: row.report,
      project: row.project_snapshot,
      created_at: row.created_at,
      expires_at: row.expires_at,
    };
  });
