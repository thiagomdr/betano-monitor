-- Estrategia analise: odd inicial do favorito (1X2) → máximo durante o jogo → vitória?
-- Fonte: Edge overview JSON (ml_home/ml_away), sem Playwright.

create table if not exists public.futebol_favorito_drift (
  event_id text primary key,
  home text,
  away text,
  league text,
  country text,
  betano_url text,
  -- home | away (menor odd 1X2 na abertura; empate de odd → home)
  favorito_lado text not null check (favorito_lado in ('home', 'away')),
  favorito_nome text,
  odd_inicial numeric not null,
  minuto_inicial integer,
  odd_atual numeric,
  odd_max numeric not null,
  minuto_odd_max integer,
  ml_home_atual numeric,
  ml_draw_atual numeric,
  ml_away_atual numeric,
  placar_atual text,
  placar_final text,
  home_score integer,
  away_score integer,
  -- true = favorito ganhou; false = perdeu; null = empate ou ainda ao vivo
  favorito_venceu boolean,
  status text not null default 'watching'
    check (status in ('watching', 'settled')),
  first_seen_at timestamptz not null default now(),
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists futebol_favorito_drift_status_idx
  on public.futebol_favorito_drift (status, updated_at desc);

create index if not exists futebol_favorito_drift_watching_idx
  on public.futebol_favorito_drift (status)
  where status = 'watching';

alter table public.futebol_favorito_drift enable row level security;

drop policy if exists "futebol_favorito_drift_select_auth" on public.futebol_favorito_drift;
create policy "futebol_favorito_drift_select_auth"
  on public.futebol_favorito_drift for select to authenticated
  using (true);

drop policy if exists "futebol_favorito_drift_service" on public.futebol_favorito_drift;
create policy "futebol_favorito_drift_service"
  on public.futebol_favorito_drift for all to service_role
  using (true) with check (true);

comment on table public.futebol_favorito_drift is
  'Analise: odd inicial do favorito 1X2, máximo durante o jogo, e se o favorito venceu.';
