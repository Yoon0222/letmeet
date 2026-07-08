-- 0029: 면(코트)별 예약 — court_reservations/court_payments 에 court_unit 추가.
-- 같은 시설의 서로 다른 면은 같은 시간에 동시 예약 가능. 면 없는 시설은 '' (시설 단위).
alter table public.court_reservations add column if not exists court_unit text not null default '';
alter table public.court_payments    add column if not exists court_unit text not null default '';

-- 중복 방지 유니크: (코트, 면, 날짜, 시각) 단위로 변경
drop index if exists public.court_reservations_slot_uniq;
create unique index if not exists court_reservations_slot_uniq
  on public.court_reservations (court_id, court_unit, slot_date, hour)
  where status = 'reserved';
