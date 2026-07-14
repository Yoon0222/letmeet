-- 0036: 대회 진행 방식(format) 정식화.
--   group_knockout = 조별리그 + 토너먼트 (지금 방식)
--   kdk            = KDK 개인전 대진
--   team           = 단체전
-- 기존 값('single_elim' 등)은 현재 엔진이 하는 '조별+토너먼트'이므로 group_knockout 으로 정규화한다.
update public.tournaments
  set format = 'group_knockout'
  where format is null or format not in ('group_knockout', 'kdk', 'team');

alter table public.tournaments alter column format set default 'group_knockout';
alter table public.tournaments drop constraint if exists tournaments_format_check;
alter table public.tournaments add constraint tournaments_format_check
  check (format in ('group_knockout', 'kdk', 'team'));
