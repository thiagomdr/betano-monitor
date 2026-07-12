-- Minuto do jogo no momento do print (prova odd inicial).

alter table public.futebol_favorito_drift
  add column if not exists screenshot_minuto integer;

comment on column public.futebol_favorito_drift.screenshot_minuto is
  'Minuto live no momento do screenshot; limpo no settle.';
