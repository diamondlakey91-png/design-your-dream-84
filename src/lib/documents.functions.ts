import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getEntitlement, requireFeature } from "@/lib/entitlements";

// ---- Documents ----
export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Sign URLs for each
    const withUrls = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: signed } = await context.supabase
          .storage.from("project-docs").createSignedUrl(r.storage_path, 3600);
        return { ...r, url: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

export const registerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      name: z.string().min(1).max(300),
      storage_path: z.string().min(1).max(500),
      mime_type: z.string().max(120).default(""),
      size_bytes: z.number().int().min(0).default(0),
      stage: z.number().int().min(0).max(4).nullable().optional(),
      permit_item_id: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("project_documents")
      .insert({
        user_id: context.userId,
        project_id: data.project_id,
        name: data.name,
        storage_path: data.storage_path,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        stage: data.stage ?? null,
        permit_item_id: data.permit_item_id ?? null,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: data.project_id,
      description: `Uploaded document: ${data.name}${typeof data.stage === "number" ? ` (Stage ${data.stage + 1})` : ""}`,
    });
    return row;
  });

export const updateDocumentLinkage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      stage: z.number().int().min(0).max(4).nullable().optional(),
      permit_item_id: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { stage?: number | null; permit_item_id?: string | null } = {};
    if (data.stage !== undefined) patch.stage = data.stage;
    if (data.permit_item_id !== undefined) patch.permit_item_id = data.permit_item_id;
    const { data: row, error } = await context.supabase
      .from("project_documents")
      .update(patch)
      .eq("id", data.id)
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });


export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("project_documents").select("*").eq("id", data.id).maybeSingle();
    if (!row) return { ok: true };
    await context.supabase.storage.from("project-docs").remove([row.storage_path]);
    const { error } = await context.supabase.from("project_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DocAnalysisSchema = z.object({
  summary: z.string(),
  document_type: z.string().default(""),
  action_items: z.array(z.object({
    reviewer: z.string().default(""),
    discipline: z.string().default(""),
    request: z.string(),
    reference: z.string().default(""),
  })).max(30).default([]),
  key_dates: z.array(z.object({ label: z.string(), date: z.string() })).max(10).default([]),
});

export const analyzeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireFeature(await getEntitlement(context.supabase, context.userId), "docReader");
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) throw new Error("AI is not configured");


    const { data: doc } = await context.supabase
      .from("project_documents").select("*").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Document not found");

    const { data: signed, error: sErr } = await context.supabase
      .storage.from("project-docs").createSignedUrl(doc.storage_path, 600);
    if (sErr || !signed?.signedUrl) throw new Error("Could not access document");

    const mime = doc.mime_type || "application/pdf";
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      throw new Error("Only PDFs and images can be analyzed right now.");
    }

    const instruction = `You are analyzing a construction / permit document for Permivio. Extract concrete action items a project manager must respond to.

Return ONLY valid JSON in this exact shape:
{
  "summary": "2-4 sentence plain-English summary of what this document is and what it requires.",
  "document_type": "e.g. Plan Review Comments, Correction Letter, Approved Permit, Inspection Report, Fee Invoice",
  "action_items": [
    { "reviewer": "e.g. Mechanical Reviewer", "discipline": "Mechanical | Electrical | Plumbing | Structural | Building | Fire | Zoning | Other", "request": "concrete action, imperative voice", "reference": "sheet #, code section, or page if listed" }
  ],
  "key_dates": [ { "label": "Deadline / Expiration / Inspection", "date": "as printed" } ]
}

Rules: never invent items not in the document. If the document is just an approval with no actions, return action_items: []. Keep each request under 160 characters.`;

    const contentParts: unknown[] = [{ type: "text", text: instruction }];
    if (isImage) {
      contentParts.push({ type: "image_url", image_url: { url: signed.signedUrl } });
    } else {
      // PDF via file part with signed URL fetched by us then base64'd
      const fileResp = await fetch(signed.signedUrl);
      if (!fileResp.ok) throw new Error("Could not download document for analysis");
      const buf = new Uint8Array(await fileResp.arrayBuffer());
      // btoa in chunks to avoid stack blowout
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      const b64 = btoa(bin);
      contentParts.push({
        type: "file",
        file: { filename: doc.name, file_data: `data:${mime};base64,${b64}` },
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": aiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You extract structured action items from construction permit documents. Output valid JSON only, no prose, no fences." },
          { role: "user", content: contentParts },
        ],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429) throw new Error("Too many requests — try again shortly.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Please top up.");
      throw new Error(`AI error: ${t.slice(0, 200)}`);
    }
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (j.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    let parsed: z.infer<typeof DocAnalysisSchema>;
    try {
      parsed = DocAnalysisSchema.parse(JSON.parse(cleaned.slice(s, e + 1)));
    } catch {
      throw new Error("AI returned an unreadable analysis. Try again.");
    }

    const { data: updated, error: uErr } = await context.supabase
      .from("project_documents")
      .update({
        ai_summary: parsed.summary,
        ai_action_items: parsed.action_items,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*").single();
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("activity").insert({
      user_id: context.userId,
      project_id: doc.project_id,
      description: `AI analyzed "${doc.name}" — ${parsed.action_items.length} action item${parsed.action_items.length === 1 ? "" : "s"}.`,
    });

    return { document: updated, analysis: parsed };
  });
