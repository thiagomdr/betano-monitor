-- Link direto da partida na Betano (campo url do overview/latest)

alter table public.jogos_coleta
  add column if not exists event_id bigint,
  add column if not exists url_partida text;

alter table public.alertas_betano
  add column if not exists url_partida text;

notify pgrst, 'reload schema';
