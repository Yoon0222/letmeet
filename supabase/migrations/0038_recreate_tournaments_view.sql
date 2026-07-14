-- 0038: tournaments_with_counts 뷰 재생성.
-- 뷰의 t.* 는 '정의 시점' 컬럼으로 고정되므로, 0037에서 tournaments 에 추가한
-- team_min_size / tie_singles / tie_doubles 가 뷰에 안 잡힌다. 뷰를 다시 만들어 반영.
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
