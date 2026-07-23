import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listJurisdictionProfiles,
  buildJurisdictionProfile,
  listSavedJurisdictions,
  toggleSaveJurisdiction,
  listJurisdictionRequests,
  createJurisdictionRequest,
  seedDemoJurisdictions,
} from "@/lib/jurisdictionProfiles.functions";
import {
  Search, Sparkles, MapPin, Bookmark, BookmarkCheck, Pin,
  Plus, X, Building2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { verifyMeta, type VerificationStatus } from "@/lib/verification";

export const Route = createFileRoute("/_authenticated/jurisdictions")({
  head: () => ({
    meta: [
      { title: "Jurisdiction Library — Permivio" },
      { name: "description", content: "Search U.S. permitting jurisdictions, portals, departments, and requirements." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JurisdictionsIndex,
});

const US_STATES: Array<[string, string]> = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["DC","District of Columbia"],
  ["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],
  ["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],
  ["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],
  ["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],
  ["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],
  ["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],
  ["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],
  ["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],
  ["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
];
const TYPES = ["city", "county", "town", "borough", "parish", "township", "district", "state"];

function JurisdictionsIndex() {
  const listFn = useServerFn(listJurisdictionProfiles);
  const buildFn = useServerFn(buildJurisdictionProfile);
  const savedFn = useServerFn(listSavedJurisdictions);
  const toggleSaveFn = useServerFn(toggleSaveJurisdiction);
  const seedFn = useServerFn(seedDemoJurisdictions);
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [stateF, setStateF] = useState("");
  const [countyF, setCountyF] = useState("");
  const [typeF, setTypeF] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  // Live search — debounce input so typing "anne arundel" filters as you go.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  // Reset county when state changes so we never leave a stale county filter behind.
  useEffect(() => { setCountyF(""); }, [stateF]);

  const listQ = useQuery({
    queryKey: ["jurisdictions", term, stateF, typeF, verifiedOnly],
    queryFn: () => listFn({ data: { q: term, state: stateF, jurisdiction_type: typeF, verified_only: verifiedOnly } }),
  });
  const savedQ = useQuery({ queryKey: ["saved-jurisdictions"], queryFn: () => savedFn() });

  // Seed demo jurisdictions once if the library is completely empty
  const seed = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jurisdictions"] }),
  });
  useEffect(() => {
    if (listQ.data && listQ.data.length === 0 && !term && !stateF && !typeF && !verifiedOnly && !seed.isPending && !seed.data) {
      seed.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQ.data]);

  const build = useMutation({
    mutationFn: (name: string) => buildFn({ data: { jurisdiction: name } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["jurisdictions"] });
      toast.success(`Built profile for ${row.name}`);
      setQ("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleSave = useMutation({
    mutationFn: (jurisdiction_id: string) => toggleSaveFn({ data: { jurisdiction_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-jurisdictions"] }),
  });

  const rows = listQ.data ?? [];
  const saved = savedQ.data ?? [];
  const savedIds = useMemo(() => new Set(saved.map((s) => s.jurisdiction_id)), [saved]);

  // Client-side county filter — server already filters state; we narrow further by county.
  const countyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.county) set.add(r.county);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const filteredRows = useMemo(
    () => (countyF ? rows.filter((r) => (r.county ?? "") === countyF) : rows),
    [rows, countyF],
  );
  const featured = filteredRows.filter((r) => r.is_demo).slice(0, 5);
  const others = filteredRows.filter((r) => !r.is_demo);
  const totalResults = featured.length + others.length;

  // Popular quick-pick counties users search for most often.
  const QUICK_PICKS: Array<{ label: string; state: string; county: string }> = [
    { label: "Anne Arundel County, MD", state: "MD", county: "Anne Arundel County" },
    { label: "Montgomery County, MD", state: "MD", county: "Montgomery County" },
    { label: "Prince George's County, MD", state: "MD", county: "Prince George's County" },
    { label: "Arlington County, VA", state: "VA", county: "Arlington County" },
    { label: "Fairfax County, VA", state: "VA", county: "Fairfax County" },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="px-4 md:px-8 pt-6 pb-5 border-b border-border relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -top-16 right-0 size-64 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Jurisdiction Library</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Find the agencies, portals, requirements, and approval paths connected to any U.S. project location.
            </p>
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70 mt-2">
              National jurisdiction coverage planned — verified jurisdictions are added continuously.
            </p>
          </div>
        </header>

        <div className="grid md:grid-cols-[220px_1fr] gap-6 md:gap-8 px-4 md:px-8 py-6">
          {/* Left nav (desktop) */}
          <aside className="hidden md:block">
            <nav className="sticky top-4 space-y-1 text-sm">
              <SideLink href="#browse" label="Browse" active />
              <SideLink href="#saved" label={`Saved (${saved.length})`} />
              <SideLink href="#featured" label="Featured launch" />
              <SideLink href="#legend" label="Verification legend" />
              <button
                onClick={() => setRequestOpen(true)}
                className="mt-3 w-full inline-flex items-center gap-2 rounded-lg bg-brand text-brand-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
              >
                <Plus className="size-4" /> Request jurisdiction
              </button>
            </nav>
          </aside>

          {/* Main */}
          <main className="space-y-8 min-w-0">
            {/* Search + build */}
            <section id="browse" className="space-y-3">
              <form
                onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by county, city, ZIP, department… (e.g. Anne Arundel)"
                    className="w-full rounded-lg bg-card ring-1 ring-border pl-9 pr-9 py-2.5 text-sm outline-none focus:ring-brand"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => q.trim() && build.mutate(q.trim())}
                  disabled={!q.trim() || build.isPending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50 shadow-lg shadow-blue-500/10"
                  title="Search official sources and build a profile"
                >
                  <Sparkles className="size-4" />
                  {build.isPending ? "Researching…" : "Live research"}
                </button>
                <button
                  type="button"
                  onClick={() => setRequestOpen(true)}
                  className="md:hidden inline-flex items-center justify-center gap-1.5 rounded-lg ring-1 ring-border px-3 py-2.5 text-sm"
                >
                  <Plus className="size-4" /> Request
                </button>
              </form>

              {/* Quick picks — one click to jump straight to a popular county */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mr-1">Quick picks</span>
                {QUICK_PICKS.map((p) => {
                  const active = stateF === p.state && countyF === p.county;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setQ(""); setTerm("");
                        setStateF(p.state);
                        // stateF change resets countyF via effect; set after next tick
                        setTimeout(() => setCountyF(p.county), 0);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ring-1 transition ${
                        active
                          ? "bg-brand/10 text-brand ring-brand/40"
                          : "bg-card ring-border text-muted-foreground hover:text-foreground hover:ring-brand/40"
                      }`}
                    >
                      <Building2 className="size-3" /> {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2 text-xs">
                <select value={stateF} onChange={(e) => setStateF(e.target.value)}
                  className="rounded-md bg-card ring-1 ring-border px-2 py-1.5 min-w-[10rem]"
                  aria-label="Filter by state">
                  <option value="">All states</option>
                  {US_STATES.map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}
                </select>
                <select
                  value={countyF}
                  onChange={(e) => setCountyF(e.target.value)}
                  disabled={countyOptions.length === 0}
                  className="rounded-md bg-card ring-1 ring-border px-2 py-1.5 min-w-[12rem] disabled:opacity-50"
                  aria-label="Filter by county"
                >
                  <option value="">{countyOptions.length ? "All counties" : "No counties in view"}</option>
                  {countyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={typeF} onChange={(e) => setTypeF(e.target.value)}
                  className="rounded-md bg-card ring-1 ring-border px-2 py-1.5 capitalize"
                  aria-label="Filter by jurisdiction type">
                  <option value="">All types</option>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <label className="inline-flex items-center gap-1.5 rounded-md bg-card ring-1 ring-border px-2 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="accent-emerald-500" />
                  Verified only
                </label>
                <span className="inline-flex items-center gap-1 text-muted-foreground px-1 py-1.5">
                  {listQ.isFetching ? "Searching…" : `${totalResults} result${totalResults === 1 ? "" : "s"}`}
                </span>
                {(term || stateF || countyF || typeF || verifiedOnly) && (
                  <button
                    onClick={() => { setQ(""); setTerm(""); setStateF(""); setCountyF(""); setTypeF(""); setVerifiedOnly(false); }}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 py-1.5"
                  >
                    <X className="size-3" /> Clear
                  </button>
                )}
              </div>
            </section>

            {/* Featured */}
            {featured.length > 0 && (
              <section id="featured">
                <SectionTitle>Featured launch jurisdictions</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  {featured.map((r) => (
                    <JurisdictionCard key={r.id} row={r} saved={savedIds.has(r.id)} onToggleSave={() => toggleSave.mutate(r.id)} />
                  ))}
                </div>
              </section>
            )}

            {/* Saved */}
            {saved.length > 0 && (
              <section id="saved">
                <SectionTitle>Saved</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  {saved.map((s) => {
                    const j = s.jurisdiction as unknown as Row | null;
                    if (!j) return null;
                    return <JurisdictionCard key={s.id} row={j} saved onToggleSave={() => toggleSave.mutate(s.jurisdiction_id)} pinned={s.pinned} />;
                  })}
                </div>
              </section>
            )}

            {/* Results */}
            <section>
              <SectionTitle>{term || stateF || typeF || verifiedOnly ? "Results" : "All jurisdictions"}</SectionTitle>
              {listQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!listQ.isLoading && others.length === 0 && featured.length === 0 && (
                <div className="rounded-xl bg-card ring-1 ring-border p-6 text-center text-sm text-muted-foreground">
                  No jurisdictions match. Type an address or city above and hit{" "}
                  <span className="text-brand font-medium">Live research</span> to pull one from official sources.
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                {others.map((r) => (
                  <JurisdictionCard key={r.id} row={r} saved={savedIds.has(r.id)} onToggleSave={() => toggleSave.mutate(r.id)} />
                ))}
              </div>
            </section>

            {/* Legend */}
            <section id="legend">
              <SectionTitle>Verification status legend</SectionTitle>
              <div className="rounded-xl bg-card ring-1 ring-border p-4 grid sm:grid-cols-2 gap-2 text-xs">
                {(["verified","recently_verified","review_recommended","limited","unverified","source_unavailable","demo"] as VerificationStatus[]).map((s) => {
                  const m = verifyMeta(s); const Icon = m.icon;
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${m.klass}`}>
                        <Icon className="size-3" /> {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                Permivio provides organizational and research assistance only. Jurisdiction boundaries, permit requirements,
                fees, contacts, review timelines, and submission procedures must be confirmed directly with the applicable
                government agency.
              </p>
            </section>
          </main>
        </div>
      </div>

      {requestOpen && <RequestDrawer onClose={() => setRequestOpen(false)} />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">{children}</h2>;
}

function SideLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <a href={href} className={`block px-3 py-2 rounded-md ${active ? "bg-card ring-1 ring-border text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {label}
    </a>
  );
}

type Row = {
  id: string; slug: string; name: string; state: string; county?: string | null;
  jurisdiction_type?: string | null; department?: string | null; portal_url?: string | null;
  verification_status?: string | null; last_verified_date?: string | null;
  is_demo?: boolean | null; permit_categories?: unknown;
};


function JurisdictionCard({ row, saved, onToggleSave, pinned = false }: {
  row: Row; saved: boolean; onToggleSave: () => void; pinned?: boolean;
}) {
  const m = verifyMeta(row.verification_status);
  const Icon = m.icon;
  const catCount = Array.isArray(row.permit_categories) ? row.permit_categories.length : 0;
  return (
    <div className="group relative rounded-xl bg-card ring-1 ring-border hover:ring-brand/50 transition p-4">
      <div className="flex items-start gap-2">
        <MapPin className="size-4 text-brand mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <Link
            to="/jurisdictions/$slug"
            params={{ slug: row.slug }}
            className="block text-sm font-semibold truncate hover:underline"
          >
            {row.name}
          </Link>
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/80 truncate mt-0.5">
            {row.jurisdiction_type || "jurisdiction"}{row.county ? ` · ${row.county}` : ""} {row.state && `· ${row.state}`}
          </div>
          {row.department && (
            <div className="text-xs text-muted-foreground truncate mt-1">{row.department}</div>
          )}
        </div>
        <button
          onClick={onToggleSave}
          aria-label={saved ? "Remove from saved" : "Save"}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          {saved ? <BookmarkCheck className="size-4 text-brand" /> : <Bookmark className="size-4" />}
        </button>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 mt-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 text-[10px] font-medium ${m.klass}`}>
          <Icon className="size-3" /> {m.label}
        </span>
        {catCount > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground rounded-full px-2 py-0.5 ring-1 ring-border">
            {catCount} permit categories
          </span>
        )}
        {pinned && (
          <span className="inline-flex items-center gap-1 text-[10px] text-brand"><Pin className="size-3" /> Pinned</span>
        )}
        {row.last_verified_date && (
          <span className="text-[10px] text-muted-foreground">
            Verified {new Date(row.last_verified_date).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function RequestDrawer({ onClose }: { onClose: () => void }) {
  const createFn = useServerFn(createJurisdictionRequest);
  const listFn = useServerFn(listJurisdictionRequests);
  const qc = useQueryClient();
  const requestsQ = useQuery({ queryKey: ["jurisdiction-requests"], queryFn: () => listFn() });
  const [form, setForm] = useState({
    jurisdiction_name: "", state: "", county: "", project_address: "",
    permit_type: "", project_type: "", priority: "normal" as "low"|"normal"|"high"|"urgent", notes: "",
  });

  const submit = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurisdiction-requests"] });
      toast.success("Jurisdiction request submitted");
      setForm({ ...form, jurisdiction_name: "", county: "", project_address: "", permit_type: "", project_type: "", notes: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-card border-l border-border overflow-y-auto"
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Request a jurisdiction</h2>
            <p className="text-xs text-muted-foreground">We'll research and add it to your library.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="size-4" /></button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (form.jurisdiction_name.trim().length >= 2) submit.mutate(); }}
          className="p-5 space-y-3 text-sm"
        >
          <Field label="Jurisdiction name *">
            <input required minLength={2} value={form.jurisdiction_name}
              onChange={(e) => setForm({ ...form, jurisdiction_name: e.target.value })}
              className="input" placeholder="e.g. City of Alexandria" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="State">
              <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="input">
                <option value="">Select</option>
                {US_STATES.map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}
              </select>
            </Field>
            <Field label="County">
              <input value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Project address">
            <input value={form.project_address} onChange={(e) => setForm({ ...form, project_address: e.target.value })} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Permit type">
              <input value={form.permit_type} onChange={(e) => setForm({ ...form, permit_type: e.target.value })} className="input" placeholder="Building, sign…" />
            </Field>
            <Field label="Project type">
              <input value={form.project_type} onChange={(e) => setForm({ ...form, project_type: e.target.value })} className="input" placeholder="Tenant fit-out, new build…" />
            </Field>
          </div>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as typeof form.priority })} className="input capitalize">
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="input" />
          </Field>
          <button type="submit" disabled={submit.isPending || form.jurisdiction_name.trim().length < 2}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50">
            {submit.isPending ? "Submitting…" : "Submit request"}
          </button>
        </form>

        {(requestsQ.data ?? []).length > 0 && (
          <div className="px-5 pb-6">
            <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Your requests</h3>
            <ul className="space-y-1.5">
              {(requestsQ.data ?? []).map((r) => (
                <li key={r.id} className="rounded-lg bg-background ring-1 ring-border p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.jurisdiction_name}{r.state ? `, ${r.state}` : ""}</span>
                    <span className="font-mono uppercase text-[10px] text-muted-foreground">{r.status}</span>
                  </div>
                  {r.permit_type && <div className="text-muted-foreground mt-0.5">{r.permit_type}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <style>{`.input { width: 100%; border-radius: 0.5rem; background: var(--background); padding: 0.5rem 0.625rem; font-size: 0.875rem; outline: none; box-shadow: inset 0 0 0 1px var(--border); }
        .input:focus { box-shadow: inset 0 0 0 1px var(--brand); }`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

// Building2 kept imported for potential future use; suppress unused warning
void Building2;
