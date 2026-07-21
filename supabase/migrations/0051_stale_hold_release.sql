-- 0051: 미결제 홀드 자동정리
--   결제 흐름은 "주문(pending) + 슬롯 홀드 → 결제 → paid" 순. 앱이 죽거나 앱 복귀가
--   막혀 결제 승인이 안 되면, pending 주문과 홀드 예약이 유령 슬롯으로 남는다.
--   이 함수가 N분 지난 pending 홀드를 해제(예약 삭제 + 주문 canceled)한다.
--   pg_cron 으로 주기 실행(아래 주석 참고). 코트 예약용(대회 결제는 범용화 후 확장).

create or replace function public.release_stale_court_holds(p_minutes int default 15)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
  from public.court_payments
  where status = 'pending'
    and created_at < now() - make_interval(mins => p_minutes);

  if v_ids is null then
    return 0;
  end if;

  -- 홀드된 예약 삭제(슬롯 반환)
  delete from public.court_reservations where payment_id = any(v_ids);
  -- 주문 취소 처리
  update public.court_payments set status = 'canceled' where id = any(v_ids);

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- 주기 실행 (pg_cron). Supabase 대시보드 Database → Extensions 에서 pg_cron 활성화 후,
-- SQL Editor 에서 아래 한 줄 실행(5분마다 15분 지난 홀드 해제):
--   select cron.schedule('release-stale-court-holds', '*/5 * * * *',
--                        $$select public.release_stale_court_holds(15)$$);
-- 해제하려면: select cron.unschedule('release-stale-court-holds');
