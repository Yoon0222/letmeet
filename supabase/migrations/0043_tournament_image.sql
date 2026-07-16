-- 0043: 대회 대표 사진 — tournaments.image_url + tournament-images 스토리지 버킷.
alter table public.tournaments add column if not exists image_url text;

-- tournaments_with_counts 뷰 재생성 (t.* 재확장으로 image_url 포함 — 0038 이슈 동일)
drop view if exists public.tournaments_with_counts;
create view public.tournaments_with_counts
with (security_invoker = true)
as
select
  t.*,
  p.nickname   as organizer_nickname,
  p.avatar_url as organizer_avatar_url,
  (select count(*) from public.tournament_entries e
     where e.tournament_id = t.id and e.status = 'approved') as approved_count,
  (select count(*) from public.tournament_entries e
     where e.tournament_id = t.id and e.status = 'pending') as pending_count
from public.tournaments t
join public.profiles p on p.id = t.organizer_id;

-- tournament-images 스토리지 버킷 (공개 조회, 로그인 사용자 업로드)
insert into storage.buckets (id, name, public) values ('tournament-images', 'tournament-images', true) on conflict (id) do nothing;
drop policy if exists "tournament_images_read" on storage.objects;
create policy "tournament_images_read" on storage.objects for select using (bucket_id = 'tournament-images');
drop policy if exists "tournament_images_insert" on storage.objects;
create policy "tournament_images_insert" on storage.objects for insert with check (bucket_id = 'tournament-images' and auth.uid() is not null);
drop policy if exists "tournament_images_update" on storage.objects;
create policy "tournament_images_update" on storage.objects for update using (bucket_id = 'tournament-images' and auth.uid() is not null);
