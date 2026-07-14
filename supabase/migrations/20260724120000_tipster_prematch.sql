-- Tipster Arena: prematch (scheduled) events

alter table public.live_events
  drop constraint if exists live_events_status_check;

alter table public.live_events
  add constraint live_events_status_check
  check (status in ('live', 'scheduled', 'suspended', 'finished', 'cancelled'));

alter table public.live_events
  add column if not exists starts_at timestamptz;

create index if not exists live_events_starts_at_idx
  on public.live_events (starts_at)
  where status = 'scheduled';

create table if not exists public.tipster_prematch_meta (
  id integer primary key default 1 check (id = 1),
  fetched_at timestamptz,
  scheduled_total integer not null default 0,
  markets_total integer not null default 0,
  last_error text,
  notes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.tipster_prematch_meta (id) values (1)
on conflict (id) do nothing;

alter table public.tipster_collector_config
  add column if not exists prematch_url text;

grant select on public.tipster_prematch_meta to authenticated;

drop policy if exists tipster_prematch_meta_select_auth on public.tipster_prematch_meta;
create policy tipster_prematch_meta_select_auth
  on public.tipster_prematch_meta for select to authenticated using (true);

drop policy if exists tipster_prematch_meta_service on public.tipster_prematch_meta;
create policy tipster_prematch_meta_service
  on public.tipster_prematch_meta for all to service_role using (true) with check (true);

alter table public.tipster_prematch_meta enable row level security;

-- Allow picks on scheduled (prematch) as well as live
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
  if ev.status is distinct from 'live' and ev.status is distinct from 'scheduled' then
    raise exception 'event not open for picks';
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
    tipster.id, contest.id, p_event_id,
    p_market_key, p_selection_key, mkt.line,
    sel.odd, 1, 'open'
  )
  returning * into pick;

  return pick;
end;
$$;

revoke all on function public.place_pick(uuid, text, text, numeric, text) from public;
grant execute on function public.place_pick(uuid, text, text, numeric, text) to authenticated;

create or replace function public.tick_tipster_prematch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.tipster_collector_config;
begin
  select * into cfg from public.tipster_collector_config where id = 'default';
  if not found or cfg.prematch_url is null or length(trim(cfg.prematch_url)) = 0 then
    raise notice 'tipster_collector_config.prematch_url nao configurada';
    return;
  end if;
  if not cfg.ativo then
    raise notice 'tipster prematch pausado';
    return;
  end if;

  perform net.http_post(
    url := cfg.prematch_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(cfg.cron_secret, '')
    ),
    body := '{}'::jsonb
  );

  update public.tipster_collector_config
  set updated_at = now()
  where id = 'default';
end;
$$;

revoke all on function public.tick_tipster_prematch() from public;
grant execute on function public.tick_tipster_prematch() to postgres;

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'tipster-prematch-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
  perform cron.schedule(
    'tipster-prematch-tick',
    '*/5 * * * *',
    $cron$ select public.tick_tipster_prematch(); $cron$
  );
end;
$$;
