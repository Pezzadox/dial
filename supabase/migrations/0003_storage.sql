-- Dial 0003: private media bucket. Supabase only (needs the storage schema).
-- Files live at media/<member id>/<file>. Members write only their own folder;
-- everyone else reaches a file only through a short-lived signed URL.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present, skipping';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('media', 'media', false, 104857600,
          array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime'])
  on conflict (id) do nothing;

  execute $p$create policy media_owner_write on storage.objects for insert to authenticated
    with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy media_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  -- Reading (and so signing) is allowed for approved media the reader may see, and for the owner.
  execute $p$create policy media_read on storage.objects for select to authenticated
    using (bucket_id = 'media' and exists (
      select 1 from public.media m where m.storage_path = storage.objects.name
        and (m.owner = auth.uid() or (m.moderation = 'approved' and not app.is_blocked(auth.uid(), m.owner)))))$p$;
end $$;
