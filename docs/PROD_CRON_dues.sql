-- ============================================================================
-- PROD: 클럽 회비 정기 작업 등록 (pg_cron + pg_net)
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)
--
-- ⚠️ 회비 기능을 실제로 켤 때 실행한다(0096~0098 적용 + club-dues-* 함수 배포가 끝난 뒤).
--    스위치(platform_billing_settings.dues_enabled)가 꺼져 있는 동안은 등록돼 있어도 청구되는 것이 없다.
--
-- 채워 넣을 값(이 파일에는 넣지 않는다 — 실행 직전에 바꿔서 실행하고, 값이 들어간 파일은 저장·커밋하지 말 것):
--   <ANON_KEY>     운영 프로젝트의 anon 키
--   <CRON_SECRET>  엣지함수 시크릿 CRON_SECRET 과 같은 값 — 구독 결제 작업(charge-club-subscriptions)에 쓴 것과 같다.
--                  그 작업을 어떻게 등록했는지는:  select command from cron.job where jobname = 'charge-club-subscriptions';
--
-- 시각은 UTC 기준으로 적는다(KST = UTC + 9).
-- ============================================================================

-- 1) 매일 09:00 KST — 회비 행 만들기·재동의 표시·납부 사전 안내·작업 점검 (DB 함수 직접 실행)
select cron.schedule('dues-daily-tick', '0 0 * * *', $$ select public.dues_daily_tick(); $$);

-- 2) 10:00~20:45 KST, 15분마다 — 자동결제 워커(엣지함수)
select cron.schedule(
  'dues-charge', '*/15 1-11 * * *',
  $$
  select net.http_post(
    url := 'https://jbvtdthtmrlndduqiikj.supabase.co/functions/v1/club-dues-charge',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON_KEY>', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- 3) 매월 2일 03:00 KST — 지난달 정산 초안 만들기 (DB 함수 직접 실행). 확정·지급은 관리자가 한다.
select cron.schedule('dues-settlement-draft', '0 18 1 * *', $$ select public.dues_settlement_generate_prev_month(); $$);

-- 확인(명령 본문에는 비밀값이 있으니 조회하지 않는다)
select jobname, schedule, active from cron.job where jobname like 'dues-%' order by jobname;

-- 되돌리기:
--   select cron.unschedule('dues-daily-tick');
--   select cron.unschedule('dues-charge');
--   select cron.unschedule('dues-settlement-draft');
