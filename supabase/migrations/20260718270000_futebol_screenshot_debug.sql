-- Debug do teste screenshot+Gemini (GitHub Actions) — painel le via anon.

create table if not exists public.futebol_screenshot_debug (
  event_id text primary key,
  slug text,
  status text not null default 'failed',
  page_error text,
  gemini_error text,
  dom_lines jsonb not null default '[]'::jsonb,
  gemini_lines jsonb not null default '[]'::jsonb,
  screenshot_full_url text,
  screenshot_block_url text,
  github_run_id text,
  github_run_url text,
  scraped_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists futebol_screenshot_debug_updated_idx
  on public.futebol_screenshot_debug (updated_at desc);

alter table public.futebol_screenshot_debug enable row level security;

drop policy if exists "futebol_screenshot_debug_select_anon" on public.futebol_screenshot_debug;
create policy "futebol_screenshot_debug_select_anon"
  on public.futebol_screenshot_debug for select to anon, authenticated
  using (true);

drop policy if exists "futebol_screenshot_debug_service" on public.futebol_screenshot_debug;
create policy "futebol_screenshot_debug_service"
  on public.futebol_screenshot_debug for all to service_role
  using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'betano-screenshot-debug',
  'betano-screenshot-debug',
  true,
  5242880,
  array['image/png', 'image/jpeg']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "betano_screenshot_debug_public_read" on storage.objects;
create policy "betano_screenshot_debug_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'betano-screenshot-debug');

drop policy if exists "betano_screenshot_debug_service_write" on storage.objects;
create policy "betano_screenshot_debug_service_write"
  on storage.objects for all to service_role
  using (bucket_id = 'betano-screenshot-debug')
  with check (bucket_id = 'betano-screenshot-debug');

notify pgrst, 'reload schema';
