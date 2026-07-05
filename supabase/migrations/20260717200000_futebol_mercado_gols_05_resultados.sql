-- Resultados explicitos: sem_linha_05 (jogo inteiro sem Over +0,5) e excluido (+0,5 desde o inicio)

alter table public.futebol_mercado_gols_05
  drop constraint if exists futebol_mercado_gols_05_resultado_check;

alter table public.futebol_mercado_gols_05
  add constraint futebol_mercado_gols_05_resultado_check
  check (resultado in (
    'watching', 'pending', 'win', 'loss',
    'skipped', 'sem_linha_05', 'excluido'
  ));

-- skipped legado: sem captura = sem linha no jogo; com had_min_plus2 false tende a excluido
update public.futebol_mercado_gols_05
set resultado = 'excluido', updated_at = now()
where resultado = 'skipped' and had_min_plus2_before = false;

update public.futebol_mercado_gols_05
set resultado = 'sem_linha_05', updated_at = now()
where resultado = 'skipped';

create index if not exists futebol_mercado_gols_05_updated_idx
  on public.futebol_mercado_gols_05 (updated_at desc nulls last);
