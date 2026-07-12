-- Odds 1X2 iniciais de ambos os times (prova / coluna Odd ini no painel).

alter table public.futebol_favorito_drift
  add column if not exists ml_home_inicial numeric,
  add column if not exists ml_away_inicial numeric;

comment on column public.futebol_favorito_drift.ml_home_inicial is
  'Odd Casa na abertura (nao muda depois).';
comment on column public.futebol_favorito_drift.ml_away_inicial is
  'Odd Fora na abertura (nao muda depois).';
