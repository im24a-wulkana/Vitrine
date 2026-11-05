-- VITRINE: item photo storage.
-- Files are stored as <user_id>/<item_id>/<random>.jpg.
--
-- The bucket is public-read because item_images.url holds a permanent URL.
-- A file can be opened by anyone who has its unguessable URL, but it cannot be
-- listed, and only its owner can upload, replace or delete it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-images', 'item-images', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "item images: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "item images: owner select" on storage.objects for select to authenticated
  using (bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "item images: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "item images: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
