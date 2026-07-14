-- Arena Tipster: cron for prematch-bridge + link-sync (placar GISMO → finished → settle)

alter table public.tipster_collector_config
  add column if not exists bridge_url text,
  add column if not exists link_sync_url text,
  add column if not exists last_bridge_at timestamptz,
  add column if not exists last_link_sync_at timestamptz;

create or replace function public.tick_tipster_bridge()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg record;
  headers jsonb;
begin
  select bridge_url, cron_secret, ativo
  into cfg
  from public.tipster_collector_config
  where id = 'default';

  if cfg.bridge_url is null or length(trim(cfg.bridge_url)) = 0 then
    raise notice 'tipster_collector_config.bridge_url nao configurada';
    return;
  end if;
  if cfg.ativo is distinct from true then
    raise notice 'tipster bridge pausado';
    return;
  end if;

  headers := jsonb_build_object('Content-Type', 'application/json');
  if cfg.cron_secret is not null and length(trim(cfg.cron_secret)) > 0 then
    headers := headers || jsonb_build_object('x-cron-secret', cfg.cron_secret);
  end if;

  perform net.http_post(
    url := cfg.bridge_url,
    headers := headers,
    body := '{"betano_from":"both"}'::jsonb
  );

  update public.tipster_collector_config
  set last_bridge_at = now(), updated_at = now()
  where id = 'default';
end;
$$;

create or replace function public.tick_tipster_link_sync()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg record;
  headers jsonb;
begin
  select link_sync_url, cron_secret, ativo
  into cfg
  from public.tipster_collector_config
  where id = 'default';

  if cfg.link_sync_url is null or length(trim(cfg.link_sync_url)) = 0 then
    raise notice 'tipster_collector_config.link_sync_url nao configurada';
    return;
  end if;
  if cfg.ativo is distinct from true then
    raise notice 'tipster link-sync pausado';
    return;
  end if;

  headers := jsonb_build_object('Content-Type', 'application/json');
  if cfg.cron_secret is not null and length(trim(cfg.cron_secret)) > 0 then
    headers := headers || jsonb_build_object('x-cron-secret', cfg.cron_secret);
  end if;

  perform net.http_post(
    url := cfg.link_sync_url,
    headers := headers,
    body := '{}'::jsonb
  );

  update public.tipster_collector_config
  set last_link_sync_at = now(), updated_at = now()
  where id = 'default';
end;
$$;

revoke all on function public.tick_tipster_bridge() from public;
grant execute on function public.tick_tipster_bridge() to postgres;
revoke all on function public.tick_tipster_link_sync() from public;
grant execute on function public.tick_tipster_link_sync() to postgres;

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'tipster-bridge-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
  perform cron.schedule(
    'tipster-bridge-tick',
    '*/10 * * * *',
    $cron$ select public.tick_tipster_bridge(); $cron$
  );

  select jobid into job_id from cron.job where jobname = 'tipster-link-sync-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
  perform cron.schedule(
    'tipster-link-sync-tick',
    '*/2 * * * *',
    $cron$ select public.tick_tipster_link_sync(); $cron$
  );
end;
$$;
