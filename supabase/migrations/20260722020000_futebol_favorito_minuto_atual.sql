-- Minuto atual do jogo (atualizado a cada cron da Edge) para coluna Tempo no painel.

alter table public.futebol_favorito_drift
  add column if not exists minuto_atual integer;

comment on column public.futebol_favorito_drift.minuto_atual is
  'Ultimo minuto live visto pela Edge (coluna Tempo no painel).';
