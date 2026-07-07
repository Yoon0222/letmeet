-- 0019: 코트 예약 값 무결성 제약 (방어적 — UI는 이미 정상값만 넣음)
-- courts: 운영 시간/요금 범위, court_reservations: 예약 시각 범위

alter table public.courts
  add constraint courts_hours_chk check (open_hour >= 0 and close_hour <= 24 and open_hour < close_hour) not valid;
alter table public.courts validate constraint courts_hours_chk;

alter table public.courts
  add constraint courts_price_chk check (hourly_price >= 0) not valid;
alter table public.courts validate constraint courts_price_chk;

alter table public.court_reservations
  add constraint court_reservations_hour_chk check (hour >= 0 and hour <= 23) not valid;
alter table public.court_reservations validate constraint court_reservations_hour_chk;
