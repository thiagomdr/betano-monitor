-- Event deep-link URL for live catalog rows (e.g. bookmaker match page)

alter table public.live_events
  add column if not exists event_url text;

notify pgrst, 'reload schema';
