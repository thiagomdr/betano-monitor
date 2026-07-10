-- Odd +0,5 na abertura (over_05_odd) vs ultima odd monitorada antes do GREEN/RED.
alter table public.futebol_mercado_gols_05
  add column if not exists over_05_odd_ultima numeric;

comment on column public.futebol_mercado_gols_05.over_05_odd is
  'Primeira odd +0,5 real (abertura da analise).';
comment on column public.futebol_mercado_gols_05.over_05_odd_ultima is
  'Ultima odd +0,5 monitorada antes do GREEN (pre-gol) ou do RED (fim do jogo).';

-- Backfill: jogos ja liquidados sem serie — ultima = abertura.
update public.futebol_mercado_gols_05
set over_05_odd_ultima = over_05_odd
where over_05_odd is not null
  and over_05_odd_ultima is null;
