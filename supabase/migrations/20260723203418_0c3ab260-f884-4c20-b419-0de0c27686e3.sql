ALTER TABLE public.scope_of_work
  ADD COLUMN IF NOT EXISTS due_diligence jsonb,
  ADD COLUMN IF NOT EXISTS due_diligence_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_diligence_model text;