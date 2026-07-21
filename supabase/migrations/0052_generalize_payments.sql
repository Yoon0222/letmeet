-- 0052: 결제 테이블 범용화 — court_payments → payments (코트 예약 + 대회 참가비 공용).
--   테이블 rename 이라 데이터·FK(court_reservations.payment_id)·RLS 정책·인덱스가 자동 보존된다.
--   여기에 범용 컬럼(order_type/target_id/order_name)만 추가하고 코트 전용 컬럼 NOT NULL 을 완화.

-- (A) rename
alter table public.court_payments rename to payments;

-- (B) 범용 컬럼
alter table public.payments add column if not exists order_type text not null default 'court';
alter table public.payments drop constraint if exists payments_order_type_check;
alter table public.payments add constraint payments_order_type_check check (order_type in ('court','tournament'));
alter table public.payments add column if not exists target_id uuid;          -- 대회 결제 시 tournament_id
alter table public.payments add column if not exists order_name text not null default '';
create index if not exists payments_target_idx on public.payments (order_type, target_id);

-- (C) 대회 주문은 코트 컬럼이 없음 → NOT NULL 완화
alter table public.payments alter column court_id drop not null;
alter table public.payments alter column slot_date drop not null;

-- (D) 스테일 홀드 정리 함수(0051)를 새 테이블명 + order_type 필터로 재정의
create or replace function public.release_stale_court_holds(p_minutes int default 15)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
  from public.payments
  where order_type = 'court' and status = 'pending'
    and created_at < now() - make_interval(mins => p_minutes);

  if v_ids is null then
    return 0;
  end if;

  delete from public.court_reservations where payment_id = any(v_ids);
  update public.payments set status = 'canceled' where id = any(v_ids);

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- 참고: 인덱스명은 rename 후에도 court_payments_* 로 남지만 동작엔 무관(신규 DB는 payments_* 사용).
