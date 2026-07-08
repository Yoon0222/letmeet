-- 0028: 코트 사진(여러 장) — courts.images(URL 배열) + Storage 버킷.
-- 저장 경로 규칙: court-images/{court_id}/파일명
alter table public.courts add column if not exists images text[] not null default '{}'::text[];

insert into storage.buckets (id, name, public)
values ('court-images', 'court-images', true)
on conflict (id) do nothing;

-- 조회: 공개(누구나)
drop policy if exists "court_images_read" on storage.objects;
create policy "court_images_read" on storage.objects
  for select using (bucket_id = 'court-images');

-- 업로드/삭제: 코트관리자 또는 최고관리자
drop policy if exists "court_images_insert" on storage.objects;
create policy "court_images_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'court-images' and public.my_role() in ('court_manager', 'super_admin')
  );
drop policy if exists "court_images_delete" on storage.objects;
create policy "court_images_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'court-images' and public.my_role() in ('court_manager', 'super_admin')
  );
