-- 0073: clubs.image_url 컬럼 보장 (0031이 dev 에 실제 적용 안 됨 → 대표사진 저장 실패).
--   업로드는 성공했으나 clubs.image_url 컬럼이 없어 'Could not find the image_url column' 발생.

alter table public.clubs add column if not exists image_url text;

-- PostgREST 스키마 캐시 즉시 갱신
notify pgrst, 'reload schema';
