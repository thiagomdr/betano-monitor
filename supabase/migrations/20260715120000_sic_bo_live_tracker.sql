-- Rastreador AO VIVO: todas as rodadas a partir do corte (sessao), contagem ate trinca

create table if not exists public.sic_bo_live_state (
  id                       text primary key,
  table_name               text not null default 'casinoscores-mega-sic-bo',
  session_started_at       timestamptz not null default now(),
  total_rounds             bigint not null default 0,
  rounds_since_last_triple integer not null default 0,
  total_triples            integer not null default 0,
  last_triple_round_id     text,
  last_triple_face         smallint check (last_triple_face between 1 and 6),
  last_triple_at           timestamptz,
  max_interval_ever        integer,
  min_interval_ever        integer,
  avg_interval             numeric(10, 2),
  updated_at               timestamptz not null default now()
);

insert into public.sic_bo_live_state (id, table_name, session_started_at)
values ('casinoscores-mega-sic-bo', 'casinoscores-mega-sic-bo', now())
on conflict (id) do nothing;

create table if not exists public.sic_bo_live_rounds (
  id                       uuid primary key default gen_random_uuid(),
  round_id                 text not null unique,
  table_name               text not null default 'casinoscores-mega-sic-bo',
  session_seq              bigint not null,
  dice_1                   smallint not null check (dice_1 between 1 and 6),
  dice_2                   smallint not null check (dice_2 between 1 and 6),
  dice_3                   smallint not null check (dice_3 between 1 and 6),
  sum_total                smallint not null check (sum_total between 3 and 18),
  is_triple                boolean not null,
  finalized_at             timestamptz,
  rounds_before_this       integer not null default 0,
  collected_at             timestamptz not null default now(),
  unique (table_name, session_seq)
);

create index if not exists idx_sic_bo_live_rounds_seq
  on public.sic_bo_live_rounds (table_name, session_seq desc);

create index if not exists idx_sic_bo_live_rounds_finalized
  on public.sic_bo_live_rounds (table_name, finalized_at desc nulls last);

create table if not exists public.sic_bo_live_triple_events (
  id                       uuid primary key default gen_random_uuid(),
  round_id                 text not null unique references public.sic_bo_live_rounds (round_id) on delete cascade,
  table_name               text not null default 'casinoscores-mega-sic-bo',
  session_seq              bigint not null,
  triple_face              smallint not null check (triple_face between 1 and 6),
  dice_1                   smallint not null,
  dice_2                   smallint not null,
  dice_3                   smallint not null,
  sum_total                smallint not null,
  finalized_at             timestamptz,
  rounds_since_last_triple integer,
  triple_seq               integer not null,
  collected_at             timestamptz not null default now(),
  unique (table_name, session_seq),
  unique (table_name, triple_seq)
);

create index if not exists idx_sic_bo_live_triple_finalized
  on public.sic_bo_live_triple_events (table_name, finalized_at desc nulls last);

create or replace function public.on_sic_bo_round_insert_live_tracker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.sic_bo_live_state%rowtype;
  v_interval integer;
  v_is_triple boolean;
begin
  if new.table_name is distinct from 'casinoscores-mega-sic-bo' then
    return new;
  end if;

  select * into v_state
  from public.sic_bo_live_state
  where id = new.table_name
  for update;

  if not found then
    return new;
  end if;

  if new.finalized_at is not null and new.finalized_at < v_state.session_started_at then
    return new;
  end if;

  if exists (select 1 from public.sic_bo_live_rounds where round_id = new.round_id) then
    return new;
  end if;

  v_is_triple := new.is_triple
    and new.dice_1 = new.dice_2
    and new.dice_2 = new.dice_3;

  insert into public.sic_bo_live_rounds (
    round_id, table_name, session_seq,
    dice_1, dice_2, dice_3, sum_total, is_triple,
    finalized_at, rounds_before_this
  ) values (
    new.round_id, new.table_name, v_state.total_rounds + 1,
    new.dice_1, new.dice_2, new.dice_3, new.sum_total, v_is_triple,
    new.finalized_at, v_state.rounds_since_last_triple
  );

  if v_is_triple then
    v_interval := v_state.rounds_since_last_triple + 1;

    insert into public.sic_bo_live_triple_events (
      round_id, table_name, session_seq, triple_face,
      dice_1, dice_2, dice_3, sum_total, finalized_at,
      rounds_since_last_triple, triple_seq
    ) values (
      new.round_id, new.table_name, v_state.total_rounds + 1, new.dice_1,
      new.dice_1, new.dice_2, new.dice_3, new.sum_total, new.finalized_at,
      case when v_state.total_triples = 0 then null else v_interval end,
      v_state.total_triples + 1
    );

    update public.sic_bo_live_state set
      total_rounds = total_rounds + 1,
      rounds_since_last_triple = 0,
      total_triples = total_triples + 1,
      last_triple_round_id = new.round_id,
      last_triple_face = new.dice_1,
      last_triple_at = new.finalized_at,
      max_interval_ever = case when total_triples = 0 then max_interval_ever
        else greatest(coalesce(max_interval_ever, v_interval), v_interval) end,
      min_interval_ever = case when total_triples = 0 then min_interval_ever
        when min_interval_ever is null then v_interval else least(min_interval_ever, v_interval) end,
      avg_interval = case when total_triples = 0 then avg_interval else round(
        ((coalesce(avg_interval, 0) * total_triples + v_interval) / (total_triples + 1))::numeric, 2) end,
      updated_at = now()
    where id = new.table_name;
  else
    update public.sic_bo_live_state set
      total_rounds = total_rounds + 1,
      rounds_since_last_triple = rounds_since_last_triple + 1,
      updated_at = now()
    where id = new.table_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sic_bo_round_live_tracker on public.sic_bo_rounds;
create trigger trg_sic_bo_round_live_tracker
  after insert on public.sic_bo_rounds
  for each row
  execute function public.on_sic_bo_round_insert_live_tracker();

alter table public.sic_bo_live_state enable row level security;
alter table public.sic_bo_live_rounds enable row level security;
alter table public.sic_bo_live_triple_events enable row level security;

drop policy if exists "sic_bo_live_state_select_anon" on public.sic_bo_live_state;
create policy "sic_bo_live_state_select_anon"
  on public.sic_bo_live_state for select to anon
  using (id = 'casinoscores-mega-sic-bo');

drop policy if exists "sic_bo_live_rounds_select_anon" on public.sic_bo_live_rounds;
create policy "sic_bo_live_rounds_select_anon"
  on public.sic_bo_live_rounds for select to anon
  using (table_name = 'casinoscores-mega-sic-bo');

drop policy if exists "sic_bo_live_triple_select_anon" on public.sic_bo_live_triple_events;
create policy "sic_bo_live_triple_select_anon"
  on public.sic_bo_live_triple_events for select to anon
  using (table_name = 'casinoscores-mega-sic-bo');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sic_bo_live_state'
  ) then
    alter publication supabase_realtime add table public.sic_bo_live_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sic_bo_live_rounds'
  ) then
    alter publication supabase_realtime add table public.sic_bo_live_rounds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sic_bo_live_triple_events'
  ) then
    alter publication supabase_realtime add table public.sic_bo_live_triple_events;
  end if;
end $$;

notify pgrst, 'reload schema';
