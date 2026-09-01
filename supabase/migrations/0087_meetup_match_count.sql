-- 0087: meetups_with_counts 에 경기 기록 수(match_count) 추가.
--   경기 기록이 입력된 모임은 번개 목록/추천에서 숨기기 위한 필터 컬럼.

drop view if exists public.meetups_with_counts;
create view public.meetups_with_counts
with (security_invoker = true)
as
select
  m.*,
  p.nickname    as host_nickname,
  p.avatar_url  as host_avatar_url,
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id and mp.status = 'approved') as participant_count,
  (select count(*) from public.meetup_matches mm where mm.meetup_id = m.id) as match_count
from public.meetups m
join public.profiles p on p.id = m.host_id;
