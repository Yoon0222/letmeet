-- ============================================================
-- 마이그레이션 0001 — profiles 에 DUPR 연동 대비 컬럼 추가
--
-- 이미 schema.sql 을 실행한 적이 있다면 이 파일만 SQL Editor 에 붙여
-- 실행하세요. (아직 schema.sql 을 안 돌렸으면 최신 schema.sql 에 이미
-- 포함되어 있으므로 이 파일은 실행할 필요 없습니다.)
-- ============================================================

alter table public.profiles
  add column if not exists dupr_id       text,
  add column if not exists dupr_rating   numeric(3,1),
  add column if not exists dupr_verified boolean not null default false;
