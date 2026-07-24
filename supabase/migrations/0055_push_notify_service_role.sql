-- 0055: push_notify 를 service_role 에만 다시 허용 (Edge Function 용).
--
--   0054 에서 PUBLIC 의 EXECUTE 를 회수하면서, PUBLIC 에 기대던 service_role 도
--   함께 막혔다. 트리거는 소유자(postgres) 권한으로 돌아 영향이 없지만,
--   Edge Function 은 service_role 로 PostgREST 를 호출하므로 명시적 부여가 필요하다.
--
--   service_role 키는 서버(Edge Function)에만 있고 클라이언트에 노출되지 않으므로
--   anon/authenticated 가 막힌 상태는 그대로 유지된다.

grant execute on function public.push_notify(uuid, text, text, text, text, uuid, uuid)
  to service_role;
