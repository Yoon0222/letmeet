-- ============================================================
-- 피넛 PROD 반영 — 0057~0062 (코트배정·DUPR·결제홀드) 누락분 보충
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)
-- 상황: prod 는 0056 까지만 적용됨. 0057~0062 구멍 → reserve_court_hold 없음,
--       DUPR 자격/매치 컬럼 없음(클럽 DUPR·코트예약 결제 깨짐). 이 구간을 채운다.
-- 전부 idempotent(정책엔 drop-if-exists 가드 추가). 운영 SQL Editor 에 통째로 실행.
-- ============================================================

-- ═══ 0057_court_assign_mode.sql ═══
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

-- ═══ 0058_dupr_rating_history.sql ═══
-- 0058: DUPR 레이팅 그래프 — 공개 설정 + 히스토리 캐시.
--
--   dupr_public : 사용자가 자신의 DUPR 그래프를 공개 프로필에 노출할지 선택(기본 비공개).
--                 이건 사용자 취향값이라 protect_dupr_columns 보호 대상이 아니다(직접 수정 허용).
--   dupr_rating_history : DUPR /history(경기별 레이팅 변화) 스냅샷 캐시.
--                 서버(Edge Function=service_role)만 채우고, 앱은 여기서 빠르게 그래프를 그린다.

-- 1) 공개 설정 (사용자 편집 가능)
alter table public.profiles
  add column if not exists dupr_public boolean not null default false;

comment on column public.profiles.dupr_public is
  'DUPR 레이팅 그래프를 공개 프로필(player)에서 남에게 보일지 여부. 본인은 항상 봄.';

-- 2) 히스토리 캐시 테이블
create table if not exists public.dupr_rating_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    bigint,                    -- DUPR matchId (없을 수 있음)
  doubles     numeric(4,3),              -- 해당 시점 복식 레이팅
  singles     numeric(4,3),              -- 해당 시점 단식 레이팅
  recorded_at timestamptz not null,      -- DUPR created(경기/변화 시각)
  created_at  timestamptz not null default now(),
  -- 같은 유저의 같은 경기 중복 저장 방지(match_id 없을 땐 시각으로 구분)
  unique (user_id, match_id, recorded_at)
);

create index if not exists dupr_rating_history_user_time
  on public.dupr_rating_history (user_id, recorded_at);

alter table public.dupr_rating_history enable row level security;

-- 조회: 본인 것은 항상, 남의 것은 그 프로필이 공개(dupr_public)일 때만.
drop policy if exists dupr_history_select on public.dupr_rating_history;
drop policy if exists dupr_history_select on public.dupr_rating_history;
create policy dupr_history_select on public.dupr_rating_history
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = dupr_rating_history.user_id and p.dupr_public = true
    )
  );

-- 쓰기: service_role(Edge Function) 전용 — authenticated/anon 은 정책 없음 → 거부.
--       (service_role 은 RLS 를 우회하므로 별도 정책 불필요.)

-- ═══ 0059_dupr_matches.sql ═══
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
drop policy if exists meetup_matches_select on public.meetup_matches;
create policy meetup_matches_select on public.meetup_matches
  for select using (true);

drop policy if exists meetup_matches_write_host on public.meetup_matches;
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

-- ═══ 0060_dupr_match_code.sql ═══
-- 0060: DUPR 등록 경기의 matchCode 저장 — 이후 수정(match/update)/삭제(match/delete)에 필요.
--   create 응답의 result.matchCode 를 보관해야 나중에 점수 수정·경기 삭제를 DUPR 에 반영할 수 있다.

alter table public.meetup_matches
  add column if not exists dupr_match_code text;
alter table public.tournament_matches
  add column if not exists dupr_match_code text;

-- ═══ 0061_dupr_entitlements.sql ═══
-- 0061: DUPR 운영요건 — 엔티틀먼트(자격) + SSO 토큰 저장.
--   DUPR RaaS 운영키 심사 요건:
--     · 경기 참가/등록 전 선수가 BASIC_L1 자격 보유(active)인지 확인
--     · SSO 의 user access/refresh token 저장(엔티틀먼트 재조회·갱신용)
--
--   보안: 토큰은 사용자 본인의 자격증명이라 profiles(전체 공개 조회)에 두면 안 된다
--   → 조회 정책이 전혀 없는 별도 테이블(dupr_credentials)에 두어 service_role(Edge)만 접근.

-- 1) 엔티틀먼트 플래그(공개 안전 — 불리언). 서버만 갱신(protect_dupr).
alter table public.profiles
  add column if not exists dupr_basic   boolean not null default false,  -- BASIC_L1(정상 회원) 보유+active
  add column if not exists dupr_premium boolean not null default false,  -- PREMIUM_L1(DUPR+) 보유
  add column if not exists dupr_entitlements_synced_at timestamptz;

comment on column public.profiles.dupr_basic is
  'DUPR BASIC_L1 자격 보유(active). 인증 경기 참가/등록의 최소 조건.';

-- 2) protect_dupr_columns 에 엔티틀먼트도 포함(service_role 만 변경)
create or replace function public.protect_dupr_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.dupr_rating    := old.dupr_rating;
    new.dupr_doubles   := old.dupr_doubles;
    new.dupr_singles   := old.dupr_singles;
    new.dupr_verified  := old.dupr_verified;
    new.dupr_status    := old.dupr_status;
    new.dupr_synced_at := old.dupr_synced_at;
    new.dupr_basic     := old.dupr_basic;
    new.dupr_premium   := old.dupr_premium;
    new.dupr_entitlements_synced_at := old.dupr_entitlements_synced_at;
  end if;
  return new;
end;
$$;

-- 3) SSO 토큰 저장소 — 아무도 조회 못 함(service_role 만). RLS 정책 없음 = 전면 차단.
create table if not exists public.dupr_credentials (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.dupr_credentials enable row level security;
-- (일부러 어떤 정책도 만들지 않는다: authenticated/anon 은 전부 거부, service_role 만 우회)

-- ═══ 0062_court_hold_expiry.sql ═══
-- 0062: 코트 예약 "짧은 점유(홀드) + 만료" 모델
--   결제 시작 시 슬롯을 잠시(기본 10분) 점유(hold)하고, 결제 성공 시 확정(영구)한다.
--   expires_at 규칙: NULL = 확정(영구), 미래 = 활성 홀드, 과거 = 만료(차단 안 함, 정리 대상).
--   장점: expires_at 은 공개 조회 가능(결제정보 노출 X) → 시간표/내예약이 RLS 문제 없이 홀드 구분.

-- 1) 컬럼 추가
alter table public.court_reservations add column if not exists expires_at timestamptz;
create index if not exists court_reservations_expires_idx on public.court_reservations (expires_at);

-- 2) 레거시 정리: 옛 모델에서 남은 "미결제 예약 행"(paid 아님) 삭제. 확정(paid)·무료(payment_id null)는 유지.
delete from public.court_reservations r
 where r.payment_id is not null
   and not exists (select 1 from public.payments p where p.id = r.payment_id and p.status = 'paid');
-- 남은 예약은 모두 확정 → expires_at NULL (기본값이라 이미 NULL)

-- 3) 홀드 생성 RPC: 만료 홀드 정리 후 홀드 삽입. 활성 홀드/확정이 있으면 conflict.
--    security definer 로 다른 사람의 '만료된' 홀드까지 정리(슬롯 반환) 가능.
create or replace function public.reserve_court_hold(
  p_court_id uuid,
  p_court_unit text,
  p_slot_date date,
  p_hours int[],
  p_user_id uuid,
  p_payment_id uuid,
  p_minutes int default 10
) returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then
    return 'forbidden';
  end if;

  -- 대상 슬롯의 '만료된' 홀드 정리(확정 expires_at NULL·활성 홀드는 유지)
  delete from public.court_reservations
   where court_id = p_court_id and court_unit = p_court_unit and slot_date = p_slot_date
     and hour = any(p_hours) and status = 'reserved'
     and expires_at is not null and expires_at < now();

  -- 홀드 삽입. 활성 홀드/확정이 있으면 유니크 위반 → conflict.
  insert into public.court_reservations (court_id, user_id, court_unit, slot_date, hour, payment_id, status, expires_at)
  select p_court_id, p_user_id, p_court_unit, p_slot_date, h, p_payment_id, 'reserved', now() + make_interval(mins => p_minutes)
  from unnest(p_hours) as h;

  return 'ok';
exception when unique_violation then
  return 'conflict';
end $$;
grant execute on function public.reserve_court_hold(uuid, text, date, int[], uuid, uuid, int) to authenticated;

-- 4) 만료 홀드 일괄 정리 RPC (pg_cron 용). 확정(NULL)은 건드리지 않음.
create or replace function public.release_expired_court_holds() returns int
language plpgsql
security definer set search_path = public
as $$
declare n int;
begin
  with del as (
    delete from public.court_reservations
     where status = 'reserved' and expires_at is not null and expires_at < now()
     returning 1
  )
  select count(*) into n from del;
  return coalesce(n, 0);
end $$;

-- pg_cron 스케줄(대시보드 SQL Editor 에서 1회 실행 권장, 5분마다 만료 홀드 정리):
--   select cron.schedule('release-expired-court-holds', '*/5 * * * *',
--                        $$select public.release_expired_court_holds()$$);

-- ===== 적용 후 검증 (전부 true) =====
select
  to_regprocedure('public.reserve_court_hold(uuid,text,date,int[],uuid,uuid,int)') is not null as m0062_hold_fn,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='court_reservations' and column_name='expires_at') as m0062_expires,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='dupr_basic') as m0061_dupr_basic,
  to_regclass('public.dupr_credentials') is not null as m0061_cred,
  to_regclass('public.dupr_rating_history') is not null as m0058_history,
  to_regclass('public.meetup_matches') is not null as m0059_meetup_matches,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='tournaments' and column_name='court_assign_mode') as m0057_assign,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='tournaments' and column_name='dupr_certified') as m0059_dupr_cert;
