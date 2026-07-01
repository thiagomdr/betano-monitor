-- Backfill gols_na_janela em partidas já finalizadas/em janela (sem eventos históricos).
update public.futebol_partidas p
set gols_na_janela = public.futebol_calc_gols_na_janela(
  p.placar_casa_inicio,
  p.placar_fora_inicio,
  coalesce(p.placar_casa_final, l.placar_casa),
  coalesce(p.placar_fora_final, l.placar_fora)
)
from (
  select distinct on (partida_id)
    partida_id,
    placar_casa,
    placar_fora
  from public.futebol_leituras
  order by partida_id, coletado_em desc
) l
where p.id = l.partida_id
  and p.status in ('em_janela', 'finalizado')
  and p.placar_casa_inicio is not null
  and p.placar_fora_inicio is not null
  and p.gols_na_janela is null;

update public.futebol_partidas p
set gols_na_janela = public.futebol_calc_gols_na_janela(
  placar_casa_inicio,
  placar_fora_inicio,
  placar_casa_final,
  placar_fora_final
)
where status in ('em_janela', 'finalizado')
  and placar_casa_inicio is not null
  and placar_fora_inicio is not null
  and placar_casa_final is not null
  and placar_fora_final is not null
  and gols_na_janela is null;

update public.futebol_leituras l
set gols_totais = l.placar_casa + l.placar_fora
where gols_totais is null;
