import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, RotateCcw } from "lucide-react";
import { useHydrated } from "@tanstack/react-router";
import {
  EMPTY_FILTERS, FINDING_STATUSES, FINDING_STATUS_LABEL, confidenceLabel, filterFindings, findingLanguage,
  isHighPriority, markersForPage, type FindingFilters, type WorkspaceFinding,
} from "@/lib/planReviewUx";
import { categoryLabel, disciplineLabel, qaqcVerificationMeta, severityMeta } from "@/lib/qaqcConfig";
import { FindingEvaluation } from "@/components/project/PlanReviewEvaluation";

const DrawingViewer = lazy(() => import("@/components/project/DrawingViewer").then((m) => ({ default: m.DrawingViewer })));

type Sheet = { id: string; sheet_number: string; sheet_title: string | null; discipline: string; document_id: string | null; index_state: string };
type Codes = Array<{ discipline?: string; code_family?: string; edition?: string; source_url?: string | null; verification?: string }>;

const sel = "rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider";

export function PlanReviewWorkspace({
  reviewId, findings, sheets, documentIds, codes, jurisdiction, professional, staff, evaluations, onStatus,
}: {
  reviewId: string;
  findings: WorkspaceFinding[];
  sheets: Sheet[];
  documentIds: string[];
  codes: Codes;
  jurisdiction: string | null;
  professional: boolean;
  staff: boolean;
  evaluations: Array<{ finding_id: string | null; accuracy: string | null; usefulness: string | null; notes: string | null }>;
  onStatus: (id: string, status: string) => void;
}) {
  const hydrated = useHydrated();
  const [filters, setFilters] = useState<FindingFilters>(EMPTY_FILTERS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pane, setPane] = useState<"sheets" | "drawing" | "finding">("finding");

  const visible = useMemo(() => filterFindings(findings, filters), [findings, filters]);
  const active = findings.find((f) => f.id === activeId) ?? null;
  const drawingDoc = doc ?? documentIds[0] ?? null;
  const markers = drawingDoc ? markersForPage(visible, drawingDoc, page) : [];

  useEffect(() => { if (!activeId && visible[0]) setActiveId(visible[0].id); }, [visible, activeId]);

  const focusFinding = (f: WorkspaceFinding, go = true) => {
    setActiveId(f.id);
    if (f.document_id) { setDoc(f.document_id); if (f.page) setPage(f.page); }
    if (go) setPane("finding");
  };
  const pickSheet = (s: Sheet) => {
    setFilters((x) => ({ ...x, sheet: x.sheet === s.sheet_number ? "all" : s.sheet_number }));
    const first = findings.find((f) => f.sheet_number === s.sheet_number && f.document_id);
    if (first) focusFinding(first, false);
    else if (s.document_id) { setDoc(s.document_id); setPage(1); }
    setPane("drawing");
  };

  const opts = (vals: (string | null)[]) => Array.from(new Set(vals.filter(Boolean) as string[])).sort();
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const countFor = (n: string) => findings.filter((f) => f.sheet_number === n || (f.related_sheets ?? []).includes(n)).length;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Discipline" className={sel} value={filters.discipline} onChange={(e) => setFilters({ ...filters, discipline: e.target.value })}>
          <option value="all">All disciplines</option>
          {opts(findings.map((f) => f.discipline)).map((d) => <option key={d} value={d}>{disciplineLabel(d)}</option>)}
        </select>
        <select aria-label="Severity" className={sel} value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
          <option value="all">All priorities</option>
          <option value="high_priority">High priority</option>
          {["critical", "high", "medium", "low", "informational"].map((s) => <option key={s} value={s}>{severityMeta(s).label}</option>)}
        </select>
        <select aria-label="Confidence" className={sel} value={filters.confidence} onChange={(e) => setFilters({ ...filters, confidence: e.target.value })}>
          <option value="all">Any confidence</option>
          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="unrated">Not rated</option>
        </select>
        <select aria-label="Status" className={sel} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="all">All statuses</option>
          <option value="active">Open + needs review</option>
          {FINDING_STATUSES.map((s) => <option key={s} value={s}>{FINDING_STATUS_LABEL[s]}</option>)}
        </select>
        <select aria-label="Sheet" className={sel} value={filters.sheet} onChange={(e) => setFilters({ ...filters, sheet: e.target.value })}>
          <option value="all">All sheets</option>
          {opts(findings.flatMap((f) => [f.sheet_number, ...(f.related_sheets ?? [])])).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {filtered && (
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-brand hover:underline">
            <RotateCcw className="size-3" /> Reset filters
          </button>
        )}
        <span className="ml-auto text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{visible.length} of {findings.length}</span>
      </div>

      {/* Small screens: one panel at a time */}
      <div className="flex gap-1 lg:hidden" role="tablist">
        {(["sheets", "drawing", "finding"] as const).map((p) => (
          <button key={p} role="tab" aria-selected={pane === p} onClick={() => setPane(p)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider ${pane === p ? "border-brand text-brand" : "border-border text-muted-foreground"}`}>
            {p === "sheets" ? "Sheets" : p === "drawing" ? "Drawing" : "Findings"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_360px]">
        {/* LEFT: sheets */}
        <div className={`${pane === "sheets" ? "block" : "hidden"} lg:block`}>
          <div className="max-h-[70vh] space-y-1 overflow-auto rounded-xl border border-border bg-card/60 p-2">
            <p className="px-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sheets</p>
            {sheets.filter((s) => s.index_state !== "missing_from_upload").map((s) => (
              <button key={s.id} onClick={() => pickSheet(s)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${filters.sheet === s.sheet_number ? "bg-brand/10 text-brand" : "hover:bg-muted/40"}`}>
                <span className="min-w-0 truncate"><span className="font-mono">{s.sheet_number}</span> <span className="text-muted-foreground">{s.sheet_title ?? ""}</span></span>
                {countFor(s.sheet_number) > 0 && <span className="shrink-0 rounded-full bg-muted/60 px-1.5 text-[10px] font-mono">{countFor(s.sheet_number)}</span>}
              </button>
            ))}
            {sheets.length === 0 && <p className="px-1 text-xs text-muted-foreground">No sheet list was extracted for this review.</p>}
            <p className="mt-2 px-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Findings</p>
            {visible.map((f) => (
              <button key={f.id} onClick={() => focusFinding(f)}
                className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs ${f.id === activeId ? "bg-brand/10 text-brand" : "hover:bg-muted/40"} ${f.status === "resolved" || f.status === "not_applicable" ? "opacity-60" : ""}`}>
                <span className="font-mono">#{f.finding_no}</span> {f.summary.slice(0, 70)}
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: drawing */}
        <div className={`${pane === "drawing" ? "block" : "hidden"} lg:block min-w-0`}>
          {documentIds.length > 1 && (
            <select aria-label="Drawing file" className={`${sel} mb-2 w-full`} value={drawingDoc ?? ""} onChange={(e) => { setDoc(e.target.value); setPage(1); }}>
              {documentIds.map((id, i) => <option key={id} value={id}>File {i + 1}</option>)}
            </select>
          )}
          {hydrated ? (
            <Suspense fallback={<p className="text-xs text-muted-foreground">Loading viewer…</p>}>
              <DrawingViewer reviewId={reviewId} documentId={drawingDoc} page={page} onPage={setPage} markers={markers} activeId={activeId}
                onMarker={(id) => { const f = findings.find((x) => x.id === id); if (f) focusFinding(f); }} />
            </Suspense>
          ) : null}
        </div>

        {/* RIGHT: finding detail */}
        <div className={`${pane === "finding" ? "block" : "hidden"} lg:block`}>
          {active ? (
            <FindingDetail f={active} professional={professional} codes={codes} jurisdiction={jurisdiction} onStatus={onStatus}
              onLocate={() => { focusFinding(active, false); setPane("drawing"); }}>
              {staff && <FindingEvaluation reviewId={reviewId} findingId={active.id} existing={evaluations.find((e) => e.finding_id === active.id) ?? null} />}
            </FindingDetail>
          ) : (
            <p className="rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">{findings.length ? "No findings match these filters." : "This review produced no findings."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FindingDetail({
  f, professional, codes, jurisdiction, onStatus, onLocate, children,
}: {
  f: WorkspaceFinding; professional: boolean; codes: Codes; jurisdiction: string | null;
  onStatus: (id: string, s: string) => void; onLocate: () => void; children?: React.ReactNode;
}) {
  const [openSrc, setOpenSrc] = useState(professional);
  useEffect(() => setOpenSrc(professional), [professional, f.id]);
  const sm = severityMeta(f.severity);
  const vm = qaqcVerificationMeta(f.verification);
  const lang = findingLanguage(f);
  const related = (f.related_sheets ?? []).filter((s) => s && s !== f.sheet_number);
  const disciplineCodes = codes.filter((c) => (c.discipline ?? "").toLowerCase() === f.discipline.toLowerCase());
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ring-1 ${sm.klass}`}>{isHighPriority(f.severity) ? `${sm.label} priority` : sm.label}</span>
        <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">{lang}</span>
        {professional && <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">{confidenceLabel(f.confidence)}</span>}
      </div>
      <p className="text-sm font-medium">#{f.finding_no} {f.summary}</p>
      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        {f.sheet_number ?? "Set-wide"}{related.length ? ` ↔ ${related.join(" ↔ ")}` : ""}
        {professional && f.page ? ` · page ${f.page}` : ""} · {disciplineLabel(f.discipline)}{professional ? ` · ${categoryLabel(f.category)}` : ""}
      </p>
      {f.location && <p className="text-xs text-muted-foreground">Location: {f.location}</p>}
      {f.document_id && f.page && (
        <button onClick={onLocate} className="text-[11px] font-mono uppercase tracking-wider text-brand hover:underline">Show on drawing</button>
      )}

      <div className="space-y-1.5 text-xs text-muted-foreground">
        {f.plain_language && <p><span className="text-foreground">What was found: </span>{f.plain_language}</p>}
        {f.why_it_matters && <p><span className="text-foreground">Why it was flagged: </span>{f.why_it_matters}</p>}
        {related.length > 0 && <p><span className="text-foreground">Cross-sheet: </span>information on {f.sheet_number ?? "this sheet"} appears inconsistent with {related.join(", ")}.</p>}
        {f.recommended_action && <p><span className="text-foreground">Next step: </span>{f.recommended_action}</p>}
      </div>

      <div className="rounded-lg border border-border">
        <button onClick={() => setOpenSrc((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-mono uppercase tracking-wider">
          Source &amp; code basis <ChevronDown className={`size-3.5 transition ${openSrc ? "rotate-180" : ""}`} />
        </button>
        {openSrc && (
          <div className="space-y-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <p><span className="text-foreground">Evidence: </span><span className={`rounded px-1.5 py-0.5 ring-1 ${vm.klass}`}>{vm.label}</span></p>
            {f.code_basis ? <p><span className="text-foreground">Code / reference: </span>{f.code_basis}</p>
              : <p className="text-sky-400">Verification required — no authoritative code section was identified for this item.</p>}
            {jurisdiction && <p><span className="text-foreground">Jurisdiction: </span>{jurisdiction}</p>}
            {disciplineCodes.map((c, i) => (
              <p key={i}><span className="text-foreground">Adopted code on file: </span>{c.code_family} {c.edition} <span className="opacity-70">[{(c.verification ?? "").replace(/_/g, " ")}]</span></p>
            ))}
            {f.jurisdiction_source_url ? (
              <a href={f.jurisdiction_source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                {/\.gov(\/|$)|\.us(\/|$)|municode|ecode360|codelibrary\.amlegal|iccsafe/i.test(f.jurisdiction_source_url) ? "Official source" : "Source"} <ExternalLink className="size-3" />
              </a>
            ) : <p>No source link attached.</p>}
          </div>
        )}
      </div>

      <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        Status
        <select aria-label="Finding status" value={f.status} onChange={(e) => onStatus(f.id, e.target.value)} className={`${sel} mt-1 w-full normal-case`}>
          {FINDING_STATUSES.map((s) => <option key={s} value={s}>{FINDING_STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      {children}
    </div>
  );
}
