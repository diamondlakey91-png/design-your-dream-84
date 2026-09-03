import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, BadgeCheck, ClipboardList, Loader2, MapPinCheck, Search, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { listMySirBriefs, submitSirBrief, type SirBriefInput } from "@/lib/sirClient.functions";
import { SIR_AI_RESEARCH_DISCLAIMER } from "@/lib/sirReport";

export const Route = createFileRoute("/_authenticated/sir/")({
  head: () => ({
    meta: [
      { title: "Site Investigation Workspace — Permivio" },
      {
        name: "description",
        content:
          "Submit a site investigation brief, follow the jurisdiction research as it runs, and download your reviewed feasibility report.",
      },
      { property: "og:title", content: "Permivio Site Investigation Workspace" },
      {
        property: "og:description",
        content: "Submit a brief, track the research agents, and download your professionally reviewed Site Investigation Report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SirWorkspacePage,
});

const STEPS = [
  { icon: ClipboardList, label: "1. Submit your brief", copy: "Address, jurisdiction and what you intend to build." },
  { icon: Search, label: "2. Research runs", copy: "Permivio's research agents pull published agency material for that jurisdiction." },
  { icon: ShieldCheck, label: "3. Professional review", copy: "A Permivio professional reviews every finding before release." },
  { icon: BadgeCheck, label: "4. Download the report", copy: "Your reviewed report, as a branded PDF you can share." },
];

function stageLabel(row: { research_status: string; review_stage: string; released_to_client_at: string | null }) {
  if (row.released_to_client_at) return { text: "Report ready", tone: "border-green-500/30 bg-green-500/10 text-green-300" };
  if (row.research_status === "failed") return { text: "Research needs attention", tone: "border-red-500/30 bg-red-500/10 text-red-200" };
  if (row.research_status === "queued") return { text: "Queued", tone: "border-slate-500/30 bg-slate-500/10 text-slate-300" };
  if (row.research_status === "running") return { text: "Researching", tone: "border-blue-500/30 bg-blue-500/10 text-blue-200" };
  if (row.review_stage === "qa_blocked") return { text: "In quality control", tone: "border-blue-500/30 bg-blue-500/10 text-blue-200" };
  return { text: "In professional review", tone: "border-blue-500/30 bg-blue-500/10 text-blue-200" };
}

const EMPTY: SirBriefInput = {
  name: "",
  company: "",
  email: "",
  phone: "",
  projectStage: "",
  siteAddress: "",
  jurisdiction: "",
  parcelApn: "",
  approxSize: "",
  intendedUse: "",
  existingBuilding: "unknown",
  targetDate: "",
  notes: "",
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none";

function SirWorkspacePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listMySirBriefs);
  const submitFn = useServerFn(submitSirBrief);

  const [form, setForm] = useState<SirBriefInput>(EMPTY);
  const set = <K extends keyof SirBriefInput>(k: K, v: SirBriefInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const briefsQ = useQuery({
    queryKey: ["sir-briefs"],
    queryFn: () => listFn({ data: { kind: "sir" } }),
    // While a brief is researching, keep the stage badges moving.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.research_status === "queued" || r.research_status === "running") ? 10_000 : false,
  });
  const briefs = briefsQ.data ?? [];

  const submit = useMutation({
    mutationFn: () => submitFn({ data: form }),
    onSuccess: (res) => {
      toast.success("Brief submitted — research has started");
      setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ["sir-briefs"] });
      navigate({ to: "/sir/$id", params: { id: res.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit your brief"),
  });

  return (
    <AppShell>
      <PermivioPageHeader
        title="Site Investigation"
        subtitle="Submit a brief, follow the research, and download your reviewed feasibility report."
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <s.icon className="size-4 text-blue-300" />
            <p className="mt-2 text-sm font-medium text-white">{s.label}</p>
            <p className="mt-1 text-xs text-slate-400">{s.copy}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white">New site investigation brief</h2>
          <p className="mt-1 text-xs text-slate-400">
            Tell us the site and what you want to do there. Permivio's research agents do the technical due-diligence work.
          </p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <label className="grid gap-1 text-xs text-slate-400">
              Your name*
              <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Company
              <input className={inputClass} value={form.company} onChange={(e) => set("company", e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Email*
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} required />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Phone
              <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2">
              Site address
              <input
                className={inputClass}
                placeholder="8025 Georgia Ave, Silver Spring, MD 20910"
                value={form.siteAddress}
                onChange={(e) => set("siteAddress", e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              City / county / state*
              <input
                className={inputClass}
                placeholder="Montgomery County, MD"
                value={form.jurisdiction}
                onChange={(e) => set("jurisdiction", e.target.value)}
                required
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Parcel / APN
              <input className={inputClass} value={form.parcelApn} onChange={(e) => set("parcelApn", e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Approximate size
              <input
                className={inputClass}
                placeholder="3,200 sf / 1.4 acres"
                value={form.approxSize}
                onChange={(e) => set("approxSize", e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Existing building?
              <select
                className={inputClass}
                value={form.existingBuilding}
                onChange={(e) => set("existingBuilding", e.target.value as SirBriefInput["existingBuilding"])}
              >
                <option value="unknown">Not sure</option>
                <option value="yes">Yes — existing building</option>
                <option value="no">No — vacant land</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Project stage
              <input
                className={inputClass}
                placeholder="Evaluating a site / under contract"
                value={form.projectStage}
                onChange={(e) => set("projectStage", e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Target date
              <input className={inputClass} placeholder="Open by March" value={form.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2">
              Intended use / scope*
              <textarea
                className={`${inputClass} min-h-24`}
                placeholder="New 60-seat full-service restaurant with a Type I hood in an existing retail bay."
                value={form.intendedUse}
                onChange={(e) => set("intendedUse", e.target.value)}
                required
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2">
              Anything else we should know
              <textarea className={`${inputClass} min-h-20`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submit.isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-200 hover:bg-blue-500/20 disabled:opacity-60"
              >
                {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : <MapPinCheck className="size-4" />}
                {submit.isPending ? "Submitting…" : "Submit brief & start research"}
              </button>
              <span className="text-xs text-slate-500">You'll get a live progress view as soon as it's submitted.</span>
            </div>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">{SIR_AI_RESEARCH_DISCLAIMER}</p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white">Your briefs</h2>
          {briefsQ.isPending && <p className="mt-3 text-xs text-slate-400">Loading…</p>}
          {!briefsQ.isPending && briefs.length === 0 && (
            <p className="mt-3 text-xs text-slate-400">No briefs yet. Submit one and it will appear here with live progress.</p>
          )}
          <ul className="mt-3 grid gap-2">
            {briefs.map((b) => {
              const stage = stageLabel(b);
              return (
                <li key={b.id}>
                  <Link
                    to="/sir/$id"
                    params={{ id: b.id }}
                    className="block rounded-xl border border-white/10 bg-white/[0.02] p-3 hover:border-blue-500/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">{b.site_address || b.jurisdiction}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{b.jurisdiction}</p>
                      </div>
                      <ArrowRight className="mt-1 size-4 shrink-0 text-slate-500" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${stage.tone}`}>{stage.text}</span>
                      <span className="text-[11px] text-slate-500">{new Date(b.created_at).toLocaleDateString()}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
