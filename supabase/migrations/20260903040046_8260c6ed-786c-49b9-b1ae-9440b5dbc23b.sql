ALTER TABLE public.sir_requests
  ADD COLUMN IF NOT EXISTS research_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS research jsonb,
  ADD COLUMN IF NOT EXISTS resolved_jurisdiction jsonb,
  ADD COLUMN IF NOT EXISTS research_sources jsonb,
  ADD COLUMN IF NOT EXISTS research_model text,
  ADD COLUMN IF NOT EXISTS researched_at timestamptz,
  ADD COLUMN IF NOT EXISTS research_error text;