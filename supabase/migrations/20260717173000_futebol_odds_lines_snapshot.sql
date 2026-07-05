-- Linhas congeladas junto com odds aos 85' (auditoria BD)

alter table public.futebol_historico_jogos
  add column if not exists odd_under_05_line numeric,
  add column if not exists odd_under_15_line numeric,
  add column if not exists odd_under_25_line numeric,
  add column if not exists odd_over_05_line numeric,
  add column if not exists odd_over_15_line numeric,
  add column if not exists odd_over_25_line numeric;
