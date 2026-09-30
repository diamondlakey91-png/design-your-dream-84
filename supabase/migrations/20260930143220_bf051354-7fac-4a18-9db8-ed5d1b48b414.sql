CREATE TABLE public.code_adoption_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer text NOT NULL DEFAULT 'state' CHECK (layer IN ('federal','state','local')),
  state text NOT NULL,
  jurisdiction_key text,
  family text NOT NULL,
  edition text,
  model text,
  adopted date,
  effective_from date,
  effective_to date,
  source_published_at date,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  authority text NOT NULL,
  source_type text NOT NULL,
  url text NOT NULL,
  quote text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  proposed boolean NOT NULL DEFAULT false,
  local_only boolean NOT NULL DEFAULT false,
  resolved_status text,
  superseded_by uuid REFERENCES public.code_adoption_evidence(id) ON DELETE SET NULL,
  recheck_after date,
  source_status text NOT NULL DEFAULT 'ok',
  discovered_by text NOT NULL DEFAULT 'seed',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX code_adoption_evidence_uniq ON public.code_adoption_evidence (state, coalesce(jurisdiction_key,''), family, coalesce(edition,''), url);
CREATE INDEX code_adoption_evidence_lookup ON public.code_adoption_evidence (state, family);
GRANT SELECT ON public.code_adoption_evidence TO authenticated;
GRANT ALL ON public.code_adoption_evidence TO service_role;
ALTER TABLE public.code_adoption_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read code adoption evidence" ON public.code_adoption_evidence FOR SELECT TO authenticated USING (true);
CREATE TRIGGER code_adoption_evidence_touch BEFORE UPDATE ON public.code_adoption_evidence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();