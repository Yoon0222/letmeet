-- 0031: 클럽 대표 사진 — clubs.image_url + club-images 스토리지 버킷.
alter table public.clubs add column if not exists image_url text;

-- clubs_with_counts 뷰 재생성 (c.* 재확장으로 image_url 포함)
drop view if exists public.clubs_with_counts;
create view public.clubs_with_counts
with (security_invoker = true)
as
select
  c.*,
  p.nickname   as owner_nickname,
  p.avatar_url as owner_avatar_url,
  (select count(*) from public.club_members cm where cm.club_id = c.id) as member_count
from public.clubs c
join public.profiles p on p.id = c.owner_id;

-- club-images 스토리지 버킷 (공개 조회, 로그인 사용자 업로드)
insert into storage.buckets (id, name, public) values ('club-images', 'club-images', true) on conflict (id) do nothing;
drop policy if exists "club_images_read" on storage.objects;
create policy "club_images_read" on storage.objects for select using (bucket_id = 'club-images');
drop policy if exists "club_images_insert" on storage.objects;
create policy "club_images_insert" on storage.objects for insert with check (bucket_id = 'club-images' and auth.uid() is not null);
drop policy if exists "club_images_update" on storage.objects;
create policy "club_images_update" on storage.objects for update using (bucket_id = 'club-images' and auth.uid() is not null);
