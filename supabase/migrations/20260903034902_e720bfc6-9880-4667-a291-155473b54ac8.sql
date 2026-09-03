create table if not exists public.sir_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  company text,
  email text not null,
  phone text,
  role text,
  project_stage text,
  site_address text,
  jurisdiction text not null,
  parcel_apn text,
  approx_size text,
  intended_use text not null,
  existing_building text,
  report_needed text,
  target_date text,
  notes text,
  status text not null default 'new'
);

comment on table public.sir_requests is 'Public Site Investigation Report intake requests (lead capture).';

grant insert on public.sir_requests to anon;
grant select, insert, update on public.sir_requests to authenticated;
grant all on public.sir_requests to service_role;

alter table public.sir_requests enable row level security;

create policy "Anyone can submit an SIR request"
  on public.sir_requests for insert
  to anon, authenticated
  with check (true);

create policy "Admins can read SIR requests"
  on public.sir_requests for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update SIR requests"
  on public.sir_requests for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));