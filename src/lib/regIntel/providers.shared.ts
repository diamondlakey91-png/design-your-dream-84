// PERMIVIO — pure parsing helpers for regulatory providers (testable, no I/O).

export type ArcgisResponse = { features?: Array<{ attributes?: Record<string, unknown> }>; error?: { message?: string } } | null;

/** First feature's attributes, or null when the service errored / returned nothing. Never guesses. */
export function arcgisFirst(j: ArcgisResponse): Record<string, unknown> | null {
  if (!j || j.error) return null;
  return j.features?.[0]?.attributes ?? null;
}

export function arcgisAll(j: ArcgisResponse): Array<Record<string, unknown>> {
  if (!j || j.error) return [];
  return (j.features ?? []).map((f) => f.attributes ?? {}).filter(Boolean);
}

export type FloodClassification = {
  available: boolean;
  zone: string | null;
  subtype: string | null;
  sfha: boolean | null;
  floodway: boolean | null;
  staticBfe: number | null;
  ambiguous: boolean;
  nearbyZones: string[];
  summary: string;
};

/**
 * Classify an NFHL point result. `nearby` = zones within a small buffer; more than one distinct
 * zone means the point is near a boundary → ambiguous (never certain).
 * Outside an SFHA is described as "not in a mapped SFHA" — never "safe from flooding".
 */
export function classifyFlood(input: {
  features: Array<Record<string, unknown>> | null;
  nearby: Array<Record<string, unknown>> | null;
  official: boolean;
}): FloodClassification {
  if (!input.features) {
    return { available: false, zone: null, subtype: null, sfha: null, floodway: null, staticBfe: null, ambiguous: false, nearbyZones: [], summary: "Flood data unavailable — Needs Verification." };
  }
  const a = input.features[0];
  if (!a) {
    return { available: true, zone: null, subtype: null, sfha: null, floodway: null, staticBfe: null, ambiguous: true, nearbyZones: [], summary: "No mapped flood-hazard polygon returned at this point — Needs Verification (unmapped or service gap)." };
  }
  const zone = typeof a["FLD_ZONE"] === "string" ? (a["FLD_ZONE"] as string).trim() : null;
  const subtype = typeof a["ZONE_SUBTY"] === "string" ? (a["ZONE_SUBTY"] as string) : null;
  const sfhaRaw = a["SFHA_TF"];
  const sfha = typeof sfhaRaw === "string" ? sfhaRaw.toUpperCase() === "T" : null;
  const floodway = subtype ? /floodway/i.test(subtype) : null;
  const bfe = typeof a["STATIC_BFE"] === "number" && (a["STATIC_BFE"] as number) > -9000 ? (a["STATIC_BFE"] as number) : null;
  const nearbyZones = [...new Set((input.nearby ?? []).map((n) => String(n["FLD_ZONE"] ?? "").trim()).filter(Boolean))];
  const ambiguous = nearbyZones.length > 1;
  const summary = zone
    ? `FEMA Zone ${zone}${subtype ? ` (${subtype})` : ""} — ${sfha ? "inside a mapped Special Flood Hazard Area" : "not inside a mapped Special Flood Hazard Area (flood risk is not zero)"}${ambiguous ? `; zones ${nearbyZones.join(", ")} occur within ~25 m, so the result is near a boundary` : ""}.`
    : "Flood zone attribute missing — Needs Verification.";
  return { available: true, zone, subtype, sfha, floodway, staticBfe: bfe, ambiguous, nearbyZones, summary };
}

export function epochToDate(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Date(v).toISOString().slice(0, 10);
}

export function addressHash(s: string): string {
  const n = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  let h = 5381;
  for (let i = 0; i < n.length; i++) h = ((h << 5) + h + n.charCodeAt(i)) | 0;
  return `a${(h >>> 0).toString(36)}`;
}

// ------------------------------------------------------------------ source resilience

export type SourceProvenance = "official" | "official_alternate" | "cached_official" | "third_party_mirror" | "inferred";
export const PROVENANCE_LABEL: Record<SourceProvenance, string> = {
  official: "Official source",
  official_alternate: "Official source (alternate FEMA endpoint)",
  cached_official: "Cached official result (source temporarily unavailable)",
  third_party_mirror: "Third-party copy of official data (not authoritative)",
  inferred: "Inferred",
};

export type HealthEvent = { provider: string; label: string; endpoint: string; ok: boolean; attempts: number; error?: string | null; ms: number };

/**
 * Bounded retry with exponential backoff for transient failures (network, 429, 5xx, non-JSON).
 * `attempt` returns { ok, retryable, value }. Never retries more than `max` times.
 */
export async function withRetry<T>(
  attempt: () => Promise<{ ok: boolean; retryable: boolean; value: T; error?: string }>,
  opts: { max?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ ok: boolean; value: T; attempts: number; error?: string }> {
  const max = opts.max ?? 3;
  const base = opts.baseMs ?? 400;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: { ok: boolean; retryable: boolean; value: T; error?: string } | null = null;
  for (let i = 1; i <= max; i++) {
    last = await attempt();
    if (last.ok || !last.retryable || i === max) return { ok: last.ok, value: last.value, attempts: i, error: last.error };
    await sleep(base * 2 ** (i - 1));
  }
  return { ok: false, value: last!.value, attempts: max, error: last?.error };
}

// ------------------------------------------------------------------ flood geometry

export type FloodPosition = "clearly_inside" | "clearly_outside" | "near_boundary" | "unknown";

/**
 * Boundary safety: compares the zone at the point with zones inside a buffer ring.
 * Any different zone or different SFHA status inside the ring = near a boundary (never certain).
 */
export function floodPosition(point: { zone: string | null; sfha: boolean | null }, ring: Array<Record<string, unknown>> | null): FloodPosition {
  if (!point.zone || point.sfha === null || !ring) return "unknown";
  const zones = new Set(ring.map((n) => String(n["FLD_ZONE"] ?? "").trim()).filter(Boolean));
  const sfhas = new Set(ring.map((n) => String(n["SFHA_TF"] ?? "").toUpperCase()).filter(Boolean));
  if (zones.size > 1 || sfhas.size > 1) return "near_boundary";
  return point.sfha ? "clearly_inside" : "clearly_outside";
}

/** Choose the FIRM panel for the property: must match the flood-zone study (DFIRM); several = ambiguous. */
export function pickPanel(panels: Array<Record<string, unknown>>, dfirmId: string | null): { panel: Record<string, unknown> | null; ambiguous: boolean; candidates: string[] } {
  const all = panels.map((p) => String(p["FIRM_PAN"] ?? "")).filter(Boolean);
  const pool = dfirmId ? panels.filter((p) => p["DFIRM_ID"] === dfirmId) : panels;
  const ids = [...new Set(pool.map((p) => String(p["FIRM_PAN"] ?? "")).filter(Boolean))];
  if (ids.length === 1) return { panel: pool.find((p) => p["FIRM_PAN"] === ids[0]) ?? null, ambiguous: false, candidates: all };
  return { panel: null, ambiguous: ids.length > 1, candidates: all };
}

// ------------------------------------------------------------------ evidence reconciler (code editions)

export type EditionEvidence = {
  source: string;
  url?: string | null;
  edition: string;
  /** Adoption effective date stated by the source (YYYY-MM-DD). */
  effective?: string | null;
  /** When the document itself was published / last updated, if known. */
  published?: string | null;
  kind: "adoption" | "informational";
};

export type EditionDecision = {
  edition: string | null;
  verification: "verified" | "needs_verification";
  current: EditionEvidence | null;
  superseded: EditionEvidence[];
  upcoming?: EditionEvidence[];
  conflicts: EditionEvidence[];
  explanation: string;
};

/**
 * Current authoritative adoption evidence wins over older informational documents; both are kept.
 * Two current adoption sources that disagree = unresolved conflict (Needs Verification).
 */
export function reconcileEditions(evidence: EditionEvidence[], asOf: string): EditionDecision {
  const adoptions = evidence.filter((e) => e.kind === "adoption" && e.effective && e.effective <= asOf).sort((a, b) => (b.effective! > a.effective! ? 1 : -1));
  if (!adoptions.length) {
    return { edition: null, verification: "needs_verification", current: null, superseded: [], conflicts: evidence, explanation: evidence.length ? "Only informational or future-dated sources were found; no current adoption record confirms the edition." : "No edition evidence was found." };
  }
  const top = adoptions[0]!;
  const sameDate = adoptions.filter((a) => a.effective === top.effective && a.edition !== top.edition);
  const others = evidence.filter((e) => e !== top && e.edition !== top.edition);
  if (sameDate.length) {
    return { edition: null, verification: "needs_verification", current: null, superseded: [], conflicts: [top, ...sameDate], explanation: `Current adoption sources disagree (${[top, ...sameDate].map((e) => `${e.source}: ${e.edition}`).join("; ")}).` };
  }
  // A document issued on/after the adoption date that still names another edition is a real conflict;
  // older or undated informational references are stale; future-dated adoptions are upcoming, not current.
  const upcoming = others.filter((e) => e.kind === "adoption" && !!e.effective && e.effective > asOf);
  const conflicts = others.filter((e) => e.kind === "informational" && !!e.published && e.published >= top.effective!);
  const superseded = others.filter((e) => !conflicts.includes(e) && !upcoming.includes(e));
  const explanation = conflicts.length
    ? `A document published after the current adoption still names a different edition (${conflicts.map((c) => `${c.source}: ${c.edition}`).join("; ")}).`
    : `${top.source} states ${top.edition} effective ${top.effective}.${superseded.length ? ` Older references (${superseded.map((x) => `${x.source}: ${x.edition}`).join("; ")}) predate that adoption and are treated as superseded.` : ""}${upcoming.length ? ` Upcoming: ${upcoming.map((u) => `${u.edition} effective ${u.effective}`).join("; ")}.` : ""}`;
  return { edition: top.edition, verification: conflicts.length ? "needs_verification" : "verified", current: top, superseded, upcoming, conflicts, explanation };
}

/** Parse Florida Building Commission amendment-search result rows (text form). */
export function parseBcisRows(text: string): Array<{ type: string; subcode: string; chapter: string; section: string; jurisdiction: string; effective: string }> {
  const out: Array<{ type: string; subcode: string; chapter: string; section: string; jurisdiction: string; effective: string }> = [];
  const re = /(Technical Amendment|Administrative Amendment)\s*\|[\s|]*([^|]+?)\s*\|[\s|]*([^|]+?)\s*\|[\s|]*([^|]+?)\s*\|[\s|]*([^|]+?)\s*\|[\s|]*(\d{1,2}\/\d{1,2}\/\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ type: m[1]!, subcode: m[2]!.trim(), chapter: m[3]!.trim(), section: m[4]!.trim(), jurisdiction: m[5]!.trim(), effective: m[6]! });
  return out;
}
