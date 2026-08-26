-- 0079: generate_due_club_sessions 를 anon 에서도 회수
--   Supabase 는 새 함수에 anon 도 EXECUTE 를 명시적으로 부여(default privileges)하므로
--   PUBLIC 회수(0078)만으로는 anon 호출이 막히지 않는다. anon 을 명시 회수한다.
--   authenticated(0077 grant)·service_role·cron 은 그대로 동작.
revoke execute on function public.generate_due_club_sessions(uuid) from anon;
