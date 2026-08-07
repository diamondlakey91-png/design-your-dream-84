CREATE TYPE public.permit_filing_status AS ENUM ('draft','preflight','awaiting_approval','ready_to_submit','submitted','monitoring','issued','withdrawn');

CREATE TABLE public.permit_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  jurisdiction text NOT NULL DEFAULT '',
  permit_type text NOT NULL DEFAULT '',
  portal_name text,
  portal_url text,
  applicant_of_record text,
  target_submittal_date date,
  notes text,
  status public.permit_filing_status NOT NULL DEFAULT 'draft',
  preflight jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by text,
  approved_at timestamptz,
  submitted_at timestamptz,
  confirmation_number text,
  status_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX permit_filings_user_idx ON public.permit_filings(user_id, created_at DESC);
CREATE INDEX permit_filings_project_idx ON public.permit_filings(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_filings TO authenticated;
GRANT ALL ON public.permit_filings TO service_role;

ALTER TABLE public.permit_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "filings_select_own" ON public.permit_filings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "filings_insert_own" ON public.permit_filings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "filings_update_own" ON public.permit_filings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "filings_delete_own" ON public.permit_filings FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER permit_filings_updated_at BEFORE UPDATE ON public.permit_filings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();