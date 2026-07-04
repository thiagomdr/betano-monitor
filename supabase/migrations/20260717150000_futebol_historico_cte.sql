-- Stats agregadas no historico (somas + CTE)
alter table public.futebol_historico_jogos
  add column if not exists shots_on_target integer,
  add column if not exists corners integer,
  add column if not exists goal_kicks integer,
  add column if not exists cte integer;
