-- PostgREST upsert exige UNIQUE CONSTRAINT (nao indice parcial) para ON CONFLICT.

drop index if exists public.futebol_historico_gols_sportradar_uidx;

alter table public.futebol_historico_gols
  drop constraint if exists futebol_historico_gols_sportradar_key;

alter table public.futebol_historico_gols
  add constraint futebol_historico_gols_sportradar_key
  unique (event_id, sportradar_goal_id);

-- Indice placar ja e nao-parcial; promover a constraint nomeada para upsert estavel.
drop index if exists public.futebol_historico_gols_placar_uidx;

alter table public.futebol_historico_gols
  drop constraint if exists futebol_historico_gols_placar_key;

alter table public.futebol_historico_gols
  add constraint futebol_historico_gols_placar_key
  unique (event_id, minute, team_side, score_home, score_away);
