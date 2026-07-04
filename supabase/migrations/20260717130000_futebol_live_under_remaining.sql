-- Odds Under por gols restantes: 0, +1, +2
alter table public.futebol_live_rows
  add column if not exists under_0_line numeric,
  add column if not exists under_0_odd numeric,
  add column if not exists under_1_line numeric,
  add column if not exists under_1_odd numeric,
  add column if not exists under_2_line numeric,
  add column if not exists under_2_odd numeric;
