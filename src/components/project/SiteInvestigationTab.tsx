/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, FileDown, Trash2, ListPlus, ExternalLink, ShieldAlert } from "lucide-react";
import {
  runSiteInvestigation,
  listSiteInvestigations,
  getSiteInvestigation,
  deleteSiteInvestigation,
  addSiteInvestigationPermitsToChecklist,
  generateSiteInvestigationPdf,
  planSiteInvestigation,
} from "@/lib/siteInvestigation.functions";
import {
  SI_FINDING_CATEGORIES,
  SITE_INVESTIGATION_DISCLAIMER,
  UTILITY_CAPACITY_CAVEAT,
  classificationMeta,
  ratingMeta,
} from "@/lib/siteInvestigationConfig";
import {
  REPORT_DEPTHS,
  riskCategoryLabel,
  riskLevelMeta,
  ddPriorityLabel,
  NO_DEAL_KILLERS_TEXT,
} from "@/lib/siteInvestigationEngine";
import { ProfessionalReviewButton } from "@/components/project/ProfessionalReviewButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function SiteInvestigationTab({
  projectId,
  defaultAddress,
  defaultProjectType,
}: {
  projectId: string;
  defaultAddress: string;
  defaultProjectType?: string;
}) {
  const qc = useQueryClient();
  const runFn = useServerFn(runSiteInvestigation);
  const listFn = useServerFn(listSiteInvestigations);
  const getFn = useServerFn(getSiteInvestigation);
  const delFn = useServerFn(deleteSiteInvestigation);
  const addFn = useServerFn(addSiteInvestigationPermitsToChecklist);
  const pdfFn = useServerFn(generateSiteInvestigationPdf);
  const planFn = useServerFn(planSiteInvestigation);

  const [address, setAddress] = useState(defaultAddress ?? "");
  const [projectType, setProjectType] = useState(defaultProjectType ?? "");
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");
  const [acreage, setAcreage] = useState("");
  const [buildingSf, setBuildingSf] = useState("");
  const [depth, setDepth] = useState("");
  const [parcels, setParcels] = useState<Array<{ label: string; parcel_number: string; acreage: string; phase: string }>>([]);
  const [active, setActive] = useState<string | null>(null);

  const planned = useQuery({
    queryKey: ["si-plan", projectId, projectType, notes],
    queryFn: () => planFn({ data: { project_id: projectId, project_type_label: projectType || undefined, scope_text: notes || undefined } }),
  });

  const list = useQuery({
    queryKey: ["site-investigations", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }),
  });

  const currentId = active ?? list.data?.investigations.find((i) => i.status === "complete")?.id ?? null;

  const inv = useQuery({
    queryKey: ["site-investigation", currentId],
    queryFn: () => getFn({ data: { investigation_id: currentId as string } }),
    enabled: !!currentId,
  });

  const run = useMutation({
    mutationFn: () =>
      runFn({
        data: {
          project_id: projectId,
          address,
          project_type_label: projectType || undefined,
          notes: notes || undefined,
          client_name: client || undefined,
          report_depth: depth || undefined,
          acreage: acreage ? Number(acreage) : undefined,
          building_sf: buildingSf ? Number(buildingSf) : undefined,
          parcels: parcels
            .filter((p) => p.label || p.parcel_number)
            .map((p, i) => ({
              label: p.label || `Parcel ${String.fromCharCode(65 + i)}`,
              parcel_number: p.parcel_number || undefined,
              acreage: p.acreage ? Number(p.acreage) : undefined,
              phase: p.phase || undefined,
            })),
        },
      }),
    onSuccess: (res) => {
      toast.success("Site investigation complete");
      setActive(res.investigation_id);
      qc.invalidateQueries({ queryKey: ["site-investigations", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Site investigation failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { investigation_id: id } }),
    onSuccess: () => {
      setActive(null);
      qc.invalidateQueries({ queryKey: ["site-investigations", projectId] });
    },
  });

  const addPermits = useMutation({
    mutationFn: () => addFn({ data: { investigation_id: currentId as string } }),
    onSuccess: (r) => {
      toast.success(r.added ? `${r.added} approval(s) added to the checklist` : "No new checklist items");
      qc.invalidateQueries({ queryKey: ["checklist", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update checklist"),
  });

  const exportPdf = useMutation({
    mutationFn: (clientReady: boolean) => pdfFn({ data: { investigation_id: currentId as string, client_ready: clientReady } }),
    onSuccess: (res) => {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "PDF export failed"),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = inv.data as any;
  const rating = d?.investigation ? ratingMeta(d.investigation.feasibility_rating) : null;

  return (
    <div className="space-y-6">
      {/* Intake */}
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Site investigation / feasibility</p>
        <h3 className="mt-1 text-lg font-semibold">Pre-development due diligence</h3>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          Researches zoning, site development, permits, utilities, environmental and access considerations for this address and proposed use.
          {" "}{SITE_INVESTIGATION_DISCLAIMER}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Site address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST 12345" />
          </div>
          <div>
            <Label className="text-xs">Proposed project / use</Label>
            <Input value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="Restaurant tenant fit-out" />
          </div>
          <div>
            <Label className="text-xs">Prepared for (optional)</Label>
            <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client / owner name" />
          </div>
          <div>
            <Label className="text-xs">Site acreage (optional)</Label>
            <Input value={acreage} onChange={(e) => setAcreage(e.target.value)} inputMode="decimal" placeholder="1.75" />
          </div>
          <div>
            <Label className="text-xs">Building area, sf (optional)</Label>
            <Input value={buildingSf} onChange={(e) => setBuildingSf(e.target.value)} inputMode="numeric" placeholder="4200" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Scope notes, known constraints, questions</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Adding a 900 sf patio, grease interceptor unknown, drive-thru desired…" />
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Report product</Label>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
            >
              <option value="">
                Recommended{planned.data ? ` — ${planned.data.recommended_depth_label}` : ""}
              </option>
              {REPORT_DEPTHS.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Parcels</Label>
            <div className="mt-1 space-y-2">
              {parcels.map((p, i) => (
                <div key={i} className="grid grid-cols-4 gap-1.5">
                  <Input value={p.label} onChange={(e) => setParcels((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={`Parcel ${String.fromCharCode(65 + i)}`} />
                  <Input value={p.parcel_number} onChange={(e) => setParcels((prev) => prev.map((x, j) => (j === i ? { ...x, parcel_number: e.target.value } : x)))} placeholder="APN" />
                  <Input value={p.acreage} onChange={(e) => setParcels((prev) => prev.map((x, j) => (j === i ? { ...x, acreage: e.target.value } : x)))} placeholder="Acres" />
                  <Input value={p.phase} onChange={(e) => setParcels((prev) => prev.map((x, j) => (j === i ? { ...x, phase: e.target.value } : x)))} placeholder="Phase" />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setParcels((prev) => [...prev, { label: "", parcel_number: "", acreage: "", phase: "" }])}
                className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:border-brand hover:text-brand"
              >
                + Add parcel
              </button>
            </div>
          </div>
        </div>

        {planned.data?.plan && (
          <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">What Permivio will research</p>
            <p className="mt-1 text-xs">
              {planned.data.plan.complexity_label} · {planned.data.recommended_depth_label} · {planned.data.plan.modules.length} research modules
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {planned.data.plan.modules.map((m: { id: string; label: string }) => (
                <span key={m.id} className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                  {m.label}
                </span>
              ))}
            </div>
            {planned.data.plan.custom_quote_recommended && (
              <p className="mt-2 text-xs text-muted-foreground">This scope is large enough that a custom-scoped study is recommended.</p>
            )}
          </div>
        )}

        <button
          onClick={() => run.mutate()}
          disabled={run.isPending || address.trim().length < 5}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-brand-foreground disabled:opacity-50"
        >
          <Sparkles className="size-3.5" /> {run.isPending ? "Researching…" : "Run site investigation"}
        </button>
      </div>

      {(list.data?.investigations.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.data!.investigations.map((i) => (
            <button
              key={i.id}
              onClick={() => setActive(i.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider ${
                currentId === i.id ? "border-brand text-brand" : "border-border text-muted-foreground hover:border-brand/60"
              }`}
            >
              {i.report_number ?? "SI"} · {i.status === "complete" ? ratingMeta(i.feasibility_rating).label : i.status} ·{" "}
              {new Date(i.created_at).toLocaleDateString()}
            </button>
          ))}
        </div>
      )}

      {inv.isLoading && currentId && <p className="text-sm text-muted-foreground">Loading report…</p>}

      {d?.investigation && (
        <>
          <div className={`rounded-xl border p-4 ring-1 ${rating!.klass}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider opacity-80">Overall feasibility rating (not a determination)</p>
                <p className="mt-1 text-2xl font-semibold">{rating!.label}</p>
                <p className="mt-1 max-w-xl text-xs opacity-80">{rating!.definition}</p>
                {d.investigation.report?.feasibility_rationale && (
                  <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{d.investigation.report.feasibility_rationale}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => addPermits.mutate()}
                  disabled={addPermits.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  <ListPlus className="size-3.5" /> Add approvals to checklist
                </button>
                <button
                  onClick={() => exportPdf.mutate(false)}
                  disabled={exportPdf.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  <FileDown className="size-3.5" /> Report PDF
                </button>
                <button
                  onClick={() => exportPdf.mutate(true)}
                  disabled={exportPdf.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  <FileDown className="size-3.5" /> Client-ready PDF
                </button>
                <button
                  onClick={() => remove.mutate(d.investigation.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            </div>
          </div>

          {d.investigation.executive_summary && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Executive summary</p>
              <p className="mt-1.5 text-sm">{d.investigation.executive_summary}</p>
            </div>
          )}

          {Object.keys(d.investigation.feasibility_snapshot ?? {}).length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Executive feasibility snapshot</p>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(d.investigation.feasibility_snapshot as Record<string, string>).map(([k, v]) =>
                  v ? (
                    <div key={k}>
                      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                      <dd>{v}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </div>
          )}

          {(d.parcels ?? []).length > 1 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Parcel summary</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {d.parcels.map((p: Record<string, any>) => (
                  <li key={p.id}>
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted-foreground">
                      {p.parcel_number ? ` · ${p.parcel_number}` : ""}
                      {p.acreage ? ` · ${p.acreage} ac` : ""}
                      {p.zoning ? ` · Zoning ${p.zoning}` : ""}
                      {p.phase ? ` · ${p.phase}` : ""}
                    </span>
                    {p.notes && <p className="text-muted-foreground">{p.notes}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(d.risks ?? []).length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Risk matrix</p>
              <ul className="mt-2 space-y-2 text-xs">
                {d.risks.map((r: Record<string, any>) => (
                  <li key={r.id} className="border-l-2 border-border pl-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{riskCategoryLabel(r.category)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ring-1 ${riskLevelMeta(r.level).klass}`}>
                        {riskLevelMeta(r.level).label}
                      </span>
                      <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                        {String(r.verification).replace(/_/g, " ")}
                      </span>
                    </div>
                    {r.why && <p className="mt-1 text-muted-foreground">{r.why}</p>}
                    {r.supporting_info && <p className="text-muted-foreground">{r.supporting_info}</p>}
                    {r.mitigation && <p className="text-muted-foreground"><span className="text-foreground">Mitigation: </span>{r.mitigation}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Potential deal killers</p>
            {((d.investigation.deal_killers ?? []) as Array<Record<string, string>>).length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">{NO_DEAL_KILLERS_TEXT}</p>
            ) : (
              <ul className="mt-2 space-y-2 text-xs">
                {((d.investigation.deal_killers ?? []) as Array<Record<string, string>>).map((k, i) => (
                  <li key={i} className="border-l-2 border-destructive/60 pl-3">
                    <p className="text-sm font-medium">{k['issue']}</p>
                    {k['why'] && <p className="mt-0.5 text-muted-foreground">{k['why']}</p>}
                    {k['supporting_info'] && <p className="text-muted-foreground">{k['supporting_info']}</p>}
                    {k['resolution_path'] && <p className="text-muted-foreground"><span className="text-foreground">Possible path: </span>{k['resolution_path']}</p>}
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{String(k['verification'] ?? "").replace(/_/g, " ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {((d.investigation.due_diligence ?? []) as Array<Record<string, string>>).length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Outstanding due diligence</p>
              <ul className="mt-2 space-y-2 text-xs">
                {((d.investigation.due_diligence ?? []) as Array<Record<string, string>>).map((it, i) => (
                  <li key={i} className="border-l-2 border-border pl-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{it['item']}</span>
                      <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                        {ddPriorityLabel(it['priority'] ?? "")}
                      </span>
                    </div>
                    {it['why'] && <p className="mt-0.5 text-muted-foreground">{it['why']}</p>}
                    {it['responsible_party'] && <p className="text-muted-foreground">Typically handled by: {it['responsible_party']}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Property information */}
          {Object.keys(d.investigation.property_info ?? {}).length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Property information</p>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(d.investigation.property_info as Record<string, string>).map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                    <dd>{v || "Requires confirmation"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Findings by category */}
          <div className="space-y-3">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Findings by category</p>
            {SI_FINDING_CATEGORIES.map((cat) => {
              const rows = d.findings.filter((f: Record<string, string>) => f['category'] === cat.id);
              if (!rows.length) return null;
              return (
                <div key={cat.id} className="rounded-xl border border-border bg-card/60 p-4">
                  <p className="text-sm font-semibold">{cat.label}</p>
                  <ul className="mt-2 space-y-2 text-xs">
                    {rows.map((f: Record<string, string>) => {
                      const cm = classificationMeta(f.classification);
                      return (
                        <li key={f.id} className="border-l-2 border-border pl-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{f.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ring-1 ${cm.klass}`}>{cm.label}</span>
                            <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                              {f.verification.replace(/_/g, " ")}
                            </span>
                          </div>
                          {f.detail && <p className="mt-1 text-muted-foreground">{f.detail}</p>}
                          {f.impact && <p className="mt-0.5 text-muted-foreground"><span className="text-foreground">Impact: </span>{f.impact}</p>}
                          {f.source_url && (
                            <a href={f.source_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-brand hover:underline">
                              {f.source_title || "Official source"} <ExternalLink className="size-3" />
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Permits */}
          {d.permits.length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Required permits & approvals (estimated sequence)</p>
              <ol className="mt-2 space-y-2 text-xs">
                {d.permits.map((p: Record<string, any>, i: number) => (
                  <li key={p.id} className="border-l-2 border-border pl-3">
                    <p className="text-sm font-medium">
                      {i + 1}. {p.approval}
                      {p.agency ? <span className="text-muted-foreground"> — {p.agency}</span> : null}
                      {p.concurrent && <span className="ml-2 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground ring-1 ring-border">concurrent</span>}
                    </p>
                    {p.why_required && <p className="mt-0.5 text-muted-foreground">{p.why_required}</p>}
                    {p.trigger_condition && <p className="text-muted-foreground">Trigger: {p.trigger_condition}</p>}
                    {p.timeline_estimate && <p className="text-muted-foreground">Estimated: {p.timeline_estimate} (estimate only)</p>}
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{p.verification.replace(/_/g, " ")}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Report sections */}
          <div className="space-y-3">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Full report</p>
            {((d.investigation.report?.sections ?? []) as Array<{ no: number; title: string; body: string; bullets: string[] }>).map((s) => (
              <div key={s.no} className="rounded-xl border border-border bg-card/60 p-4">
                <p className="text-sm font-semibold">
                  {s.no}. {s.title}
                </p>
                {s.body ? (
                  <p className="mt-1.5 whitespace-pre-line text-xs text-muted-foreground">{s.body}</p>
                ) : (
                  !(s.bullets ?? []).length && <p className="mt-1.5 text-xs text-muted-foreground">Requires confirmation — no verified information available.</p>
                )}
                {(s.bullets ?? []).length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {s.bullets.map((b, i) => (
                      <li key={i}>• {b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Timeline */}
          {((d.investigation.timeline ?? []) as Array<{ phase: string; duration: string; depends_on: string; notes: string }>).length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Estimated timeline (estimates only)</p>
              <ul className="mt-2 space-y-1 text-xs">
                {((d.investigation.timeline ?? []) as Array<{ phase: string; duration: string; depends_on: string; notes: string }>).map((t, i) => (
                  <li key={i}>
                    <span className="font-medium">{t.phase}</span>
                    <span className="text-muted-foreground">
                      {" "}— {t.duration || "TBD"}
                      {t.depends_on ? ` · after ${t.depends_on}` : ""}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sources */}
          {((d.investigation.sources ?? []) as Array<{ url: string; title: string }>).length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Official sources</p>
              <ul className="mt-2 space-y-1 text-xs">
                {((d.investigation.sources ?? []) as Array<{ url: string; title: string }>).map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                      {s.title || s.url} <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card/40 p-4">
            <div className="max-w-2xl space-y-1 text-xs text-muted-foreground">
              <p className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-sky-400" />
                {SITE_INVESTIGATION_DISCLAIMER}
              </p>
              <p>{UTILITY_CAPACITY_CAVEAT}</p>
              {((d.investigation.assumptions ?? []) as string[]).map((a, i) => (
                <p key={i}>• {a}</p>
              ))}
            </div>
            <ProfessionalReviewButton
              projectId={projectId}
              targetType="site_investigation"
              targetId={d.investigation.id}
              existing={d.professional_review}
              onDone={() => qc.invalidateQueries({ queryKey: ["site-investigation", currentId] })}
            />
          </div>
        </>
      )}

      {d?.investigation?.status === "error" && <p className="text-sm text-destructive">{d.investigation.error}</p>}
    </div>
  );
}
