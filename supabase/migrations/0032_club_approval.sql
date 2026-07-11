-- 0032: 클럽 가입 승인 — clubs.require_approval(승인 필요 설정) + club_members.status(pending/approved).
alter table public.clubs        add column if not exists require_approval boolean not null default false;
alter table public.club_members add column if not exists status text not null default 'approved'; -- 'pending' | 'approved'

-- member_count는 승인된 멤버만 카운트 (뷰 재생성 — image_url 도 c.* 로 포함)
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

-- owner 는 자기 클럽 멤버의 상태 변경(승인) 가능
drop policy if exists "club_members_update_owner" on public.club_members;
create policy "club_members_update_owner" on public.club_members
  for update using (exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid()));

-- owner 는 자기 클럽 멤버 삭제(가입 거절/추방) 가능
drop policy if exists "club_members_delete_owner" on public.club_members;
create policy "club_members_delete_owner" on public.club_members
  for delete using (exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid()));
