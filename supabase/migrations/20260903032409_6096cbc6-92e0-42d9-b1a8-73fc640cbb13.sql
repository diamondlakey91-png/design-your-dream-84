ALTER TABLE public.site_investigations
  ADD COLUMN IF NOT EXISTS investigation_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS complexity_level integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS complexity_label text,
  ADD COLUMN IF NOT EXISTS report_depth text NOT NULL DEFAULT 'project_feasibility',
  ADD COLUMN IF NOT EXISTS recommended_depth text,
  ADD COLUMN IF NOT EXISTS modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feasibility_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deal_killers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS due_diligence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS followups jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS progress_step text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_investigation_id uuid REFERENCES public.site_investigations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parcel_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS site_acreage numeric,
  ADD COLUMN IF NOT EXISTS custom_quote_requested boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.site_investigation_parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.site_investigations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  label text,
  parcel_number text,
  address text,
  acreage numeric,
  zoning text,
  land_use text,
  jurisdiction text,
  county text,
  state text,
  phase text,
  notes text,
  verification text NOT NULL DEFAULT 'needs_agency_confirmation',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_investigation_parcels TO authenticated;
GRANT ALL ON public.site_investigation_parcels TO service_role;
ALTER TABLE public.site_investigation_parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage parcels for own investigations"
  ON public.site_investigation_parcels FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid());
CREATE TRIGGER site_investigation_parcels_touch BEFORE UPDATE ON public.site_investigation_parcels
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS site_investigation_parcels_inv_idx ON public.site_investigation_parcels(investigation_id);

CREATE TABLE IF NOT EXISTS public.site_investigation_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.site_investigations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  category text NOT NULL,
  level text NOT NULL DEFAULT 'unknown',
  why text,
  supporting_info text,
  mitigation text,
  verification text NOT NULL DEFAULT 'needs_agency_confirmation',
  parcel_label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_investigation_risks TO authenticated;
GRANT ALL ON public.site_investigation_risks TO service_role;
ALTER TABLE public.site_investigation_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage risks for own investigations"
  ON public.site_investigation_risks FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid());
CREATE TRIGGER site_investigation_risks_touch BEFORE UPDATE ON public.site_investigation_risks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS site_investigation_risks_inv_idx ON public.site_investigation_risks(investigation_id);