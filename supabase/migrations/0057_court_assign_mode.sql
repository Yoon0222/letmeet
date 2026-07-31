-- 0057: 대회 코트 배정 방식 (auto=자동배정+수동수정 / manual=완전 수동).
--   auto: 점수 입력 등 진행 시 빈 코트에 자동 배정, 운영자가 이후 수동 변경 가능.
--   manual: 운영자가 경기마다 직접 코트 지정(자동 배정 안 함).
alter table public.tournaments
  add column if not exists court_assign_mode text not null default 'auto'
    check (court_assign_mode in ('auto', 'manual'));

comment on column public.tournaments.court_assign_mode is
  'auto=자동배정(수동수정 가능) / manual=완전 수동';

-- ⚠️ tournaments_with_counts 뷰는 t.* 가 생성 시점에 고정되므로, 새 컬럼이
--    자동 반영되지 않는다(0038 이슈 동일). 새 컬럼이 t.* 중간에 끼어 컬럼 순서가
--    바뀌면 create or replace 가 거부되므로(42P16), drop 후 재생성한다.
drop view if exists public.tournaments_with_counts;
create view public.tournaments_with_counts
with (security_invoker = true)
as
select
  t.*,
  p.nickname   as organizer_nickname,
  p.avatar_url as organizer_avatar_url,
  (select count(*) from public.tournament_entries e
     where e.tournament_id = t.id and e.status = 'approved') as approved_count,
  (select count(*) from public.tournament_entries e
     where e.tournament_id = t.id and e.status = 'pending') as pending_count
from public.tournaments t
join public.profiles p on p.id = t.organizer_id;
