-- Estrategias: super_05 (+0,5 apos fase +1,5/+2,5) e imediato_05 (+0,5 desde a 1a coleta)

alter table public.futebol_mercado_gols_05
  add column if not exists estrategia text
  check (estrategia is null or estrategia in ('super_05', 'imediato_05'));

update public.futebol_mercado_gols_05
set estrategia = 'super_05', updated_at = now()
where captured_at is not null and had_min_plus2_before = true;

update public.futebol_mercado_gols_05
set estrategia = 'imediato_05', updated_at = now()
where captured_at is not null
  and coalesce(had_min_plus2_before, false) = false;

update public.futebol_mercado_gols_05
set estrategia = 'imediato_05', updated_at = now()
where resultado = 'excluido';

create index if not exists futebol_mercado_gols_05_estrategia_idx
  on public.futebol_mercado_gols_05 (estrategia);
