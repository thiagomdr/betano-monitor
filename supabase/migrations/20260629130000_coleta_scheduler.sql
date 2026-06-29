-- Agendamento automático de coleta na nuvem (4–8 min aleatório)
-- Aplicar no SQL Editor ou: supabase db push

-- fonte_parser: incluir 'api'
alter table public.coletas_betano
  drop constraint if exists coletas_betano_fonte_parser_check;

alter table public.coletas_betano
  add constraint coletas_betano_fonte_parser_check
  check (fonte_parser in ('local', 'llm', 'api', 'nenhum'));

-- Scheduler singleton (monitor na nuvem)
create table if not exists public.coleta_scheduler (
  id text primary key default 'default',
  usuario_id uuid references auth.users (id) on delete set null,
  ativo boolean not null default false,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_interval_ms integer,
  recent_intervals_ms integer[] not null default '{}',
  data_criacao timestamptz not null default now(),
  data_atualizacao timestamptz not null default now()
);

insert into public.coleta_scheduler (id)
values ('default')
on conflict (id) do nothing;

-- Estado por jogo para regras Q2 na nuvem
create table if not exists public.jogos_estado_monitor (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  game_key text not null,
  time_casa text not null,
  time_fora text not null,
  liga text,
  periodo text not null,
  placar_casa integer not null,
  placar_fora integer not null,
  alerta_enviado boolean not null default false,
  data_criacao timestamptz not null default now(),
  data_atualizacao timestamptz not null default now(),
  primary key (usuario_id, game_key)
);

create index if not exists idx_jogos_estado_monitor_usuario
  on public.jogos_estado_monitor (usuario_id);

-- RLS scheduler
alter table public.coleta_scheduler enable row level security;

drop policy if exists coleta_scheduler_select on public.coleta_scheduler;
create policy coleta_scheduler_select
  on public.coleta_scheduler for select
  using (usuario_id is null or auth.uid() = usuario_id);

drop policy if exists coleta_scheduler_insert on public.coleta_scheduler;
create policy coleta_scheduler_insert
  on public.coleta_scheduler for insert
  with check (auth.uid() is not null);

drop policy if exists coleta_scheduler_update on public.coleta_scheduler;
create policy coleta_scheduler_update
  on public.coleta_scheduler for update
  using (usuario_id is null or auth.uid() = usuario_id)
  with check (usuario_id is null or auth.uid() = usuario_id);

-- RLS estado jogos
alter table public.jogos_estado_monitor enable row level security;

drop policy if exists jogos_estado_monitor_select_own on public.jogos_estado_monitor;
create policy jogos_estado_monitor_select_own
  on public.jogos_estado_monitor for select
  using (auth.uid() = usuario_id);

-- pg_cron: tick a cada minuto (chama Edge Function betano-coleta-cron)
-- Requer extensões pg_cron + pg_net no projeto Supabase.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove job anterior se existir
do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'betano-coleta-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

-- Configura secret e URL via tabela auxiliar (atualize após deploy)
create table if not exists public.coleta_cron_config (
  id text primary key default 'default',
  function_url text not null,
  cron_secret text,
  data_atualizacao timestamptz not null default now()
);

insert into public.coleta_cron_config (id, function_url, cron_secret)
values (
  'default',
  'https://mddortcbebtkopeanrhu.supabase.co/functions/v1/betano-coleta-cron',
  null
)
on conflict (id) do nothing;

alter table public.coleta_cron_config enable row level security;

-- Apenas leitura para autenticados (secret não exposto ao app em produção idealmente)
drop policy if exists coleta_cron_config_select on public.coleta_cron_config;
create policy coleta_cron_config_select
  on public.coleta_cron_config for select
  using (auth.role() = 'authenticated');

-- Função chamada pelo pg_cron (security definer)
create or replace function public.tick_coleta_betano_cron()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg record;
  headers jsonb;
begin
  select function_url, cron_secret
  into cfg
  from public.coleta_cron_config
  where id = 'default';

  if cfg.function_url is null then
    raise notice 'coleta_cron_config.function_url não configurada';
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
  'betano-coleta-tick',
  '* * * * *',
  $$ select public.tick_coleta_betano_cron(); $$
);

notify pgrst, 'reload schema';
