import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkles, FileText, ClipboardList, Building2, Route as RouteIcon,
  ShieldAlert, ListChecks, LinkIcon, Loader2, Save, Send, RotateCcw, CalendarPlus, Wand2,
} from "lucide-react";
import {
  generatePermitAnalysis, listProjects, attachAnalysisToProject,
  analysisToChecklist, analysisToDeadlines, listPermitAnalyses, getPermitAnalysis,
  type PermitIntake,
} from "@/lib/permits.functions";

export const Route = createFileRoute("/_authenticated/assistant/analysis")({
  head: () => ({ meta: [{ title: "Permit Analysis — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: AnalysisPage,
});

const EMPTY_INTAKE: PermitIntake = {
  project_name: "", address: "", city: "", county: "", state: "", zip: "",
  property_type: "commercial", project_type: "", scope: "", occupancy_type: "",
  square_footage: "", construction_value: "", existing_use: "", proposed_use: "",
  target_construction_date: "", target_opening_date: "",
  client: "", property_owner: "", general_contractor: "", architect: "", engineer: "",
  jurisdiction: "", existing_permit_number: "", project_id: null,
};

const SAMPLE_INTAKE: PermitIntake = {
  project_name: "Sample Restaurant Tenant Improvement",
  address: "2100 Clarendon Blvd",
  city: "Arlington", county: "Arlington", state: "VA", zip: "22201",
  property_type: "commercial",
  project_type: "Tenant Improvement",
  scope: "Interior renovation of an existing retail space into a 2,400 sf restaurant. New commercial kitchen equipment (Type I hood, grease interceptor), plumbing fixtures, mechanical/HVAC upgrades, electrical panel upgrade, interior signage and exterior wall sign, ADA-compliant restrooms, new dining seating for approximately 60.",
  occupancy_type: "Restaurant (Assembly A-2)",
  square_footage: "2400",
  construction_value: "285000",
  existing_use: "Retail (Mercantile)",
  proposed_use: "Restaurant (Assembly A-2)",
  target_construction_date: "", target_opening_date: "",
  client: "Sample Client LLC",
  property_owner: "", general_contractor: "", architect: "", engineer: "",
  jurisdiction: "Arlington County, Virginia",
  existing_permit_number: "",
  project_id: null,
};

const SUGGESTED_QUESTIONS = [
  "What permits may be required?",
  "What documents should I prepare?",
  "Which agencies may review this project?",
  "What is the likely approval sequence?",
  "What inspections may be required?",
  "What information is missing?",
  "What are the biggest permit risks?",
  "Draft a jurisdiction verification email.",
  "Explain the certificate of occupancy process.",
  "What should I do next?",
];

const DISCLAIMER =
  "PERMIVIO provides AI-assisted organizational and research guidance only. Permit requirements, fees, timelines, code interpretations, inspections, and approvals must be verified directly with the applicable jurisdiction and qualified professionals. PERMIVIO does not guarantee permit approval.";

type Analysis = {
  summary?: Record<string, unknown>;
  permits?: Array<Record<string, string>>;
  documents?: Array<Record<string, unknown>>;
  agencies?: Array<Record<string, string>>;
  sequence?: Array<Record<string, unknown>>;
  inspections?: Array<Record<string, string>>;
  risks?: Array<Record<string, string>>;
  next_actions?: Array<Record<string, string>>;
  sources?: Array<Record<string, unknown>>;
  missing_info?: string[];
  follow_up_questions?: string[];
};

type AnalysisRow = {
  id: string;
  title: string;
  jurisdiction: string | null;
  project_id: string | null;
  intake: PermitIntake;
  analysis: Analysis;
  created_at: string;
};

function statusChip(status: string | undefined) {
  const v = (status || "").toLowerCase();
  if (v.includes("confirmed")) return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
  if (v.includes("insufficient")) return "bg-zinc-700/40 text-zinc-300 ring-zinc-500/30";
  if (v.includes("verification")) return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  if (v.includes("possibly")) return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
  if (v.includes("likely")) return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
  return "bg-zinc-800 text-zinc-300 ring-white/10";
}

function priorityChip(p: string | undefined) {
  const v = (p || "").toLowerCase();
  if (v === "critical") return "bg-red-500/15 text-red-300 ring-red-500/30";
  if (v === "high") return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  if (v === "medium") return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
  return "bg-zinc-800 text-zinc-400 ring-white/10";
}

function severityChip(s: string | undefined) {
  const v = (s || "").toLowerCase();
  if (v === "red") return "bg-red-500/15 text-red-300 ring-red-500/30";
  if (v === "amber") return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
}

function AnalysisPage() {
  const genFn = useServerFn(generatePermitAnalysis);
  const projectsFn = useServerFn(listProjects);
  const attachFn = useServerFn(attachAnalysisToProject);
  const toChecklistFn = useServerFn(analysisToChecklist);
  const toDeadlinesFn = useServerFn(analysisToDeadlines);
  const listFn = useServerFn(listPermitAnalyses);
  const getFn = useServerFn(getPermitAnalysis);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [intake, setIntake] = useState<PermitIntake>(EMPTY_INTAKE);
  const [current, setCurrent] = useState<AnalysisRow | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const historyQ = useQuery({ queryKey: ["permit-analyses"], queryFn: () => listFn() });

  const generate = useMutation({
    mutationFn: (i: PermitIntake) => genFn({ data: i }),
    onSuccess: (row) => {
      setCurrent(row as unknown as AnalysisRow);
      qc.invalidateQueries({ queryKey: ["permit-analyses"] });
      toast.success("Analysis ready");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generation failed"),
  });

  const attach = useMutation({
    mutationFn: (project_id: string) => attachFn({ data: { analysis_id: current!.id, project_id } }),
    onSuccess: () => toast.success("Saved to project"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const importChecklist = useMutation({
    mutationFn: (project_id: string) => toChecklistFn({ data: { analysis_id: current!.id, project_id } }),
    onSuccess: (r) => toast.success(`Imported ${r.count} items to checklist`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const importDeadlines = useMutation({
    mutationFn: (project_id: string) => toDeadlinesFn({ data: { analysis_id: current!.id, project_id } }),
    onSuccess: (r) => toast.success(`Created ${r.count} deadlines`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openHistorical = async (id: string) => {
    try {
      const row = await getFn({ data: { id } });
      setCurrent(row as unknown as AnalysisRow);
      setIntake(row.intake as PermitIntake);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  };

  const projects = projectsQ.data ?? [];
  const history = historyQ.data ?? [];
  const analysis: Analysis = current?.analysis ?? {};
  const jurisdictionText =
    current?.jurisdiction ||
    intake.jurisdiction ||
    [intake.city, intake.county, intake.state].filter(Boolean).join(", ");

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#05070d] via-[#080b16] to-[#0a0f22] text-zinc-100">
      <header className="border-b border-white/5 backdrop-blur bg-black/30 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/assistant" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white shrink-0">
              <ArrowLeft className="size-4" /> Assistant
            </Link>
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <div className="size-7 rounded-md bg-gradient-to-br from-sky-500 to-violet-600 grid place-items-center">
                <Sparkles className="size-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Permit Assistant</div>
                <div className="text-[11px] text-sky-300/70 truncate">Build a smarter path to approval.</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setIntake(SAMPLE_INTAKE); setCurrent(null); }}
              className="text-xs sm:text-sm inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10 px-3 py-1.5"
            >
              <Wand2 className="size-3.5" /> Load sample
            </button>
            <button
              onClick={() => { setIntake(EMPTY_INTAKE); setCurrent(null); }}
              className="text-xs sm:text-sm inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10 px-3 py-1.5"
            >
              <RotateCcw className="size-3.5" /> New
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 grid lg:grid-cols-[380px_1fr] gap-6">
        <aside className="space-y-4">
          <IntakeForm intake={intake} onChange={setIntake} />
          <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="size-4 text-violet-300" />
              <div className="text-sm font-semibold">Suggested questions</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    const merged = { ...intake, scope: intake.scope ? `${intake.scope}\n\nUser question: ${q}` : q };
                    generate.mutate(merged);
                  }}
                  className="text-[11px] rounded-full bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/20 px-2.5 py-1"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => generate.mutate(intake)}
            disabled={generate.isPending || !intake.project_name.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-violet-600 hover:opacity-90 text-white font-medium py-3 disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-[0_0_40px_-10px_rgba(99,102,241,0.6)]"
          >
            {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {generate.isPending ? "Analyzing…" : "Generate permit roadmap"}
          </button>

          {history.length > 0 && (
            <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-4">
              <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Recent analyses</div>
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => openHistorical(h.id)}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/5 text-sm truncate"
                    >
                      <div className="truncate">{h.title}</div>
                      <div className="text-[10px] text-zinc-500 truncate">
                        {h.jurisdiction || "—"} · {new Date(h.created_at).toLocaleDateString()}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <main className="min-w-0 space-y-4">
          {!current && !generate.isPending && <EmptyState />}
          {generate.isPending && <LoadingCard />}
          {current && (
            <>
              <SummaryCard title={current.title} jurisdiction={jurisdictionText} analysis={analysis} intake={intake} />

              {projects.length > 0 && (
                <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-4 flex flex-wrap items-center gap-2">
                  <div className="text-xs text-zinc-400 mr-auto">Save this analysis to a project:</div>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="bg-black/40 ring-1 ring-white/10 rounded-md text-sm px-2 py-1.5"
                  >
                    <option value="">Choose project…</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    onClick={() => selectedProjectId && attach.mutate(selectedProjectId)}
                    disabled={!selectedProjectId || attach.isPending}
                    className="text-xs inline-flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/20 px-2.5 py-1.5 disabled:opacity-40"
                  >
                    <Save className="size-3.5" /> Save
                  </button>
                  <button
                    onClick={() => selectedProjectId && importChecklist.mutate(selectedProjectId)}
                    disabled={!selectedProjectId || importChecklist.isPending}
                    className="text-xs inline-flex items-center gap-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 text-sky-100 px-2.5 py-1.5 disabled:opacity-40"
                  >
                    <ClipboardList className="size-3.5" /> To checklist
                  </button>
                  <button
                    onClick={() => selectedProjectId && importDeadlines.mutate(selectedProjectId)}
                    disabled={!selectedProjectId || importDeadlines.isPending}
                    className="text-xs inline-flex items-center gap-1 rounded-md bg-violet-500/20 hover:bg-violet-500/30 text-violet-100 px-2.5 py-1.5 disabled:opacity-40"
                  >
                    <CalendarPlus className="size-3.5" /> To deadlines
                  </button>
                </div>
              )}

              <PermitsSection permits={analysis.permits ?? []} />
              <DocumentsSection docs={analysis.documents ?? []} />
              <AgenciesSection agencies={analysis.agencies ?? []} />
              <SequenceSection steps={analysis.sequence ?? []} />
              <InspectionsSection items={analysis.inspections ?? []} />
              <RisksSection risks={analysis.risks ?? []} missing={analysis.missing_info ?? []} />
              <NextActionsSection actions={analysis.next_actions ?? []} />
              <SourcesSection sources={analysis.sources ?? []} />

              {(analysis.follow_up_questions?.length ?? 0) > 0 && (
                <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
                  <SectionTitle icon={<Sparkles className="size-4" />} title="Follow-up questions" />
                  <ul className="mt-2 space-y-1.5 text-sm text-zinc-300 list-disc pl-5">
                    {analysis.follow_up_questions!.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </div>
              )}

              <div className="rounded-xl bg-amber-500/5 ring-1 ring-amber-500/20 p-4 text-[12px] leading-relaxed text-amber-200/90">
                {DISCLAIMER}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------- Sub-components ----------------

function Field({ label, value, onChange, placeholder, textarea, cols = 2 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean; cols?: 1 | 2;
}) {
  return (
    <label className={cols === 1 ? "col-span-2" : ""}>
      <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</span>
      {textarea ? (
        <textarea
          value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
          className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-sky-500/40 rounded-md px-2 py-1.5 text-sm placeholder-zinc-600"
        />
      ) : (
        <input
          value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-black/40 ring-1 ring-white/10 focus:ring-sky-500/40 rounded-md px-2 py-1.5 text-sm placeholder-zinc-600"
        />
      )}
    </label>
  );
}

function IntakeForm({ intake, onChange }: { intake: PermitIntake; onChange: (i: PermitIntake) => void }) {
  const set = <K extends keyof PermitIntake>(k: K, v: PermitIntake[K]) => onChange({ ...intake, [k]: v });
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-4">
      <div className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Building2 className="size-4 text-sky-300" /> Project intake
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field cols={1} label="Project name" value={intake.project_name} onChange={(v) => set("project_name", v)} placeholder="e.g. Bayside Cafe TI" />
        <Field cols={1} label="Full address" value={intake.address} onChange={(v) => set("address", v)} />
        <Field label="City" value={intake.city} onChange={(v) => set("city", v)} />
        <Field label="County" value={intake.county} onChange={(v) => set("county", v)} />
        <Field label="State" value={intake.state} onChange={(v) => set("state", v)} placeholder="e.g. VA" />
        <Field label="ZIP" value={intake.zip} onChange={(v) => set("zip", v)} />
        <label>
          <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Property type</span>
          <select
            value={intake.property_type}
            onChange={(e) => set("property_type", e.target.value as PermitIntake["property_type"])}
            className="w-full bg-black/40 ring-1 ring-white/10 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="commercial">Commercial</option>
            <option value="residential">Residential</option>
            <option value="mixed">Mixed use</option>
          </select>
        </label>
        <Field label="Project type" value={intake.project_type} onChange={(v) => set("project_type", v)} placeholder="TI, new build, reno…" />
        <Field cols={1} label="Scope of work" textarea value={intake.scope} onChange={(v) => set("scope", v)} placeholder="Describe the work…" />
        <Field label="Occupancy / business" value={intake.occupancy_type} onChange={(v) => set("occupancy_type", v)} />
        <Field label="Square footage" value={intake.square_footage} onChange={(v) => set("square_footage", v)} />
        <Field label="Estimated value" value={intake.construction_value} onChange={(v) => set("construction_value", v)} />
        <Field label="Existing use" value={intake.existing_use} onChange={(v) => set("existing_use", v)} />
        <Field label="Proposed use" value={intake.proposed_use} onChange={(v) => set("proposed_use", v)} />
        <Field label="Target construction" value={intake.target_construction_date} onChange={(v) => set("target_construction_date", v)} placeholder="e.g. 2026-08" />
        <Field label="Target opening" value={intake.target_opening_date} onChange={(v) => set("target_opening_date", v)} />
        <Field cols={1} label="Known jurisdiction" value={intake.jurisdiction} onChange={(v) => set("jurisdiction", v)} placeholder="e.g. Arlington County, VA" />
        <details className="col-span-2 mt-1">
          <summary className="text-[11px] text-zinc-500 cursor-pointer hover:text-zinc-300">Optional parties & references</summary>
          <div className="grid grid-cols-2 gap-2.5 mt-2">
            <Field label="Client" value={intake.client} onChange={(v) => set("client", v)} />
            <Field label="Property owner" value={intake.property_owner} onChange={(v) => set("property_owner", v)} />
            <Field label="General contractor" value={intake.general_contractor} onChange={(v) => set("general_contractor", v)} />
            <Field label="Architect" value={intake.architect} onChange={(v) => set("architect", v)} />
            <Field label="Engineer" value={intake.engineer} onChange={(v) => set("engineer", v)} />
            <Field label="Existing permit #" value={intake.existing_permit_number} onChange={(v) => set("existing_permit_number", v)} />
          </div>
        </details>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-10 text-center">
      <div className="mx-auto size-14 rounded-2xl bg-gradient-to-br from-sky-500/30 to-violet-600/30 grid place-items-center mb-3 ring-1 ring-white/10">
        <Sparkles className="size-6 text-sky-200" />
      </div>
      <h2 className="text-lg font-semibold">Build a smarter path to approval</h2>
      <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
        Fill in the project intake on the left and generate a structured permit roadmap with likely permits, agencies, sequence, inspections, risks, and next actions.
      </p>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-10 text-center">
      <Loader2 className="size-6 animate-spin mx-auto text-sky-300 mb-2" />
      <div className="text-sm text-zinc-300">Analyzing project scope, jurisdiction, and requirements…</div>
      <div className="text-[11px] text-zinc-500 mt-1">This may take 15–30 seconds.</div>
    </div>
  );
}

function SectionTitle({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="size-6 rounded-md bg-white/5 ring-1 ring-white/10 grid place-items-center text-sky-300">{icon}</div>
      <div className="text-sm font-semibold">{title}</div>
      {typeof count === "number" && <span className="text-[11px] text-zinc-500">· {count}</span>}
    </div>
  );
}

function SummaryCard({ title, jurisdiction, analysis, intake }: {
  title: string; jurisdiction: string; analysis: Analysis; intake: PermitIntake;
}) {
  const s = (analysis.summary ?? {}) as Record<string, unknown>;
  const assumptions = Array.isArray(s.assumptions) ? (s.assumptions as string[]) : [];
  return (
    <div className="rounded-2xl bg-gradient-to-br from-sky-500/10 via-violet-500/5 to-transparent ring-1 ring-white/10 p-5">
      <div className="text-[11px] font-mono uppercase tracking-widest text-sky-300/80">Project summary</div>
      <h1 className="text-xl font-semibold mt-1">{title}</h1>
      <div className="text-sm text-zinc-400 mt-0.5">{jurisdiction || "Jurisdiction unspecified"}</div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3 text-sm">
        <div><span className="text-zinc-500">Type:</span> {String(s.project_type ?? intake.project_type ?? "—")}</div>
        <div><span className="text-zinc-500">Proposed use:</span> {String(s.proposed_use ?? intake.proposed_use ?? "—")}</div>
        <div className="sm:col-span-2"><span className="text-zinc-500">Scope:</span> {String(s.scope ?? intake.scope ?? "—")}</div>
      </div>
      {assumptions.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">Assumptions</div>
          <ul className="mt-1 text-sm text-zinc-300 list-disc pl-5 space-y-0.5">
            {assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function PermitsSection({ permits }: { permits: Array<Record<string, string>> }) {
  if (!permits.length) return null;
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
      <SectionTitle icon={<ListChecks className="size-4" />} title="Likely required permits" count={permits.length} />
      <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
        {permits.map((p, i) => (
          <div key={i} className="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium">{p.name}</div>
              <span className={`text-[10px] rounded-full px-2 py-0.5 ring-1 ${statusChip(p.verification_status)}`}>
                {(p.verification_status || "verification_needed").replace(/_/g, " ")}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">{p.agency || "Local Building Department"}</div>
            {p.why && <div className="text-xs text-zinc-300 mt-2">{p.why}</div>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {p.priority && <span className={`text-[10px] rounded-full px-2 py-0.5 ring-1 ${priorityChip(p.priority)}`}>{p.priority}</span>}
              {p.dependency && <span className="text-[10px] rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-0.5 text-zinc-400">depends: {p.dependency}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentsSection({ docs }: { docs: Array<Record<string, unknown>> }) {
  if (!docs.length) return null;
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
      <SectionTitle icon={<FileText className="size-4" />} title="Required documents" count={docs.length} />
      <ul className="mt-3 divide-y divide-white/5">
        {docs.map((d, i) => (
          <li key={i} className="py-2 flex items-start gap-3">
            <input type="checkbox" className="mt-1 accent-sky-500" />
            <div className="flex-1 min-w-0">
              <div className="text-sm flex items-center gap-2 flex-wrap">
                <span className="font-medium">{String(d.name ?? "Document")}</span>
                {d.required ? (
                  <span className="text-[10px] rounded-full px-2 py-0.5 ring-1 bg-red-500/10 text-red-300 ring-red-500/30">required</span>
                ) : (
                  <span className="text-[10px] rounded-full px-2 py-0.5 ring-1 bg-zinc-800 text-zinc-400 ring-white/10">recommended</span>
                )}
              </div>
              <div className="text-[11px] text-zinc-500">
                {String(d.responsible_party ?? "")}{d.notes ? ` — ${String(d.notes)}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgenciesSection({ agencies }: { agencies: Array<Record<string, string>> }) {
  if (!agencies.length) return null;
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
      <SectionTitle icon={<Building2 className="size-4" />} title="Agencies & departments" count={agencies.length} />
      <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
        {agencies.map((a, i) => (
          <div key={i} className="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
            <div className="text-sm font-medium">{a.name}</div>
            <div className="text-[11px] text-zinc-500">{a.department}</div>
            {a.role && <div className="text-xs text-zinc-300 mt-1.5">{a.role}</div>}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
              {a.contact && <span>{a.contact}</span>}
              {a.portal && (
                <a href={a.portal} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline inline-flex items-center gap-1">
                  <LinkIcon className="size-3" /> portal
                </a>
              )}
              {a.verified_date && <span>verified {a.verified_date}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SequenceSection({ steps }: { steps: Array<Record<string, unknown>> }) {
  if (!steps.length) return null;
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
      <SectionTitle icon={<RouteIcon className="size-4" />} title="Approval sequence" count={steps.length} />
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="mt-0.5 size-6 shrink-0 rounded-full bg-gradient-to-br from-sky-500 to-violet-600 grid place-items-center text-[11px] font-semibold">
              {String(s.step ?? i + 1)}
            </div>
            <div className="flex-1 rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
              <div className="text-sm font-medium">{String(s.stage ?? "Stage")}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {String(s.responsible_party ?? "—")}{s.dependency ? ` · depends on ${String(s.dependency)}` : ""}
              </div>
              {s.notes && <div className="text-xs text-zinc-300 mt-1.5">{String(s.notes)}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function InspectionsSection({ items }: { items: Array<Record<string, string>> }) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
      <SectionTitle icon={<ClipboardList className="size-4" />} title="Inspections" count={items.length} />
      <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
        {items.map((it, i) => (
          <div key={i} className="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium">{it.type}</div>
              <span className={`text-[10px] rounded-full px-2 py-0.5 ring-1 ${statusChip(it.verification_status)}`}>
                {(it.verification_status || "verification_needed").replace(/_/g, " ")}
              </span>
            </div>
            <div className="text-[11px] text-zinc-500">{it.agency}</div>
            <div className="text-xs text-zinc-300 mt-1.5">{it.when}</div>
            {it.prerequisites && <div className="text-[11px] text-zinc-500 mt-1">Prereq: {it.prerequisites}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RisksSection({ risks, missing }: { risks: Array<Record<string, string>>; missing: string[] }) {
  if (!risks.length && !missing.length) return null;
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
      <SectionTitle icon={<ShieldAlert className="size-4" />} title="Risks & missing information" />
      {missing.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-mono uppercase tracking-widest text-amber-300/80">Missing info</div>
          <ul className="mt-1 text-sm text-zinc-300 list-disc pl-5 space-y-0.5">
            {missing.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
      {risks.length > 0 && (
        <div className="mt-3 space-y-2">
          {risks.map((r, i) => (
            <div key={i} className="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{r.title}</div>
                <span className={`text-[10px] rounded-full px-2 py-0.5 ring-1 ${severityChip(r.severity)}`}>
                  {r.severity || "info"}
                </span>
              </div>
              {r.detail && <div className="text-xs text-zinc-300 mt-1">{r.detail}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NextActionsSection({ actions }: { actions: Array<Record<string, string>> }) {
  if (!actions.length) return null;
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
      <SectionTitle icon={<ListChecks className="size-4" />} title="Recommended next actions" count={actions.length} />
      <div className="mt-3 space-y-2">
        {actions.map((a, i) => (
          <div key={i} className="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium">{a.action}</div>
              <span className={`text-[10px] rounded-full px-2 py-0.5 ring-1 ${priorityChip(a.priority)}`}>{a.priority || "medium"}</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {a.responsible_party || "—"}{a.suggested_due_date ? ` · due ${a.suggested_due_date}` : ""}{a.related_permit ? ` · ${a.related_permit}` : ""}
            </div>
            {a.reason && <div className="text-xs text-zinc-300 mt-1.5">{a.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcesSection({ sources }: { sources: Array<Record<string, unknown>> }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5">
      <SectionTitle icon={<LinkIcon className="size-4" />} title="Sources & verification" count={sources.length} />
      {sources.length === 0 ? (
        <div className="mt-3 text-sm text-amber-300/90 bg-amber-500/5 ring-1 ring-amber-500/20 rounded-lg p-3">
          Official jurisdiction information has not yet been verified. Run a live jurisdiction refresh from the project page, or contact the local Building Department to confirm the requirements above.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {sources.map((s, i) => (
            <li key={i} className="rounded-xl bg-black/30 ring-1 ring-white/10 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{String(s.title ?? "Source")}</span>
                {s.official ? (
                  <span className="text-[10px] rounded-full px-2 py-0.5 ring-1 bg-emerald-500/10 text-emerald-300 ring-emerald-500/30">official</span>
                ) : (
                  <span className="text-[10px] rounded-full px-2 py-0.5 ring-1 bg-amber-500/10 text-amber-300 ring-amber-500/30">unverified</span>
                )}
              </div>
              <div className="text-[11px] text-zinc-500">{String(s.agency ?? "")}</div>
              {s.url && (
                <a href={String(s.url)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-300 hover:underline break-all">
                  {String(s.url)}
                </a>
              )}
              <div className="text-[10px] text-zinc-500 mt-1">
                {s.date_accessed ? `accessed ${String(s.date_accessed)}` : ""} {s.last_verified ? `· last verified ${String(s.last_verified)}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
