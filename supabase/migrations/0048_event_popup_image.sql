-- 0048: 이벤트 팝업 배너 이미지 — event_popups.image_url + event-images 스토리지 버킷.
alter table public.event_popups add column if not exists image_url text;

-- event-images 스토리지 버킷 (공개 조회, 로그인 사용자 업로드 — 실제 등록은 super_admin RLS로 제한됨)
insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true) on conflict (id) do nothing;
drop policy if exists "event_images_read" on storage.objects;
create policy "event_images_read" on storage.objects for select using (bucket_id = 'event-images');
drop policy if exists "event_images_insert" on storage.objects;
create policy "event_images_insert" on storage.objects for insert with check (bucket_id = 'event-images' and auth.uid() is not null);
drop policy if exists "event_images_update" on storage.objects;
create policy "event_images_update" on storage.objects for update using (bucket_id = 'event-images' and auth.uid() is not null);
