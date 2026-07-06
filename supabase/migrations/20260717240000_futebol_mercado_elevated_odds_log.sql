-- Historico de odds Over acima do +0,5 (fase Super Estrategia)
alter table public.futebol_mercado_gols_05
  add column if not exists elevated_odds_log jsonb not null default '[]'::jsonb;
