-- Limpa tabelas antigas (futebol/basquete) e cria sic_bo_rounds
-- Projeto: BetanoMonitor (mddortcbebtkopeanrhu)
-- Execute no SQL Editor do Supabase ou: supabase db push

-- Edge / cron legado
drop function if exists public.trigger_betano_coleta_cron() cascade;
drop function if exists public.run_betano_coleta_cron() cascade;

-- Tabelas futebol
drop table if exists public.futebol_eventos_gol cascade;
drop table if exists public.futebol_gols cascade;
drop table if exists public.futebol_leituras cascade;
drop table if exists public.futebol_partidas cascade;
drop table if exists public.futebol_agenda cascade;

-- Tabelas basquete / alertas / coleta antiga
drop table if exists public.alertas_betano cascade;
drop table if exists public.regras_alerta cascade;
drop table if exists public.jogos_betano cascade;
drop table if exists public.coletas_betano cascade;
drop table if exists public.coleta_scheduler cascade;
drop table if exists public.coleta_cron_config cascade;

-- Nova tabela Sic Bo
create table if not exists public.sic_bo_rounds (
  id               uuid primary key default gen_random_uuid(),
  round_id         text unique not null,
  table_name       text not null default 'korean-mega-sic-bo',
  provider         text not null default 'pragmatic',
  finalized_at     timestamptz,
  collected_at     timestamptz not null default now(),
  dice_1           smallint not null check (dice_1 between 1 and 6),
  dice_2           smallint not null check (dice_2 between 1 and 6),
  dice_3           smallint not null check (dice_3 between 1 and 6),
  sum_total        smallint not null check (sum_total between 3 and 18),
  is_small         boolean not null,
  is_big           boolean not null,
  is_odd           boolean not null,
  is_triple        boolean not null,
  mega_multipliers jsonb,
  raw_payload      jsonb not null
);

create index if not exists idx_sic_bo_finalized_at on public.sic_bo_rounds (finalized_at desc);
create index if not exists idx_sic_bo_sum_total on public.sic_bo_rounds (sum_total);
create index if not exists idx_sic_bo_collected_at on public.sic_bo_rounds (collected_at desc);

alter table public.sic_bo_rounds enable row level security;

-- Leitura para usuários autenticados (painel futuro)
drop policy if exists "sic_bo_select_authenticated" on public.sic_bo_rounds;
create policy "sic_bo_select_authenticated"
  on public.sic_bo_rounds
  for select
  to authenticated
  using (true);

-- Inserção/atualização só via service_role (coletor local)
drop policy if exists "sic_bo_insert_service_role" on public.sic_bo_rounds;
create policy "sic_bo_insert_service_role"
  on public.sic_bo_rounds
  for all
  to service_role
  using (true)
  with check (true);
