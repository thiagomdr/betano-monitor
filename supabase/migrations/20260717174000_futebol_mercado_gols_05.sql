-- Mercado de Gols +0,5: registro quando a linha Over +0,5 surge apos fase so com +1,5/+2,5
create table if not exists public.futebol_mercado_gols_05 (
  event_id text primary key references public.futebol_historico_jogos(event_id) on delete cascade,
  home text,
  away text,
  league text,
  country text,
  betano_url text,
  indisponivel_ate_minuto integer,
  had_min_plus2_before boolean not null default false,
  disponivel_desde_minuto integer,
  placar_na_captura text,
  over_05_odd numeric,
  over_05_line numeric,
  captured_at timestamptz,
  resultado text not null default 'watching'
    check (resultado in ('watching', 'pending', 'win', 'loss', 'skipped')),
  gols_apos_captura integer,
  gol_green_minute integer,
  settled_at timestamptz,
  placar_final text,
  is_live boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists futebol_mercado_gols_05_captured_idx
  on public.futebol_mercado_gols_05 (captured_at desc nulls last);

create index if not exists futebol_mercado_gols_05_resultado_idx
  on public.futebol_mercado_gols_05 (resultado);

alter table public.futebol_mercado_gols_05 enable row level security;

drop policy if exists "futebol_mercado_gols_05_select_anon" on public.futebol_mercado_gols_05;
create policy "futebol_mercado_gols_05_select_anon"
  on public.futebol_mercado_gols_05 for select to anon, authenticated
  using (true);

drop policy if exists "futebol_mercado_gols_05_service" on public.futebol_mercado_gols_05;
create policy "futebol_mercado_gols_05_service"
  on public.futebol_mercado_gols_05 for all to service_role
  using (true)
  with check (true);
