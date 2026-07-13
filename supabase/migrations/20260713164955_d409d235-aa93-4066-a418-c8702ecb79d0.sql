ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS linked_permit_number text,
  ADD COLUMN IF NOT EXISTS linked_permit_url text,
  ADD COLUMN IF NOT EXISTS linked_permit_data jsonb,
  ADD COLUMN IF NOT EXISTS linked_permit_synced_at timestamptz;