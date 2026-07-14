-- Tipster Arena / Terminal (paper trading contest)
-- Provider-agnostic live catalog + picks + ranking. Isolated from mercado +0,5 / HCTG / favorito.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipsters & contests
-- ---------------------------------------------------------------------------

create table if not exists public.tipsters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) >= 2),
  created_at timestamptz not null default now()
);

create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.contest_entries (
  contest_id uuid not null references public.contests (id) on delete cascade,
  tipster_id uuid not null references public.tipsters (id) on delete cascade,
  subscribed_at timestamptz not null default now(),
  payment_status text not null default 'mock_ok',
  primary key (contest_id, tipster_id)
);

insert into public.contests (slug, title, status, starts_at)
values ('arena-open', 'Arena Tipster — Open', 'open', now())
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Live catalog (odds provider agnostic)
-- ---------------------------------------------------------------------------

create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  sport text not null default 'football',
  league text,
  home text not null,
  away text not null,
  minute integer,
  home_score integer,
  away_score integer,
  status text not null default 'live'
    check (status in ('live', 'suspended', 'finished', 'cancelled')),
  betradar_id text,
  kickoff_at timestamptz,
  finished_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists live_events_status_idx on public.live_events (status);
create index if not exists live_events_updated_idx on public.live_events (updated_at desc);

create table if not exists public.live_markets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_events (id) on delete cascade,
  market_key text not null
    check (market_key in ('1x2', 'total', 'btts', 'double_chance')),
  line numeric,
  status text not null default 'open'
    check (status in ('open', 'suspended', 'settled', 'void')),
  provider_market_id text,
  updated_at timestamptz not null default now()
);

create unique index if not exists live_markets_event_key_line_uidx
  on public.live_markets (event_id, market_key, (coalesce(line, -1::numeric)));

create index if not exists live_markets_event_idx on public.live_markets (event_id);

create table if not exists public.live_selections (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.live_markets (id) on delete cascade,
  selection_key text not null,
  odd numeric not null check (odd >= 1.01),
  status text not null default 'open'
    check (status in ('open', 'suspended', 'settled', 'void')),
  provider_selection_id text,
  updated_at timestamptz not null default now(),
  unique (market_id, selection_key)
);

create index if not exists live_selections_market_idx on public.live_selections (market_id);

-- ---------------------------------------------------------------------------
-- Picks
-- ---------------------------------------------------------------------------

create table if not exists public.picks (
  id uuid primary key default gen_random_uuid(),
  tipster_id uuid not null references public.tipsters (id) on delete cascade,
  contest_id uuid not null references public.contests (id) on delete cascade,
  event_id uuid not null references public.live_events (id) on delete cascade,
  market_key text not null,
  selection_key text not null,
  line numeric,
  odd_snapshot numeric not null check (odd_snapshot >= 1.01),
  stake_u numeric not null default 1 check (stake_u = 1),
  status text not null default 'open'
    check (status in ('open', 'won', 'lost', 'void')),
  pnl_u numeric,
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists picks_tipster_placed_idx
  on public.picks (tipster_id, placed_at desc);
create index if not exists picks_open_event_idx
  on public.picks (event_id)
  where status = 'open';
create index if not exists picks_contest_status_idx
  on public.picks (contest_id, status);

-- ---------------------------------------------------------------------------
-- Collector / settle meta + cron config
-- ---------------------------------------------------------------------------

create table if not exists public.tipster_live_meta (
  id integer primary key default 1 check (id = 1),
  fetched_at timestamptz,
  live_total integer not null default 0,
  markets_total integer not null default 0,
  last_error text,
  notes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.tipster_live_meta (id) values (1)
on conflict (id) do nothing;

create table if not exists public.tipster_collector_config (
  id text primary key default 'default',
  ativo boolean not null default true,
  collector_url text,
  settle_url text,
  cron_secret text,
  last_collector_at timestamptz,
  last_settle_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.tipster_collector_config (id)
values ('default')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ranking view
-- ---------------------------------------------------------------------------

create or replace view public.v_tipster_ranking as
select
  t.id as tipster_id,
  t.display_name,
  c.id as contest_id,
  c.slug as contest_slug,
  count(*) filter (where p.status in ('won', 'lost')) as settled_n,
  count(*) filter (where p.status = 'won') as wins,
  count(*) filter (where p.status = 'lost') as losses,
  count(*) filter (where p.status = 'open') as open_n,
  count(*) filter (where p.status = 'void') as voids,
  coalesce(sum(p.pnl_u) filter (where p.status in ('won', 'lost', 'void')), 0)::numeric as pnl_u,
  case
    when count(*) filter (where p.status in ('won', 'lost')) > 0
    then (
      count(*) filter (where p.status = 'won')::numeric
      / count(*) filter (where p.status in ('won', 'lost'))
    )
    else null
  end as winrate
from public.tipsters t
cross join public.contests c
left join public.contest_entries e
  on e.tipster_id = t.id and e.contest_id = c.id
left join public.picks p
  on p.tipster_id = t.id and p.contest_id = c.id
where e.tipster_id is not null
group by t.id, t.display_name, c.id, c.slug;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.ensure_tipster(p_display_name text default null)
returns public.tipsters
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.tipsters;
  name text;
  contest_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into row from public.tipsters where user_id = uid;
  if found then
    if p_display_name is not null and char_length(trim(p_display_name)) >= 2 then
      update public.tipsters
      set display_name = trim(p_display_name)
      where id = row.id
      returning * into row;
    end if;
  else
    name := coalesce(nullif(trim(p_display_name), ''), 'Tipster');
    if char_length(name) < 2 then
      name := 'Tipster';
    end if;
    insert into public.tipsters (user_id, display_name)
    values (uid, name)
    returning * into row;
  end if;

  select id into contest_id from public.contests where slug = 'arena-open' and status = 'open' limit 1;
  if contest_id is not null then
    insert into public.contest_entries (contest_id, tipster_id, payment_status)
    values (contest_id, row.id, 'mock_ok')
    on conflict do nothing;
  end if;

  return row;
end;
$$;

create or replace function public.place_pick(
  p_event_id uuid,
  p_market_key text,
  p_selection_key text,
  p_line numeric default null,
  p_contest_slug text default 'arena-open'
)
returns public.picks
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tipster public.tipsters;
  contest public.contests;
  ev public.live_events;
  mkt public.live_markets;
  sel public.live_selections;
  pick public.picks;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  tipster := public.ensure_tipster(null);

  select * into contest
  from public.contests
  where slug = p_contest_slug and status = 'open'
  limit 1;
  if not found then
    raise exception 'contest not open';
  end if;

  if not exists (
    select 1 from public.contest_entries
    where contest_id = contest.id and tipster_id = tipster.id
  ) then
    raise exception 'not enrolled in contest';
  end if;

  select * into ev from public.live_events where id = p_event_id;
  if not found then
    raise exception 'event not found';
  end if;
  if ev.status is distinct from 'live' then
    raise exception 'event not live';
  end if;

  select * into mkt
  from public.live_markets
  where event_id = p_event_id
    and market_key = p_market_key
    and (
      (p_line is null and line is null)
      or (p_line is not null and line is not null and abs(line - p_line) < 0.001)
    )
  limit 1;
  if not found then
    raise exception 'market not found';
  end if;
  if mkt.status is distinct from 'open' then
    raise exception 'market not open';
  end if;

  select * into sel
  from public.live_selections
  where market_id = mkt.id
    and selection_key = p_selection_key
  limit 1;
  if not found then
    raise exception 'selection not found';
  end if;
  if sel.status is distinct from 'open' then
    raise exception 'selection not open';
  end if;
  if sel.odd is null or sel.odd < 1.01 then
    raise exception 'invalid odd';
  end if;

  insert into public.picks (
    tipster_id, contest_id, event_id,
    market_key, selection_key, line,
    odd_snapshot, stake_u, status
  ) values (
    tipster.id, contest.id, ev.id,
    p_market_key, p_selection_key, mkt.line,
    sel.odd, 1, 'open'
  )
  returning * into pick;

  return pick;
end;
$$;

revoke all on function public.ensure_tipster(text) from public;
revoke all on function public.place_pick(uuid, text, text, numeric, text) from public;
grant execute on function public.ensure_tipster(text) to authenticated;
grant execute on function public.place_pick(uuid, text, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tipsters enable row level security;
alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.live_events enable row level security;
alter table public.live_markets enable row level security;
alter table public.live_selections enable row level security;
alter table public.picks enable row level security;
alter table public.tipster_live_meta enable row level security;
alter table public.tipster_collector_config enable row level security;

drop policy if exists tipsters_select_auth on public.tipsters;
create policy tipsters_select_auth
  on public.tipsters for select to authenticated using (true);

drop policy if exists tipsters_update_own on public.tipsters;
create policy tipsters_update_own
  on public.tipsters for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists contests_select_auth on public.contests;
create policy contests_select_auth
  on public.contests for select to authenticated using (true);

drop policy if exists contest_entries_select_auth on public.contest_entries;
create policy contest_entries_select_auth
  on public.contest_entries for select to authenticated using (true);

drop policy if exists live_events_select_auth on public.live_events;
create policy live_events_select_auth
  on public.live_events for select to authenticated using (true);

drop policy if exists live_markets_select_auth on public.live_markets;
create policy live_markets_select_auth
  on public.live_markets for select to authenticated using (true);

drop policy if exists live_selections_select_auth on public.live_selections;
create policy live_selections_select_auth
  on public.live_selections for select to authenticated using (true);

drop policy if exists picks_select_auth on public.picks;
create policy picks_select_auth
  on public.picks for select to authenticated using (true);

drop policy if exists tipster_live_meta_select_auth on public.tipster_live_meta;
create policy tipster_live_meta_select_auth
  on public.tipster_live_meta for select to authenticated using (true);

-- service_role writes (edge collectors)
drop policy if exists tipsters_service on public.tipsters;
create policy tipsters_service
  on public.tipsters for all to service_role using (true) with check (true);

drop policy if exists contests_service on public.contests;
create policy contests_service
  on public.contests for all to service_role using (true) with check (true);

drop policy if exists contest_entries_service on public.contest_entries;
create policy contest_entries_service
  on public.contest_entries for all to service_role using (true) with check (true);

drop policy if exists live_events_service on public.live_events;
create policy live_events_service
  on public.live_events for all to service_role using (true) with check (true);

drop policy if exists live_markets_service on public.live_markets;
create policy live_markets_service
  on public.live_markets for all to service_role using (true) with check (true);

drop policy if exists live_selections_service on public.live_selections;
create policy live_selections_service
  on public.live_selections for all to service_role using (true) with check (true);

drop policy if exists picks_service on public.picks;
create policy picks_service
  on public.picks for all to service_role using (true) with check (true);

drop policy if exists tipster_live_meta_service on public.tipster_live_meta;
create policy tipster_live_meta_service
  on public.tipster_live_meta for all to service_role using (true) with check (true);

drop policy if exists tipster_collector_config_service on public.tipster_collector_config;
create policy tipster_collector_config_service
  on public.tipster_collector_config for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Cron tickers
-- ---------------------------------------------------------------------------

create or replace function public.tick_tipster_collector()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg record;
  headers jsonb;
begin
  select collector_url, cron_secret, ativo
  into cfg
  from public.tipster_collector_config
  where id = 'default';

  if cfg.collector_url is null or length(trim(cfg.collector_url)) = 0 then
    raise notice 'tipster_collector_config.collector_url nao configurada';
    return;
  end if;
  if cfg.ativo is distinct from true then
    raise notice 'tipster collector pausado';
    return;
  end if;

  headers := jsonb_build_object('Content-Type', 'application/json');
  if cfg.cron_secret is not null and length(trim(cfg.cron_secret)) > 0 then
    headers := headers || jsonb_build_object('x-cron-secret', cfg.cron_secret);
  end if;

  perform net.http_post(
    url := cfg.collector_url,
    headers := headers,
    body := '{}'::jsonb
  );

  update public.tipster_collector_config
  set last_collector_at = now(), updated_at = now()
  where id = 'default';
end;
$$;

create or replace function public.tick_tipster_settle()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg record;
  headers jsonb;
begin
  select settle_url, cron_secret, ativo
  into cfg
  from public.tipster_collector_config
  where id = 'default';

  if cfg.settle_url is null or length(trim(cfg.settle_url)) = 0 then
    raise notice 'tipster_collector_config.settle_url nao configurada';
    return;
  end if;
  if cfg.ativo is distinct from true then
    raise notice 'tipster settle pausado';
    return;
  end if;

  headers := jsonb_build_object('Content-Type', 'application/json');
  if cfg.cron_secret is not null and length(trim(cfg.cron_secret)) > 0 then
    headers := headers || jsonb_build_object('x-cron-secret', cfg.cron_secret);
  end if;

  perform net.http_post(
    url := cfg.settle_url,
    headers := headers,
    body := '{}'::jsonb
  );

  update public.tipster_collector_config
  set last_settle_at = now(), updated_at = now()
  where id = 'default';
end;
$$;

revoke all on function public.tick_tipster_collector() from public;
revoke all on function public.tick_tipster_settle() from public;
grant execute on function public.tick_tipster_collector() to postgres;
grant execute on function public.tick_tipster_settle() to postgres;

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'tipster-collector-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
  perform cron.schedule(
    'tipster-collector-tick',
    '*/2 * * * *',
    $cron$ select public.tick_tipster_collector(); $cron$
  );

  select jobid into job_id from cron.job where jobname = 'tipster-settle-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
  perform cron.schedule(
    'tipster-settle-tick',
    '*/2 * * * *',
    $cron$ select public.tick_tipster_settle(); $cron$
  );
end $$;

grant select on public.v_tipster_ranking to authenticated;
grant select on public.tipsters to authenticated;
grant select on public.contests to authenticated;
grant select on public.contest_entries to authenticated;
grant select on public.live_events to authenticated;
grant select on public.live_markets to authenticated;
grant select on public.live_selections to authenticated;
grant select on public.picks to authenticated;
grant select on public.tipster_live_meta to authenticated;

notify pgrst, 'reload schema';
