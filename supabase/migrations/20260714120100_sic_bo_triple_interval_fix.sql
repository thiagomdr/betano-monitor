-- Corrige calculo de intervalo (rodadas ate repetir = diff de indice global)

create or replace function public.rebuild_sic_bo_triple_tracker(
  p_table_name text default 'casinoscores-mega-sic-bo'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_global_index bigint := 0;
  v_last_triple_index bigint := null;
  v_total_triples integer := 0;
  v_max_interval integer := null;
  v_min_interval integer := null;
  v_sum_intervals bigint := 0;
  v_interval_count integer := 0;
  v_last_round_id text := null;
  v_last_face smallint := null;
  v_last_at timestamptz := null;
  v_interval integer := null;
  v_rounds_since integer := 0;
begin
  delete from public.sic_bo_triple_events
  where table_name = p_table_name;

  for r in
    select round_id, dice_1, dice_2, dice_3, sum_total, is_triple, finalized_at
    from public.sic_bo_rounds
    where table_name = p_table_name
    order by finalized_at asc nulls last, round_id asc
  loop
    v_global_index := v_global_index + 1;

    if r.is_triple and r.dice_1 = r.dice_2 and r.dice_2 = r.dice_3 then
      v_interval := case
        when v_last_triple_index is null then null
        else (v_global_index - v_last_triple_index)::integer
      end;

      insert into public.sic_bo_triple_events (
        round_id, table_name, triple_face, dice_1, dice_2, dice_3, sum_total,
        finalized_at, global_round_index, rounds_since_last_triple
      ) values (
        r.round_id, p_table_name, r.dice_1, r.dice_1, r.dice_2, r.dice_3, r.sum_total,
        r.finalized_at, v_global_index, v_interval
      );

      if v_interval is not null then
        v_max_interval := greatest(coalesce(v_max_interval, v_interval), v_interval);
        v_min_interval := least(coalesce(v_min_interval, v_interval), v_interval);
        v_sum_intervals := v_sum_intervals + v_interval;
        v_interval_count := v_interval_count + 1;
      end if;

      v_total_triples := v_total_triples + 1;
      v_last_triple_index := v_global_index;
      v_last_round_id := r.round_id;
      v_last_face := r.dice_1;
      v_last_at := r.finalized_at;
      v_rounds_since := 0;
    else
      v_rounds_since := v_rounds_since + 1;
    end if;
  end loop;

  insert into public.sic_bo_triple_state (
    id, rounds_since_last_triple, last_triple_round_id, last_triple_face, last_triple_at,
    total_rounds_seen, total_triples_seen, max_interval_ever, min_interval_ever,
    avg_interval, needs_rebuild, updated_at
  ) values (
    p_table_name, v_rounds_since, v_last_round_id, v_last_face, v_last_at,
    v_global_index, v_total_triples, v_max_interval, v_min_interval,
    case when v_interval_count > 0 then round((v_sum_intervals::numeric / v_interval_count), 2) else null end,
    false, now()
  )
  on conflict (id) do update set
    rounds_since_last_triple = excluded.rounds_since_last_triple,
    last_triple_round_id = excluded.last_triple_round_id,
    last_triple_face = excluded.last_triple_face,
    last_triple_at = excluded.last_triple_at,
    total_rounds_seen = excluded.total_rounds_seen,
    total_triples_seen = excluded.total_triples_seen,
    max_interval_ever = excluded.max_interval_ever,
    min_interval_ever = excluded.min_interval_ever,
    avg_interval = excluded.avg_interval,
    needs_rebuild = false,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'table_name', p_table_name,
    'total_rounds', v_global_index,
    'total_triples', v_total_triples,
    'rounds_since_last_triple', v_rounds_since,
    'max_interval', v_max_interval,
    'min_interval', v_min_interval
  );
end;
$$;

create or replace function public.on_sic_bo_round_insert_triple_tracker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.sic_bo_triple_state%rowtype;
  v_interval integer;
begin
  insert into public.sic_bo_triple_state (id)
  values (new.table_name)
  on conflict (id) do nothing;

  select * into v_state
  from public.sic_bo_triple_state
  where id = new.table_name
  for update;

  if new.is_triple and new.dice_1 = new.dice_2 and new.dice_2 = new.dice_3 then
    v_interval := v_state.rounds_since_last_triple + 1;

    insert into public.sic_bo_triple_events (
      round_id, table_name, triple_face, dice_1, dice_2, dice_3, sum_total,
      finalized_at, global_round_index, rounds_since_last_triple
    ) values (
      new.round_id, new.table_name, new.dice_1, new.dice_1, new.dice_2, new.dice_3, new.sum_total,
      new.finalized_at, v_state.total_rounds_seen + 1,
      case when v_state.total_triples_seen = 0 then null else v_interval end
    )
    on conflict (round_id) do nothing;

    update public.sic_bo_triple_state set
      rounds_since_last_triple = 0,
      last_triple_round_id = new.round_id,
      last_triple_face = new.dice_1,
      last_triple_at = new.finalized_at,
      total_rounds_seen = total_rounds_seen + 1,
      total_triples_seen = total_triples_seen + 1,
      max_interval_ever = case when total_triples_seen = 0 then max_interval_ever
        else greatest(coalesce(max_interval_ever, v_interval), v_interval) end,
      min_interval_ever = case when total_triples_seen = 0 then min_interval_ever
        when min_interval_ever is null then v_interval else least(min_interval_ever, v_interval) end,
      avg_interval = case when total_triples_seen = 0 then avg_interval else round(
        ((coalesce(avg_interval, 0) * total_triples_seen + v_interval) / (total_triples_seen + 1))::numeric, 2) end,
      updated_at = now()
    where id = new.table_name;
  else
    update public.sic_bo_triple_state set
      rounds_since_last_triple = rounds_since_last_triple + 1,
      total_rounds_seen = total_rounds_seen + 1,
      updated_at = now()
    where id = new.table_name;
  end if;

  return new;
end;
$$;

select public.rebuild_sic_bo_triple_tracker('casinoscores-mega-sic-bo');
