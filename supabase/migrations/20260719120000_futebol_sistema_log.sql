-- Log de auditoria do monitor (Edge, VPS worker, Telegram).

create table if not exists public.futebol_sistema_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  level text not null default 'info'
    check (level in ('info', 'warn', 'error')),
  source text not null,
  action text not null,
  message text not null,
  event_id text,
  match_label text,
  payload jsonb,
  duration_ms integer
);

create index if not exists futebol_sistema_log_created_idx
  on public.futebol_sistema_log (created_at desc);

create index if not exists futebol_sistema_log_level_idx
  on public.futebol_sistema_log (level);

create index if not exists futebol_sistema_log_action_idx
  on public.futebol_sistema_log (action);

alter table public.futebol_sistema_log enable row level security;

drop policy if exists "futebol_sistema_log_select_auth" on public.futebol_sistema_log;
create policy "futebol_sistema_log_select_auth"
  on public.futebol_sistema_log for select to authenticated
  using (true);

drop policy if exists "futebol_sistema_log_service" on public.futebol_sistema_log;
create policy "futebol_sistema_log_service"
  on public.futebol_sistema_log for all to service_role
  using (true)
  with check (true);

-- Limpar todo o log (botao no painel).
create or replace function public.clear_futebol_sistema_log()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.futebol_sistema_log;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.clear_futebol_sistema_log() from public;
grant execute on function public.clear_futebol_sistema_log() to authenticated;

-- Retencao 30 dias.
create or replace function public.prune_futebol_sistema_log()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.futebol_sistema_log
  where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.prune_futebol_sistema_log() from public;
grant execute on function public.prune_futebol_sistema_log() to postgres;

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'futebol-sistema-log-prune';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'futebol-sistema-log-prune',
    '15 4 * * *',
    $cron$ select public.prune_futebol_sistema_log(); $cron$
  );
end $$;

notify pgrst, 'reload schema';
