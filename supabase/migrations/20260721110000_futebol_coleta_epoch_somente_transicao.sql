-- Epoch so muda em transicao Pausar<->Iniciar (evita abortar scrape ao religar/clicar de novo).
-- Coleta imediata so ao passar de pausado -> ativo.

create or replace function public.set_futebol_sistema_ativo(p_ativo boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo boolean;
  v_was_ativo boolean;
  v_mudou boolean;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'not authenticated';
  end if;

  select ativo into v_was_ativo
  from public.futebol_live_coleta_config
  where id = 'default';

  update public.futebol_live_coleta_config
  set
    ativo = p_ativo,
    data_atualizacao = case
      when v_was_ativo is distinct from p_ativo then now()
      else data_atualizacao
    end
  where id = 'default'
  returning ativo into v_ativo;

  if v_ativo is null then
    raise exception 'futebol_live_coleta_config default missing';
  end if;

  v_mudou := v_was_ativo is distinct from v_ativo;

  if v_mudou then
    insert into public.futebol_sistema_log (level, source, action, message, payload)
    values (
      'warn',
      'painel',
      case when v_ativo then 'sistema_iniciado' else 'sistema_pausado' end,
      case
        when v_ativo then 'Sistema ligado — coleta Edge disparada imediatamente (cron automatico a cada 2 min)'
        else 'Sistema pausado — coleta bloqueada ate religar'
      end,
      jsonb_build_object('ativo', v_ativo, 'coleta_imediata', v_ativo, 'transicao', true)
    );
  end if;

  if v_ativo and v_was_ativo is distinct from true then
    perform public.tick_futebol_live_coleta();
  end if;

  return v_ativo;
end;
$$;

revoke all on function public.set_futebol_sistema_ativo(boolean) from public;
grant execute on function public.set_futebol_sistema_ativo(boolean) to authenticated;
