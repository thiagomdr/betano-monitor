-- Cron: lembretes Telegram a cada minuto (4 ticks de 15s dentro da function)
create or replace function public.tick_futebol_telegram_reminder()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg record;
  headers jsonb;
  reminder_url text;
begin
  select function_url, cron_secret, ativo
  into cfg
  from public.futebol_live_coleta_config
  where id = 'default';

  if cfg.function_url is null then
    raise notice 'futebol_live_coleta_config.function_url nao configurada';
    return;
  end if;

  if cfg.ativo is distinct from true then
    return;
  end if;

  reminder_url := regexp_replace(cfg.function_url, '/betano-futebol-live$', '/telegram-reminder');

  headers := jsonb_build_object('Content-Type', 'application/json');
  if cfg.cron_secret is not null and length(trim(cfg.cron_secret)) > 0 then
    headers := headers || jsonb_build_object('x-cron-secret', cfg.cron_secret);
  end if;

  perform net.http_post(
    url := reminder_url,
    headers := headers,
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.tick_futebol_telegram_reminder() from public;
grant execute on function public.tick_futebol_telegram_reminder() to postgres;

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'futebol-telegram-reminder-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'futebol-telegram-reminder-tick',
    '* * * * *',
    $cron$ select public.tick_futebol_telegram_reminder(); $cron$
  );
end $$;

notify pgrst, 'reload schema';
