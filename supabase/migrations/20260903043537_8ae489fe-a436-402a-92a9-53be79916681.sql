ALTER TABLE public.sir_requests
  ADD COLUMN IF NOT EXISTS finding_reviews jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewer_name text,
  ADD COLUMN IF NOT EXISTS reviewer_credential text,
  ADD COLUMN IF NOT EXISTS reviewer_summary text;

ALTER TABLE public.sir_requests
  DROP CONSTRAINT IF EXISTS sir_requests_review_status_check;
ALTER TABLE public.sir_requests
  ADD CONSTRAINT sir_requests_review_status_check
  CHECK (review_status IN ('unreviewed','in_review','reviewed'));