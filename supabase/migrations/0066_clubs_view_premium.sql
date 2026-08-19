-- 0066: clubs_with_counts 뷰 재생성 — 프리미엄 컬럼(0063) 노출 누락 수정.
--   Postgres 는 뷰 생성 시점의 c.* 를 컬럼 목록으로 고정한다. 0063 에서 clubs 에
--   tier/premium_status/premium_trial_ends_at/premium_started_at 를 추가했지만 뷰를
--   재생성하지 않아, 앱(clubs_with_counts 조회)에서 tier 등이 안 내려와 프리미엄 클럽이
--   무료로 취급됐다(무료체험 버튼 계속 노출). c.* 재확장으로 새 컬럼을 포함시킨다.

drop view if exists public.clubs_with_counts;
create view public.clubs_with_counts
with (security_invoker = true)
as
select
  c.*,
  p.nickname   as owner_nickname,
  p.avatar_url as owner_avatar_url,
  (select count(*) from public.club_members cm where cm.club_id = c.id and cm.status = 'approved') as member_count
from public.clubs c
join public.profiles p on p.id = c.owner_id;
