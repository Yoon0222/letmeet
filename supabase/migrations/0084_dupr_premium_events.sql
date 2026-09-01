-- 0084: DUPR+ 프리미엄 이벤트 게이팅 — DUPR 통합 리뷰 요건(2026-09-01).
--   "Any match or tournament should be gated as an option for DUPR+ users.
--    (check only Premium_L1 and Verified_L1 user allowed to enter)"
--   · profiles.dupr_verified_l1 — VERIFIED_L1 자격 보유(SSO subscriptions 에서 동기화)
--   · meetups/tournaments.dupr_premium — 생성 시 "DUPR+ 전용" 옵션.
--     참가 게이트 = dupr_premium(PREMIUM_L1) + dupr_verified_l1(VERIFIED_L1) 둘 다 보유.

-- 1) VERIFIED_L1 자격 플래그 (서버만 갱신 — protect_dupr_columns)
alter table public.profiles
  add column if not exists dupr_verified_l1 boolean not null default false;

comment on column public.profiles.dupr_verified_l1 is
  'DUPR VERIFIED_L1 자격 보유. DUPR+ 전용 이벤트 참가 조건(PREMIUM_L1 과 함께).';

-- 2) 이벤트 "DUPR+ 전용" 플래그 (생성 옵션)
alter table public.meetups
  add column if not exists dupr_premium boolean not null default false;
alter table public.tournaments
  add column if not exists dupr_premium boolean not null default false;

comment on column public.meetups.dupr_premium is
  'DUPR+ 전용 번개 — PREMIUM_L1 + VERIFIED_L1 보유 회원만 참가(dupr_certified 와 함께 사용).';
comment on column public.tournaments.dupr_premium is
  'DUPR+ 전용 대회 — PREMIUM_L1 + VERIFIED_L1 보유 선수만 참가(dupr_certified 와 함께 사용).';

-- 3) protect_dupr_columns 에 dupr_verified_l1 포함 (service_role 만 변경)
create or replace function public.protect_dupr_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.dupr_id        := old.dupr_id;
    new.dupr_rating    := old.dupr_rating;
    new.dupr_doubles   := old.dupr_doubles;
    new.dupr_singles   := old.dupr_singles;
    new.dupr_verified  := old.dupr_verified;
    new.dupr_status    := old.dupr_status;
    new.dupr_synced_at := old.dupr_synced_at;
    new.dupr_basic     := old.dupr_basic;
    new.dupr_premium   := old.dupr_premium;
    new.dupr_verified_l1 := old.dupr_verified_l1;
    new.dupr_entitlements_synced_at := old.dupr_entitlements_synced_at;
  end if;
  return new;
end;
$$;

-- 4) 뷰 재생성 — m.*/t.* 고정이라 새 컬럼 포함하려면 drop 후 create (42P16 회피)
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
