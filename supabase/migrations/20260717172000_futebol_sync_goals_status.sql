-- Sincroniza goals_status a partir da contagem real no BD (sem parser).

update public.futebol_historico_jogos j
set
  goals_expected = coalesce(j.home_score, 0) + coalesce(j.away_score, 0),
  goals_recorded = coalesce(g.cnt, 0),
  goals_status = case
    when coalesce(j.home_score, 0) + coalesce(j.away_score, 0) = 0 and coalesce(g.cnt, 0) = 0 then 'ok'
    when coalesce(g.cnt, 0) = 0 and coalesce(j.home_score, 0) + coalesce(j.away_score, 0) > 0 then 'missing'
    when coalesce(g.cnt, 0) < coalesce(j.home_score, 0) + coalesce(j.away_score, 0) then 'partial'
    when coalesce(g.cnt, 0) > coalesce(j.home_score, 0) + coalesce(j.away_score, 0) then 'mismatch'
    else 'ok'
  end,
  updated_at = now()
from (
  select event_id, count(*)::integer as cnt
  from public.futebol_historico_gols
  group by event_id
) g
where j.event_id = g.event_id
  and j.is_live = false;

update public.futebol_historico_jogos j
set
  goals_expected = coalesce(j.home_score, 0) + coalesce(j.away_score, 0),
  goals_recorded = 0,
  goals_status = case
    when coalesce(j.home_score, 0) + coalesce(j.away_score, 0) = 0 then 'ok'
    else 'missing'
  end,
  updated_at = now()
where j.is_live = false
  and not exists (
    select 1 from public.futebol_historico_gols g where g.event_id = j.event_id
  )
  and (j.goals_status is null or j.goals_status = 'unknown' or j.goals_recorded is null);

update public.futebol_historico_jogos j
set
  goals_expected = coalesce(j.home_score, 0) + coalesce(j.away_score, 0),
  goals_recorded = coalesce(g.cnt, 0),
  goals_status = 'ok',
  updated_at = now()
from (
  select event_id, count(*)::integer as cnt
  from public.futebol_historico_gols
  group by event_id
) g
where j.event_id = g.event_id
  and j.is_live = false
  and coalesce(g.cnt, 0) = coalesce(j.home_score, 0) + coalesce(j.away_score, 0)
  and (j.goals_status is null or j.goals_status = 'unknown');
