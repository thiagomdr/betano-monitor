-- Minuto atual do jogo na aba Mercado +0,5 (atualizado pelo cron enquanto is_live)
alter table public.futebol_mercado_gols_05
  add column if not exists last_minute integer;
