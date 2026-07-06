-- Snapshot ao vivo na propria tabela mercado (painel nao depende de futebol_live_rows)

alter table public.futebol_mercado_gols_05
  add column if not exists live_score text,
  add column if not exists live_over_0_line numeric,
  add column if not exists live_over_0_odd numeric,
  add column if not exists live_over_1_line numeric,
  add column if not exists live_over_1_odd numeric,
  add column if not exists live_over_2_line numeric,
  add column if not exists live_over_2_odd numeric;
