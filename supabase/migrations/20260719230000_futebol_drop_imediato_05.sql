-- Remove estrategia Imediato (e legado Super): tudo vira Estrategia +0,5.

alter table public.futebol_mercado_gols_05
  drop constraint if exists futebol_mercado_gols_05_estrategia_check;

update public.futebol_mercado_gols_05
set estrategia = 'estrategia_05', updated_at = now()
where estrategia in ('imediato_05', 'super_05');

-- Qualquer outro valor legado (exceto null) tambem unifica.
update public.futebol_mercado_gols_05
set estrategia = 'estrategia_05', updated_at = now()
where estrategia is not null
  and estrategia <> 'estrategia_05';

alter table public.futebol_mercado_gols_05
  add constraint futebol_mercado_gols_05_estrategia_check
  check (estrategia is null or estrategia = 'estrategia_05');
