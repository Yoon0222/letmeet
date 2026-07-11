-- 0034: 번개모임 코트/장소 사진 — meetups.image_url + meetup-images 스토리지 버킷.
alter table public.meetups add column if not exists image_url text;

-- meetups_with_counts 뷰 재생성 (m.* 재확장으로 image_url 포함, 승인 참가자만 카운트 — 0033 유지)
drop view if exists public.meetups_with_counts;
create view public.meetups_with_counts
with (security_invoker = true)
as
select
  m.*,
  p.nickname    as host_nickname,
  p.avatar_url  as host_avatar_url,
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id and mp.status = 'approved') as participant_count
from public.meetups m
join public.profiles p on p.id = m.host_id;

-- meetup-images 스토리지 버킷 (공개 조회, 로그인 사용자 업로드)
insert into storage.buckets (id, name, public) values ('meetup-images', 'meetup-images', true) on conflict (id) do nothing;
drop policy if exists "meetup_images_read" on storage.objects;
create policy "meetup_images_read" on storage.objects for select using (bucket_id = 'meetup-images');
drop policy if exists "meetup_images_insert" on storage.objects;
create policy "meetup_images_insert" on storage.objects for insert with check (bucket_id = 'meetup-images' and auth.uid() is not null);
drop policy if exists "meetup_images_update" on storage.objects;
create policy "meetup_images_update" on storage.objects for update using (bucket_id = 'meetup-images' and auth.uid() is not null);
