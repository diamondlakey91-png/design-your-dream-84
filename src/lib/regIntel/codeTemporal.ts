/**
 * Temporal code-adoption model: evidence records → per-family resolution for an Applicable Code Date.
 * Official does not mean current: effective dates and source authority decide, never page recency alone.
 */
export type CodeFamily = "building" | "residential" | "existing_building" | "electrical" | "mechanical" | "plumbing" | "fuel_gas" | "energy" | "fire" | "accessibility";
export type SourceType = "statute" | "rule" | "adoption_notice" | "official_publication" | "agency_current_code_page" | "guidance" | "faq" | "informational" | "development";
export type Layer = "federal" | "state" | "local";

/** Higher = more legally operative. Development/proposed material can never establish a current edition. */
export const AUTHORITY_RANK: Record<SourceType, number> = {
  statute: 9, rule: 8, adoption_notice: 7, official_publication: 6, agency_current_code_page: 5, guidance: 4, faq: 3, informational: 2, development: 0,
};
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  statute: "Statute", rule: "Adopted rule / regulation", adoption_notice: "Adoption notice / order", official_publication: "Official code publication",
  agency_current_code_page: "Agency current-code page", guidance: "Official guidance", faq: "FAQ", informational: "Informational page", development: "Code-development / proposed material",
};

export type CodeEvidence = {
  layer: Layer; state: string; jurisdiction_key?: string | null;
  family: CodeFamily; edition: string | null; /** Model code name, e.g. "NFPA 70 (NEC)" */ model?: string | null;
  adopted?: string | null; effective_from?: string | null; effective_to?: string | null;
  published?: string | null; retrieved_at: string;
  authority: string; source_type: SourceType; url: string; quote: string;
  /** Primary = the adopting authority's own page/register; mirrors are never Verified. */
  primary: boolean;
  /** Evidence says the edition is proposed / under development (not adopted). */
  proposed?: boolean;
  /** Evidence says this family is not adopted statewide (local determination). */
  local_only?: boolean;
  note?: string | null;
};

export type TemporalStatus = "current_verified" | "current_needs_verification" | "future_adopted" | "proposed" | "superseded" | "local_determination" | "unresolved";
export const TEMPORAL_LABEL: Record<TemporalStatus, string> = {
  current_verified: "Current — verified", current_needs_verification: "Current — needs verification", future_adopted: "Adopted — not yet effective",
  proposed: "Proposed / under development", superseded: "Superseded", local_determination: "Local determination required", unresolved: "Not established",
};

export type EditionPeriod = { edition: string; status: TemporalStatus; effective_from: string | null; effective_to: string | null; evidence: CodeEvidence[] };
export type FamilyResolution = {
  family: CodeFamily; state: string; as_of: string;
  current: EditionPeriod | null; future: EditionPeriod[]; proposed: EditionPeriod[]; superseded: EditionPeriod[];
  status: TemporalStatus; why: string; conflicts: Array<{ edition: string; url: string; authority: string }>;
  recheck_after: string;
};

const DAY = 86_400_000;
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * DAY).toISOString().slice(0, 10);
const dayBefore = (iso: string) => addDays(iso, -1);

/** Group non-proposed evidence by edition into periods; effective_to derived from the next edition's start. */
function periods(ev: CodeEvidence[]): EditionPeriod[] {
  const by = new Map<string, CodeEvidence[]>();
  for (const e of ev) if (e.edition && !e.proposed && AUTHORITY_RANK[e.source_type] > 0) (by.get(e.edition) ?? by.set(e.edition, []).get(e.edition)!).push(e);
  const ps = [...by.entries()].map(([edition, es]) => {
    const best = [...es].sort((a, b) => AUTHORITY_RANK[b.source_type] - AUTHORITY_RANK[a.source_type]);
    const from = best.find((e) => e.effective_from)?.effective_from ?? null;
    const to = best.find((e) => e.effective_to)?.effective_to ?? null;
    return { edition, status: "unresolved" as TemporalStatus, effective_from: from, effective_to: to, evidence: best };
  });
  ps.sort((a, b) => (a.effective_from ?? "0000").localeCompare(b.effective_from ?? "0000"));
  for (let i = 0; i < ps.length - 1; i++) if (!ps[i]!.effective_to && ps[i + 1]!.effective_from && ps[i]!.effective_from) ps[i]!.effective_to = dayBefore(ps[i + 1]!.effective_from!);
  return ps;
}

const cite = (p: EditionPeriod) => p.evidence[0]!;
const strong = (p: EditionPeriod) => p.evidence.some((e) => e.primary && AUTHORITY_RANK[e.source_type] >= AUTHORITY_RANK.agency_current_code_page);

export function resolveFamily(state: string, family: CodeFamily, evidence: CodeEvidence[], asOf: string, layer: Layer = "state", jurisdictionKey?: string | null): FamilyResolution {
  const ev = evidence.filter((e) => e.state === state && e.family === family && e.layer === layer && (layer !== "local" || !jurisdictionKey || e.jurisdiction_key === jurisdictionKey));
  const base = { family, state, as_of: asOf, future: [] as EditionPeriod[], proposed: [] as EditionPeriod[], superseded: [] as EditionPeriod[], conflicts: [] as FamilyResolution["conflicts"] };
  const proposed: EditionPeriod[] = [];
  for (const e of ev.filter((x) => x.edition && (x.proposed || AUTHORITY_RANK[x.source_type] === 0))) {
    if (!proposed.some((p) => p.edition === e.edition)) proposed.push({ edition: e.edition!, status: "proposed", effective_from: e.effective_from ?? null, effective_to: null, evidence: [e] });
  }
  const local = ev.find((e) => e.local_only && e.primary);
  const ps = periods(ev);
  const future = ps.filter((p) => p.effective_from && p.effective_from > asOf).map((p) => ({ ...p, status: "future_adopted" as TemporalStatus }));
  const past = ps.filter((p) => !p.effective_from || p.effective_from <= asOf);
  const inForce = past.filter((p) => p.effective_from && (!p.effective_to || p.effective_to >= asOf));
  const undated = past.filter((p) => !p.effective_from);
  let current: EditionPeriod | null = null;
  let why = "";
  let status: TemporalStatus = "unresolved";
  if (inForce.length) {
    current = inForce[inForce.length - 1]!;
    const verified = strong(current) && !undated.some((u) => u.evidence.some((e) => e.primary && AUTHORITY_RANK[e.source_type] > AUTHORITY_RANK[cite(current!).source_type]));
    status = verified ? "current_verified" : "current_needs_verification";
    current = { ...current, status };
    const c = cite(current);
    why = `${c.authority} ${c.source_type === "adoption_notice" || c.source_type === "rule" || c.source_type === "statute" ? "adopted" : "lists"} ${current.edition} effective ${current.effective_from}.`;
  } else if (undated.length) {
    const top = [...undated].sort((a, b) => AUTHORITY_RANK[cite(b).source_type] - AUTHORITY_RANK[cite(a).source_type]);
    current = { ...top[0]!, status: "current_needs_verification" };
    status = "current_needs_verification";
    why = `${cite(current).authority} lists ${current.edition}, but no effective date was established.`;
  }
  const superseded = ps.filter((p) => p.edition !== current?.edition && p.effective_from && p.effective_to && p.effective_to < asOf)
    .map((p) => ({ ...p, status: "superseded" as TemporalStatus }));
  // Undated editions that disagree with a dated current edition: stale or conflicting.
  for (const u of undated) {
    if (!current || u.edition === current.edition) continue;
    if (current.effective_from && strong(current)) superseded.push({ ...u, status: "superseded" });
    else base.conflicts.push({ edition: u.edition, url: cite(u).url, authority: cite(u).authority });
  }
  if (superseded.length) why += ` Older ${superseded.map((s) => s.edition).join(", ")} ${superseded.length > 1 ? "references were" : "reference was"} identified as superseded.`;
  if (base.conflicts.length) { status = "current_needs_verification"; if (current) current.status = status; why += " Official sources disagree and which one controls could not be established."; }
  if (!current && local) { status = "local_determination"; why = `${local.authority}: no statewide ${family} code — the local jurisdiction's adoption applies.`; }
  else if (current && local) why += " Local jurisdictions adopt their own edition; the local edition controls where adopted.";
  if (!current && !local && !why) why = proposed.length ? "Only proposed / development material was found — no adopted edition established." : "No adoption evidence found.";
  if (future.length) why += ` ${future.map((f) => `${f.edition} is adopted but not effective until ${f.effective_from}`).join("; ")}.`;
  return { ...base, current, future, proposed, superseded, status, why: why.trim(), recheck_after: recheckAfter(asOf, [...future, ...proposed], status) };
}

/** Freshness: stable facts 180 days; near a known transition, recheck just before and just after it; weak facts in 30. */
export function recheckAfter(asOf: string, upcoming: EditionPeriod[], status: TemporalStatus): string {
  let d = addDays(asOf, status === "current_verified" ? 180 : status === "local_determination" ? 120 : 30);
  for (const u of upcoming) {
    if (!u.effective_from) { d = d < addDays(asOf, 60) ? d : addDays(asOf, 60); continue; }
    const before = addDays(u.effective_from, -14);
    const t = before > asOf ? before : addDays(u.effective_from, 1) > asOf ? addDays(u.effective_from, 1) : d;
    if (t < d) d = t;
  }
  return d;
}

/** Applicable Code Date: permit/application date when known; otherwise today (with explicit caveat). */
export function applicableCodeDate(p: { application_date?: string | null; permit_issued?: string | null; today: string }): { date: string; basis: "application_date" | "permit_date" | "today"; caveat: string | null } {
  if (p.application_date) return { date: p.application_date.slice(0, 10), basis: "application_date", caveat: null };
  if (p.permit_issued) return { date: p.permit_issued.slice(0, 10), basis: "permit_date", caveat: "Based on the permit date; codes usually attach at application." };
  return { date: p.today, basis: "today", caveat: "No application date yet — this is today's baseline. The code that governs depends on when the permit application is submitted." };
}

export const FAMILIES: CodeFamily[] = ["building", "residential", "existing_building", "electrical", "mechanical", "plumbing", "fuel_gas", "energy", "fire", "accessibility"];

/**
 * Local vs state reconciliation. An official local page is not current merely because it is official:
 * in a statewide-mandatory state, a local edition older than the state edition in force for the
 * Applicable Code Date is stale (superseded). In local-adoption states the local edition controls.
 */
export function reconcileLocal(local: FamilyResolution, state: FamilyResolution, localAdoptionState: boolean): { status: "local_controls" | "local_stale" | "local_agrees" | "local_only" | "state_only" | "unresolved"; why: string } {
  const le = local.current?.edition ?? null, se = state.current?.edition ?? null;
  const yr = (e: string | null) => Number(e?.match(/20\d\d/)?.[0] ?? 0);
  if (!le && !se) return { status: "unresolved", why: "Neither a local nor a state edition was established." };
  if (!le) return { status: "state_only", why: "No local adoption statement found; the state baseline is shown separately and is not substituted." };
  if (!se) return { status: localAdoptionState ? "local_controls" : "local_only", why: `The local page states ${le}; no state edition was established to compare.` };
  if (localAdoptionState) return { status: "local_controls", why: `This state leaves adoption to local government; the local ${le} controls where adopted.` };
  if (yr(le) < yr(se) && (state.status === "current_verified" || state.status === "current_needs_verification") && (state.current?.effective_from ?? "9999") <= local.as_of) {
    return { status: "local_stale", why: `The local page still cites ${le}, but the statewide ${se} has been in force since ${state.current!.effective_from}. The local page is treated as out of date (superseded), not as current law.` };
  }
  if (yr(le) === yr(se)) return { status: "local_agrees", why: `The local page agrees with the statewide ${se}.` };
  return { status: "unresolved", why: `The local page cites ${le} while the state baseline is ${se}; which controls could not be established.` };
}
