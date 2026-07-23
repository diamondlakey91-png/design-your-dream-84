import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, ShieldCheck, AlertTriangle, RefreshCw, CheckCircle2, HelpCircle, Building2 } from "lucide-react";
import {
  resolveAddress,
  confirmJurisdiction,
  getJurisdictionConfirmation,
  requestJurisdictionHumanReview,
} from "@/lib/jurisdiction.functions";

const ROLE_LABEL: Record<string, string> = {
  building: "Building",
  planning_zoning: "Planning & Zoning",
  fire: "Fire",
  health: "Health",
  public_works: "Public Works",
  site_development: "Site Development",
  environmental: "Environmental",
  transportation_row: "Transportation / ROW",
  utility_water: "Water Utility",
  utility_sewer: "Sewer Utility",
  utility_electric: "Electric Utility",
  utility_gas: "Gas Utility",
  stormwater: "Stormwater",
  historic: "Historic Preservation",
  floodplain: "Floodplain",
  other: "Other",
};

export function JurisdictionConfirmCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getJurisdictionConfirmation);
  const resolveFn = useServerFn(resolveAddress);
  const confirmFn = useServerFn(confirmJurisdiction);
  const humanFn = useServerFn(requestJurisdictionHumanReview);

  const q = useQuery({
    queryKey: ["jurisdiction-confirmation", projectId],
    queryFn: () => getFn({ data: { project_id: projectId } }),
  });

  const c = q.data?.confirmation;
  const jurisdiction = q.data?.jurisdiction;
  const candidates = q.data?.candidates ?? [];

  const [editing, setEditing] = useState(!c);
  const [street, setStreet] = useState(c?.street ?? "");
  const [suite, setSuite] = useState(c?.suite ?? "");
  const [city, setCity] = useState(c?.city ?? "");
  const [state, setState] = useState(c?.state ?? "");
  const [zip, setZip] = useState(c?.zip ?? "");
  const [parcel, setParcel] = useState(c?.parcel_number ?? "");
  const [busy, setBusy] = useState<null | "resolve" | "confirm" | "human">(null);

  const status = c?.status ?? "unconfirmed";
  const isConfirmed = status === "user_confirmed" || status === "human_verified";

  const resolve = async () => {
    setBusy("resolve");
    try {
      const res = await resolveFn({
        data: {
          project_id: projectId,
          street: street.trim(),
          suite: suite.trim() || null,
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zip: zip.trim(),
          parcel_number: parcel.trim() || null,
        },
      });
      if (res.low_confidence) {
        toast.warning("Address could not be geocoded precisely. Refine and try again.");
      } else {
        toast.success("Jurisdiction resolved — review authorities and confirm.");
      }
      qc.invalidateQueries({ queryKey: ["jurisdiction-confirmation", projectId] });
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resolve address");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    setBusy("confirm");
    try {
      await confirmFn({ data: { project_id: projectId, mode: "user_confirmed" } });
      toast.success("Jurisdiction confirmed");
      qc.invalidateQueries({ queryKey: ["jurisdiction-confirmation", projectId] });
      qc.invalidateQueries({ queryKey: ["roadmap", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setBusy(null);
    }
  };

  const requestHuman = async () => {
    setBusy("human");
    try {
      await humanFn({ data: { project_id: projectId } });
      toast.success("Human verification requested");
      qc.invalidateQueries({ queryKey: ["jurisdiction-confirmation", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to request review");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-mono uppercase tracking-widest text-brand flex items-center gap-2">
            <MapPin className="size-3.5" /> Jurisdiction Confirmation
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            A ZIP code is not an authority. PERMIVIO resolves the exact building, planning, fire, health and public-works authority for the property before generating a verified roadmap.
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {(editing || !c) && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <div className="md:col-span-4">
            <Label className="text-[11px] text-muted-foreground">Street</Label>
            <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Duke of Gloucester St" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Suite / Unit</Label>
            <Input value={suite} onChange={(e) => setSuite(e.target.value)} placeholder="Optional" />
          </div>
          <div className="md:col-span-3">
            <Label className="text-[11px] text-muted-foreground">City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Annapolis" />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">State</Label>
            <Input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} placeholder="MD" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] text-muted-foreground">ZIP</Label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="21401" />
          </div>
          <div className="md:col-span-6">
            <Label className="text-[11px] text-muted-foreground">Parcel / Tax Account (optional)</Label>
            <Input value={parcel} onChange={(e) => setParcel(e.target.value)} placeholder="Optional" />
          </div>
          <div className="md:col-span-6 flex items-center gap-2 pt-1">
            <Button size="sm" onClick={resolve} disabled={!!busy || !street || !city || !state || !zip}>
              <RefreshCw className="size-4 mr-1.5" />
              {busy === "resolve" ? "Resolving…" : c ? "Re-resolve" : "Resolve jurisdiction"}
            </Button>
            {c && (
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            )}
          </div>
        </div>
      )}

      {c && !editing && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="Standardized address" value={c.formatted_address ?? `${c.street}${c.suite ? " " + c.suite : ""}, ${c.city}, ${c.state} ${c.zip}`} />
            <Field label="Parcel / Tax account" value={c.parcel_number ?? "—"} />
            <Field label="Municipality" value={jurisdiction?.municipality ?? (jurisdiction?.incorporated ? "—" : "Unincorporated")} />
            <Field label="County" value={jurisdiction ? `${jurisdiction.county} County` : "—"} />
            <Field label="State" value={jurisdiction?.state ?? c.state} />
            <Field label="Incorporated" value={jurisdiction?.incorporated ? "Inside city limits" : "Unincorporated area"} />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Building2 className="size-3.5" /> Reviewing Authorities
            </div>
            {candidates.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-400 mt-0.5" />
                <span>Exact authorities need confirmation for this jurisdiction. Request human verification below, or proceed with the roadmap marked "Needs Confirmation".</span>
              </div>
            )}
            {candidates.map((a) => (
              <div key={`${a.role}-${a.official_name}`} className="rounded-md border border-border p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{ROLE_LABEL[a.role] ?? a.role}</div>
                  <div className="text-sm font-medium">{a.official_name}</div>
                  {a.department && <div className="text-xs text-muted-foreground">{a.department}</div>}
                  <div className="text-xs text-muted-foreground mt-0.5">{a.responsibility}</div>
                  {(a.website || a.portal_url) && (
                    <a href={a.portal_url ?? a.website ?? "#"} target="_blank" rel="noreferrer" className="text-xs text-brand mt-1 inline-block">
                      {a.portal_url ? "Open portal" : "Agency website"} ↗
                    </a>
                  )}
                </div>
                <VerifBadge v={a.verification} />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!isConfirmed && (
              <Button size="sm" onClick={confirm} disabled={!!busy || !q.data?.jurisdiction}>
                <CheckCircle2 className="size-4 mr-1.5" />
                {busy === "confirm" ? "Confirming…" : "Confirm jurisdictions"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={!!busy}>
              Correct location
            </Button>
            <Button size="sm" variant="outline" onClick={requestHuman} disabled={!!busy}>
              <HelpCircle className="size-4 mr-1.5" />
              {busy === "human" ? "Requesting…" : "Request human verification"}
            </Button>
          </div>

          {!isConfirmed && (
            <div className="rounded-md border border-border bg-muted/30 p-3 flex items-start gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 mt-0.5 shrink-0" />
              <span>The roadmap cannot be marked "Verified" until the jurisdiction is confirmed by you or by human review.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm truncate">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "human_verified")
    return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 border">Human-verified</Badge>;
  if (status === "user_confirmed")
    return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 border">Confirmed by user</Badge>;
  if (status === "pending_review")
    return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 border">Pending human review</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 border">Unconfirmed</Badge>;
}

function VerifBadge({ v }: { v: string }) {
  const label = v === "verified" ? "Verified" : v === "ai_assisted" ? "AI-Assisted" : "Needs Confirmation";
  const cls =
    v === "verified"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : v === "ai_assisted"
        ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
        : "bg-amber-500/10 text-amber-400 border-amber-500/30";
  return <span className={`text-[10px] font-mono uppercase tracking-widest border px-2 py-0.5 rounded ${cls} shrink-0`}>{label}</span>;
}
