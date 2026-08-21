-- 0074: clubs_with_counts 뷰 재생성 — image_url 노출 (0073에서 컬럼 추가 후).
--   0066에서 뷰를 재생성할 때 clubs.image_url 이 아직 없어 c.* 가 image_url 을 고정 누락 →
--   업로드·저장은 되는데 앱이 뷰에서 image_url 을 못 받아 대표사진이 안 보였다.

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

notify pgrst, 'reload schema';
