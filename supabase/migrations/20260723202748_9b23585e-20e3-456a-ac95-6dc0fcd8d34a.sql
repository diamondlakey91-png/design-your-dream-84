-- Phase 1: simplified intake data model
ALTER TABLE public.scope_of_work
  ADD COLUMN IF NOT EXISTS plain_scope text,
  ADD COLUMN IF NOT EXISTS friendly_project_type text,
  ADD COLUMN IF NOT EXISTS intake_step int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS intake_status text NOT NULL DEFAULT 'draft';

-- Constrain friendly_project_type to a known set (plain-language options)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scope_friendly_project_type_check') THEN
    ALTER TABLE public.scope_of_work
      ADD CONSTRAINT scope_friendly_project_type_check
      CHECK (friendly_project_type IS NULL OR friendly_project_type IN (
        'open_restaurant','remodel_restaurant','open_retail','remodel_retail',
        'office_renovation','medical_dental','commercial_ti','new_commercial',
        'new_residential','home_addition','kitchen_bath_reno','deck_patio',
        'change_of_use','exterior_site_work','sign_installation','other'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scope_intake_status_check') THEN
    ALTER TABLE public.scope_of_work
      ADD CONSTRAINT scope_intake_status_check
      CHECK (intake_status IN ('draft','questions','ready','analyzing','report_ready','roadmap_created','human_review'));
  END IF;
END $$;

-- Intake answers (per-question storage for plain-language follow-ups + AI extraction)
CREATE TABLE IF NOT EXISTS public.intake_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  answer_value text,
  answer_choice text CHECK (answer_choice IS NULL OR answer_choice IN ('yes','no','unsure','later')),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai_extracted','uploaded')),
  verified boolean NOT NULL DEFAULT false,
  document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, question_key, source)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_answers TO authenticated;
GRANT ALL ON public.intake_answers TO service_role;

ALTER TABLE public.intake_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own intake answers"
  ON public.intake_answers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = intake_answers.project_id AND p.user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = intake_answers.project_id AND p.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS intake_answers_project_idx ON public.intake_answers(project_id);

DROP TRIGGER IF EXISTS trg_intake_answers_touch ON public.intake_answers;
CREATE TRIGGER trg_intake_answers_touch
  BEFORE UPDATE ON public.intake_answers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();