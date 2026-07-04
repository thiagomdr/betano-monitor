-- Futebol live (Betano via Edge Function na nuvem — sem IP local)
-- Projeto: BetanoMonitor (mddortcbebtkopeanrhu)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.futebol_live_meta (
  id integer primary key default 1 check (id = 1),
  source text not null default 'betano-danae',
  fetched_at timestamptz,
  live_total integer not null default 0,
  candidates integer not null default 0,
  total integer not null default 0,
  notes text[] not null default '{}',
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.futebol_live_meta (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.futebol_live_rows (
  event_id text primary key,
  home text,
  away text,
  league text,
  country text,
  minute integer,
  injury_time integer,
  home_score integer,
  away_score integer,
  score text,
  home_shots_on_target integer,
  away_shots_on_target integer,
  home_shots_total integer,
  away_shots_total integer,
  home_corners integer,
  away_corners integer,
  home_goal_kicks integer,
  away_goal_kicks integer,
  ml_home numeric,
  ml_draw numeric,
  ml_away numeric,
  under_line numeric,
  under_odd numeric,
  signal text,
  betano_url text,
  stats_available boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists futebol_live_rows_minute_idx
  on public.futebol_live_rows (minute desc nulls last);

alter table public.futebol_live_meta enable row level security;
alter table public.futebol_live_rows enable row level security;

drop policy if exists "futebol_live_meta_select_anon" on public.futebol_live_meta;
create policy "futebol_live_meta_select_anon"
  on public.futebol_live_meta for select to anon, authenticated
  using (true);

drop policy if exists "futebol_live_rows_select_anon" on public.futebol_live_rows;
create policy "futebol_live_rows_select_anon"
  on public.futebol_live_rows for select to anon, authenticated
  using (true);

drop policy if exists "futebol_live_meta_service" on public.futebol_live_meta;
create policy "futebol_live_meta_service"
  on public.futebol_live_meta for all to service_role
  using (true) with check (true);

drop policy if exists "futebol_live_rows_service" on public.futebol_live_rows;
create policy "futebol_live_rows_service"
  on public.futebol_live_rows for all to service_role
  using (true) with check (true);

-- Config do cron (URL da Edge Function)
create table if not exists public.futebol_live_coleta_config (
  id text primary key default 'default',
  ativo boolean not null default true,
  function_url text not null,
  cron_secret text,
  min_minute integer not null default 85,
  last_run_at timestamptz,
  last_saved_count integer not null default 0,
  last_error text,
  data_atualizacao timestamptz not null default now()
);

insert into public.futebol_live_coleta_config (id, function_url, cron_secret)
values (
  'default',
  'https://mddortcbebtkopeanrhu.supabase.co/functions/v1/betano-futebol-live',
  null
)
on conflict (id) do update set
  function_url = excluded.function_url;

alter table public.futebol_live_coleta_config enable row level security;

create or replace function public.tick_futebol_live_coleta()
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
  from public.futebol_live_coleta_config
  where id = 'default';

  if cfg.function_url is null then
    raise notice 'futebol_live_coleta_config.function_url nao configurada';
    return;
  end if;

  if cfg.ativo is distinct from true then
    raise notice 'futebol live coleta pausada (ativo=false)';
    return;
  end if;

  headers := jsonb_build_object('Content-Type', 'application/json');
  if cfg.cron_secret is not null and length(trim(cfg.cron_secret)) > 0 then
    headers := headers || jsonb_build_object('x-cron-secret', cfg.cron_secret);
  end if;

  perform net.http_post(
    url := cfg.function_url,
    headers := headers,
    body := '{}'::jsonb
  );

  update public.futebol_live_coleta_config
  set last_run_at = now(), data_atualizacao = now()
  where id = 'default';
end;
$$;

revoke all on function public.tick_futebol_live_coleta() from public;
grant execute on function public.tick_futebol_live_coleta() to postgres;

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'futebol-live-coleta-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'futebol-live-coleta-tick',
    '*/2 * * * *',
    $cron$ select public.tick_futebol_live_coleta(); $cron$
  );
end $$;
