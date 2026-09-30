// PERMIVIO — Phase 2C.1 Regulatory Profile server functions.
// Research runs as a persisted, resumable job: one bounded worker step per call, lease-protected,
// state kept in the database so navigation/reload never loses progress.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addressHash } from "@/lib/regIntel/providers.shared";
import { findDuplicate } from "@/lib/regIntel/rules";

const STEP_KEYS = ["property", "boundary", "ahj", "flood", "zoning", "codes", "permits", "reconcile"] as const;
const STEP_LABELS: Record<string, string> = {
  property: "Locating address & parcel", boundary: "Checking county & municipal boundaries", ahj: "Identifying permitting authorities",
  flood: "Checking FEMA flood data", zoning: "Researching zoning & land use", codes: "Researching applicable codes",
  permits: "Determining scope-specific permits", reconcile: "Reconciling evidence",
};
const ADDRESS_STEPS = new Set(["property", "boundary", "ahj", "flood", "zoning", "codes"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function projectInputs(db: Db, projectId: string) {
  const [{ data: p }, { data: conf }, { data: docs }, { data: corr }, { data: jur }] = await Promise.all([
    db.from("projects").select("id,location,jurisdiction,scope_description,work_type,project_type").eq("id", projectId).maybeSingle(),
    db.from("jurisdiction_confirmations").select("formatted_address,street,city,state,zip,status,jurisdiction_id").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
    db.from("project_documents").select("name").eq("project_id", projectId),
    db.from("project_regulatory_facts").select("fact_key,value").eq("project_id", projectId).eq("fact_type", "scope_attribute").eq("origin", "user"),
    Promise.resolve({ data: null }),
  ]);
  void jur;
  const c = (conf ?? [])[0] ?? null;
  let stored: { label: string | null; county: string | null; municipality: string | null; incorporated: boolean | null; status: string | null } | null = null;
  if (c?.jurisdiction_id) {
    const { data: j } = await db.from("jurisdictions").select("county,municipality,incorporated").eq("id", c.jurisdiction_id).maybeSingle();
    stored = { label: p?.jurisdiction ?? null, county: j?.county ?? null, municipality: j?.municipality ?? null, incorporated: j?.incorporated ?? null, status: c.status };
  } else if (p?.jurisdiction) stored = { label: p.jurisdiction, county: null, municipality: null, incorporated: null, status: null };
  const address = (c?.formatted_address || [c?.street, c?.city, [c?.state, c?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || p?.location || "").trim();
  const postalCity = c?.city ?? (address.split(",")[1]?.trim() || null);
  const corrections: Record<string, boolean> = {};
  for (const r of corr ?? []) if (r.fact_key.startsWith("user:")) corrections[r.fact_key.slice(5)] = !!(r.value as { value?: boolean })?.value;
  const scopeText = p?.scope_description ?? null;
  const scopeHash = addressHash(`${scopeText ?? ""}|${p?.work_type ?? ""}|${p?.project_type ?? ""}|${JSON.stringify(corrections)}`);
  return {
    project: p, address, postalCity, stored, scopeText, scopeHash, corrections,
    hasSeptic: (docs ?? []).some((d: { name: string }) => /septic|ostds|drainfield/i.test(d.name)),
  };
}

async function assertAccess(sb: Db, projectId: string, write = false) {
  const { data } = await sb.rpc(write ? "can_write_project" : "can_access_project", { _project_id: projectId });
  if (!data) throw new Error("You don't have access to this project");
}

function freshSteps(skipAddress: boolean) {
  return STEP_KEYS.map((k) => ({ key: k, label: STEP_LABELS[k], status: skipAddress && ADDRESS_STEPS.has(k) ? "skipped" : "pending", note: skipAddress && ADDRESS_STEPS.has(k) ? "Cached — address unchanged" : undefined }));
}

/** Start research when none exists, the address changed, the scope changed, or on explicit refresh. */
export const startRegulatoryResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid(), refresh: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.project_id, data.refresh);
    const db = await admin();
    const inp = await projectInputs(db, data.project_id);
    if (!inp.address) return { job_id: null, started: false, reason: "no_address" as const };
    const aHash = addressHash(inp.address);
    const { data: last } = await db.from("regulatory_research_jobs").select("id,status,address_hash,scope_hash,state,lease_until").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const running = last && ["queued", "researching"].includes(last.status);
    if (running) return { job_id: last.id, started: false, reason: "running" as const };
    let trigger: "auto" | "refresh" | "address_change" | "scope_change" = "auto";
    let skipAddress = false;
    if (last && !data.refresh) {
      if (last.address_hash !== aHash) trigger = "address_change";
      else if (last.scope_hash !== inp.scopeHash) { trigger = "scope_change"; skipAddress = last.status !== "failed"; }
      else return { job_id: last.id, started: false, reason: "cached" as const };
    } else if (data.refresh) trigger = "refresh";
    if (trigger === "address_change" || trigger === "refresh") {
      // Address changes invalidate every researched fact; customer scope corrections are kept.
      await db.from("project_regulatory_facts").delete().eq("project_id", data.project_id).neq("origin", "user");
    }
    const baseState = skipAddress ? (last!.state ?? {}) : {};
    const { data: job, error } = await db.from("regulatory_research_jobs").insert({
      project_id: data.project_id, address: inp.address, address_hash: aHash, scope_hash: inp.scopeHash, trigger,
      status: "queued", steps: freshSteps(skipAddress), requested_by: context.userId,
      state: { ...baseState, address: inp.address, postalCity: inp.postalCity, lat: skipAddress ? baseState.lat ?? null : null, lng: skipAddress ? baseState.lng ?? null : null, confirmedSources: skipAddress ? baseState.confirmedSources ?? [] : [], incorporation: skipAddress ? baseState.incorporation ?? "undetermined" : "undetermined" },
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { job_id: job.id as string, started: true, reason: trigger };
  });

/** Advance a job by exactly one worker step (bounded work per call; lease prevents parallel runs). */
export const advanceRegulatoryResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: job } = await db.from("regulatory_research_jobs").select("*").eq("id", data.job_id).maybeSingle();
    if (!job) throw new Error("Research job not found");
    await assertAccess(context.supabase, job.project_id);
    if (!["queued", "researching"].includes(job.status)) return { status: job.status as string, done: true };
    const nowIso = new Date().toISOString();
    const { data: leased } = await db.from("regulatory_research_jobs").update({ lease_until: new Date(Date.now() + 60000).toISOString(), status: "researching", started_at: job.started_at ?? nowIso })
      .eq("id", job.id).or(`lease_until.is.null,lease_until.lt.${nowIso}`).select("id").maybeSingle();
    if (!leased) return { status: "researching", done: false, busy: true };

    const steps = job.steps as Array<{ key: string; label: string; status: string; note?: string; ms?: number }>;
    const idx = steps.findIndex((s) => s.status === "pending");
    const usage = { deterministic_calls: 0, paid_data_calls: 0, ai_calls: 0, tokens: 0, estimated_cost_usd: 0, duration_ms: 0, ...(job.usage ?? {}) };
    if (idx === -1) return finish(db, job, steps, usage);

    const inp = await projectInputs(db, job.project_id);
    const { runWorker } = await import("@/lib/regIntel/pipeline.server");
    const state = {
      lat: null, lng: null, state: null, county: null, countyFips: null, place: null, placeStatistical: null, censusUrl: null, parcel: null, parcelUrl: null,
      incorporation: "undetermined", flood: null, zoningCode: null, historic: null, confirmedSources: [],
      ...(job.state ?? {}),
      address: job.address, scopeText: inp.scopeText, workType: inp.project?.work_type ?? null, projectType: inp.project?.project_type ?? null,
      scopeCorrections: inp.corrections, hasSepticDocument: inp.hasSeptic, storedJurisdiction: inp.stored,
    };
    const step = steps[idx]!;
    step.status = "running";
    const t0 = Date.now();
    const escalations = [...((job.escalations as string[]) ?? [])];
    try {
      const r = await runWorker(step.key as never, state as never, usage, db);
      step.ms = Date.now() - t0;
      step.status = r.status;
      step.note = r.note;
      for (const e of r.escalations ?? []) if (!escalations.includes(e)) escalations.push(e);
      if (r.facts.length) {
        const rows = r.facts.map((f) => ({ ...f, project_id: job.project_id, created_by: job.requested_by }));
        const { error } = await db.from("project_regulatory_facts").upsert(rows, { onConflict: "project_id,fact_type,fact_key" });
        if (error) throw new Error(error.message);
      }
    } catch (e) {
      step.ms = Date.now() - t0;
      step.status = "failed";
      step.note = (e as Error).message.slice(0, 200);
    }
    usage.duration_ms += step.ms ?? 0;
    // Hard failure of the property step stops the chain — nothing downstream can be trusted.
    const stop = step.key === "property" && step.status === "failed";
    if (stop) for (const s of steps) if (s.status === "pending") s.status = "skipped";
    await db.from("regulatory_research_jobs").update({ steps, usage, escalations, state, current_step: idx + 1, lease_until: null }).eq("id", job.id);
    const more = steps.some((s) => s.status === "pending");
    if (!more) return finish(db, { ...job, escalations }, steps, usage);
    return { status: "researching", done: false };
  });

async function finish(db: Db, job: { id: string; escalations: unknown }, steps: Array<{ status: string }>, usage: unknown) {
  const esc = (job.escalations as string[]) ?? [];
  const failed = steps.some((s) => s.status === "failed");
  const warned = steps.some((s) => s.status === "warning");
  const status = failed && steps.every((s) => s.status !== "done") ? "failed" : esc.length ? "needs_human_verification" : failed || warned ? "completed_with_warnings" : "completed";
  await db.from("regulatory_research_jobs").update({ status, usage, finished_at: new Date().toISOString(), lease_until: null }).eq("id", job.id);
  return { status, done: true };
}

export const getRegulatoryProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: facts }, { data: jobs }, { data: items }] = await Promise.all([
      sb.from("project_regulatory_facts" as never).select("*").eq("project_id", data.project_id).order("fact_type"),
      sb.from("regulatory_research_jobs" as never).select("id,status,steps,escalations,usage,trigger,address,created_at,finished_at").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(1),
      sb.from("permit_items").select("id,name,category,regulatory_fact_id" as never).eq("project_id", data.project_id),
    ]);
    const { coverageFor } = await import("@/lib/regIntel/coverage");
    const factRows = (facts ?? []) as Array<Record<string, unknown>>;
    const county = factRows.find((f) => f["fact_type"] === "jurisdiction" && f["fact_key"] === "county");
    const cv = (county?.["value"] ?? {}) as { state?: string; fips?: string };
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      facts: factRows as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      job: (((jobs ?? []) as unknown as any[])[0] ?? null) as any,
      roadmapItems: (items ?? []) as unknown as Array<{ id: string; name: string; category: string | null; regulatory_fact_id: string | null }>,
      coverage: cv.state ? coverageFor(cv.state, cv.fips ?? null) : null,
    };
  });

/** Customer correction of a derived scope attribute (stored as a user fact; never Verified). */
export const setScopeAttribute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid(), key: z.string().regex(/^[a-z_]{2,40}$/), value: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { SCOPE_ATTRIBUTES, SCOPE_LABEL } = await import("@/lib/regIntel/scope");
    if (!(SCOPE_ATTRIBUTES as readonly string[]).includes(data.key)) throw new Error("Unknown scope attribute");
    await assertAccess(context.supabase, data.project_id, true);
    const { error } = await context.supabase.from("project_regulatory_facts" as never).upsert({
      project_id: data.project_id, fact_type: "scope_attribute", fact_key: `user:${data.key}`, label: SCOPE_LABEL[data.key as keyof typeof SCOPE_LABEL],
      value: { key: data.key, value: data.value }, display_value: data.value ? "Yes" : "No", provider: "customer_confirmation", origin: "user", verification: "needs_verification",
    } as never, { onConflict: "project_id,fact_type,fact_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Add researched candidates to the existing Permit Roadmap (permit_items). Links instead of duplicating. */
export const addCandidatesToRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid(), fact_ids: z.array(z.string().uuid()).min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertAccess(sb, data.project_id, true);
    const { data: facts } = await sb.from("project_regulatory_facts" as never).select("id,fact_key,label,value,verification,source_url").eq("project_id", data.project_id).eq("fact_type", "permit_candidate").in("id", data.fact_ids);
    const { data: existing } = await sb.from("permit_items").select("id,name,category,regulatory_fact_id" as never).eq("project_id", data.project_id);
    const items = ((existing ?? []) as unknown as Array<{ id: string; name: string; category: string | null; regulatory_fact_id: string | null }>);
    const { data: { user } } = await sb.auth.getUser();
    let added = 0, linked = 0;
    for (const f of (facts ?? []) as Array<{ id: string; fact_key: string; label: string; value: Record<string, unknown>; verification: string; source_url: string | null }>) {
      const cat = String(f.value["category"] ?? "other");
      const dup = findDuplicate({ key: f.id, name: f.label, category: cat }, items.map((i) => ({ ...i, regulatory_fact_key: i.regulatory_fact_id })));
      if (dup) {
        const cur = items.find((i) => i.id === dup);
        if (!cur?.regulatory_fact_id) { await sb.from("permit_items").update({ regulatory_fact_id: f.id, source_url: f.source_url } as never).eq("id", dup); linked++; }
        continue;
      }
      // Research never marks anything Verified/Submitted/Approved on the roadmap; the DB trigger enforces it too.
      const { data: ins, error } = await sb.from("permit_items").insert({
        user_id: user!.id, project_id: data.project_id, name: f.label, category: cat, status: "not_started", required: f.verification !== "potential",
        agency: String(f.value["agency"] ?? ""), description: String(f.value["why"] ?? ""), source_url: f.source_url,
        requirement_confidence: f.verification === "potential" ? "potential" : "needs_verification", regulatory_fact_id: f.id,
        notes: `Added from Regulatory Profile research. Trigger: ${String(f.value["trigger"] ?? "")}`,
      } as never).select("id").single();
      if (error) throw new Error(error.message);
      items.push({ id: (ins as { id: string }).id, name: f.label, category: cat, regulatory_fact_id: f.id });
      added++;
    }
    return { added, linked };
  });
