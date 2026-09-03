alter table public.sir_requests
  add column if not exists client_user_id uuid references auth.users(id) on delete set null,
  add column if not exists released_to_client_at timestamptz;

create index if not exists sir_requests_client_user_id_idx on public.sir_requests (client_user_id);

comment on column public.sir_requests.client_user_id is 'Signed-in client who submitted this brief from the SIR workspace (null for public lead-capture submissions).';
comment on column public.sir_requests.released_to_client_at is 'When a reviewer released the professionally reviewed report to the client.';

drop policy if exists "Clients can read their own SIR requests" on public.sir_requests;
create policy "Clients can read their own SIR requests"
  on public.sir_requests for select
  to authenticated
  using (client_user_id = auth.uid());