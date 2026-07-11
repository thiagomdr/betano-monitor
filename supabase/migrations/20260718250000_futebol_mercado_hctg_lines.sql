-- Total de Gols completo (JSON do evento overview?eventId=) — fonte para painel e captura +0,5
alter table public.futebol_mercado_gols_05
  add column if not exists hctg_lines jsonb not null default '[]'::jsonb,
  add column if not exists hctg_fetched_at timestamptz,
  add column if not exists hctg_source text;

create index if not exists futebol_mercado_gols_05_hctg_live_idx
  on public.futebol_mercado_gols_05 (is_live, hctg_fetched_at desc nulls last)
  where is_live = true and resultado is distinct from 'excluido';

notify pgrst, 'reload schema';
