-- Historico de jogos monitorados + gols com minuto
-- Permite filtrar jogos com gols a partir de um minuto (ex.: >= 85)

create table if not exists public.futebol_historico_jogos (
  event_id text primary key,
  betradar_match_id text,
  home text,
  away text,
  league text,
  country text,
  home_score integer,
  away_score integer,
  score text,
  last_minute integer,
  is_live boolean not null default true,
  betano_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists futebol_historico_jogos_last_seen_idx
  on public.futebol_historico_jogos (last_seen_at desc);

create table if not exists public.futebol_historico_gols (
  id bigserial primary key,
  event_id text not null references public.futebol_historico_jogos(event_id) on delete cascade,
  minute integer not null,
  team text, -- 'home' | 'away' | nome
  team_side text, -- home | away
  player text,
  score_home integer,
  score_away integer,
  unique (event_id, minute, team_side)
);

create index if not exists futebol_historico_gols_minute_idx
  on public.futebol_historico_gols (minute);

create index if not exists futebol_historico_gols_event_minute_idx
  on public.futebol_historico_gols (event_id, minute);

alter table public.futebol_historico_jogos enable row level security;
alter table public.futebol_historico_gols enable row level security;

drop policy if exists "futebol_historico_jogos_select_anon" on public.futebol_historico_jogos;
create policy "futebol_historico_jogos_select_anon"
  on public.futebol_historico_jogos for select to anon, authenticated
  using (true);

drop policy if exists "futebol_historico_gols_select_anon" on public.futebol_historico_gols;
create policy "futebol_historico_gols_select_anon"
  on public.futebol_historico_gols for select to anon, authenticated
  using (true);

drop policy if exists "futebol_historico_jogos_service" on public.futebol_historico_jogos;
create policy "futebol_historico_jogos_service"
  on public.futebol_historico_jogos for all to service_role
  using (true) with check (true);

drop policy if exists "futebol_historico_gols_service" on public.futebol_historico_gols;
create policy "futebol_historico_gols_service"
  on public.futebol_historico_gols for all to service_role
  using (true) with check (true);
