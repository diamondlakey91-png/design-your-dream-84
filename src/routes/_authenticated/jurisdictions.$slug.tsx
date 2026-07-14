import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getJurisdictionProfile,
  buildJurisdictionProfile,
  toggleSaveJurisdiction,
  listSavedJurisdictions,
} from "@/lib/jurisdictionProfiles.functions";
import {
  ArrowLeft, RefreshCw, ExternalLink, Building2, Bookmark, BookmarkCheck,
  ShieldCheck, ShieldAlert, ShieldQuestion, Info, MessageSquare,
  Phone, Mail, MapPin, Globe, FileText, Server, ListChecks, Clock, Users,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/jurisdictions/$slug")({
  head: () => ({
    meta: [
      { title: "Jurisdiction — Permivio" },
      { name: "description", content: "Permitting authority overview, portals, permit categories, requirements, and sources." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JurisdictionDetail,
});

type VStatus = "verified" | "recently_verified" | "review_recommended" | "limited" | "unverified" | "source_unavailable" | "demo";
function verifyMeta(status: string | null | undefined) {
  const s = (status || "unverified") as VStatus;
  const map = {
    verified:            { label: "Verified",            klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30", icon: ShieldCheck },
    recently_verified:   { label: "Recently verified",   klass: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30", icon: ShieldCheck },
    review_recommended:  { label: "Review recommended",  klass: "text-amber-400 bg-amber-500/10 ring-amber-500/30",       icon: ShieldAlert },
    limited:             { label: "Limited information", klass: "text-amber-400 bg-amber-500/10 ring-amber-500/30",       icon: ShieldAlert },
    unverified:          { label: "Unverified",          klass: "text-muted-foreground bg-muted/40 ring-border",           icon: ShieldQuestion },
    source_unavailable:  { label: "Source unavailable",  klass: "text-red-400 bg-red-500/10 ring-red-500/30",              icon: ShieldAlert },
    demo:                { label: "Demonstration data",  klass: "text-brand bg-brand/10 ring-brand/30",                    icon: Info },
  } as const;
  return map[s] ?? map.unverified;
}

type PermitLegacy = { name: string; when_required?: string; typical_reviewers?: string };
type FeeEntry = { label: string; detail?: string };
type TimelineEntry = { stage: string; typical_duration: string };
type ContactEntry = { role: string; detail: string };
type Department = { name: string; responsibility?: string; webpage?: string; portal?: string; phone?: string; email?: string; office_address?: string; last_verified_date?: string };
type PermitCategory = { name: string; department?: string; application_link?: string; submission_method?: string; prerequisites?: string; documents?: string; fees?: string; timeline?: string; inspections?: string; verification_status?: string; source?: string };
type Portal = { name: string; agency?: string; url?: string; account_required?: boolean; online_submission?: boolean; payment?: boolean; inspection_scheduling?: boolean; status_tracking?: boolean; notes?: string; last_verified_date?: string };
type Requirement = { title: string; summary?: string; applicable_permit?: string; source?: string; source_date?: string; verification_status?: string };
type Source = { title: string; agency?: string; url?: string; accessed_at?: string; verified_by?: string; status?: string; notes?: string };

function JurisdictionDetail() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getJurisdictionProfile);
  const buildFn = useServerFn(buildJurisdictionProfile);
  const savedFn = useServerFn(listSavedJurisdictions);
  const toggleSaveFn = useServerFn(toggleSaveJurisdiction);

  const q = useQuery({ queryKey: ["jurisdiction", slug], queryFn: () => getFn({ data: { slug } }) });
  const savedQ = useQuery({ queryKey: ["saved-jurisdictions"], queryFn: () => savedFn() });
  const p = q.data;

  const isSaved = useMemo(
    () => !!(p && (savedQ.data ?? []).some((s) => s.jurisdiction_id === p.id)),
    [savedQ.data, p],
  );

  const refresh = useMutation({
    mutationFn: () => buildFn({ data: { jurisdiction: p?.name ?? slug.replace(/-/g, " ") } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurisdiction", slug] });
      qc.invalidateQueries({ queryKey: ["jurisdictions"] });
      toast.success("Profile refreshed from official sources");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleSave = useMutation({
    mutationFn: () => toggleSaveFn({ data: { jurisdiction_id: p!.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-jurisdictions"] }),
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

  const legacyPermits = (p.permits ?? []) as PermitLegacy[];
  const fees = (p.fees ?? []) as FeeEntry[];
  const timelines = (p.timelines ?? []) as TimelineEntry[];
  const legacyContacts = (p.contacts ?? []) as ContactEntry[];
  const legacySources = (p.source_urls ?? []) as string[];
  const departments = (p.departments ?? []) as Department[];
  const permitCategories = (p.permit_categories ?? []) as PermitCategory[];
  const portals = (p.submission_portals ?? []) as Portal[];
  const requirements = (p.requirements ?? []) as Requirement[];
  const sources = (p.sources ?? []) as Source[];

  const meta = verifyMeta(p.verification_status);
  const MetaIcon = meta.icon;

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="px-4 md:px-8 pt-5 pb-5 border-b border-border relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -top-16 right-0 size-64 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <Link to="/jurisdictions" className="mt-1 text-muted-foreground hover:text-foreground" aria-label="Back">
              <ArrowLeft className="size-4" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold truncate">{p.name}</h1>
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
                {p.jurisdiction_type || "jurisdiction"}
                {p.county && ` · ${p.county}`}
                {p.state && ` · ${p.state}`}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 text-[10px] font-medium ${meta.klass}`}>
                  <MetaIcon className="size-3" /> {meta.label}
                </span>
                {p.last_verified_date && (
                  <span className="text-[10px] text-muted-foreground">
                    Last verified {new Date(p.last_verified_date).toLocaleDateString()}
                  </span>
                )}
                {p.confidence && (
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">confidence: {p.confidence}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-end gap-2">
              <button
                onClick={() => toggleSave.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-border px-2.5 py-1.5 text-xs hover:ring-brand"
              >
                {isSaved ? <BookmarkCheck className="size-3.5 text-brand" /> : <Bookmark className="size-3.5" />}
                {isSaved ? "Saved" : "Save"}
              </button>
              <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-border px-2.5 py-1.5 text-xs hover:ring-brand disabled:opacity-50"
              >
                <RefreshCw className={`size-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
                {refresh.isPending ? "Researching…" : "Refresh"}
              </button>
              <Link
                to="/assistant"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 text-white px-3 py-1.5 text-xs font-medium"
              >
                <MessageSquare className="size-3.5" /> Ask Permit Assistant
              </Link>
            </div>
          </div>
        </header>

        <div className="grid md:grid-cols-[220px_1fr] gap-6 md:gap-8 px-4 md:px-8 py-6">
          {/* Left nav */}
          <aside className="hidden md:block">
            <nav className="sticky top-4 space-y-1 text-sm">
              <SideLink href="#overview" label="Overview" />
              <SideLink href="#departments" label={`Departments${departments.length ? ` (${departments.length})` : ""}`} />
              <SideLink href="#categories" label={`Permit categories${permitCategories.length ? ` (${permitCategories.length})` : ""}`} />
              <SideLink href="#portals" label={`Portals${portals.length ? ` (${portals.length})` : ""}`} />
              <SideLink href="#requirements" label="Requirements" />
              <SideLink href="#timelines" label="Review timelines" />
              <SideLink href="#contacts" label="Contacts" />
              <SideLink href="#sources" label="Sources & verification" />
            </nav>
          </aside>

          <main className="space-y-8 min-w-0">
            {/* Overview */}
            <Section id="overview" title="Jurisdiction overview">
              <div className="rounded-xl bg-card ring-1 ring-border p-4 space-y-3">
                {p.overview && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.overview}</ReactMarkdown>
                  </div>
                )}
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <DTRow icon={Building2} label="Primary department" value={p.department} />
                  <DTRow icon={Globe} label="Government website" value={p.gov_website} href={p.gov_website || undefined} />
                  <DTRow icon={Server} label="Submission portal" value={p.portal_url} href={p.portal_url || undefined} />
                  <DTRow icon={Phone} label="Phone" value={p.phone} />
                  <DTRow icon={Mail} label="Email" value={p.email} />
                  <DTRow icon={MapPin} label="Office" value={p.office_address} />
                  <DTRow icon={Clock} label="Hours" value={p.office_hours} />
                </dl>
              </div>
            </Section>

            {/* Departments */}
            {departments.length > 0 && (
              <Section id="departments" title="Approval departments">
                <div className="grid sm:grid-cols-2 gap-3">
                  {departments.map((d, i) => (
                    <div key={i} className="rounded-xl bg-card ring-1 ring-border p-3.5">
                      <div className="text-sm font-semibold">{d.name}</div>
                      {d.responsibility && <div className="text-xs text-muted-foreground mt-0.5">{d.responsibility}</div>}
                      <div className="mt-2 space-y-1 text-xs">
                        {d.webpage && <LinkRow icon={Globe} href={d.webpage}>Webpage</LinkRow>}
                        {d.portal && <LinkRow icon={Server} href={d.portal}>Submission portal</LinkRow>}
                        {d.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="size-3" /> {d.phone}</div>}
                        {d.email && <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="size-3" /> {d.email}</div>}
                        {d.office_address && <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3" /> {d.office_address}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Permit categories */}
            {(permitCategories.length > 0 || legacyPermits.length > 0) && (
              <Section id="categories" title="Permit categories">
                {permitCategories.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {permitCategories.map((c, i) => {
                      const m = verifyMeta(c.verification_status);
                      const MIcon = m.icon;
                      return (
                        <div key={i} className="rounded-xl bg-card ring-1 ring-border p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{c.name}</div>
                              {c.department && <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/80 mt-0.5">{c.department}</div>}
                            </div>
                            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ring-1 text-[10px] ${m.klass}`}>
                              <MIcon className="size-3" /> {m.label}
                            </span>
                          </div>
                          <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                            {c.prerequisites && <li>Prereqs: {c.prerequisites}</li>}
                            {c.documents && <li>Docs: {c.documents}</li>}
                            {c.fees && <li>Fees: {c.fees}</li>}
                            {c.timeline && <li>Timeline: {c.timeline}</li>}
                            {c.inspections && <li>Inspections: {c.inspections}</li>}
                          </ul>
                          {c.application_link && <LinkRow icon={ExternalLink} href={c.application_link}>Application</LinkRow>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {legacyPermits.length > 0 && (
                  <ul className="mt-3 grid sm:grid-cols-2 gap-2">
                    {legacyPermits.map((it, i) => (
                      <li key={i} className="rounded-lg bg-card ring-1 ring-border p-3">
                        <div className="text-sm font-medium">{it.name}</div>
                        {it.when_required && <div className="text-xs text-muted-foreground mt-1">When: {it.when_required}</div>}
                        {it.typical_reviewers && <div className="text-xs text-muted-foreground">Reviewers: {it.typical_reviewers}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {/* Portals */}
            {portals.length > 0 && (
              <Section id="portals" title="Submission portals">
                <ul className="space-y-2">
                  {portals.map((pt, i) => (
                    <li key={i} className="rounded-xl bg-card ring-1 ring-border p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold flex items-center gap-1.5">
                            <Server className="size-4 text-brand" /> {pt.name}
                          </div>
                          {pt.agency && <div className="text-xs text-muted-foreground mt-0.5">{pt.agency}</div>}
                        </div>
                        {pt.url && (
                          <a href={pt.url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-1 shrink-0">
                            Open <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                        <Cap ok={pt.online_submission} label="Online submission" />
                        <Cap ok={pt.payment} label="Payment" />
                        <Cap ok={pt.inspection_scheduling} label="Inspections" />
                        <Cap ok={pt.status_tracking} label="Status tracking" />
                        <Cap ok={pt.account_required} label="Account required" />
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Requirements */}
            {requirements.length > 0 && (
              <Section id="requirements" title="Jurisdiction requirements">
                <ul className="rounded-xl bg-card ring-1 ring-border divide-y divide-border">
                  {requirements.map((r, i) => (
                    <li key={i} className="p-3.5">
                      <div className="flex items-start gap-2">
                        <ListChecks className="size-4 text-brand mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{r.title}</div>
                          {r.summary && <div className="text-xs text-muted-foreground mt-0.5">{r.summary}</div>}
                          <div className="text-[10px] font-mono text-muted-foreground/80 mt-1">
                            {r.applicable_permit && <>Applies to: {r.applicable_permit} · </>}
                            {r.source_date && <>source date: {r.source_date}</>}
                          </div>
                        </div>
                        {r.source && (
                          <a href={r.source} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-1 shrink-0">
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Fees */}
            {fees.length > 0 && (
              <Section id="fees" title="Fees">
                <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
                  {fees.map((f, i) => (
                    <li key={i} className="p-3">
                      <div className="text-sm font-medium">{f.label}</div>
                      {f.detail && <div className="text-xs text-muted-foreground mt-0.5">{f.detail}</div>}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Fees are shown only when published by the agency. Always confirm with the current fee schedule.
                </p>
              </Section>
            )}

            {/* Timelines */}
            {timelines.length > 0 && (
              <Section id="timelines" title="Review timelines">
                <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
                  {timelines.map((t, i) => (
                    <li key={i} className="p-3 flex justify-between items-baseline gap-3">
                      <span className="text-sm">{t.stage}</span>
                      <span className="text-xs font-mono text-brand">{t.typical_duration}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Published review periods are estimates or agency targets and do not guarantee approval dates.
                </p>
              </Section>
            )}

            {/* Contacts */}
            {legacyContacts.length > 0 && (
              <Section id="contacts" title="Contacts">
                <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
                  {legacyContacts.map((c, i) => (
                    <li key={i} className="p-3">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Users className="size-3" /> {c.role}
                      </div>
                      <div className="text-sm mt-0.5">{c.detail}</div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Sources */}
            <Section id="sources" title="Sources & verification">
              <div className="rounded-xl bg-card ring-1 ring-border p-4">
                {sources.length === 0 && legacySources.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sources recorded yet. Use <span className="text-brand">Refresh</span> to research official pages.</p>
                ) : (
                  <ul className="space-y-2">
                    {sources.map((s, i) => (
                      <li key={`s-${i}`} className="text-xs">
                        <div className="flex items-start gap-2">
                          <FileText className="size-3.5 mt-0.5 text-brand" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{s.title}{s.agency ? ` · ${s.agency}` : ""}</div>
                            {s.url && (
                              <a href={s.url} target="_blank" rel="noreferrer" className="text-brand hover:underline break-all">{s.url}</a>
                            )}
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              {s.accessed_at && <>accessed {s.accessed_at} · </>}
                              {s.verified_by && <>verified by {s.verified_by} · </>}
                              {s.status && <>status: {s.status}</>}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                    {legacySources.map((u, i) => (
                      <li key={`l-${i}`} className="text-xs">
                        <a href={u} target="_blank" rel="noreferrer" className="text-brand hover:underline break-all">{u}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>

            {/* Disclaimer */}
            <div className="rounded-xl bg-muted/30 ring-1 ring-border p-4 text-[11px] text-muted-foreground leading-relaxed">
              Permivio provides organizational and research assistance only. Jurisdiction boundaries, permit requirements,
              fees, contacts, review timelines, and submission procedures must be confirmed directly with the applicable
              government agency.
            </div>

            {p.refreshed_at && (
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground text-center">
                Last refreshed {new Date(p.refreshed_at).toLocaleString()}
              </p>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function SideLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="block px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card">
      {label}
    </a>
  );
}

function DTRow({ icon: Icon, label, value, href }: { icon: typeof Building2; label: string; value?: string | null; href?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80">{label}</div>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-brand hover:underline break-all">{value}</a>
        ) : (
          <div className="truncate">{value}</div>
        )}
      </div>
    </div>
  );
}

function LinkRow({ icon: Icon, href, children }: { icon: typeof Globe; href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand hover:underline">
      <Icon className="size-3" /> {children}
    </a>
  );
}

function Cap({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ring-1 ${ok ? "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30" : "text-muted-foreground bg-muted/40 ring-border"}`}>
      {label}{ok ? " ✓" : ""}
    </span>
  );
}
