-- Acréscimos (injury time) ao lado do minuto na aba Estatísticas.

alter table public.futebol_sportradar_stats
  add column if not exists injury_time integer;

comment on column public.futebol_sportradar_stats.injury_time is
  'Minutos de acréscimo anunciados (Betano/clock), ex.: 3 em 45+3';

notify pgrst, 'reload schema';
