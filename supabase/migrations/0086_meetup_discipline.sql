-- 0086: 번개 모임 종목(discipline) — 복식/단식/자유. 생성 시 선택, 상세에 표시.
--   경기 기록 화면의 형식 기본값으로도 사용(자유면 복식 기본).

alter table public.meetups
  add column if not exists discipline text not null default 'any'
    check (discipline in ('any', 'singles', 'doubles'));

comment on column public.meetups.discipline is
  '모임 종목: any=자유(단복식 무관) / singles=단식 / doubles=복식';

-- 뷰 재생성 — m.* 고정이라 새 컬럼 포함하려면 drop 후 create
drop view if exists public.meetups_with_counts;
create view public.meetups_with_counts
with (security_invoker = true)
as
select
  m.*,
  p.nickname    as host_nickname,
  p.avatar_url  as host_avatar_url,
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id and mp.status = 'approved') as participant_count
from public.meetups m
join public.profiles p on p.id = m.host_id;
