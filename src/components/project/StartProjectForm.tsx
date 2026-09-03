import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { createProject } from "@/lib/projects.functions";
import { geocodeAddress } from "@/lib/geocoding.functions";
import { setProjectTypeForProject } from "@/lib/projectTypes.functions";
import { useProjectTypes } from "@/hooks/useProjectTypes";
import { JurisdictionAutocomplete } from "@/components/JurisdictionAutocomplete";
import { ProjectTypeSelector } from "@/components/project-type/ProjectTypeSelector";

/**
 * The single canonical "Start a Project" form.
 * Every entry point in the app (dashboard, project board, empty states, public
 * landing CTA) routes to /start and renders this one component — no parallel
 * project-creation flows.
 */
export function StartProjectForm({ onCreated }: { onCreated?: (projectId: string) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createFn = useServerFn(createProject);
  const geocodeFn = useServerFn(geocodeAddress);
  const setTypeFn = useServerFn(setProjectTypeForProject);
  const { byId } = useProjectTypes();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [projectType, setProjectType] = useState("Tenant Fit-Out");
  const [primaryTypeId, setPrimaryTypeId] = useState<string | null>(null);
  const [permitCount, setPermitCount] = useState(3);
  const [geocodeVerified, setGeocodeVerified] = useState(false);

  const verifyMut = useMutation({
    mutationFn: () => geocodeFn({ data: { address: location } }),
    onSuccess: (res) => {
      setLocation(res.formatted_address);
      setJurisdiction(res.jurisdiction);
      setGeocodeVerified(true);
      toast.success("Address verified");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't verify that address"),
  });

  const mut = useMutation({
    mutationFn: async () => {
      const row = await createFn({
        data: { name, location, jurisdiction, project_type: projectType, permit_count: permitCount },
      });
      if (primaryTypeId) {
        await setTypeFn({
          data: {
            project_id: row.id,
            primary_project_type_id: primaryTypeId,
            additional_project_type_ids: [],
            source: "user_selected",
          },
        }).catch(() => {});
      }
      return row;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["client-dashboard"] });
      toast.success("Project created — let's finish your intake");
      if (onCreated) onCreated(row.id);
      else navigate({ to: "/projects/$id", params: { id: row.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) mut.mutate();
      }}
      className="flex flex-col gap-3"
    >
      <Field label="Project name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Riverside Plaza"
          className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary"
        />
      </Field>

      <Field label="Project address">
        <div className="flex gap-2">
          <input
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setGeocodeVerified(false);
            }}
            placeholder="1200 Main St, Cleveland, OH"
            className="h-11 flex-1 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={!location.trim() || verifyMut.isPending}
            onClick={() => verifyMut.mutate()}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-medium disabled:opacity-40"
          >
            {verifyMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />}
            Verify
          </button>
        </div>
      </Field>

      <Field label="Jurisdiction">
        <JurisdictionAutocomplete
          value={jurisdiction}
          onChange={(v) => {
            setJurisdiction(v);
            setGeocodeVerified(false);
          }}
          placeholder="Cuyahoga County, OH"
        />
        {geocodeVerified && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="size-3.5" /> Address resolved — confirm the controlling agencies during intake
          </span>
        )}
      </Field>

      <Field label="What are you doing?">
        <ProjectTypeSelector
          mode="single"
          value={{ primaryId: primaryTypeId }}
          onChange={(v) => {
            setPrimaryTypeId(v.primaryId ?? null);
            const t = v.primaryId ? byId.get(v.primaryId) : null;
            if (t) setProjectType(t.client_label);
          }}
          label=""
          helperText=""
        />
      </Field>

      <Field label="Estimated permit count">
        <input
          type="number"
          min={1}
          max={20}
          value={permitCount}
          onChange={(e) => setPermitCount(parseInt(e.target.value) || 1)}
          className="h-11 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary"
        />
      </Field>

      <button
        type="submit"
        disabled={mut.isPending}
        className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_10px_40px_-8px_oklch(0.66_0.19_258/0.6)] disabled:opacity-50"
      >
        {mut.isPending ? "Creating…" : "Create project & continue"}
      </button>
      <p className="text-xs text-muted-foreground">
        Next you'll confirm the jurisdiction and answer a few questions so Permivio can build your permit roadmap.
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
