-- Metadados do jogo via Sportradar gismo/match_info (estadio, arbitro, clima, etc.).

alter table public.futebol_sportradar_stats
  add column if not exists stadium_name text,
  add column if not exists stadium_city text,
  add column if not exists stadium_country text,
  add column if not exists stadium_capacity integer,
  add column if not exists referee_name text,
  add column if not exists manager_home text,
  add column if not exists manager_away text,
  add column if not exists weather_code integer,
  add column if not exists weather text,
  add column if not exists pitch_code integer,
  add column if not exists pitch text,
  add column if not exists temperature integer,
  add column if not exists wind integer,
  add column if not exists season_name text,
  add column if not exists tournament_name text;

comment on column public.futebol_sportradar_stats.weather is
  'Condicao climatica (label) a partir do codigo Sportradar match_info';
comment on column public.futebol_sportradar_stats.pitch is
  'Condicao do gramado (label) a partir do codigo Sportradar match_info';

notify pgrst, 'reload schema';
