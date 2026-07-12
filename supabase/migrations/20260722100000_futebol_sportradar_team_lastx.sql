-- IDs unicos Sportradar + ultimos resultados (stats_team_lastx) por time.

alter table public.futebol_sportradar_stats
  add column if not exists home_team_uid text,
  add column if not exists away_team_uid text,
  add column if not exists home_lastx_json jsonb not null default '[]'::jsonb,
  add column if not exists away_lastx_json jsonb not null default '[]'::jsonb;

comment on column public.futebol_sportradar_stats.home_lastx_json is
  'Ultimos jogos do time da casa (stats_team_lastx compacto)';
comment on column public.futebol_sportradar_stats.away_lastx_json is
  'Ultimos jogos do time visitante (stats_team_lastx compacto)';

notify pgrst, 'reload schema';
