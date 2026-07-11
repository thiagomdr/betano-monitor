-- Aposta simulada: uma oferta Telegram por jogo; confirmada | recusada
alter table public.futebol_mercado_gols_05
  drop constraint if exists futebol_mercado_gols_05_telegram_confirmacao_check;

update public.futebol_mercado_gols_05
set telegram_confirmacao = 'confirmada'
where telegram_confirmacao = 'correta';

update public.futebol_mercado_gols_05
set telegram_confirmacao = 'recusada'
where telegram_confirmacao = 'incorreta';

alter table public.futebol_mercado_gols_05
  add constraint futebol_mercado_gols_05_telegram_confirmacao_check
    check (
      telegram_confirmacao is null
      or telegram_confirmacao in ('confirmada', 'recusada')
    );

alter table public.futebol_mercado_gols_05
  add column if not exists telegram_capture_sent_at timestamptz;

create index if not exists futebol_mercado_gols_05_telegram_capture_sent_idx
  on public.futebol_mercado_gols_05 (telegram_capture_sent_at)
  where telegram_capture_sent_at is not null;

notify pgrst, 'reload schema';
