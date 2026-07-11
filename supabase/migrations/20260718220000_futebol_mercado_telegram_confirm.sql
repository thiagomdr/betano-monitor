-- Confirmacao manual via Telegram (botoes Correto / Erro na notificacao de captura)
alter table public.futebol_mercado_gols_05
  add column if not exists telegram_confirmacao text
    check (telegram_confirmacao is null or telegram_confirmacao in ('correta', 'incorreta')),
  add column if not exists telegram_confirmado_em timestamptz,
  add column if not exists telegram_confirmado_por bigint,
  add column if not exists telegram_message_id bigint;

create index if not exists futebol_mercado_gols_05_telegram_confirm_idx
  on public.futebol_mercado_gols_05 (telegram_confirmacao)
  where telegram_confirmacao is not null;

notify pgrst, 'reload schema';
