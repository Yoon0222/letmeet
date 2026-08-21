-- 0072: 스토리지 정책 재보장.
--   운영/개발 DB 분리 시 storage.objects RLS 정책도 누락 → 업로드 시
--   'new row violates row-level security policy'. 모든 버킷 정책을 재생성한다.

-- meetup-images
drop policy if exists "meetup_images_read" on storage.objects;
create policy "meetup_images_read" on storage.objects for select using (bucket_id = 'meetup-images');
drop policy if exists "meetup_images_insert" on storage.objects;
create policy "meetup_images_insert" on storage.objects for insert with check (bucket_id = 'meetup-images' and auth.uid() is not null);
drop policy if exists "meetup_images_update" on storage.objects;
create policy "meetup_images_update" on storage.objects for update using (bucket_id = 'meetup-images' and auth.uid() is not null);

-- club-images
drop policy if exists "club_images_read" on storage.objects;
create policy "club_images_read" on storage.objects for select using (bucket_id = 'club-images');
drop policy if exists "club_images_insert" on storage.objects;
create policy "club_images_insert" on storage.objects for insert with check (bucket_id = 'club-images' and auth.uid() is not null);
drop policy if exists "club_images_update" on storage.objects;
create policy "club_images_update" on storage.objects for update using (bucket_id = 'club-images' and auth.uid() is not null);

-- tournament-images
drop policy if exists "tournament_images_read" on storage.objects;
create policy "tournament_images_read" on storage.objects for select using (bucket_id = 'tournament-images');
drop policy if exists "tournament_images_insert" on storage.objects;
create policy "tournament_images_insert" on storage.objects for insert with check (bucket_id = 'tournament-images' and auth.uid() is not null);
drop policy if exists "tournament_images_update" on storage.objects;
create policy "tournament_images_update" on storage.objects for update using (bucket_id = 'tournament-images' and auth.uid() is not null);

-- avatars (본인 폴더만 쓰기)
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- court-images (코트관리자/최고관리자만 쓰기)
drop policy if exists "court_images_read" on storage.objects;
create policy "court_images_read" on storage.objects for select using (bucket_id = 'court-images');
drop policy if exists "court_images_insert" on storage.objects;
create policy "court_images_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'court-images' and public.my_role() in ('court_manager', 'super_admin'));
drop policy if exists "court_images_delete" on storage.objects;
create policy "court_images_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'court-images' and public.my_role() in ('court_manager', 'super_admin'));

-- event-images
drop policy if exists "event_images_read" on storage.objects;
create policy "event_images_read" on storage.objects for select using (bucket_id = 'event-images');
drop policy if exists "event_images_insert" on storage.objects;
create policy "event_images_insert" on storage.objects for insert with check (bucket_id = 'event-images' and auth.uid() is not null);
drop policy if exists "event_images_update" on storage.objects;
create policy "event_images_update" on storage.objects for update using (bucket_id = 'event-images' and auth.uid() is not null);

-- community-images
drop policy if exists "community_images_read" on storage.objects;
create policy "community_images_read" on storage.objects for select using (bucket_id = 'community-images');
drop policy if exists "community_images_insert" on storage.objects;
create policy "community_images_insert" on storage.objects for insert with check (bucket_id = 'community-images' and auth.uid() is not null);
