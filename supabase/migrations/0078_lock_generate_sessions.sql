-- 0078: generate_due_club_sessions 실행 권한 정리
--   CREATE FUNCTION 은 기본으로 PUBLIC(anon 포함)에 EXECUTE 를 부여한다.
--   앱(on-read)은 authenticated 로만 호출하므로 PUBLIC 권한을 회수해 anon 호출을 막는다.
--   (0077 의 authenticated 명시 grant 는 유지되므로 로그인 사용자·cron 은 정상)
revoke execute on function public.generate_due_club_sessions(uuid) from public;
