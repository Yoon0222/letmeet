-- 0070: 클럽 세션 매치에 DUPR 모드 플래그.
--   경기 시작 시 'DUPR 모드'(레이팅 반영) / '일반 모드'(친선) 선택.
--   dupr_mode=true 인 경기만 DUPR 일괄 등록 대상이 된다.

alter table public.club_session_matches
  add column if not exists dupr_mode boolean not null default false;
