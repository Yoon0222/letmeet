-- 0082: DUPR 계정 1:1 — 한 DUPR 계정(dupr_id)은 한 피넛 프로필에만 연결.
--   다른 프로필이 같은 dupr_id 를 못 갖게 부분 유니크 인덱스(값 있을 때만).
--   dupr-verify 가 저장 전 사전 체크도 하지만, 동시성/직접 경로까지 DB 로 강제한다.
--   ⚠️ 기존에 중복 dupr_id 가 있으면 생성 실패 → 먼저 중복 정리 필요(현재 dev 중복 없음).
create unique index if not exists profiles_dupr_id_uniq
  on public.profiles (dupr_id) where dupr_id is not null;
