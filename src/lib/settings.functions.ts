import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { encryptSecret } from "@/lib/crypto.server";

// ---- Workspace settings: profile, notifications, branding, portal credentials, data cleanup ----

const SETTINGS_COLUMNS =
  "id,user_id,full_name,company,job_title,phone,timezone,notify_email_digest,notify_permit_status,notify_deadlines,notify_corrections,notify_inspections,digest_frequency,brand_company_name,brand_license_number,brand_contact_email,brand_contact_phone,brand_address,brand_accent_color,brand_logo_url,brand_footer_note,updated_at";

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_settings")
      .select(SETTINGS_COLUMNS)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;

    const { data: created, error: insErr } = await context.supabase
      .from("user_settings")
      .insert({ user_id: context.userId })
      .select(SETTINGS_COLUMNS)
      .single();
    if (insErr) throw new Error(insErr.message);
    return created;
  });

const settingsPatch = z
  .object({
    full_name: z.string().max(160).nullable(),
    company: z.string().max(160).nullable(),
    job_title: z.string().max(160).nullable(),
    phone: z.string().max(60).nullable(),
    timezone: z.string().max(80),
    notify_email_digest: z.boolean(),
    notify_permit_status: z.boolean(),
    notify_deadlines: z.boolean(),
    notify_corrections: z.boolean(),
    notify_inspections: z.boolean(),
    digest_frequency: z.enum(["daily", "weekly", "off"]),
    brand_company_name: z.string().max(160).nullable(),
    brand_license_number: z.string().max(120).nullable(),
    brand_contact_email: z.string().max(200).nullable(),
    brand_contact_phone: z.string().max(60).nullable(),
    brand_address: z.string().max(400).nullable(),
    brand_accent_color: z.string().max(40),
    brand_logo_url: z.string().max(1000).nullable(),
    brand_footer_note: z.string().max(600).nullable(),
  })
  .partial();

export const updateUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsPatch.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("user_settings")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" })
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---- Portal credentials ----

const CRED_COLUMNS =
  "id,label,kind,portal_url,jurisdiction,username,notes,last_verified_at,created_at,updated_at";

export const listPortalCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("portal_credentials")
      .select(`${CRED_COLUMNS},password_encrypted`)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Never return the stored secret — only whether one exists.
    return (data ?? []).map(({ password_encrypted, ...rest }) => ({
      ...rest,
      has_password: Boolean(password_encrypted),
    }));
  });

export const savePortalCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        label: z.string().min(1).max(160),
        kind: z.enum(["permit", "utility", "fire", "health", "other"]).default("permit"),
        portal_url: z.string().max(1000).optional().nullable(),
        jurisdiction: z.string().max(200).optional().nullable(),
        username: z.string().min(1).max(200),
        password: z.string().max(400).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, password, ...fields } = data;
    const payload: Record<string, unknown> = {
      ...fields,
      portal_url: fields.portal_url || null,
      jurisdiction: fields.jurisdiction || null,
      notes: fields.notes || null,
    };
    if (password) payload.password_encrypted = await encryptSecret(password);

    if (id) {
      const { error } = await context.supabase
        .from("portal_credentials")
        .update(payload)
        .eq("id", id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id };
    }

    const { data: row, error } = await context.supabase
      .from("portal_credentials")
      .insert({ user_id: context.userId, ...payload })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const markPortalCredentialVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("portal_credentials")
      .update({ last_verified_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePortalCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("portal_credentials")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Data cleanup ----

const CLEANUP_TABLES = {
  chat: "chat_threads",
  sync_history: "permit_sync_history",
  activity: "activity",
  reports: "compliance_reports",
  analyses: "permit_analyses",
  share_links: "report_shares",
} as const;

type CleanupKey = keyof typeof CLEANUP_TABLES;

export const getCleanupCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const entries = Object.entries(CLEANUP_TABLES) as [CleanupKey, string][];
    const counts: Record<string, number> = {};
    for (const [key, table] of entries) {
      const { count, error } = await context.supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      counts[key] = count ?? 0;
    }
    return counts;
  });

export const runDataCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        keys: z
          .array(z.enum(["chat", "sync_history", "activity", "reports", "analyses", "share_links"]))
          .min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const deleted: Record<string, number> = {};
    for (const key of data.keys) {
      const table = CLEANUP_TABLES[key as CleanupKey];
      const { data: rows, error } = await context.supabase
        .from(table)
        .delete()
        .eq("user_id", context.userId)
        .select("id");
      if (error) throw new Error(error.message);
      deleted[key] = rows?.length ?? 0;
    }
    return deleted;
  });
