-- 0069: 클럽 세션 매치에 '진행 중(ongoing)' 상태 추가.
--   대진 확정 후 참여 선수가 '경기 시작'을 누르면 scheduled → ongoing,
--   결과 입력 시 ongoing → done. 모두가 대기/진행중/완료를 구분해 볼 수 있다.

alter table public.club_session_matches drop constraint if exists club_session_matches_status_check;
alter table public.club_session_matches
  add constraint club_session_matches_status_check check (status in ('scheduled', 'ongoing', 'done'));
