-- Tipster Arena: country + league_id for Betano-style grouping

alter table public.live_events
  add column if not exists country text,
  add column if not exists league_id text;

create index if not exists live_events_country_league_idx
  on public.live_events (country, league);

notify pgrst, 'reload schema';
