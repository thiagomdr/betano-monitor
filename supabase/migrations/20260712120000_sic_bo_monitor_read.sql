-- Leitura publica (anon) das rodadas CasinoScores para o painel web
-- Projeto: BetanoMonitor (mddortcbebtkopeanrhu)

drop policy if exists "sic_bo_select_anon_casinoscores" on public.sic_bo_rounds;
create policy "sic_bo_select_anon_casinoscores"
  on public.sic_bo_rounds
  for select
  to anon
  using (table_name = 'casinoscores-mega-sic-bo');

-- Realtime para novas rodadas no monitor
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sic_bo_rounds'
  ) then
    alter publication supabase_realtime add table public.sic_bo_rounds;
  end if;
end $$;

notify pgrst, 'reload schema';
