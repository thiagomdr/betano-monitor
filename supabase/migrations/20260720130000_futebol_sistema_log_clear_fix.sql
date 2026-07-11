-- Supabase bloqueia DELETE sem WHERE (21000). TRUNCATE + fallback REST no painel.

create or replace function public.clear_futebol_sistema_log()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  select count(*)::bigint into n from public.futebol_sistema_log;
  truncate table public.futebol_sistema_log;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.clear_futebol_sistema_log() from public;
grant execute on function public.clear_futebol_sistema_log() to authenticated;

-- Fallback: DELETE via PostgREST com filtro (id not null = todas as linhas)
drop policy if exists "futebol_sistema_log_delete_auth" on public.futebol_sistema_log;
create policy "futebol_sistema_log_delete_auth"
  on public.futebol_sistema_log for delete to authenticated
  using (true);

notify pgrst, 'reload schema';
