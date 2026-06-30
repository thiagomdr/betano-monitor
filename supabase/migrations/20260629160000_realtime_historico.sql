-- Realtime para o painel web (atualização instantânea ao inserir coletas/jogos)
-- Aplicar no SQL Editor ou: supabase db push

-- RLS exige REPLICA IDENTITY FULL para postgres_changes no cliente
alter table public.coletas_betano replica identity full;
alter table public.jogos_coleta replica identity full;
alter table public.coleta_scheduler replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coletas_betano'
  ) then
    alter publication supabase_realtime add table public.coletas_betano;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jogos_coleta'
  ) then
    alter publication supabase_realtime add table public.jogos_coleta;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coleta_scheduler'
  ) then
    alter publication supabase_realtime add table public.coleta_scheduler;
  end if;
end $$;

notify pgrst, 'reload schema';
