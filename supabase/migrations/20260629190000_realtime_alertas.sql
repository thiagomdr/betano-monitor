-- Realtime para histórico de alertas no painel web

alter table public.alertas_betano replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alertas_betano'
  ) then
    alter publication supabase_realtime add table public.alertas_betano;
  end if;
end $$;

notify pgrst, 'reload schema';
