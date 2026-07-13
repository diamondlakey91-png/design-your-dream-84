
ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_action_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS result text;
