-- Coleta cron: 15 s (antes 1 min) para respeitar futebol_agenda.next_fetch_at em 40–50 s aleatórios.
-- pg_cron suporta 'N seconds' no Supabase (Postgres 15+). A Edge Function só coleta quando due.

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'betano-coleta-tick';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

select cron.schedule(
  'betano-coleta-tick',
  '15 seconds',
  $$ select public.tick_coleta_betano_cron(); $$
);

notify pgrst, 'reload schema';
