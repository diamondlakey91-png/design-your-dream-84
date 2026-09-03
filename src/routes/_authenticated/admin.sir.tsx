import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PermivioPageHeader } from "@/components/PermivioPageHeader";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { listSirRequests, researchSirRequest, updateSirRequestStatus } from "@/lib/sir.functions";
import { SirReportView } from "@/components/sir/SirReportView";
import { ShieldAlert, RefreshCw, Search, Building2, BadgeCheck } from "lucide-react";

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
                    {r.review_status === "reviewed" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-300">
                        <BadgeCheck className="size-3" /> PROFESSIONALLY REVIEWED
                      </span>
                    )}
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

              {open && <div className="mt-4"><SirReportView row={r} /></div>}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
