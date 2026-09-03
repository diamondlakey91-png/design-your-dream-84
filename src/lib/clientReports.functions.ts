import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderPermivioReportPdf, toVerificationLabel, type ReportDoc, type ReportSection } from "@/lib/reportPdf.server";

// ---------------------------------------------------------------------------
// Client report workspace
//
// Everything a paying client needs after purchase: what they bought, where each
// report is in production, and the finalized branded PDF, stored permanently so
// they can return to it from the project or their reports library.
// ---------------------------------------------------------------------------

const BUCKET = "project-docs";

export type ClientReportStage = "ordered" | "in_research" | "in_review" | "ready" | "delivered";

const STAGE_BY_STATUS: Record<string, ClientReportStage> = {
  payment_required: "ordered",
  paid: "ordered",
  processing: "in_research",
  waiting_client: "in_research",
  ai_in_progress: "in_research",
  professional_review: "in_review",
  ready: "ready",
  delivered: "delivered",
};

export type ClientReportRow = {
  order_id: string;
  product_id: string;
  product_key: string;
  title: string;
  subtitle: string | null;
  project_id: string | null;
  project_name: string | null;
  delivery_tier: string;
  status: string;
  stage: ClientReportStage;
  amount_cents: number;
  currency: string;
  turnaround: string | null;
  created_at: string;
  delivered_at: string | null;
  latest_version_id: string | null;
  latest_version: number | null;
  professionally_reviewed: boolean;
  has_pdf: boolean;
  version_count: number;
};

/** Everything the client's Reports workspace lists. */
export const listMyReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientReportRow[]> => {
    const { supabase, userId } = context;
    const [orders, products, projects, versions] = await Promise.all([
      supabase
        .from("service_orders")
        .select("id,product_id,project_id,delivery_tier,status,amount_cents,currency,created_at,delivered_at")
        .eq("user_id", userId)
        .neq("status", "payment_required")
        .order("created_at", { ascending: false }),
      supabase.from("service_products").select("id,product_key,client_title,report_subtitle,name,turnaround_estimate"),
      supabase.from("projects").select("id,name"),
      supabase
        .from("service_report_versions")
        .select("id,order_id,version,reviewed_at,pdf_path,created_at")
        .eq("user_id", userId)
        .order("version", { ascending: false }),
    ]);
    if (orders.error) throw new Error(orders.error.message);

    const productMap = new Map((products.data ?? []).map((p) => [p.id, p]));
    const projectMap = new Map((projects.data ?? []).map((p) => [p.id, p.name]));

    return (orders.data ?? []).map((o) => {
      const p = productMap.get(o.product_id);
      const mine = (versions.data ?? []).filter((v) => v.order_id === o.id);
      const latest = mine[0] ?? null;
      return {
        order_id: o.id,
        product_id: o.product_id,
        product_key: p?.product_key ?? "",
        title: p?.client_title ?? p?.name ?? "Permivio report",
        subtitle: p?.report_subtitle ?? null,
        project_id: o.project_id,
        project_name: o.project_id ? projectMap.get(o.project_id) ?? null : null,
        delivery_tier: o.delivery_tier,
        status: o.status,
        stage: STAGE_BY_STATUS[o.status] ?? "in_research",
        amount_cents: o.amount_cents,
        currency: o.currency,
        turnaround: p?.turnaround_estimate ?? null,
        created_at: o.created_at,
        delivered_at: o.delivered_at,
        latest_version_id: latest?.id ?? null,
        latest_version: latest?.version ?? null,
        professionally_reviewed: Boolean(latest?.reviewed_at),
        has_pdf: Boolean(latest?.pdf_path),
        version_count: mine.length,
      };
    });
  });

const OrderIdInput = z.object({ order_id: z.string().uuid() });

/** One purchased report: production stage, saved versions and report content. */
export const getMyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrderIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order, error } = await supabase
      .from("service_orders")
      .select("id,product_id,project_id,delivery_tier,status,amount_cents,currency,rush,client_notes,created_at,delivered_at")
      .eq("id", data.order_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { order: null, product: null, project: null, versions: [] };

    const [product, project, versions] = await Promise.all([
      supabase
        .from("service_products")
        .select("id,product_key,client_title,report_subtitle,name,description,turnaround_estimate,deliverables,full_scope")
        .eq("id", order.product_id)
        .maybeSingle(),
      order.project_id
        ? supabase.from("projects").select("id,name,location,jurisdiction,project_type").eq("id", order.project_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("service_report_versions")
        .select("id,version,title,summary,payload,delivery_tier,reviewed_at,reviewer_name,reviewer_title,report_number,issued_at,pdf_path,created_at")
        .eq("order_id", order.id)
        .eq("user_id", userId)
        .order("version", { ascending: false }),
    ]);

    return {
      order: { ...order, stage: STAGE_BY_STATUS[order.status] ?? "in_research" },
      product: product.data,
      project: project.data,
      versions: versions.data ?? [],
    };
  });

// ---------------------------------------------------------------------------
// PDF finalization
// ---------------------------------------------------------------------------

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const label = typeof o.statement === "string" ? o.statement : typeof o.title === "string" ? o.title : null;
        const detail = typeof o.detail === "string" ? o.detail : typeof o.description === "string" ? o.description : null;
        return [label, detail].filter(Boolean).join(" - ") || null;
      }
      return null;
    })
    .filter((v): v is string => Boolean(v && v.trim()));
}

type RawFinding = { statement: string; label: string; detail?: string; source?: string };

function asFindings(value: unknown): RawFinding[] {
  if (!Array.isArray(value)) return [];
  const out: RawFinding[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      out.push({ statement: item, label: "agency_confirmation_needed" });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const statement =
      typeof o.statement === "string" ? o.statement : typeof o.finding === "string" ? o.finding : typeof o.title === "string" ? o.title : null;
    if (!statement) continue;
    out.push({
      statement,
      label: typeof o.verification === "string" ? o.verification : typeof o.verification_status === "string" ? o.verification_status : "",
      detail: typeof o.detail === "string" ? o.detail : typeof o.explanation === "string" ? o.explanation : undefined,
      source: typeof o.source === "string" ? o.source : typeof o.source_url === "string" ? o.source_url : undefined,
    });
  }
  return out;
}

function asSources(value: unknown): { title: string; url?: string; retrieved?: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { title: string; url?: string; retrieved?: string }[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      out.push(item.startsWith("http") ? { title: item, url: item } : { title: item });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : undefined;
    const title = typeof o.title === "string" ? o.title : typeof o.name === "string" ? o.name : url ?? null;
    if (!title) continue;
    out.push({
      title,
      url,
      retrieved: typeof o.retrieved_at === "string" ? o.retrieved_at.slice(0, 10) : undefined,
    });
  }
  return out;
}

/** Builds the branded report document from the stored research payload. */
function buildReportDoc(args: {
  productTitle: string;
  productSubtitle: string | null;
  version: {
    version: number;
    title: string | null;
    summary: string | null;
    payload: unknown;
    delivery_tier: string;
    reviewed_at: string | null;
    reviewer_name: string | null;
    reviewer_title: string | null;
  };
  reportNumber: string;
  project: { name: string; location: string | null; jurisdiction: string | null } | null;
  preparedFor: string | null;
}): ReportDoc {
  const payload = (args.version.payload ?? {}) as Record<string, unknown>;
  const findings = asFindings(payload.findings ?? payload.key_findings);
  const risks = asStringArray(payload.risks);
  const nextSteps = asStringArray(payload.next_steps);
  const sources = asSources(payload.sources ?? payload.official_sources);
  const outstanding = asStringArray(payload.outstanding ?? payload.missing_information ?? payload.client_questions);

  const sections: ReportSection[] = [];

  sections.push({
    heading: "Project and Site Summary",
    blocks: [
      {
        kind: "keyvalue",
        rows: [
          { label: "Project", value: args.project?.name ?? "Not linked to a project" },
          { label: "Site address", value: args.project?.location ?? "Not provided" },
          { label: "Jurisdiction researched", value: args.project?.jurisdiction ?? "To be confirmed" },
        ],
      },
    ],
  });

  if (findings.length) {
    sections.push({
      heading: "Findings",
      blocks: [
        {
          kind: "findings",
          items: findings.map((f) => ({
            statement: f.statement,
            label: toVerificationLabel(f.label),
            detail: f.detail,
            source: f.source,
          })),
        },
      ],
    });
  }

  if (risks.length) {
    sections.push({
      heading: "Risks and Constraints",
      blocks: [{ kind: "bullets", items: risks }],
    });
  }

  if (outstanding.length) {
    sections.push({
      heading: "Outstanding Items and Confirmations Needed",
      blocks: [{ kind: "bullets", items: outstanding }],
    });
  }

  if (nextSteps.length) {
    sections.push({
      heading: "Recommended Next Steps",
      blocks: [{ kind: "bullets", items: nextSteps }],
    });
  }

  sections.push({
    heading: "Official Sources",
    blocks: sources.length
      ? [{ kind: "sources", items: sources }]
      : [
          {
            kind: "paragraph",
            text: "No official published sources were recorded for this version of the report. Statements in this report should be confirmed with the responsible agency before you rely on them.",
          },
        ],
  });

  const reviewed = Boolean(args.version.reviewed_at);
  return {
    report_title: args.version.title ?? args.productTitle,
    report_subtitle: args.productSubtitle,
    report_number: args.reportNumber,
    issued_at: new Date().toISOString().slice(0, 10),
    prepared_for: args.preparedFor,
    project_name: args.project?.name ?? null,
    project_address: args.project?.location ?? null,
    jurisdiction: args.project?.jurisdiction ?? null,
    delivery_label: reviewed ? "Professionally Reviewed Report" : "AI-Assisted Report",
    professionally_reviewed: reviewed,
    reviewer_name: args.version.reviewer_name,
    reviewer_title: args.version.reviewer_title,
    version: args.version.version,
    executive_summary: args.version.summary,
    sections,
    limitations: [
      "Findings reflect information published or available at the time of research and may change without notice.",
      "Statements not labeled Verified Source require confirmation with the responsible agency before you rely on them.",
      "This report is not a code-compliance certification, zoning determination, permit approval, or engineering or architectural approval.",
      "Fees, review durations and submission requirements are set by the authority having jurisdiction and may differ from published information.",
    ],
  };
}

const VersionInput = z.object({ version_id: z.string().uuid() });

/**
 * Returns a signed URL for the finalized report PDF, rendering and permanently
 * storing it on first request so the client can always come back to it.
 */
export const getReportPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VersionInput.parse(input))
  .handler(async ({ data, context }): Promise<{ url: string; filename: string; report_number: string } | { error: string }> => {
    const { supabase, userId } = context;

    const { data: version, error } = await supabase
      .from("service_report_versions")
      .select(
        "id,order_id,product_id,project_id,version,title,summary,payload,delivery_tier,reviewed_at,reviewer_name,reviewer_title,report_number,pdf_path,pdf_filename",
      )
      .eq("id", data.version_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!version) return { error: "We couldn't find that report on your account." };

    // Already finalized — hand back the stored file.
    if (version.pdf_path) {
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(version.pdf_path, 3600);
      if (signed.data?.signedUrl) {
        return {
          url: signed.data.signedUrl,
          filename: version.pdf_filename ?? "permivio-report.pdf",
          report_number: version.report_number ?? "",
        };
      }
    }

    const [product, project, profile] = await Promise.all([
      supabase.from("service_products").select("client_title,report_subtitle,name").eq("id", version.product_id).maybeSingle(),
      version.project_id
        ? supabase.from("projects").select("name,location,jurisdiction").eq("id", version.project_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("user_settings").select("full_name,company").eq("user_id", userId).maybeSingle(),
    ]);

    const reportNumber =
      version.report_number ??
      `PVR-${new Date().toISOString().slice(0, 7).replace("-", "")}-${version.id.slice(0, 6).toUpperCase()}-V${version.version}`;

    const doc = buildReportDoc({
      productTitle: product.data?.client_title ?? product.data?.name ?? "Permivio report",
      productSubtitle: product.data?.report_subtitle ?? null,
      version: {
        version: version.version,
        title: version.title,
        summary: version.summary,
        payload: version.payload,
        delivery_tier: version.delivery_tier,
        reviewed_at: version.reviewed_at,
        reviewer_name: version.reviewer_name ?? null,
        reviewer_title: version.reviewer_title ?? null,
      },
      reportNumber,
      project: project.data
        ? {
            name: project.data.name,
            location: project.data.location ?? null,
            jurisdiction: project.data.jurisdiction ?? null,
          }
        : null,
      preparedFor:
        [profile.data?.full_name, profile.data?.company].filter(Boolean).join(" - ") || null,
    });

    const bytes = await renderPermivioReportPdf(doc);
    const filename = `${reportNumber}.pdf`;
    const path = `${userId}/reports/${filename}`;

    const upload = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upload.error) return { error: "We couldn't save your report PDF. Please try again." };

    await supabase
      .from("service_report_versions")
      .update({
        pdf_path: path,
        pdf_filename: filename,
        report_number: reportNumber,
        issued_at: new Date().toISOString(),
      })
      .eq("id", version.id)
      .eq("user_id", userId);

    const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (!signed.data?.signedUrl) return { error: "We couldn't open your report PDF. Please try again." };
    return { url: signed.data.signedUrl, filename, report_number: reportNumber };
  });

const RequestInput = z.object({
  order_id: z.string().uuid(),
  request_type: z.enum(["professional_review_upgrade", "report_update"]),
  notes: z.string().max(2000).optional(),
});

/** Client-initiated request to upgrade to professional review or refresh a report. */
export const requestReportAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RequestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order } = await supabase
      .from("service_orders")
      .select("id,project_id")
      .eq("id", data.order_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!order) throw new Error("We couldn't find that purchase on your account.");

    const { error } = await supabase.from("service_upgrade_requests").insert({
      user_id: userId,
      project_id: order.project_id,
      request_type: data.request_type,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);

    if (order.project_id) {
      await supabase.from("activity").insert({
        project_id: order.project_id,
        user_id: userId,
        description:
          data.request_type === "professional_review_upgrade"
            ? "Professional review requested for a purchased report."
            : "Report update requested for a purchased report.",
      });
    }
    return { ok: true as const };
  });
