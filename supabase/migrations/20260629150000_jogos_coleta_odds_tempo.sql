-- Odds vencedor + tempo restante por jogo em cada coleta

alter table public.jogos_coleta
  add column if not exists odd_casa numeric(8, 2) not null default 0,
  add column if not exists odd_fora numeric(8, 2) not null default 0,
  add column if not exists tempo_restante text;

notify pgrst, 'reload schema';
