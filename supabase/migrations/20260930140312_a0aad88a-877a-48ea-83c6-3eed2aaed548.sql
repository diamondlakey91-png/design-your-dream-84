ALTER TABLE public.project_regulatory_facts
  ADD COLUMN IF NOT EXISTS requirement_type text,
  ADD COLUMN IF NOT EXISTS source_status text,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE public.permit_items ADD COLUMN IF NOT EXISTS requirement_type text;

CREATE TABLE public.regulatory_source_health (
  provider text PRIMARY KEY,
  label text NOT NULL,
  endpoint text,
  status text NOT NULL DEFAULT 'unknown',
  last_ok_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regulatory_source_health TO authenticated;
GRANT ALL ON public.regulatory_source_health TO service_role;
ALTER TABLE public.regulatory_source_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read source health" ON public.regulatory_source_health
  FOR SELECT TO authenticated USING (true);