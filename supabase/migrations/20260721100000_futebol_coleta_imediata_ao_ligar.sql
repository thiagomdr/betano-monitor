-- Ao ligar o sistema, dispara coleta Edge imediatamente (nao esperar cron */2 min).

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
      when v_ativo then 'Sistema ligado — coleta Edge disparada imediatamente (cron automatico a cada 2 min)'
      else 'Sistema pausado — coleta bloqueada ate religar'
    end,
    jsonb_build_object('ativo', v_ativo, 'coleta_imediata', v_ativo)
  );

  if v_ativo then
    perform public.tick_futebol_live_coleta();
  end if;

  return v_ativo;
end;
$$;

revoke all on function public.set_futebol_sistema_ativo(boolean) from public;
grant execute on function public.set_futebol_sistema_ativo(boolean) to authenticated;
