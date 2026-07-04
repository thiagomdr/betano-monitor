-- Odds Over no snapshot ao vivo
alter table public.futebol_live_rows
  add column if not exists over_0_line numeric,
  add column if not exists over_0_odd numeric,
  add column if not exists over_1_line numeric,
  add column if not exists over_1_odd numeric,
  add column if not exists over_2_line numeric,
  add column if not exists over_2_odd numeric;

-- Odds congeladas aos 85' no historico (nao alterar apos captura)
alter table public.futebol_historico_jogos
  add column if not exists odd_under_05 numeric,
  add column if not exists odd_under_15 numeric,
  add column if not exists odd_under_25 numeric,
  add column if not exists odd_over_05 numeric,
  add column if not exists odd_over_15 numeric,
  add column if not exists odd_over_25 numeric,
  add column if not exists odds_85_minute integer,
  add column if not exists odds_85_score text,
  add column if not exists odds_85_captured_at timestamptz;
