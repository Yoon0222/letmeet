-- 0011: 프로필 사진(아바타) 업로드용 Storage 버킷 + RLS
-- 저장 경로 규칙: avatars/{user_id}/파일명  → 본인 폴더에만 쓰기 가능.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 조회: 공개(누구나)
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- 업로드/수정/삭제: 본인 폴더(첫 경로 세그먼트 = 내 uid)만
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
