ALTER TABLE public.official_sources
  ADD COLUMN IF NOT EXISTS jurisdiction_key text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS trust text,
  ADD COLUMN IF NOT EXISTS discovered_by text,
  ADD COLUMN IF NOT EXISTS verification text NOT NULL DEFAULT 'needs_verification',
  ADD COLUMN IF NOT EXISTS recheck_after timestamptz,
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS official_sources_jurisdiction_key_idx ON public.official_sources(jurisdiction_key);
CREATE UNIQUE INDEX IF NOT EXISTS official_sources_jur_cat_url_uniq ON public.official_sources(jurisdiction_key, category, url) WHERE jurisdiction_key IS NOT NULL;