-- data_atualizacao = epoch de sessao (Iniciar/Pausar via set_futebol_sistema_ativo).
-- Cron e Edge NAO devem alterar esse campo (invalidaria coleta em andamento).

create or replace function public.tick_futebol_live_coleta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
  headers jsonb;
begin
  select * into cfg from public.futebol_live_coleta_config where id = 'default';
  if not found or cfg.ativo is distinct from true then
    raise notice 'futebol live coleta pausada (ativo=false)';
    return;
  end if;

  headers := jsonb_build_object('Content-Type', 'application/json');
  if cfg.cron_secret is not null and length(trim(cfg.cron_secret)) > 0 then
    headers := headers || jsonb_build_object('x-cron-secret', cfg.cron_secret);
  end if;

  perform net.http_post(
    url := cfg.function_url,
    headers := headers,
    body := '{}'::jsonb
  );

  update public.futebol_live_coleta_config
  set last_run_at = now()
  where id = 'default';
end;
$$;

comment on column public.futebol_live_coleta_config.data_atualizacao is
  'Epoch de sessao: atualizado apenas por set_futebol_sistema_ativo (Iniciar/Pausar).';
