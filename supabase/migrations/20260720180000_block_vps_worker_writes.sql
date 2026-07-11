-- VPS HCTG removida (producao = PC local). Processo remoto legado nao grava mais no BD.

create or replace function public.reject_vps_worker_sistema_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'vps-worker' then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists reject_vps_worker_sistema_log on public.futebol_sistema_log;
create trigger reject_vps_worker_sistema_log
  before insert on public.futebol_sistema_log
  for each row
  execute function public.reject_vps_worker_sistema_log();

create or replace function public.reject_vps_hctg_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hctg_source = 'html-dom-vps' then
    new.hctg_source := old.hctg_source;
    new.hctg_lines := old.hctg_lines;
    new.hctg_fetched_at := old.hctg_fetched_at;
  end if;
  return new;
end;
$$;

drop trigger if exists reject_vps_hctg_updates on public.futebol_mercado_gols_05;
create trigger reject_vps_hctg_updates
  before update on public.futebol_mercado_gols_05
  for each row
  execute function public.reject_vps_hctg_updates();

delete from public.futebol_sistema_log where source = 'vps-worker';

comment on function public.reject_vps_worker_sistema_log() is
  'Descarta logs source=vps-worker (HostGator legado).';

comment on function public.reject_vps_hctg_updates() is
  'Rejeita hctg_source=html-dom-vps (worker VPS legado).';
