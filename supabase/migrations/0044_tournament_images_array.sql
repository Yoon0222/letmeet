-- 0044: 대회 사진 다중화 — image_url(단일) → images(배열). 첫 장이 메인 커버.
alter table public.tournaments add column if not exists images text[] not null default '{}';

-- 기존 단일 사진(0043)을 배열로 이관
update public.tournaments
  set images = array[image_url]
  where image_url is not null and (images is null or array_length(images, 1) is null);

-- 단일 컬럼 제거 (뷰의 t.* 가 참조하므로 뷰 먼저 드롭 후 컬럼 드롭)
drop view if exists public.tournaments_with_counts;
alter table public.tournaments drop column if exists image_url;

-- 뷰 재생성 (images 포함, image_url 제거)
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
