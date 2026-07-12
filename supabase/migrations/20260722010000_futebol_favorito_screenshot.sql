-- Fase 2: print do odd inicial do favorito (prova), guardado ate o fim do jogo.

alter table public.futebol_favorito_drift
  add column if not exists screenshot_path text,
  add column if not exists screenshot_url text,
  add column if not exists screenshot_captured_at timestamptz;

comment on column public.futebol_favorito_drift.screenshot_path is
  'Path no Storage (bucket betano-screenshot-debug); apagado apos settle.';
comment on column public.futebol_favorito_drift.screenshot_url is
  'URL publica do print do odd inicial; limpa apos settle.';

-- Reusa bucket de debug de screenshots (ja publico + service write).
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
