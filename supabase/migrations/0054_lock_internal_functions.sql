-- 0054: 내부 전용 함수의 실행 권한 회수 (보안).
--
--   Postgres 는 함수 생성 시 PUBLIC 에 EXECUTE 를 기본 부여한다. 그래서 아래 두
--   security definer 함수를 anon/authenticated 가 PostgREST 로 직접 호출할 수 있었다.
--   (2026-07-24 확인: anon 키만으로 push_notify 호출이 실제로 성공함)
--
--   · push_notify              → 아무에게나 가짜 알림 + 실제 폰 푸시 발송 가능(피싱/스팸)
--   · release_stale_court_holds→ p_minutes:0 으로 대기중 결제·예약을 전부 취소 가능(파괴적)
--
--   두 함수는 각각 트리거와 스케줄러(pg_cron)에서만 쓰인다. 트리거 함수들도
--   security definer(소유자=postgres)라 내부 호출은 권한 회수 후에도 정상 동작한다.
--
--   유지: mark_notifications_read 는 auth.uid() 로 본인 범위만 갱신하므로 계속 호출 가능.

revoke all on function public.push_notify(uuid, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.release_stale_court_holds(int)
  from public, anon, authenticated;
