-- Backfill histórico: minuto_jogo, delta_gols e futebol_eventos_gol a partir das leituras.

create or replace function public.futebol_parse_minuto_jogo(p_texto text)
returns integer
language sql
immutable
as $$
  select case
    when p_texto is null or btrim(p_texto) = '' then null
    when btrim(p_texto) ~ '^\d{1,3}$' then btrim(p_texto)::integer
    when btrim(p_texto) ~ '^(\d{1,3}):\d{2}' then
      (regexp_match(btrim(p_texto), '^(\d{1,3}):\d{2}'))[1]::integer
    when btrim(p_texto) ~ '^(\d{1,3})\s*[''′]' then
      (regexp_match(btrim(p_texto), '^(\d{1,3})\s*[''′]'))[1]::integer
    when btrim(p_texto) ~ '(\d{1,3})\s*[''′]\s*\+\s*(\d{1,2})' then
      (regexp_match(btrim(p_texto), '(\d{1,3})\s*[''′]\s*\+\s*(\d{1,2})'))[1]::integer
      + (regexp_match(btrim(p_texto), '(\d{1,3})\s*[''′]\s*\+\s*(\d{1,2})'))[2]::integer
    else null
  end;
$$;

update public.futebol_leituras l
set minuto_jogo = public.futebol_parse_minuto_jogo(l.minuto_relogio)
where l.minuto_jogo is null
  and l.minuto_relogio is not null;

update public.futebol_leituras l
set gols_totais = l.placar_casa + l.placar_fora
where l.gols_totais is null;

with ordered as (
  select
    l.id,
    l.placar_casa + l.placar_fora as gols_totais,
    p.placar_casa_inicio + p.placar_fora_inicio as gols_inicio,
    lag(l.placar_casa + l.placar_fora) over (
      partition by l.partida_id
      order by l.coletado_em
    ) as prev_gols,
    row_number() over (
      partition by l.partida_id
      order by l.coletado_em
    ) as rn
  from public.futebol_leituras l
  join public.futebol_partidas p on p.id = l.partida_id
  where p.status in ('em_janela', 'finalizado')
)
update public.futebol_leituras l
set delta_gols = greatest(
  0,
  o.gols_totais - case
    when o.rn = 1 then o.gols_inicio
    else coalesce(o.prev_gols, o.gols_inicio)
  end
)
from ordered o
where l.id = o.id
  and l.delta_gols is null;

insert into public.futebol_eventos_gol (
  usuario_id,
  partida_id,
  leitura_id,
  minuto_jogo,
  quantidade,
  origem
)
select
  l.usuario_id,
  l.partida_id,
  l.id,
  l.minuto_jogo,
  l.delta_gols,
  'leitura_delta'
from public.futebol_leituras l
join public.futebol_partidas p on p.id = l.partida_id
where p.status in ('em_janela', 'finalizado')
  and l.delta_gols > 0
  and l.minuto_jogo is not null
  and l.minuto_jogo >= 85
  and not exists (
    select 1
    from public.futebol_eventos_gol e
    where e.leitura_id = l.id
      and e.origem = 'leitura_delta'
  );

insert into public.futebol_eventos_gol (
  usuario_id,
  partida_id,
  leitura_id,
  minuto_jogo,
  quantidade,
  origem
)
select
  p.usuario_id,
  p.id,
  null,
  greatest(
    85,
    coalesce(
      (
        select max(l.minuto_jogo)
        from public.futebol_leituras l
        where l.partida_id = p.id
          and l.minuto_jogo is not null
          and l.minuto_jogo >= 85
      ),
      p.minuto_inicio_janela,
      85
    )
  ),
  p.gols_na_janela - coalesce(
    (
      select sum(e.quantidade)
      from public.futebol_eventos_gol e
      where e.partida_id = p.id
    ),
    0
  ),
  'fechamento_partida'
from public.futebol_partidas p
where p.status in ('em_janela', 'finalizado')
  and coalesce(p.gols_na_janela, 0) > 0
  and p.gols_na_janela > coalesce(
    (
      select sum(e.quantidade)
      from public.futebol_eventos_gol e
      where e.partida_id = p.id
    ),
    0
  );

-- Garante que o total exibido bate com a soma por minuto.
create or replace function public.futebol_resumo_janela()
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  total_eventos integer;
begin
  if uid is null then
    return json_build_object(
      'jogosColetados', 0,
      'jogosComGolNaJanela', 0,
      'totalGolsNaJanela', 0,
      'golsPorMinuto', '{}'::json,
      'maxMinutoComGol', 87
    );
  end if;

  select coalesce(sum(quantidade), 0)::integer
  into total_eventos
  from public.futebol_eventos_gol
  where usuario_id = uid;

  return (
    with partidas_janela as (
      select *
      from public.futebol_partidas
      where usuario_id = uid
        and status in ('em_janela', 'finalizado')
    ),
    gols_minuto as (
      select minuto_jogo, sum(quantidade)::integer as total_gols
      from public.futebol_eventos_gol
      where usuario_id = uid
      group by minuto_jogo
    ),
    max_min as (
      select coalesce(max(minuto_jogo), 87) as m
      from gols_minuto
      where minuto_jogo >= 85
    )
    select json_build_object(
      'jogosColetados', (select count(*)::integer from partidas_janela),
      'jogosComGolNaJanela', (
        select count(*)::integer from partidas_janela
        where coalesce(gols_na_janela, 0) > 0
      ),
      'totalGolsNaJanela', total_eventos,
      'golsPorMinuto', coalesce(
        (select json_object_agg(minuto_jogo::text, total_gols order by minuto_jogo) from gols_minuto),
        '{}'::json
      ),
      'maxMinutoComGol', (select greatest(87, m) from max_min)
    )
  );
end;
$$;

grant execute on function public.futebol_resumo_janela() to authenticated;

notify pgrst, 'reload schema';
