-- Estatisticas agregadas CasinoScores (espelha /megasicbo/stats para o monitor web)

create table if not exists public.sic_bo_public_stats (
  id text primary key default 'casinoscores',
  total_count integer not null default 0,
  triple_dice_stats jsonb not null default '[]'::jsonb,
  duration_minutes integer not null default 4320,
  updated_at timestamptz not null default now()
);

insert into public.sic_bo_public_stats (id)
values ('casinoscores')
on conflict (id) do nothing;

alter table public.sic_bo_public_stats enable row level security;

drop policy if exists "sic_bo_public_stats_select_anon" on public.sic_bo_public_stats;
create policy "sic_bo_public_stats_select_anon"
  on public.sic_bo_public_stats
  for select
  to anon
  using (true);

notify pgrst, 'reload schema';
