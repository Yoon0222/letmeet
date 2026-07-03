-- ============================================================
-- 마이그레이션 0007 — 단식/복식(discipline)
-- ============================================================

alter table public.tournaments
  add column if not exists discipline text not null default 'singles';

do $$
begin
  alter table public.tournaments
    add constraint tournaments_discipline_check check (discipline in ('singles', 'doubles'));
exception when duplicate_object then null;
end $$;

-- 컬럼 추가됐으니 뷰 재생성 (t.* 는 생성 시점 컬럼만 잡음)
drop view if exists public.tournaments_with_counts;
create view public.tournaments_with_counts
with (security_invoker = true)
as
select
  t.*,
  p.nickname   as organizer_nickname,
  p.avatar_url as organizer_avatar_url,
  (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.status = 'approved') as approved_count,
  (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.status = 'pending') as pending_count
from public.tournaments t
join public.profiles p on p.id = t.organizer_id;
