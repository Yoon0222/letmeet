-- 0059: DUPR 인증 경기 — 번개/대회에 인증 플래그 + 번개 경기기록 테이블 + 제출추적.
--
--   인증(certified) 번개/대회: DUPR 연결(verified)된 사람만 참여, 경기결과를 DUPR 에
--   등록(match/create)해 실제 레이팅에 반영한다. 등록되면 RATING 웹훅으로 그래프 자동 갱신.
--   비인증: 기존과 동일(아무나 참여, DUPR 미연동).

-- 1) 인증 플래그
alter table public.meetups
  add column if not exists dupr_certified boolean not null default false;
alter table public.tournaments
  add column if not exists dupr_certified boolean not null default false;

comment on column public.meetups.dupr_certified is
  'DUPR 인증 번개: 연결(verified)된 사람만 참여, 경기결과를 DUPR 에 등록';

-- 2) 번개 경기기록 (호스트가 기록) — 대회는 이미 tournament_matches 가 있어 이 테이블은 번개 전용.
--    한 행 = 고정된 두 팀 간 한 경기(최대 5게임). games = [{"a":11,"b":7}, ...].
create table if not exists public.meetup_matches (
  id            uuid primary key default gen_random_uuid(),
  meetup_id     uuid not null references public.meetups(id) on delete cascade,
  format        text not null check (format in ('singles', 'doubles')),
  a1            uuid not null references public.profiles(id) on delete cascade,
  a2            uuid references public.profiles(id) on delete set null, -- 복식 파트너(단식이면 null)
  b1            uuid not null references public.profiles(id) on delete cascade,
  b2            uuid references public.profiles(id) on delete set null,
  games         jsonb not null default '[]',           -- [{a:int,b:int}] 최대 5
  recorded_by   uuid references public.profiles(id) on delete set null,
  -- DUPR 제출 추적
  dupr_identifier  text unique,                          -- DUPR 에 보낸 고유값 = 'meetup:'||id
  dupr_status      text not null default 'pending'
                   check (dupr_status in ('pending', 'submitted', 'failed', 'skipped')),
  dupr_submitted_at timestamptz,
  dupr_error       text,
  created_at    timestamptz not null default now()
);

create index if not exists meetup_matches_meetup_idx on public.meetup_matches (meetup_id);

alter table public.meetup_matches enable row level security;

-- 조회: 공개(번개가 공개라 결과도 공개). 쓰기: 해당 번개의 호스트만.
drop policy if exists meetup_matches_select on public.meetup_matches;
create policy meetup_matches_select on public.meetup_matches
  for select using (true);

drop policy if exists meetup_matches_write_host on public.meetup_matches;
create policy meetup_matches_write_host on public.meetup_matches
  for all using (
    exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
  ) with check (
    exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
  );

-- 3) 대회 경기의 DUPR 제출 추적 컬럼(결과 확정 시 등록). 서버(Edge)만 갱신.
alter table public.tournament_matches
  add column if not exists dupr_identifier text unique,
  add column if not exists dupr_status text not null default 'pending'
    check (dupr_status in ('pending', 'submitted', 'failed', 'skipped')),
  add column if not exists dupr_submitted_at timestamptz,
  add column if not exists dupr_error text;

-- 4) meetups_with_counts 뷰는 m.* 라 새 컬럼(dupr_certified)을 자동으로 안 가진다.
--    컬럼 목록이 바뀌므로 create or replace 는 42P16 실패 → drop + create.
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

-- tournaments_with_counts 뷰도 t.* 라 dupr_certified 를 자동으로 안 가진다 → drop+create.
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
