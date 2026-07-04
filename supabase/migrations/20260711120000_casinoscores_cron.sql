-- Coleta automatica CasinoScores (Mega Sic Bo) via Edge Function + pg_cron
-- Projeto: BetanoMonitor (mddortcbebtkopeanrhu)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove jobs legados se existirem
do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'betano-coleta-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  select jobid into job_id from cron.job where jobname = 'casinoscores-coleta-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

drop function if exists public.tick_coleta_betano_cron() cascade;

create table if not exists public.casinoscores_coleta_config (
  id text primary key default 'default',
  ativo boolean not null default true,
  function_url text not null,
  cron_secret text,
  last_run_at timestamptz,
  last_saved_count integer not null default 0,
  last_error text,
  data_atualizacao timestamptz not null default now()
);

insert into public.casinoscores_coleta_config (id, function_url, cron_secret)
values (
  'default',
  'https://mddortcbebtkopeanrhu.supabase.co/functions/v1/casinoscores-coleta',
  null
)
on conflict (id) do update set
  function_url = excluded.function_url;

alter table public.casinoscores_coleta_config enable row level security;

-- Sem policies publicas: leitura/escrita apenas service_role (painel futuro via RPC)

create or replace function public.tick_casinoscores_coleta()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg record;
  headers jsonb;
begin
  select function_url, cron_secret, ativo
  into cfg
  from public.casinoscores_coleta_config
  where id = 'default';

  if cfg.function_url is null then
    raise notice 'casinoscores_coleta_config.function_url nao configurada';
    return;
  end if;

  if cfg.ativo is distinct from true then
    raise notice 'casinoscores coleta pausada (ativo=false)';
    return;
  end if;

  headers := jsonb_build_object('Content-Type', 'application/json');
  if cfg.cron_secret is not null and length(trim(cfg.cron_secret)) > 0 then
    headers := headers || jsonb_build_object('x-cron-secret', cfg.cron_secret);
  end if;

  perform net.http_post(
    url := cfg.function_url,
    headers := headers,
    body := '{"tick":true}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

select cron.schedule(
  'casinoscores-coleta-tick',
  '* * * * *',
  $$ select public.tick_casinoscores_coleta(); $$
);

notify pgrst, 'reload schema';
