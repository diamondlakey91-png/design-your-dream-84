import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const sirRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().email("A valid email is required").max(320),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.string().trim().max(80).optional().or(z.literal("")),
  projectStage: z.string().trim().max(80).optional().or(z.literal("")),
  siteAddress: z.string().trim().max(300).optional().or(z.literal("")),
  jurisdiction: z.string().trim().min(1, "City / state / county is required").max(300),
  parcelApn: z.string().trim().max(120).optional().or(z.literal("")),
  approxSize: z.string().trim().max(120).optional().or(z.literal("")),
  intendedUse: z.string().trim().min(1, "Intended use is required").max(4000),
  existingBuilding: z.string().trim().max(40).optional().or(z.literal("")),
  reportNeeded: z.string().trim().max(80).optional().or(z.literal("")),
  targetDate: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  // Honeypot — must stay empty
  website: z.string().max(0).optional().or(z.literal("")),
});

export type SirRequestInput = z.infer<typeof sirRequestSchema>;

export const submitSirRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => sirRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sir_requests").insert({
      name: data.name,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      role: data.role || null,
      project_stage: data.projectStage || null,
      site_address: data.siteAddress || null,
      jurisdiction: data.jurisdiction,
      parcel_apn: data.parcelApn || null,
      approx_size: data.approxSize || null,
      intended_use: data.intendedUse,
      existing_building: data.existingBuilding || null,
      report_needed: data.reportNeeded || null,
      target_date: data.targetDate || null,
      notes: data.notes || null,
    });
    if (error) throw new Error("Could not submit your request. Please try again.");
    return { ok: true as const };
  });
