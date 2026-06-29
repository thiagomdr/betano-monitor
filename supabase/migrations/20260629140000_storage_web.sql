-- Bucket publico para painel web (HTML com MIME correto)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'web',
  'web',
  true,
  5242880,
  array['text/html', 'text/css', 'application/javascript', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists web_public_read on storage.objects;
create policy web_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'web');

notify pgrst, 'reload schema';
