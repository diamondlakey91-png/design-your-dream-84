import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUSES = [
  "draft",
  "preflight",
  "awaiting_approval",
  "ready_to_submit",
  "submitted",
  "monitoring",
  "issued",
  "withdrawn",
] as const;

export const listFilings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [filings, projects] = await Promise.all([
      context.supabase
        .from("permit_filings")
        .select("*")
        .order("created_at", { ascending: false }),
      context.supabase
        .from("projects")
        .select("id,name,jurisdiction,location,project_type")
        .order("created_at", { ascending: false }),
    ]);
    if (filings.error) throw new Error(filings.error.message);
    return { filings: filings.data ?? [], projects: projects.data ?? [] };
  });

const PreflightItem = z.object({
  label: z.string().min(1).max(200),
  done: z.boolean().default(false),
});

const DEFAULT_PREFLIGHT = [
  "Applicant of record confirmed with signed authorization (LOA)",
  "Jurisdiction (AHJ) confirmed — building, fire, health, zoning",
  "Plan set complete, stamped and signed by design professional",
  "Required forms and application fields filled out",
  "Fee estimate reviewed with client",
  "Portal account / credentials available for this jurisdiction",
];

const CreateFilingInput = z.object({
  title: z.string().min(1).max(200),
  project_id: z.string().uuid().nullish(),
  jurisdiction: z.string().max(200).default(""),
  permit_type: z.string().max(120).default(""),
  portal_name: z.string().max(200).nullish(),
  portal_url: z.string().max(600).nullish(),
  applicant_of_record: z.string().max(200).nullish(),
  target_submittal_date: z.string().max(20).nullish(),
  notes: z.string().max(4000).nullish(),
});

export const createFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateFilingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("permit_filings")
      .insert({
        user_id: context.userId,
        title: data.title,
        project_id: data.project_id ?? null,
        jurisdiction: data.jurisdiction ?? "",
        permit_type: data.permit_type ?? "",
        portal_name: data.portal_name ?? null,
        portal_url: data.portal_url ?? null,
        applicant_of_record: data.applicant_of_record ?? null,
        target_submittal_date: data.target_submittal_date || null,
        notes: data.notes ?? null,
        status: "draft",
        preflight: DEFAULT_PREFLIGHT.map((label) => ({ label, done: false })),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UpdateFilingInput = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES).optional(),
  preflight: z.array(PreflightItem).optional(),
  approved_by: z.string().max(200).nullish(),
  approved_at: z.string().nullish(),
  submitted_at: z.string().nullish(),
  confirmation_number: z.string().max(120).nullish(),
  status_source: z.string().max(200).nullish(),
  notes: z.string().max(4000).nullish(),
  portal_name: z.string().max(200).nullish(),
  portal_url: z.string().max(600).nullish(),
  target_submittal_date: z.string().max(20).nullish(),
});

export const updateFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateFilingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const clean: Record<string, unknown> = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    if ("target_submittal_date" in clean && !clean.target_submittal_date) {
      clean.target_submittal_date = null;
    }
    const { data: row, error } = await context.supabase
      .from("permit_filings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(clean as any)

      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("permit_filings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
