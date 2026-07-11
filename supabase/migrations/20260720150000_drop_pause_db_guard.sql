-- Remove guarda no BD (coleta deve respeitar ativo no codigo Edge/worker).

drop trigger if exists guard_sistema_log_when_paused on public.futebol_sistema_log;
drop trigger if exists guard_mercado_hctg_when_paused on public.futebol_mercado_gols_05;
drop function if exists public.guard_sistema_log_when_paused();
drop function if exists public.guard_mercado_hctg_when_paused();
