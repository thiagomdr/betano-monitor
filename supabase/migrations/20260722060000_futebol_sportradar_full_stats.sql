-- Snapshot + timeline Sportradar (tudo que o feed devolve, alem dos campos mapeados).

create table if not exists public.futebol_sportradar_stats (
  event_id text primary key,
  betradar_match_id text,
  home text,
  away text,
  last_minute integer,
  home_score integer,
  away_score integer,
  home_shots_on_target integer,
  away_shots_on_target integer,
  home_shots_total integer,
  away_shots_total integer,
  home_corners integer,
  away_corners integer,
  home_goal_kicks integer,
  away_goal_kicks integer,
  -- Mapa completo payload.values do match_details / extended
  values_json jsonb not null default '{}'::jsonb,
  source_url text,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists futebol_sportradar_stats_fetched_idx
  on public.futebol_sportradar_stats (fetched_at desc);

create index if not exists futebol_sportradar_stats_betradar_idx
  on public.futebol_sportradar_stats (betradar_match_id);

-- Eventos da timeline (gols, cartoes, substituicoes, etc.)
create table if not exists public.futebol_sportradar_events (
  id bigserial primary key,
  event_id text not null,
  betradar_match_id text,
  sportradar_event_id text not null,
  event_type text,
  type_id integer,
  minute integer,
  seconds integer,
  team_side text,
  team text,
  player text,
  score_home integer,
  score_away integer,
  disabled boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (event_id, sportradar_event_id)
);

create index if not exists futebol_sportradar_events_event_idx
  on public.futebol_sportradar_events (event_id, minute nulls last);

create index if not exists futebol_sportradar_events_type_idx
  on public.futebol_sportradar_events (event_type, type_id);

alter table public.futebol_sportradar_stats enable row level security;
alter table public.futebol_sportradar_events enable row level security;

drop policy if exists "futebol_sportradar_stats_select_auth" on public.futebol_sportradar_stats;
create policy "futebol_sportradar_stats_select_auth"
  on public.futebol_sportradar_stats for select to authenticated
  using (true);

drop policy if exists "futebol_sportradar_events_select_auth" on public.futebol_sportradar_events;
create policy "futebol_sportradar_events_select_auth"
  on public.futebol_sportradar_events for select to authenticated
  using (true);

drop policy if exists "futebol_sportradar_stats_service" on public.futebol_sportradar_stats;
create policy "futebol_sportradar_stats_service"
  on public.futebol_sportradar_stats for all to service_role
  using (true) with check (true);

drop policy if exists "futebol_sportradar_events_service" on public.futebol_sportradar_events;
create policy "futebol_sportradar_events_service"
  on public.futebol_sportradar_events for all to service_role
  using (true) with check (true);

comment on table public.futebol_sportradar_stats is
  'Ultimo snapshot Sportradar por jogo (values_json = feed completo).';
comment on table public.futebol_sportradar_events is
  'Timeline Sportradar (todos os eventos tipados, nao so gols).';

notify pgrst, 'reload schema';
