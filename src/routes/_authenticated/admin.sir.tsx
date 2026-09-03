import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { listSirRequests, researchSirRequest, updateSirRequestStatus } from "@/lib/sir.functions";
import {
  ShieldAlert,
  RefreshCw,
  Search,
  ExternalLink,
  MapPin,
  Building2,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/sir")({
  component: AdminSirPage,
  head: () => ({
    meta: [
      { title: "SIR Requests — Permivio Admin" },
      { name: "description", content: "Review Site Investigation Report requests and their automated jurisdiction, zoning, permit, utility and timeline research." },
      { property: "og:title", content: "SIR Requests — Permivio Admin" },
      { property: "og:description", content: "Site Investigation Report intake with automated jurisdiction research." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUSES = ["new", "reviewing", "scoped", "quoted", "won", "closed"] as const;

type Verification = string | null | undefined;

function VerificationBadge({ level }: { level: Verification }) {
  const map: Record<string, { label: string; cls: string }> = {
    verified: { label: "Verified requirement", cls: "border-green-500/30 bg-green-500/10 text-green-300" },
    ai_assisted: { label: "AI-assisted", cls: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
    needs_confirmation: { label: "Agency confirmation required", cls: "border-slate-500/30 bg-white/5 text-slate-300" },
  };
  const v = map[level ?? "needs_confirmation"] ?? map['needs_confirmation']!;
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${v.cls}`}>{v.label}</span>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResearchPanel({ row }: { row: any }) {
  const research = row.research as any;
  const resolved = row.resolved_jurisdiction as any;
  const sources = (row.research_sources ?? []) as Array<{ url: string; title: string }>;

  if (row.research_status === "failed") {
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-200">
        <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Research failed</div>
        <p className="mt-1 text-red-200/80">{row.research_error ?? "Unknown error"}</p>
      </div>
    );
  }
  if (row.research_status === "running") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-200">
        <Loader2 className="size-4 animate-spin" /> Researching jurisdiction, zoning, permits, utilities and timeline…
      </div>
    );
  }
  if (!research) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
        No research on file yet. Run research to confirm the AHJ and auto-populate the report scope.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-white">Scope confirmation</h4>
          <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-200">
            {research.complexity} · {research.project_classification}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-300">{research.scope_summary}</p>
        <p className="mt-2 text-xs text-slate-400">Turnaround: {research.turnaround}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-blue-400" />
          <h4 className="text-sm font-semibold text-white">Jurisdiction & authorities</h4>
          <VerificationBadge level={research.jurisdiction?.verification} />
        </div>
        {resolved && (
          <p className="mt-2 text-xs text-slate-400">
            {resolved.formatted_address ?? "Address not resolved"} · {resolved.city ?? "—"}, {resolved.county ?? "—"} County, {resolved.state ?? "—"}
            {resolved.note ? ` — ${resolved.note}` : ""}
          </p>
        )}
        <p className="mt-2 text-sm text-slate-300">{research.jurisdiction?.ahj_summary}</p>
        <ul className="mt-3 grid gap-2">
          {(research.jurisdiction?.authorities ?? []).map((a: any, i: number) => (
            <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">{a.official_name}</span>
                <span className="text-xs text-slate-500">{a.role}</span>
                <VerificationBadge level={a.verification} />
              </div>
              <p className="mt-1 text-xs text-slate-400">{a.responsibility}</p>
              {a.website && (
                <a href={a.website} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-300 hover:underline">
                  <ExternalLink className="size-3" /> Agency site
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-white">Zoning & allowable use</h4>
          <VerificationBadge level={research.zoning?.verification} />
        </div>
        <p className="mt-2 text-sm text-slate-300">
          District: <span className="text-white">{research.zoning?.district ?? "Not established — confirm with the zoning office"}</span> ·
          Conclusion: <span className="text-white">{String(research.zoning?.use_conclusion ?? "needs_confirmation").replace(/_/g, " ")}</span>
        </p>
        <p className="mt-2 text-sm text-slate-400">{research.zoning?.rationale}</p>
        {(research.zoning?.items_to_confirm ?? []).length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-slate-400">
            {research.zoning.items_to_confirm.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h4 className="text-sm font-semibold text-white">Permit & approval matrix</h4>
        <div className="mt-3 grid gap-2">
          {(research.permits ?? []).map((p: any, i: number) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">{p.name}</span>
                <span className="text-xs text-slate-500">{p.agency}</span>
                <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-200">{p.likelihood}</span>
                <VerificationBadge level={p.verification} />
              </div>
              {p.depends_on && <p className="mt-1 text-xs text-slate-400">Depends on: {p.depends_on}</p>}
              {p.notes && <p className="mt-1 text-xs text-slate-400">{p.notes}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Utility coordination</h4>
          <ul className="mt-3 grid gap-2">
            {(research.utilities ?? []).map((u: any, i: number) => (
              <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{u.utility}</span>
                  <span className="text-xs text-slate-500">{u.provider ?? "Provider not established"}</span>
                  <VerificationBadge level={u.verification} />
                </div>
                <p className="mt-1 text-xs text-slate-400">{u.coordination_required}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Sequencing & timeline</h4>
          <ul className="mt-3 grid gap-2">
            {(research.timeline ?? []).map((t: any, i: number) => (
              <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{t.phase}</span>
                  <span className="text-xs text-slate-400">{t.duration}</span>
                  {t.critical_path && <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-200">Critical path</span>}
                  {t.long_lead && <span className="rounded-full border border-slate-500/30 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">Long lead</span>}
                </div>
                {t.depends_on && <p className="mt-1 text-xs text-slate-400">After: {t.depends_on}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Risks</h4>
          <ul className="mt-2 grid gap-2 text-xs">
            {(research.risks ?? []).map((r: any, i: number) => (
              <li key={i} className="text-slate-400">
                <span className={r.severity === "high" ? "text-red-300" : "text-white"}>{r.title}</span> — {r.why}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Open questions</h4>
          <ul className="mt-2 list-disc pl-4 text-xs text-slate-400">
            {(research.open_questions ?? []).map((q: string, i: number) => <li key={i}>{q}</li>)}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Recommended next steps</h4>
          <ul className="mt-2 list-disc pl-4 text-xs text-slate-400">
            {(research.recommended_next_steps ?? []).map((q: string, i: number) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      </div>

      {(research.research_scope ?? []).length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Report will cover</h4>
          <ul className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
            {research.research_scope.map((s: string, i: number) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
      )}

      {sources.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-sm font-semibold text-white">Sources</h4>
          <ul className="mt-2 grid gap-1 text-xs">
            {sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">{s.title || s.url}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Research output is AI-assisted analysis of published agency material. It is not a jurisdiction determination,
        survey, engineering opinion, or legal advice. Items marked for agency confirmation must be verified with the
        authority having jurisdiction before the report is delivered.
      </p>
    </div>
  );
}

function AdminSirPage() {
  const adminQ = useIsAdmin();
  const listFn = useServerFn(listSirRequests);
  const researchFn = useServerFn(researchSirRequest);
  const statusFn = useServerFn(updateSirRequestStatus);
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const requestsQ = useQuery({
    queryKey: ["sir-requests"],
    queryFn: () => listFn(),
    enabled: adminQ.data === true,
    refetchInterval: 20000,
  });

  const research = useMutation({
    mutationFn: (id: string) => researchFn({ data: { id } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sir-requests"] }),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: (typeof STATUSES)[number] }) => statusFn({ data: v }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sir-requests"] }),
  });

  const rows = useMemo(() => {
    const all = requestsQ.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r: any) =>
      [r.name, r.company, r.email, r.jurisdiction, r.site_address, r.intended_use]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q)),
    );
  }, [requestsQ.data, query]);

  if (adminQ.data === false) {
    return (
      <AppShell>
        <PermivioPageHeader title="SIR Requests" subtitle="Site Investigation Report intake" />
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <ShieldAlert className="mx-auto size-8 text-slate-400" />
          <h2 className="mt-3 text-lg font-semibold text-white">Restricted</h2>
          <p className="mt-1 text-sm text-slate-400">This page is available to Permivio administrators only.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PermivioPageHeader
        title="SIR Requests"
        subtitle="Public Site Investigation Report intake with automated jurisdiction, zoning, permit, utility and timeline research"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, jurisdiction or scope"
            aria-label="Search requests"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
        <button
          onClick={() => requestsQ.refetch()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 hover:border-blue-500/40"
        >
          <RefreshCw className={`size-4 ${requestsQ.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-3">
        {requestsQ.isLoading && <p className="text-sm text-slate-400">Loading requests…</p>}
        {!requestsQ.isLoading && rows.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-slate-400">No requests yet.</p>
        )}
        {rows.map((r: any) => {
          const open = openId === r.id;
          return (
            <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-white">{r.name}</h3>
                    {r.company && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Building2 className="size-3" /> {r.company}
                      </span>
                    )}
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">{r.status}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        r.research_status === "complete"
                          ? "border-green-500/30 bg-green-500/10 text-green-300"
                          : r.research_status === "failed"
                            ? "border-red-500/30 bg-red-500/10 text-red-300"
                            : "border-blue-500/30 bg-blue-500/10 text-blue-200"
                      }`}
                    >
                      research: {r.research_status ?? "pending"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-400">
                    {r.site_address ? `${r.site_address} · ` : ""}{r.jurisdiction}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-300">{r.intended_use}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.email}{r.phone ? ` · ${r.phone}` : ""} · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={r.status}
                    onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as (typeof STATUSES)[number] })}
                    aria-label="Request status"
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                  >
                    {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
                  </select>
                  <button
                    onClick={() => research.mutate(r.id)}
                    disabled={research.isPending && research.variables === r.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-200 hover:bg-blue-500/20 disabled:opacity-60"
                  >
                    <RefreshCw className={`size-4 ${research.isPending && research.variables === r.id ? "animate-spin" : ""}`} />
                    {r.research ? "Re-run research" : "Run research"}
                  </button>
                  <button
                    onClick={() => setOpenId(open ? null : r.id)}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 hover:border-blue-500/40"
                  >
                    {open ? "Hide report" : "View report"}
                  </button>
                </div>
              </div>

              {open && <div className="mt-4"><ResearchPanel row={r} /></div>}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
