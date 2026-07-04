-- Lightning Storm: nova coleta; Mega Sic Bo arquivado (coleta pausada)

create table if not exists public.lightning_storm_rounds (
  id                uuid primary key default gen_random_uuid(),
  round_id          text unique not null,
  table_name        text not null default 'casinoscores-lightning-storm',
  finalized_at      timestamptz,
  collected_at      timestamptz not null default now(),
  wheel_sector_type text not null,
  outcome           text not null,
  is_bonus          boolean not null default false,
  max_multiplier    numeric(14, 2),
  wheel_multiplier  smallint,
  bonus_multiplier  numeric(14, 2),
  raw_payload       jsonb not null
);

create index if not exists idx_ls_rounds_finalized
  on public.lightning_storm_rounds (finalized_at desc nulls last);

create index if not exists idx_ls_rounds_outcome
  on public.lightning_storm_rounds (outcome);

create index if not exists idx_ls_rounds_collected
  on public.lightning_storm_rounds (collected_at desc);

create table if not exists public.lightning_storm_public_stats (
  id               text primary key default 'casinoscores-lightning-storm',
  duration_minutes integer not null default 4320,
  stats            jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

insert into public.lightning_storm_public_stats (id)
values ('casinoscores-lightning-storm')
on conflict (id) do nothing;

alter table public.lightning_storm_rounds enable row level security;
alter table public.lightning_storm_public_stats enable row level security;

drop policy if exists "ls_rounds_select_anon" on public.lightning_storm_rounds;
create policy "ls_rounds_select_anon"
  on public.lightning_storm_rounds for select to anon
  using (table_name = 'casinoscores-lightning-storm');

drop policy if exists "ls_stats_select_anon" on public.lightning_storm_public_stats;
create policy "ls_stats_select_anon"
  on public.lightning_storm_public_stats for select to anon
  using (id = 'casinoscores-lightning-storm');

drop policy if exists "ls_rounds_service_role" on public.lightning_storm_rounds;
create policy "ls_rounds_service_role"
  on public.lightning_storm_rounds for all to service_role
  using (true) with check (true);

drop policy if exists "ls_stats_service_role" on public.lightning_storm_public_stats;
create policy "ls_stats_service_role"
  on public.lightning_storm_public_stats for all to service_role
  using (true) with check (true);

-- Pausa coleta Sic Bo; ativa Lightning Storm
update public.casinoscores_coleta_config
set ativo = false, data_atualizacao = now()
where id = 'default';

insert into public.casinoscores_coleta_config (id, ativo, function_url)
values (
  'lightning-storm',
  true,
  'https://mddortcbebtkopeanrhu.supabase.co/functions/v1/lightningstorm-coleta'
)
on conflict (id) do update set
  ativo = true,
  function_url = excluded.function_url,
  data_atualizacao = now();

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
  where id = 'lightning-storm';

  if cfg.function_url is null then
    raise notice 'lightning-storm coleta: function_url nao configurada';
    return;
  end if;

  if cfg.ativo is distinct from true then
    raise notice 'lightning-storm coleta pausada (ativo=false)';
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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'lightning_storm_rounds'
  ) then
    alter publication supabase_realtime add table public.lightning_storm_rounds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'lightning_storm_public_stats'
  ) then
    alter publication supabase_realtime add table public.lightning_storm_public_stats;
  end if;
end $$;

notify pgrst, 'reload schema';
