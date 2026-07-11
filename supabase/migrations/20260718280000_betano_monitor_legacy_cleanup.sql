-- Monitor Betano: remove schema legado (CasinoScores / Sic Bo / Lightning Storm).
-- Migrations antigas permanecem no historico do repo; este script limpa o banco em producao.
-- Aplicar: npx supabase db query --linked -f supabase/migrations/20260718280000_betano_monitor_legacy_cleanup.sql

-- Cron legado (Edge Functions casinoscores-coleta / lightningstorm-coleta nao existem mais)
do $$
declare
  job_id bigint;
begin
  for job_id in
    select jobid from cron.job
    where jobname in ('casinoscores-coleta-tick', 'betano-coleta-tick')
  loop
    perform cron.unschedule(job_id);
  end loop;
end $$;

-- Realtime (se publicado)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'lightning_storm_rounds'
  ) then
    alter publication supabase_realtime drop table public.lightning_storm_rounds;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'lightning_storm_public_stats'
  ) then
    alter publication supabase_realtime drop table public.lightning_storm_public_stats;
  end if;
end $$;

-- Triggers em sic_bo_rounds
drop trigger if exists trg_sic_bo_round_triple_tracker on public.sic_bo_rounds;
drop trigger if exists trg_sic_bo_round_live_tracker on public.sic_bo_rounds;

-- Funcoes legadas
drop function if exists public.tick_casinoscores_coleta() cascade;
drop function if exists public.tick_coleta_betano_cron() cascade;
drop function if exists public.trigger_betano_coleta_cron() cascade;
drop function if exists public.run_betano_coleta_cron() cascade;
drop function if exists public.on_sic_bo_round_insert_triple_tracker() cascade;
drop function if exists public.on_sic_bo_round_insert_live_tracker() cascade;
drop function if exists public.rebuild_sic_bo_triple_tracker(text) cascade;

-- Tabelas legadas (ordem: dependentes primeiro)
drop table if exists public.sic_bo_live_triple_events cascade;
drop table if exists public.sic_bo_live_rounds cascade;
drop table if exists public.sic_bo_live_state cascade;
drop table if exists public.sic_bo_triple_events cascade;
drop table if exists public.sic_bo_triple_state cascade;
drop table if exists public.sic_bo_rounds cascade;
drop table if exists public.sic_bo_public_stats cascade;
drop table if exists public.lightning_storm_rounds cascade;
drop table if exists public.lightning_storm_public_stats cascade;
drop table if exists public.casinoscores_coleta_config cascade;

-- Snapshot ao vivo antigo (painel usa futebol_mercado_gols_05)
drop table if exists public.futebol_live_rows cascade;

notify pgrst, 'reload schema';
