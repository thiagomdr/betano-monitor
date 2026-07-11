-- Notificacao Telegram unica ao liquidar GREEN/RED (sem lembrete)
alter table public.futebol_mercado_gols_05
  add column if not exists telegram_settle_notified_at timestamptz;

create index if not exists futebol_mercado_gols_05_telegram_settle_idx
  on public.futebol_mercado_gols_05 (telegram_settle_notified_at)
  where telegram_settle_notified_at is null
    and resultado in ('win', 'loss');

notify pgrst, 'reload schema';
