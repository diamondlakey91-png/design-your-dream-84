import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listJurisdictionProfiles, buildJurisdictionProfile } from "@/lib/permits.functions";
import { ArrowLeft, Search, Sparkles, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jurisdictions")({
  head: () => ({ meta: [{ title: "Jurisdiction Library — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: JurisdictionsIndex,
});

function JurisdictionsIndex() {
  const listFn = useServerFn(listJurisdictionProfiles);
  const buildFn = useServerFn(buildJurisdictionProfile);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");

  const listQ = useQuery({ queryKey: ["jurisdictions", term], queryFn: () => listFn({ data: { q: term } }) });

  const build = useMutation({
    mutationFn: (name: string) => buildFn({ data: { jurisdiction: name } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["jurisdictions"] });
      toast.success(`Built profile for ${row.name}`);
      setQ("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = listQ.data ?? [];

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-2xl">
        <header className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Jurisdiction Library</h1>
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              20,000+ US jurisdictions — pulled live when you need one
            </p>
          </div>
        </header>

        <div className="p-6 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); setTerm(q); }}
            className="flex gap-2"
          >
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search or type e.g. Austin, TX"
                className="w-full rounded-lg bg-card ring-1 ring-border pl-9 pr-3 py-2 text-sm outline-none focus:ring-brand"
              />
            </div>
            <button
              type="button"
              onClick={() => q.trim() && build.mutate(q.trim())}
              disabled={!q.trim() || build.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-brand-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {build.isPending ? "Building…" : "Build"}
            </button>
          </form>

          <div>
            <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Cached profiles
            </h2>
            {listQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!listQ.isLoading && rows.length === 0 && (
              <div className="rounded-lg bg-card ring-1 ring-border p-6 text-center text-sm text-muted-foreground">
                No profiles yet. Type a jurisdiction above and hit <span className="text-brand">Build</span> —
                Permivio will search the official portal and generate a shared profile.
              </div>
            )}
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/jurisdictions/$slug"
                    params={{ slug: r.slug }}
                    className="block rounded-lg bg-card ring-1 ring-border hover:ring-brand/50 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="size-4 text-brand" />
                      <span className="text-sm font-medium">{r.name}</span>
                      {r.state && <span className="text-[11px] font-mono text-muted-foreground">{r.state}</span>}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                      {r.department || "Building Department"}
                      {r.refreshed_at && ` · updated ${new Date(r.refreshed_at).toLocaleDateString()}`}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
