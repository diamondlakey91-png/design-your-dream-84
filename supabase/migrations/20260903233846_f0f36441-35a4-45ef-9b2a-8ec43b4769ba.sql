alter table public.sir_requests
  add column if not exists report_kind text not null default 'sir';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sir_requests_report_kind_check') then
    alter table public.sir_requests
      add constraint sir_requests_report_kind_check check (report_kind in ('sir','feasibility'));
  end if;
end $$;

create index if not exists sir_requests_report_kind_idx on public.sir_requests (report_kind);

comment on column public.sir_requests.report_kind is 'Which Permivio product this brief produces: sir = Site Investigation Report, feasibility = Project Feasibility Report.';