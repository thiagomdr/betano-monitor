-- Arena Tipster: Betano↔SuperBet event links + Sportradar validation logs

create table if not exists public.tipster_event_links (
  id uuid primary key default gen_random_uuid(),
  sport text not null default 'other',
  home text not null,
  away text not null,
  starts_at timestamptz,
  betradar_id text not null,
  betano_provider_event_id text,
  superbet_offer_id text,
  live_event_id uuid references public.live_events (id) on delete set null,
  match_score numeric,
  match_method text not null
    check (match_method in ('betradar_id', 'name_time', 'manual')),
  status text not null default 'pending'
    check (status in ('pending', 'sr_validated', 'sr_rejected', 'live', 'finished', 'broken')),
  sr_validated_at timestamptz,
  sr_home text,
  sr_away text,
  last_score_home integer,
  last_score_away integer,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tipster_event_links_betradar_uidx
  on public.tipster_event_links (betradar_id);

create unique index if not exists tipster_event_links_superbet_uidx
  on public.tipster_event_links (superbet_offer_id)
  where superbet_offer_id is not null;

create unique index if not exists tipster_event_links_betano_uidx
  on public.tipster_event_links (betano_provider_event_id)
  where betano_provider_event_id is not null;

create index if not exists tipster_event_links_status_idx
  on public.tipster_event_links (status);

create index if not exists tipster_event_links_starts_at_idx
  on public.tipster_event_links (starts_at);

create table if not exists public.tipster_validation_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  action text not null,
  status text not null,
  betradar_id text,
  betano_provider_event_id text,
  superbet_offer_id text,
  link_id uuid references public.tipster_event_links (id) on delete set null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists tipster_validation_logs_created_idx
  on public.tipster_validation_logs (created_at desc);

create index if not exists tipster_validation_logs_action_idx
  on public.tipster_validation_logs (action, status);

create table if not exists public.tipster_bridge_meta (
  id int primary key default 1 check (id = 1),
  fetched_at timestamptz,
  betano_n int not null default 0,
  superbet_n int not null default 0,
  linked_n int not null default 0,
  validated_n int not null default 0,
  rejected_n int not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.tipster_bridge_meta (id) values (1)
on conflict (id) do nothing;

alter table public.tipster_event_links enable row level security;
alter table public.tipster_validation_logs enable row level security;
alter table public.tipster_bridge_meta enable row level security;

drop policy if exists tipster_event_links_select_auth on public.tipster_event_links;
create policy tipster_event_links_select_auth
  on public.tipster_event_links for select to authenticated using (true);

drop policy if exists tipster_event_links_service on public.tipster_event_links;
create policy tipster_event_links_service
  on public.tipster_event_links for all to service_role using (true) with check (true);

drop policy if exists tipster_validation_logs_select_auth on public.tipster_validation_logs;
create policy tipster_validation_logs_select_auth
  on public.tipster_validation_logs for select to authenticated using (true);

drop policy if exists tipster_validation_logs_service on public.tipster_validation_logs;
create policy tipster_validation_logs_service
  on public.tipster_validation_logs for all to service_role using (true) with check (true);

drop policy if exists tipster_bridge_meta_select_auth on public.tipster_bridge_meta;
create policy tipster_bridge_meta_select_auth
  on public.tipster_bridge_meta for select to authenticated using (true);

drop policy if exists tipster_bridge_meta_service on public.tipster_bridge_meta;
create policy tipster_bridge_meta_service
  on public.tipster_bridge_meta for all to service_role using (true) with check (true);

grant select on public.tipster_event_links to authenticated;
grant select on public.tipster_validation_logs to authenticated;
grant select on public.tipster_bridge_meta to authenticated;
