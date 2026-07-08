-- 0025: 코트 예약 자동 오픈 기간(롤링 윈도우)
-- auto_open_days = N 이면 '오늘 ~ 오늘+N-1' 이 항상 자동으로 예약 가능(날짜가 지나면 자동으로 다음날 열림).
-- 0=자동 오픈 없음(수동 지정일만). 보통 7(1주)/14(2주)/30(1개월).
alter table public.courts
  add column if not exists auto_open_days int not null default 0 check (auto_open_days >= 0 and auto_open_days <= 60);
