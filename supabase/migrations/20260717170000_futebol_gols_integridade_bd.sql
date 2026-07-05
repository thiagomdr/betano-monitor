-- Integridade de gols no BD: chaves unicas robustas + status de validacao

alter table public.futebol_historico_gols
  add column if not exists sportradar_goal_id text;

alter table public.futebol_historico_jogos
  add column if not exists goals_expected integer,
  add column if not exists goals_recorded integer,
  add column if not exists goals_status text not null default 'unknown';

alter table public.futebol_historico_gols
  drop constraint if exists futebol_historico_gols_event_id_minute_team_side_key;

alter table public.futebol_historico_gols
  drop constraint if exists futebol_historico_gols_sportradar_key;

alter table public.futebol_historico_gols
  add constraint futebol_historico_gols_sportradar_key
  unique (event_id, sportradar_goal_id);

alter table public.futebol_historico_gols
  drop constraint if exists futebol_historico_gols_placar_key;

alter table public.futebol_historico_gols
  add constraint futebol_historico_gols_placar_key
  unique (event_id, minute, team_side, score_home, score_away);

create index if not exists futebol_historico_jogos_goals_status_idx
  on public.futebol_historico_jogos (goals_status);

-- View de auditoria (fonte da verdade = contagem no BD vs placar)
create or replace view public.futebol_historico_validacao as
select
  j.event_id,
  j.home,
  j.away,
  j.score,
  j.home_score,
  j.away_score,
  coalesce(j.home_score, 0) + coalesce(j.away_score, 0) as gols_esperados,
  count(g.id) as gols_registrados,
  case
    when coalesce(j.home_score, 0) + coalesce(j.away_score, 0) = 0 and count(g.id) = 0 then 'ok'
    when count(g.id) = 0 and coalesce(j.home_score, 0) + coalesce(j.away_score, 0) > 0 then 'missing'
    when count(g.id) < coalesce(j.home_score, 0) + coalesce(j.away_score, 0) then 'partial'
    when count(g.id) > coalesce(j.home_score, 0) + coalesce(j.away_score, 0) then 'mismatch'
    else 'ok'
  end as goals_status_calc
from public.futebol_historico_jogos j
left join public.futebol_historico_gols g on g.event_id = j.event_id
group by j.event_id, j.home, j.away, j.score, j.home_score, j.away_score;

grant select on public.futebol_historico_validacao to anon, authenticated;
