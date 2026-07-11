-- Lembretes Telegram ate confirmacao (janela 5 min, intervalo 15s no worker)
alter table public.futebol_mercado_gols_05
  add column if not exists telegram_reminder_started_at timestamptz,
  add column if not exists telegram_last_notify_at timestamptz;

create index if not exists futebol_mercado_gols_05_telegram_reminder_idx
  on public.futebol_mercado_gols_05 (telegram_last_notify_at)
  where telegram_confirmacao is null
    and captured_at is not null
    and telegram_reminder_started_at is not null;

notify pgrst, 'reload schema';
