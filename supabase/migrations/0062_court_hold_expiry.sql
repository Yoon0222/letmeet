-- 0062: 코트 예약 "짧은 점유(홀드) + 만료" 모델
--   결제 시작 시 슬롯을 잠시(기본 10분) 점유(hold)하고, 결제 성공 시 확정(영구)한다.
--   expires_at 규칙: NULL = 확정(영구), 미래 = 활성 홀드, 과거 = 만료(차단 안 함, 정리 대상).
--   장점: expires_at 은 공개 조회 가능(결제정보 노출 X) → 시간표/내예약이 RLS 문제 없이 홀드 구분.

-- 1) 컬럼 추가
alter table public.court_reservations add column if not exists expires_at timestamptz;
create index if not exists court_reservations_expires_idx on public.court_reservations (expires_at);

-- 2) 레거시 정리: 옛 모델에서 남은 "미결제 예약 행"(paid 아님) 삭제. 확정(paid)·무료(payment_id null)는 유지.
delete from public.court_reservations r
 where r.payment_id is not null
   and not exists (select 1 from public.payments p where p.id = r.payment_id and p.status = 'paid');
-- 남은 예약은 모두 확정 → expires_at NULL (기본값이라 이미 NULL)

-- 3) 홀드 생성 RPC: 만료 홀드 정리 후 홀드 삽입. 활성 홀드/확정이 있으면 conflict.
--    security definer 로 다른 사람의 '만료된' 홀드까지 정리(슬롯 반환) 가능.
create or replace function public.reserve_court_hold(
  p_court_id uuid,
  p_court_unit text,
  p_slot_date date,
  p_hours int[],
  p_user_id uuid,
  p_payment_id uuid,
  p_minutes int default 10
) returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then
    return 'forbidden';
  end if;

  -- 대상 슬롯의 '만료된' 홀드 정리(확정 expires_at NULL·활성 홀드는 유지)
  delete from public.court_reservations
   where court_id = p_court_id and court_unit = p_court_unit and slot_date = p_slot_date
     and hour = any(p_hours) and status = 'reserved'
     and expires_at is not null and expires_at < now();

  -- 홀드 삽입. 활성 홀드/확정이 있으면 유니크 위반 → conflict.
  insert into public.court_reservations (court_id, user_id, court_unit, slot_date, hour, payment_id, status, expires_at)
  select p_court_id, p_user_id, p_court_unit, p_slot_date, h, p_payment_id, 'reserved', now() + make_interval(mins => p_minutes)
  from unnest(p_hours) as h;

  return 'ok';
exception when unique_violation then
  return 'conflict';
end $$;
grant execute on function public.reserve_court_hold(uuid, text, date, int[], uuid, uuid, int) to authenticated;

-- 4) 만료 홀드 일괄 정리 RPC (pg_cron 용). 확정(NULL)은 건드리지 않음.
create or replace function public.release_expired_court_holds() returns int
language plpgsql
security definer set search_path = public
as $$
declare n int;
begin
  with del as (
    delete from public.court_reservations
     where status = 'reserved' and expires_at is not null and expires_at < now()
     returning 1
  )
  select count(*) into n from del;
  return coalesce(n, 0);
end $$;

-- pg_cron 스케줄(대시보드 SQL Editor 에서 1회 실행 권장, 5분마다 만료 홀드 정리):
--   select cron.schedule('release-expired-court-holds', '*/5 * * * *',
--                        $$select public.release_expired_court_holds()$$);
