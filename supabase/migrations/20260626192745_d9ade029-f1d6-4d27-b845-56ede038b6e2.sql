
create table if not exists public.client_telemetry_events (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  session_id  text,
  kind        text not null check (kind in ('error','perf','event')),
  category    text,
  level       text,
  message     text,
  route       text,
  app_version text,
  user_agent  text,
  context     jsonb,
  fcp_ms      integer,
  lcp_ms      integer,
  tti_ms      integer,
  api_p95_ms  integer
);

create index if not exists idx_telemetry_created   on public.client_telemetry_events (created_at desc);
create index if not exists idx_telemetry_kind_time on public.client_telemetry_events (kind, created_at desc);
create index if not exists idx_telemetry_user      on public.client_telemetry_events (user_id, created_at desc);

grant select, insert on public.client_telemetry_events to authenticated;
grant insert         on public.client_telemetry_events to anon;
grant all            on public.client_telemetry_events to service_role;
grant usage, select on sequence public.client_telemetry_events_id_seq to authenticated, anon, service_role;

alter table public.client_telemetry_events enable row level security;

create policy "telemetry insert any"
on public.client_telemetry_events for insert
to anon, authenticated
with check (user_id is null or user_id = auth.uid());

create policy "telemetry admin read"
on public.client_telemetry_events for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create or replace function public.prune_client_telemetry()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.client_telemetry_events
  where created_at < now() - interval '30 days';
$$;

grant execute on function public.prune_client_telemetry() to service_role;
