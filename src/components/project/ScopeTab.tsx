import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getScope, upsertScope, TRADE_KEYS, type TradeKey } from "@/lib/scope.functions";
import { generateRoadmapFromRules } from "@/lib/roadmap.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, Sparkles, MapPin } from "lucide-react";
import { RoadmapView } from "./RoadmapView";

type TradeState = Record<string, { involved: "yes" | "no" | "unsure"; details?: Record<string, unknown> }>;

const TRADE_LABELS: Record<TradeKey, string> = {
  interior: "Interior",
  exterior: "Exterior",
  structural: "Structural",
  electrical: "Electrical",
  mechanical: "Mechanical",
  plumbing: "Plumbing",
  fire_alarm: "Fire alarm",
  fire_sprinkler: "Fire sprinkler / suppression",
  food_service: "Food service",
  signage: "Signage",
  site_dev: "Site development",
  grading: "Grading",
  stormwater: "Stormwater",
  row: "Right-of-way",
  utility: "Utility",
};

const PROJECT_TYPES: Array<{ v: string; l: string }> = [
  { v: "new_construction", l: "New construction" },
  { v: "tenant_improvement", l: "Tenant improvement" },
  { v: "change_of_occupancy", l: "Change of occupancy" },
  { v: "addition", l: "Addition" },
  { v: "alteration", l: "Alteration" },
  { v: "repair", l: "Repair" },
  { v: "demolition", l: "Demolition" },
  { v: "shell", l: "Shell" },
  { v: "core_and_shell", l: "Core & shell" },
  { v: "other", l: "Other" },
];

const CONSTRUCTION_TYPES = ["I-A", "I-B", "II-A", "II-B", "III-A", "III-B", "IV", "V-A", "V-B", "IRC"];

export function ScopeTab({ projectId, defaultAddress }: { projectId: string; defaultAddress?: string | null }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getScope);
  const saveFn = useServerFn(upsertScope);
  const genRoadmapFn = useServerFn(generateRoadmapFromRules);

  const q = useQuery({
    queryKey: ["scope", projectId],
    queryFn: () => getFn({ data: { project_id: projectId } }),
  });

  const initial = q.data?.scope ?? null;

  const [address, setAddress] = useState("");
  const [rc, setRc] = useState<"residential" | "commercial" | "mixed_use" | "">("");
  const [occExisting, setOccExisting] = useState("");
  const [occProposed, setOccProposed] = useState("");
  const [projectType, setProjectType] = useState<string>("");
  const [constructionType, setConstructionType] = useState<string>("");
  const [dwellingUnits, setDwellingUnits] = useState<string>("");
  const [value, setValue] = useState<string>(""); // dollars
  const [sqftGross, setSqftGross] = useState<string>("");
  const [sqftAffected, setSqftAffected] = useState<string>("");
  const [scopeText, setScopeText] = useState<string>("");
  const [trades, setTrades] = useState<TradeState>(() => {
    const out: TradeState = {};
    TRADE_KEYS.forEach((k) => (out[k] = { involved: "unsure" }));
    return out;
  });
  const [targetStart, setTargetStart] = useState<string>("");
  const [targetOpen, setTargetOpen] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!initial || hydrated) return;
    setAddress(initial.address ?? defaultAddress ?? "");
    setRc((initial.residential_or_commercial as typeof rc) ?? "");
    setOccExisting(initial.occupancy_existing ?? "");
    setOccProposed(initial.occupancy_proposed ?? "");
    setProjectType(initial.project_type ?? "");
    setConstructionType(initial.construction_type ?? "");
    setDwellingUnits(initial.dwelling_units != null ? String(initial.dwelling_units) : "");
    setValue(initial.construction_value_cents != null ? String(Math.round(initial.construction_value_cents / 100)) : "");
    setSqftGross(initial.sq_ft_gross != null ? String(initial.sq_ft_gross) : "");
    setSqftAffected(initial.sq_ft_affected != null ? String(initial.sq_ft_affected) : "");
    setScopeText(initial.scope_text ?? "");
    setTargetStart(initial.target_start_date ?? "");
    setTargetOpen(initial.target_open_date ?? "");
    if (initial.trades && typeof initial.trades === "object") {
      const t: TradeState = {};
      TRADE_KEYS.forEach((k) => {
        const v = (initial.trades as TradeState)[k];
        t[k] = v ?? { involved: "unsure" };
      });
      setTrades(t);
    }
    setHydrated(true);
  }, [initial, defaultAddress, hydrated]);

  useEffect(() => {
    // Prefill address on first load when no scope exists yet
    if (!q.isLoading && !initial && defaultAddress && !address) setAddress(defaultAddress);
  }, [q.isLoading, initial, defaultAddress, address]);

  const isCommercial = rc === "commercial" || rc === "mixed_use";
  const changeOfOcc = projectType === "change_of_occupancy";

  const foodService = trades.food_service?.involved === "yes";
  const fireSprinkler = trades.fire_sprinkler?.involved === "yes";
  const structural = trades.structural?.involved === "yes";
  const siteWork = ["site_dev", "grading", "stormwater"].some((k) => trades[k]?.involved === "yes");
  const rowWork = trades.row?.involved === "yes";
  const utilityWork = trades.utility?.involved === "yes";
  const signWork = trades.signage?.involved === "yes";

  const canSubmit = useMemo(() => {
    return Boolean(address.trim() && rc && projectType && scopeText.trim().length > 5);
  }, [address, rc, projectType, scopeText]);

  const save = async (status: "draft" | "submitted") => {
    setSaving(true);
    try {
      await saveFn({
        data: {
          project_id: projectId,
          address: address.trim() || null,
          residential_or_commercial: (rc || null) as "residential" | "commercial" | "mixed_use" | null,
          occupancy_existing: occExisting.trim() || null,
          occupancy_proposed: occProposed.trim() || null,
          project_type: (projectType || null) as
            | "new_construction"
            | "tenant_improvement"
            | "change_of_occupancy"
            | "addition"
            | "alteration"
            | "repair"
            | "demolition"
            | "shell"
            | "core_and_shell"
            | "other"
            | null,
          construction_type: constructionType || null,
          dwelling_units: dwellingUnits ? Number(dwellingUnits) : null,
          construction_value_cents: value ? Math.round(Number(value) * 100) : null,
          sq_ft_gross: sqftGross ? Number(sqftGross) : null,
          sq_ft_affected: sqftAffected ? Number(sqftAffected) : null,
          scope_text: scopeText.trim() || null,
          trades,
          target_start_date: targetStart || null,
          target_open_date: targetOpen || null,
          status,
        },
      });
      if (status === "submitted") {
        try {
          await genRoadmapFn({ data: { project_id: projectId } });
          toast.success("Scope submitted — roadmap generated");
          qc.invalidateQueries({ queryKey: ["roadmap", projectId] });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Roadmap generation failed");
        }
      } else {
        toast.success("Draft saved");
      }
      qc.invalidateQueries({ queryKey: ["scope", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (q.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading scope…</div>;
  }

  const setTrade = (k: TradeKey, v: "yes" | "no" | "unsure") =>
    setTrades((t) => ({ ...t, [k]: { ...t[k], involved: v } }));

  const setTradeDetail = (k: TradeKey, field: string, val: unknown) =>
    setTrades((t) => ({
      ...t,
      [k]: { ...t[k], details: { ...(t[k]?.details ?? {}), [field]: val } },
    }));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-mono uppercase tracking-widest text-brand">Scope of Work</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your project scope. Permivio will generate a jurisdiction-specific Permit Roadmap after submission.
            </p>
          </div>
          {initial?.status && (
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {initial.status}
            </span>
          )}
        </div>
      </div>

      {/* Location & classification */}
      <Section title="Location & Classification">
        <Field label="Project address" required>
          <div className="relative">
            <MapPin className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Baltimore, MD 21201" />
          </div>
        </Field>
        <Row>
          <Field label="Residential or commercial" required>
            <SegSelect
              value={rc}
              onChange={(v) => setRc(v as typeof rc)}
              options={[
                { v: "residential", l: "Residential" },
                { v: "commercial", l: "Commercial" },
                { v: "mixed_use", l: "Mixed use" },
              ]}
            />
          </Field>
          <Field label="Project type" required>
            <Select value={projectType} onChange={setProjectType} options={PROJECT_TYPES.map((p) => ({ v: p.v, l: p.l }))} />
          </Field>
        </Row>
        <Row>
          <Field label="Existing occupancy / use">
            <Input value={occExisting} onChange={(e) => setOccExisting(e.target.value)} placeholder="e.g. B — Business office" />
          </Field>
          <Field label="Proposed occupancy / use">
            <Input value={occProposed} onChange={(e) => setOccProposed(e.target.value)} placeholder="e.g. A-2 — Restaurant" />
          </Field>
        </Row>
        <Row>
          <Field label={isCommercial ? "Construction classification (IBC)" : "Construction classification"}>
            <Select
              value={constructionType}
              onChange={setConstructionType}
              options={CONSTRUCTION_TYPES.map((c) => ({ v: c, l: c }))}
              placeholder={isCommercial ? "Select IBC type" : "IRC (default) or IBC"}
            />
          </Field>
          {rc === "residential" && (
            <Field label="Dwelling units">
              <Input type="number" min={0} value={dwellingUnits} onChange={(e) => setDwellingUnits(e.target.value)} />
            </Field>
          )}
        </Row>
        <Row>
          <Field label="Construction value (USD)">
            <Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder="250000" />
          </Field>
          <Field label="Square footage (gross)">
            <Input type="number" min={0} value={sqftGross} onChange={(e) => setSqftGross(e.target.value)} />
          </Field>
          <Field label="Square footage (affected)">
            <Input type="number" min={0} value={sqftAffected} onChange={(e) => setSqftAffected(e.target.value)} />
          </Field>
        </Row>
      </Section>

      {/* Scope description */}
      <Section title="Scope Description">
        <Field label="Detailed scope of work" required>
          <Textarea
            rows={6}
            value={scopeText}
            onChange={(e) => setScopeText(e.target.value)}
            placeholder="Describe the work: demo, framing, MEP, finishes, exterior, site changes, etc."
          />
        </Field>
        {changeOfOcc && (
          <p className="text-[11px] text-amber-500">
            Change of occupancy triggers re-evaluation of egress, plumbing fixture counts, fire separation, accessibility, and CofO re-issuance.
          </p>
        )}
      </Section>

      {/* Trades */}
      <Section title="Trade Involvement">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TRADE_KEYS.map((k) => (
            <div key={k} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
              <span className="text-sm">{TRADE_LABELS[k]}</span>
              <SegSelect
                value={trades[k]?.involved ?? "unsure"}
                onChange={(v) => setTrade(k, v as "yes" | "no" | "unsure")}
                options={[
                  { v: "yes", l: "Yes" },
                  { v: "no", l: "No" },
                  { v: "unsure", l: "?" },
                ]}
                compact
              />
            </div>
          ))}
        </div>

        {/* Conditional detail groups */}
        {isCommercial && foodService && (
          <ConditionalCard title="Food service details">
            <Row>
              <Field label="Seating count">
                <Input
                  type="number"
                  min={0}
                  value={String(trades.food_service?.details?.seating ?? "")}
                  onChange={(e) => setTradeDetail("food_service", "seating", Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Grease-producing equipment">
                <SegSelect
                  value={String(trades.food_service?.details?.grease ?? "no")}
                  onChange={(v) => setTradeDetail("food_service", "grease", v)}
                  options={[
                    { v: "yes", l: "Yes" },
                    { v: "no", l: "No" },
                  ]}
                  compact
                />
              </Field>
              <Field label="Hood type">
                <Select
                  value={String(trades.food_service?.details?.hood ?? "")}
                  onChange={(v) => setTradeDetail("food_service", "hood", v)}
                  options={[
                    { v: "none", l: "None" },
                    { v: "type_i", l: "Type I" },
                    { v: "type_ii", l: "Type II" },
                  ]}
                />
              </Field>
            </Row>
          </ConditionalCard>
        )}

        {fireSprinkler && (
          <ConditionalCard title="Fire sprinkler details">
            <Row>
              <Field label="NFPA standard">
                <Select
                  value={String(trades.fire_sprinkler?.details?.nfpa ?? "")}
                  onChange={(v) => setTradeDetail("fire_sprinkler", "nfpa", v)}
                  options={[
                    { v: "13", l: "NFPA 13" },
                    { v: "13R", l: "NFPA 13R" },
                    { v: "13D", l: "NFPA 13D" },
                  ]}
                />
              </Field>
              <Field label="Scope">
                <SegSelect
                  value={String(trades.fire_sprinkler?.details?.scope ?? "modification")}
                  onChange={(v) => setTradeDetail("fire_sprinkler", "scope", v)}
                  options={[
                    { v: "new", l: "New system" },
                    { v: "modification", l: "Modification" },
                  ]}
                  compact
                />
              </Field>
            </Row>
          </ConditionalCard>
        )}

        {structural && (
          <ConditionalCard title="Structural details">
            <Row>
              <Field label="Load-bearing walls">
                <SegSelect
                  value={String(trades.structural?.details?.loadbearing ?? "no")}
                  onChange={(v) => setTradeDetail("structural", "loadbearing", v)}
                  options={[
                    { v: "yes", l: "Yes" },
                    { v: "no", l: "No" },
                  ]}
                  compact
                />
              </Field>
              <Field label="Foundation work">
                <SegSelect
                  value={String(trades.structural?.details?.foundation ?? "no")}
                  onChange={(v) => setTradeDetail("structural", "foundation", v)}
                  options={[
                    { v: "yes", l: "Yes" },
                    { v: "no", l: "No" },
                  ]}
                  compact
                />
              </Field>
            </Row>
          </ConditionalCard>
        )}

        {siteWork && (
          <ConditionalCard title="Site development details">
            <Row>
              <Field label="Disturbed area (sq ft)">
                <Input
                  type="number"
                  min={0}
                  value={String(trades.site_dev?.details?.disturbed_sqft ?? "")}
                  onChange={(e) => setTradeDetail("site_dev", "disturbed_sqft", Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Impervious added (sq ft)">
                <Input
                  type="number"
                  min={0}
                  value={String(trades.site_dev?.details?.impervious_sqft ?? "")}
                  onChange={(e) => setTradeDetail("site_dev", "impervious_sqft", Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Floodplain proximity">
                <SegSelect
                  value={String(trades.site_dev?.details?.floodplain ?? "unsure")}
                  onChange={(v) => setTradeDetail("site_dev", "floodplain", v)}
                  options={[
                    { v: "yes", l: "Yes" },
                    { v: "no", l: "No" },
                    { v: "unsure", l: "?" },
                  ]}
                  compact
                />
              </Field>
            </Row>
          </ConditionalCard>
        )}

        {rowWork && (
          <ConditionalCard title="Right-of-way details">
            <Row>
              <Field label="Work types">
                <Input
                  value={String(trades.row?.details?.types ?? "")}
                  onChange={(e) => setTradeDetail("row", "types", e.target.value)}
                  placeholder="Sidewalk, curb cut, lane closure…"
                />
              </Field>
            </Row>
          </ConditionalCard>
        )}

        {utilityWork && (
          <ConditionalCard title="Utility details">
            <Row>
              <Field label="Services affected">
                <Input
                  value={String(trades.utility?.details?.services ?? "")}
                  onChange={(e) => setTradeDetail("utility", "services", e.target.value)}
                  placeholder="Water, sewer, gas, electric, telecom"
                />
              </Field>
              <Field label="New service or modification">
                <SegSelect
                  value={String(trades.utility?.details?.action ?? "modification")}
                  onChange={(v) => setTradeDetail("utility", "action", v)}
                  options={[
                    { v: "new", l: "New service" },
                    { v: "modification", l: "Modification" },
                  ]}
                  compact
                />
              </Field>
            </Row>
          </ConditionalCard>
        )}

        {signWork && (
          <ConditionalCard title="Signage details">
            <Row>
              <Field label="Sign type">
                <Select
                  value={String(trades.signage?.details?.sign_type ?? "")}
                  onChange={(v) => setTradeDetail("signage", "sign_type", v)}
                  options={[
                    { v: "wall", l: "Wall" },
                    { v: "freestanding", l: "Freestanding" },
                    { v: "illuminated", l: "Illuminated" },
                    { v: "electronic", l: "Electronic" },
                  ]}
                />
              </Field>
              <Field label="Historic district">
                <SegSelect
                  value={String(trades.signage?.details?.historic ?? "no")}
                  onChange={(v) => setTradeDetail("signage", "historic", v)}
                  options={[
                    { v: "yes", l: "Yes" },
                    { v: "no", l: "No" },
                    { v: "unsure", l: "?" },
                  ]}
                  compact
                />
              </Field>
            </Row>
          </ConditionalCard>
        )}
      </Section>

      {/* Dates */}
      <Section title="Target Dates">
        <Row>
          <Field label="Target construction start">
            <Input type="date" value={targetStart} onChange={(e) => setTargetStart(e.target.value)} />
          </Field>
          <Field label="Target opening / TCO">
            <Input type="date" value={targetOpen} onChange={(e) => setTargetOpen(e.target.value)} />
          </Field>
        </Row>
      </Section>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={() => save("draft")} disabled={saving}>
          <Save className="size-4 mr-1.5" /> Save draft
        </Button>
        <Button onClick={() => save("submitted")} disabled={saving || !canSubmit}>
          <Sparkles className="size-4 mr-1.5" /> Submit for roadmap
        </Button>
      </div>
      {!canSubmit && (
        <p className="text-[11px] text-muted-foreground text-right">
          Address, residential/commercial, project type, and scope description are required to submit.
        </p>
      )}

      <div className="pt-6 border-t border-border">
        <RoadmapView projectId={projectId} />
      </div>
    </div>
  );
}

// ---- Small local UI helpers (reuse existing tokens; no new design) ----
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">{children}</div>
    </section>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label} {required && <span className="text-brand">*</span>}
      </Label>
      {children}
    </div>
  );
}
function ConditionalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-brand/30 bg-brand/5 p-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-widest text-brand">{title}</div>
      {children}
    </div>
  );
}
function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}
function SegSelect({
  value,
  onChange,
  options,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
  compact?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-md border border-border overflow-hidden ${compact ? "text-[11px]" : "text-xs"}`}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1.5 font-mono uppercase tracking-wider ${
            value === o.v ? "bg-brand text-brand-foreground" : "bg-background hover:bg-muted text-muted-foreground"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
