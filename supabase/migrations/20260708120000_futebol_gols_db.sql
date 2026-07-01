-- Gols na janela: eventos persistidos no banco (sem agregação por parse no painel).

alter table public.futebol_partidas
  add column if not exists gols_na_janela integer;

alter table public.futebol_leituras
  add column if not exists minuto_jogo integer,
  add column if not exists gols_totais integer,
  add column if not exists delta_gols integer;

create table if not exists public.futebol_eventos_gol (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  partida_id uuid not null references public.futebol_partidas (id) on delete cascade,
  leitura_id uuid references public.futebol_leituras (id) on delete set null,
  minuto_jogo integer not null check (minuto_jogo >= 85),
  quantidade integer not null check (quantidade > 0),
  origem text not null check (origem in ('leitura_delta', 'fechamento_partida')),
  criado_em timestamptz not null default now()
);

create index if not exists idx_futebol_eventos_gol_usuario_minuto
  on public.futebol_eventos_gol (usuario_id, minuto_jogo);

create index if not exists idx_futebol_eventos_gol_partida
  on public.futebol_eventos_gol (partida_id);

alter table public.futebol_eventos_gol enable row level security;

drop policy if exists futebol_eventos_gol_select_own on public.futebol_eventos_gol;
create policy futebol_eventos_gol_select_own
  on public.futebol_eventos_gol for select
  using (auth.uid() = usuario_id);

-- Recalcula gols_na_janela da partida a partir do placar início/final.
create or replace function public.futebol_calc_gols_na_janela(
  p_placar_casa_inicio integer,
  p_placar_fora_inicio integer,
  p_placar_casa_final integer,
  p_placar_fora_final integer
) returns integer
language sql
immutable
as $$
  select greatest(
    0,
    coalesce(p_placar_casa_final, 0) + coalesce(p_placar_fora_final, 0)
      - coalesce(p_placar_casa_inicio, 0) - coalesce(p_placar_fora_inicio, 0)
  );
$$;

-- Resumo agregado para o painel (fonte única: tabelas persistidas).
create or replace function public.futebol_resumo_janela()
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return json_build_object(
      'jogosColetados', 0,
      'jogosComGolNaJanela', 0,
      'totalGolsNaJanela', 0,
      'golsPorMinuto', '{}'::json,
      'maxMinutoComGol', 87
    );
  end if;

  return (
    with partidas_janela as (
      select *
      from public.futebol_partidas
      where usuario_id = uid
        and status in ('em_janela', 'finalizado')
    ),
    gols_minuto as (
      select minuto_jogo, sum(quantidade)::integer as total_gols
      from public.futebol_eventos_gol
      where usuario_id = uid
      group by minuto_jogo
    ),
    max_min as (
      select coalesce(max(minuto_jogo), 87) as m from gols_minuto where minuto_jogo >= 85
    )
    select json_build_object(
      'jogosColetados', (select count(*)::integer from partidas_janela),
      'jogosComGolNaJanela', (
        select count(*)::integer from partidas_janela
        where coalesce(gols_na_janela, 0) > 0
      ),
      'totalGolsNaJanela', (
        select coalesce(sum(gols_na_janela), 0)::integer from partidas_janela
      ),
      'golsPorMinuto', coalesce(
        (select json_object_agg(minuto_jogo::text, total_gols order by minuto_jogo) from gols_minuto),
        '{}'::json
      ),
      'maxMinutoComGol', (select greatest(87, m) from max_min)
    )
  );
end;
$$;

grant execute on function public.futebol_resumo_janela() to authenticated;

notify pgrst, 'reload schema';
