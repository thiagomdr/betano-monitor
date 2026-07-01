-- Estatísticas futebol: partidas monitoradas, leituras em lote, agenda radar/intensivo

create table if not exists public.futebol_agenda (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  modo text not null default 'radar' check (modo in ('radar', 'intenso')),
  next_fetch_at timestamptz,
  last_radar_at timestamptz,
  last_intensive_at timestamptz,
  data_atualizacao timestamptz not null default now()
);

create table if not exists public.futebol_partidas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  event_id bigint not null,
  game_key text not null,
  time_casa text not null,
  time_fora text not null,
  liga text,
  url_partida text,
  status text not null default 'observado'
    check (status in ('observado', 'em_janela', 'finalizado')),
  minuto_inicio_janela integer,
  placar_casa_inicio integer,
  placar_fora_inicio integer,
  placar_casa_final integer,
  placar_fora_final integer,
  gol_nos_ultimos_5_min boolean,
  eta_85 timestamptz,
  minutos_ate_85 numeric(6, 2),
  data_criacao timestamptz not null default now(),
  data_atualizacao timestamptz not null default now(),
  finalizado_em timestamptz,
  unique (usuario_id, event_id)
);

create table if not exists public.futebol_leituras (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  partida_id uuid not null references public.futebol_partidas (id) on delete cascade,
  lote_id uuid not null,
  coletado_em timestamptz not null default now(),
  minuto_relogio text,
  placar_casa integer not null,
  placar_fora integer not null,
  odd_manter_placar numeric(8, 2),
  mercado_nome text,
  linha_gols numeric(4, 1),
  data_criacao timestamptz not null default now()
);

create index if not exists idx_futebol_partidas_usuario_status
  on public.futebol_partidas (usuario_id, status);

create index if not exists idx_futebol_partidas_eta
  on public.futebol_partidas (usuario_id, eta_85)
  where status = 'observado';

create index if not exists idx_futebol_leituras_partida
  on public.futebol_leituras (partida_id, coletado_em desc);

create index if not exists idx_futebol_leituras_lote
  on public.futebol_leituras (lote_id);

alter table public.futebol_agenda enable row level security;
alter table public.futebol_partidas enable row level security;
alter table public.futebol_leituras enable row level security;

drop policy if exists futebol_agenda_select_own on public.futebol_agenda;
create policy futebol_agenda_select_own
  on public.futebol_agenda for select
  using (auth.uid() = usuario_id);

drop policy if exists futebol_agenda_insert_own on public.futebol_agenda;
create policy futebol_agenda_insert_own
  on public.futebol_agenda for insert
  with check (auth.uid() = usuario_id);

drop policy if exists futebol_agenda_update_own on public.futebol_agenda;
create policy futebol_agenda_update_own
  on public.futebol_agenda for update
  using (auth.uid() = usuario_id);

drop policy if exists futebol_partidas_select_own on public.futebol_partidas;
create policy futebol_partidas_select_own
  on public.futebol_partidas for select
  using (auth.uid() = usuario_id);

drop policy if exists futebol_leituras_select_own on public.futebol_leituras;
create policy futebol_leituras_select_own
  on public.futebol_leituras for select
  using (auth.uid() = usuario_id);

notify pgrst, 'reload schema';
