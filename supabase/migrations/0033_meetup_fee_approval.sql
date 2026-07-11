-- 0033: 번개모임 게스트비(fee) + 참가 승인제(require_approval / participant status).
alter table public.meetups add column if not exists fee integer not null default 0;                    -- 게스트비(원), 0=무료
alter table public.meetups add column if not exists require_approval boolean not null default false;   -- 참가 신청 승인 필요 여부
alter table public.meetup_participants add column if not exists status text not null default 'approved'; -- 'pending' | 'approved'

-- meetups_with_counts 뷰 재생성 (fee/require_approval 포함 + 승인된 참가자만 카운트)
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

-- 호스트는 자기 모임 참가 신청을 승인(상태 변경) 가능
drop policy if exists "participants_update_host" on public.meetup_participants;
create policy "participants_update_host" on public.meetup_participants
  for update using (exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = auth.uid()));

-- 호스트는 자기 모임 참가 신청을 거절/추방(삭제) 가능
drop policy if exists "participants_delete_host" on public.meetup_participants;
create policy "participants_delete_host" on public.meetup_participants
  for delete using (exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = auth.uid()));
