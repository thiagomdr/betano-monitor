-- Pausar / iniciar o sistema (cron Edge + worker leem ativo).

grant select (id, ativo, last_run_at, data_atualizacao) on public.futebol_live_coleta_config to authenticated;

drop policy if exists "futebol_live_coleta_config_select_auth" on public.futebol_live_coleta_config;
create policy "futebol_live_coleta_config_select_auth"
  on public.futebol_live_coleta_config for select to authenticated
  using (true);

create or replace function public.set_futebol_sistema_ativo(p_ativo boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo boolean;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'not authenticated';
  end if;

  update public.futebol_live_coleta_config
  set
    ativo = p_ativo,
    data_atualizacao = now()
  where id = 'default'
  returning ativo into v_ativo;

  if v_ativo is null then
    raise exception 'futebol_live_coleta_config default missing';
  end if;

  insert into public.futebol_sistema_log (level, source, action, message, payload)
  values (
    'warn',
    'painel',
    case when v_ativo then 'sistema_iniciado' else 'sistema_pausado' end,
    case
      when v_ativo then 'Sistema iniciado — coleta Edge e worker ativos'
      else 'Sistema pausado — coleta Edge e worker parados'
    end,
    jsonb_build_object('ativo', v_ativo)
  );

  return v_ativo;
end;
$$;

revoke all on function public.set_futebol_sistema_ativo(boolean) from public;
grant execute on function public.set_futebol_sistema_ativo(boolean) to authenticated;
