alter table public.sir_requests
  add column if not exists compiled_report jsonb,
  add column if not exists compiled_at timestamptz,
  add column if not exists qa_report jsonb,
  add column if not exists qa_status text not null default 'pending',
  add column if not exists review_stage text not null default 'draft',
  add column if not exists submitted_for_review_at timestamptz;