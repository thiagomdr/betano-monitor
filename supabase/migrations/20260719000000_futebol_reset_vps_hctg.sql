-- Reset historico futebol: inicio limpo com coleta HCTG via VPS (HTML only).
truncate table public.futebol_mercado_gols_05;
truncate table public.futebol_historico_gols;
truncate table public.futebol_historico_jogos cascade;

do $$ begin
  if to_regclass('public.futebol_screenshot_debug') is not null then
    truncate table public.futebol_screenshot_debug;
  end if;
end $$;

update public.futebol_live_meta
set
  fetched_at = null,
  live_total = 0,
  candidates = 0,
  total = 0,
  notes = '{}',
  last_error = null,
  updated_at = now()
where id = 1;

notify pgrst, 'reload schema';
