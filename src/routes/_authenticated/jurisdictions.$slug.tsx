import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getJurisdictionProfile, buildJurisdictionProfile } from "@/lib/permits.functions";
import { ArrowLeft, RefreshCw, ExternalLink, Building2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/_authenticated/jurisdictions/$slug")({
  head: () => ({ meta: [{ title: "Jurisdiction — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: JurisdictionDetail,
});

type PermitEntry = { name: string; when_required?: string; typical_reviewers?: string };
type FeeEntry = { label: string; detail?: string };
type TimelineEntry = { stage: string; typical_duration: string };
type ContactEntry = { role: string; detail: string };

function JurisdictionDetail() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getJurisdictionProfile);
  const buildFn = useServerFn(buildJurisdictionProfile);

  const q = useQuery({ queryKey: ["jurisdiction", slug], queryFn: () => getFn({ data: { slug } }) });
  const p = q.data;

  const refresh = useMutation({
    mutationFn: () => buildFn({ data: { jurisdiction: p?.name ?? slug.replace(/-/g, " ") } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurisdiction", slug] });
      qc.invalidateQueries({ queryKey: ["jurisdictions"] });
      toast.success("Profile refreshed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!p) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground">Profile not found.</p>
        <button onClick={() => navigate({ to: "/jurisdictions" })} className="text-brand mt-2 text-sm hover:underline">
          ← Back to library
        </button>
      </div>
    );
  }

  const permits = (p.permits ?? []) as PermitEntry[];
  const fees = (p.fees ?? []) as FeeEntry[];
  const timelines = (p.timelines ?? []) as TimelineEntry[];
  const contacts = (p.contacts ?? []) as ContactEntry[];
  const sources = (p.source_urls ?? []) as string[];

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-2xl">
        <header className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Link to="/jurisdictions" className="text-muted-foreground hover:text-foreground" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{p.name}</h1>
            {p.department && (
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground truncate">
                {p.department}
              </p>
            )}
          </div>
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-border px-2.5 py-1.5 text-xs hover:ring-brand disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        <div className="p-6 space-y-6">
          {p.portal_url && (
            <a
              href={p.portal_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg bg-card ring-1 ring-border px-3 py-2.5 text-sm hover:ring-brand"
            >
              <Building2 className="size-4 text-brand" />
              <span className="flex-1 truncate">Open official permit portal</span>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </a>
          )}

          {p.overview && (
            <section>
              <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Overview</h2>
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.overview}</ReactMarkdown>
              </div>
            </section>
          )}

          {permits.length > 0 && (
            <Section title="Common permits">
              <ul className="space-y-2">
                {permits.map((it, i) => (
                  <li key={i} className="rounded-lg bg-card ring-1 ring-border p-3">
                    <div className="text-sm font-medium">{it.name}</div>
                    {it.when_required && <div className="text-xs text-muted-foreground mt-1">When required: {it.when_required}</div>}
                    {it.typical_reviewers && <div className="text-xs text-muted-foreground mt-0.5">Reviewers: {it.typical_reviewers}</div>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {fees.length > 0 && (
            <Section title="Fees">
              <ul className="divide-y divide-border rounded-lg bg-card ring-1 ring-border">
                {fees.map((f, i) => (
                  <li key={i} className="p-3">
                    <div className="text-sm font-medium">{f.label}</div>
                    {f.detail && <div className="text-xs text-muted-foreground mt-0.5">{f.detail}</div>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {timelines.length > 0 && (
            <Section title="Typical timelines">
              <ul className="divide-y divide-border rounded-lg bg-card ring-1 ring-border">
                {timelines.map((t, i) => (
                  <li key={i} className="p-3 flex justify-between items-baseline gap-3">
                    <span className="text-sm">{t.stage}</span>
                    <span className="text-xs font-mono text-brand">{t.typical_duration}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {contacts.length > 0 && (
            <Section title="Contacts">
              <ul className="divide-y divide-border rounded-lg bg-card ring-1 ring-border">
                {contacts.map((c, i) => (
                  <li key={i} className="p-3">
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{c.role}</div>
                    <div className="text-sm mt-0.5">{c.detail}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {sources.length > 0 && (
            <Section title="Sources">
              <ul className="space-y-1.5">
                {sources.map((u, i) => (
                  <li key={i}>
                    <a href={u} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline break-all">
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {p.refreshed_at && (
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground text-center">
              Last refreshed {new Date(p.refreshed_at).toLocaleString()} · AI-summarized from official sources. Verify with department.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">{title}</h2>
      {children}
    </section>
  );
}
