-- Colunas tipadas para filtros/UI da aba Estatisticas (snapshot atual).
-- values_json continua como backup do feed completo.

alter table public.futebol_sportradar_stats
  add column if not exists league text,
  add column if not exists country text,
  add column if not exists betano_url text,
  add column if not exists is_live boolean not null default true,
  -- Posse (%)
  add column if not exists home_possession integer,
  add column if not exists away_possession integer,
  -- Finalizacao
  add column if not exists home_shots_off_target integer,
  add column if not exists away_shots_off_target integer,
  add column if not exists home_shots_blocked integer,
  add column if not exists away_shots_blocked integer,
  add column if not exists home_saves integer,
  add column if not exists away_saves integer,
  -- Bola parada / reinicios
  add column if not exists home_throw_ins integer,
  add column if not exists away_throw_ins integer,
  add column if not exists home_free_kicks integer,
  add column if not exists away_free_kicks integer,
  add column if not exists home_offsides integer,
  add column if not exists away_offsides integer,
  add column if not exists home_fouls integer,
  add column if not exists away_fouls integer,
  add column if not exists home_penalties integer,
  add column if not exists away_penalties integer,
  -- Disciplina
  add column if not exists home_yellow_cards integer,
  add column if not exists away_yellow_cards integer,
  add column if not exists home_red_cards integer,
  add column if not exists away_red_cards integer,
  add column if not exists home_yellow_red_cards integer,
  add column if not exists away_yellow_red_cards integer,
  -- Elenco / interrupcoes
  add column if not exists home_substitutions integer,
  add column if not exists away_substitutions integer,
  add column if not exists home_injuries integer,
  add column if not exists away_injuries integer,
  -- Pressao (contagens)
  add column if not exists home_attacks integer,
  add column if not exists away_attacks integer,
  add column if not exists home_dangerous_attacks integer,
  add column if not exists away_dangerous_attacks integer,
  add column if not exists home_ball_safe integer,
  add column if not exists away_ball_safe integer;

create index if not exists futebol_sportradar_stats_live_idx
  on public.futebol_sportradar_stats (is_live, updated_at desc);

create index if not exists futebol_sportradar_stats_minute_idx
  on public.futebol_sportradar_stats (last_minute);

create index if not exists futebol_sportradar_stats_corners_idx
  on public.futebol_sportradar_stats (home_corners, away_corners);

create index if not exists futebol_sportradar_stats_sot_idx
  on public.futebol_sportradar_stats (home_shots_on_target, away_shots_on_target);

-- Timeline: busca por canto (balao de escanteios)
create index if not exists futebol_sportradar_events_corner_idx
  on public.futebol_sportradar_events (event_id, minute nulls last)
  where lower(coalesce(event_type, '')) = 'corner' and disabled = false;

comment on column public.futebol_sportradar_stats.is_live is
  'true enquanto o jogo ainda aparece no ciclo live da Edge';

notify pgrst, 'reload schema';
