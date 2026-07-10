-- Renomeia super_05 → estrategia_05 ("Estratégia +0,5")
-- Mantém imediato_05 inalterado.

alter table public.futebol_mercado_gols_05
  drop constraint if exists futebol_mercado_gols_05_estrategia_check;

update public.futebol_mercado_gols_05
set estrategia = 'estrategia_05', updated_at = now()
where estrategia = 'super_05';

alter table public.futebol_mercado_gols_05
  add constraint futebol_mercado_gols_05_estrategia_check
  check (estrategia is null or estrategia in ('estrategia_05', 'imediato_05'));
