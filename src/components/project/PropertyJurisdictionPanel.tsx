import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Landmark, ShieldCheck, ShieldAlert, ShieldQuestion, HelpCircle, AlertTriangle, Loader2, Building2 } from "lucide-react";
import { runParcelJurisdiction } from "@/features/agents/parcelJurisdiction.functions";

/**
 * Property, Parcel & Jurisdiction Agent — client-facing panel.
 *
 * Presentation only: the agent runs server-side and returns client-safe
 * results. Nothing here asserts code compliance or approval; every row shows
 * its verification label and whether professional confirmation is required.
 */

type Ref = { source_key: string };
type Normalization = {
  normalized_address: string;
  postal_city: string | null;
  place_in_control: string | null;
  incorporation_status: string;
  postal_city_is_controlling: boolean | null;
  postal_city_note: string;
  county: string | null;
  state: string | null;
  postal_code: string | null;
  verification_status: string;
  confidence: string;
  source_refs: Ref[];
};
type Parcel = {
  parcel_id: string | null;
  parcel_id_type: string | null;
  owner_of_record: string | null;
  acreage: string | null;
  spans_multiple_parcels: boolean;
  boundary_note: string | null;
  verification_status: string;
};
type MatrixRow = {
  function: string;
  authority_name: string;
  authority_level: string;
  controls: string;
  contact_or_portal: string | null;
  verification_status: string;
  notes: string | null;
};
type Overlay = { name: string; kind: string; effect: string; verification_status: string };
type Finding = {
  title: string;
  finding: string;
  explanation: string;
  status_label: string;
  agency: string | null;
  risk_level: string;
  recommendation: string | null;
  confirmation_required: boolean;
};
type Question = { question: string; why_it_matters: string; blocking: boolean; who_can_answer: string | null };

type Geography = {
  determination: { place_in_control: string | null; incorporation_status: string; postal_city_is_controlling: boolean | null; note: string; authoritative: boolean };
  census: {
    place: { name: string; geoid: string } | null;
    countySubdivision: { name: string } | null;
    county: string | null;
    state: string | null;
    tract: string | null;
    block: string | null;
  } | null;
  flood: { zone: string; subtype: string | null; sfha: boolean | null; firmPanel: string | null } | null;
  unavailable: string[];
  sources: Array<{ source_key: string; title: string; url: string }>;
};

type Result = {
  runId: string;
  geography?: Geography;
  addressNormalization: Normalization;
  parcels: Parcel[];
  jurisdictionMatrix: MatrixRow[];
  overlays: Overlay[];
  findings: Finding[];
  clientQuestions: Question[];
  missingInformation: string[];
  conflicts: Array<{ topic?: string; description?: string }> | unknown[];
  summary: string;
};

const LABELS: Record<string, string> = {
  verified: "Verified",
  preliminary_analysis: "Preliminary Analysis",
  pending_confirmation: "Pending Confirmation",
  client_input_required: "Client Input Required",
  not_available: "Not Available",
  conflict_detected: "Conflict Detected",
  superseded: "Superseded",
};

function StatusChip({ status }: { status: string }) {
  const label = LABELS[status] ?? status.replace(/_/g, " ");
  const klass =
    status === "verified"
      ? "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30"
      : status === "conflict_detected" || status === "not_available"
        ? "text-red-400 bg-red-500/10 ring-red-500/30"
        : status === "preliminary_analysis" || status === "pending_confirmation" || status === "client_input_required"
          ? "text-sky-400 bg-sky-500/10 ring-sky-500/30"
          : "text-muted-foreground bg-muted/40 ring-border";
  const Icon = status === "verified" ? ShieldCheck : status === "not_available" ? ShieldQuestion : ShieldAlert;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest ring-1 ${klass}`}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

const fmtFunction = (f: string) => f.replace(/_/g, " ");

export function PropertyJurisdictionPanel({
  projectId,
  defaultAddress,
  projectType,
}: {
  projectId: string;
  defaultAddress?: string | null;
  projectType?: string | null;
}) {
  const runFn = useServerFn(runParcelJurisdiction);
  const [address, setAddress] = useState(defaultAddress ?? "");
  const [parcelId, setParcelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    if (address.trim().length < 5) {
      toast.error("Enter the full site address.");
      return;
    }
    setBusy(true);
    try {
      const res = await runFn({
        data: {
          address: address.trim(),
          parcelId: parcelId.trim() || null,
          projectId,
          projectType: projectType ?? null,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res as unknown as Result);
      toast.success("Property research complete");
    } catch {
      toast.error("Could not complete the property research. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const n = result?.addressNormalization;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-mono uppercase tracking-widest text-foreground">Property, parcel &amp; jurisdiction</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
              Permivio researches the parcel and every authority that controls a permitting function at this location. A mailing
              city is never treated as proof of permitting control.
            </p>
          </div>
          <Building2 className="size-5 text-brand shrink-0" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <div>
            <Label htmlFor="pj-address" className="text-xs">Site address</Label>
            <Input id="pj-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1234 Main St, Rockville, MD 20850" />
          </div>
          <div>
            <Label htmlFor="pj-parcel" className="text-xs">Parcel / tax ID (optional)</Label>
            <Input id="pj-parcel" value={parcelId} onChange={(e) => setParcelId(e.target.value)} placeholder="04-00123456" />
          </div>
          <Button onClick={run} disabled={busy} className="w-full sm:w-auto">
            {busy ? <><Loader2 className="size-4 animate-spin" /> Researching…</> : "Run research"}
          </Button>
        </div>
        {busy && (
          <p className="mt-3 text-xs text-muted-foreground">
            Confirming the property and retrieving official parcel, boundary and agency records. This can take a minute.
          </p>
        )}
      </section>

      {result && n && (
        <>
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-brand" />
              <h4 className="text-xs font-mono uppercase tracking-widest">Confirmed property</h4>
              <StatusChip status={n.verification_status} />
            </div>
            <p className="mt-3 text-sm text-foreground">{n.normalized_address}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              {[
                ["Mailing city", n.postal_city],
                ["Place in control", n.place_in_control],
                ["Incorporation status", fmtFunction(n.incorporation_status)],
                ["County", n.county],
                ["State", n.state],
                ["ZIP", n.postal_code],
                ["Confidence", n.confidence],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-foreground">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 rounded border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-200">{n.postal_city_note}</p>
          </section>

          {result.geography && (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-mono uppercase tracking-widest">Official boundary record</h4>
                <StatusChip status={result.geography.determination.authoritative ? "verified" : "not_available"} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Read directly from government GIS services — U.S. Census Bureau TIGER boundaries, the FCC block API and the FEMA National Flood Hazard Layer. These values are not AI-generated.
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                {[
                  ["Incorporated place at this point", result.geography.census?.place?.name ?? (result.geography.determination.authoritative ? "None — unincorporated" : null)],
                  ["Township / MCD", result.geography.census?.countySubdivision?.name ?? null],
                  ["County of record", result.geography.census?.county ?? null],
                  ["State", result.geography.census?.state ?? null],
                  ["FEMA flood zone", result.geography.flood ? `${result.geography.flood.zone}${result.geography.flood.sfha ? " (SFHA)" : ""}` : null],
                  ["FIRM panel", result.geography.flood?.firmPanel ?? null],
                  ["Census tract", result.geography.census?.tract ?? null],
                  ["2020 block", result.geography.census?.block ?? null],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
              {result.geography.unavailable.length > 0 && (
                <p className="mt-4 rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Not reachable on this run — confirm these directly: {result.geography.unavailable.join("; ")}.
                </p>
              )}
              {result.geography.sources.length > 0 && (
                <ul className="mt-4 space-y-1 text-xs">
                  {result.geography.sources.map((sr) => (
                    <li key={sr.source_key}>
                      <a href={sr.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                        {sr.source_key} — {sr.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {result.parcels.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h4 className="text-xs font-mono uppercase tracking-widest">Parcel record{result.parcels.length > 1 ? "s" : ""}</h4>
              <div className="mt-3 space-y-3">
                {result.parcels.map((p, i) => (
                  <div key={`${p.parcel_id ?? i}`} className="rounded border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-foreground">{p.parcel_id ?? "Parcel ID not retrieved"}</span>
                      {p.parcel_id_type && <span className="text-xs text-muted-foreground">({p.parcel_id_type})</span>}
                      <StatusChip status={p.verification_status} />
                      {p.spans_multiple_parcels && (
                        <span className="text-[10px] font-mono uppercase tracking-widest text-sky-400">Spans multiple parcels</span>
                      )}
                    </div>
                    <dl className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
                      <div><dt className="text-muted-foreground">Owner of record</dt><dd>{p.owner_of_record ?? "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Acreage</dt><dd>{p.acreage ?? "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Boundary note</dt><dd>{p.boundary_note ?? "—"}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Landmark className="size-4 text-brand" />
              <h4 className="text-xs font-mono uppercase tracking-widest">Jurisdictional responsibility matrix</h4>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-mono uppercase tracking-widest">Function</th>
                    <th className="py-2 pr-3 font-mono uppercase tracking-widest">Authority</th>
                    <th className="py-2 pr-3 font-mono uppercase tracking-widest">Level</th>
                    <th className="py-2 pr-3 font-mono uppercase tracking-widest">Controls</th>
                    <th className="py-2 pr-3 font-mono uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.jurisdictionMatrix.map((r) => (
                    <tr key={r.function} className="border-t border-border align-top">
                      <td className="py-2 pr-3 capitalize text-foreground">{fmtFunction(r.function)}</td>
                      <td className="py-2 pr-3">
                        <span className="text-foreground">{r.authority_name}</span>
                        {r.contact_or_portal && <div className="text-muted-foreground">{r.contact_or_portal}</div>}
                      </td>
                      <td className="py-2 pr-3 capitalize text-muted-foreground">{r.authority_level}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {r.controls}
                        {r.notes && <div className="mt-1 text-muted-foreground/80">{r.notes}</div>}
                      </td>
                      <td className="py-2 pr-3"><StatusChip status={r.verification_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {result.overlays.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h4 className="text-xs font-mono uppercase tracking-widest">Overlays &amp; special districts</h4>
              <ul className="mt-3 space-y-2 text-xs">
                {result.overlays.map((o) => (
                  <li key={o.name} className="rounded border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-foreground">{o.name}</span>
                      <span className="text-muted-foreground">{o.kind}</span>
                      <StatusChip status={o.verification_status} />
                    </div>
                    <p className="mt-1 text-muted-foreground">{o.effect}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.findings.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h4 className="text-xs font-mono uppercase tracking-widest">Findings</h4>
              <ul className="mt-3 space-y-3">
                {result.findings.map((f, i) => (
                  <li key={`${f.title}-${i}`} className="rounded border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-foreground">{f.title}</span>
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest ring-1 ring-border bg-muted/40 text-muted-foreground">
                        {f.status_label}
                      </span>
                      {f.agency && <span className="text-xs text-muted-foreground">{f.agency}</span>}
                      {f.risk_level !== "none" && (
                        <span className={`text-[10px] font-mono uppercase tracking-widest ${f.risk_level === "high" ? "text-red-400" : f.risk_level === "medium" ? "text-sky-400" : "text-muted-foreground"}`}>
                          {f.risk_level} risk
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-foreground">{f.finding}</p>
                    {f.explanation && <p className="mt-1 text-xs text-muted-foreground">{f.explanation}</p>}
                    {f.recommendation && <p className="mt-1 text-xs text-brand">Next step: {f.recommendation}</p>}
                    {f.confirmation_required && (
                      <p className="mt-1 text-[11px] text-muted-foreground">Requires confirmation with the responsible agency.</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.clientQuestions.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <HelpCircle className="size-4 text-brand" />
                <h4 className="text-xs font-mono uppercase tracking-widest">Information needed from you</h4>
              </div>
              <ul className="mt-3 space-y-2 text-xs">
                {result.clientQuestions.map((q, i) => (
                  <li key={i} className="rounded border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground">{q.question}</span>
                      {q.blocking && <span className="text-[10px] font-mono uppercase tracking-widest text-red-400">Blocking</span>}
                    </div>
                    <p className="mt-1 text-muted-foreground">{q.why_it_matters}</p>
                    {q.who_can_answer && <p className="mt-1 text-muted-foreground/80">Who can answer: {q.who_can_answer}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.missingInformation.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-sky-400" />
                <h4 className="text-xs font-mono uppercase tracking-widest">Not yet available</h4>
              </div>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                {result.missingInformation.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-border bg-card p-5">
            <h4 className="text-xs font-mono uppercase tracking-widest">Summary</h4>
            <p className="mt-2 text-xs text-muted-foreground">{result.summary}</p>
            <p className="mt-4 text-[11px] text-muted-foreground border-t border-border pt-3">
              AI-assisted research prepared for professional review. Findings are not code determinations, approvals or
              engineering conclusions. A licensed professional and the responsible agencies must confirm jurisdiction,
              parcel data and applicable requirements before you rely on them.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
