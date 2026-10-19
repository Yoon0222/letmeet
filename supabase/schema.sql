-- ============================================================
-- 피클볼 커뮤니티 매칭 — Supabase 스키마
-- Supabase Dashboard → SQL Editor 에 붙여넣고 실행하세요.
-- ============================================================

-- 확장 (UUID, 위치 계산용)
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1) profiles : 사용자 프로필 (auth.users 와 1:1)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null,
  -- 실력: DUPR 스타일 2.0 ~ 8.0
  skill_level numeric(3,1) not null default 3.0 check (skill_level between 2.0 and 8.0),
  region      text not null default '',           -- 활동 지역 (예: 서울 강남구)
  play_style  text not null default 'all',        -- 'aggressive' | 'control' | 'all'
  bio         text not null default '',
  avatar_url  text,
  push_token  text,                                -- Expo 푸시 토큰(내 경기 알림용)
  -- DUPR 연동 (0056/0058). status: none=미연동 / linked=레이팅표시 / verified=소유인증
  dupr_id        text,                             -- 사용자의 DUPR 계정 ID(6자리 공개코드)
  dupr_rating    numeric(3,1),                     -- 대표(복식 우선) 표시용
  dupr_doubles   numeric(3,1),                     -- 복식 레이팅
  dupr_singles   numeric(3,1),                     -- 단식 레이팅
  dupr_status    text not null default 'none' check (dupr_status in ('none','linked','verified')),
  dupr_synced_at timestamptz,                      -- 마지막 동기화 시각
  dupr_verified  boolean not null default false,   -- = (dupr_status='verified'), 하위호환
  dupr_public    boolean not null default false,   -- 레이팅 그래프 공개 여부(본인은 항상 봄)
  dupr_basic     boolean not null default false,   -- BASIC_L1 자격(active) — 인증경기 최소조건(0061)
  dupr_premium   boolean not null default false,   -- PREMIUM_L1(DUPR+) 자격(0061)
  dupr_verified_l1 boolean not null default false, -- VERIFIED_L1 자격 — DUPR+ 전용 이벤트 조건(0084)
  dupr_entitlements_synced_at timestamptz,         -- 자격 마지막 동기화(0061)
  -- 권한(역할): player < organizer < court_manager < super_admin. 부여는 super_admin 만.
  role        text not null default 'player'
              check (role in ('player', 'organizer', 'court_manager', 'super_admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- DUPR 레이팅 히스토리 캐시(0058) — 그래프용. 서버(service_role)만 채운다.
create table if not exists public.dupr_rating_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    bigint,
  doubles     numeric(4,3),
  singles     numeric(4,3),
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (user_id, match_id, recorded_at)
);
create index if not exists dupr_rating_history_user_time
  on public.dupr_rating_history (user_id, recorded_at);

-- SSO user access/refresh 토큰(0061) — 비공개. RLS 정책 없음 = service_role 만 접근.
create table if not exists public.dupr_credentials (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.dupr_credentials enable row level security;

-- ============================================================
-- 2) meetups : 번개 모임
-- ============================================================
create table if not exists public.meetups (
  id            uuid primary key default uuid_generate_v4(),
  host_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  location_name text not null,                    -- 코트/장소 이름
  region        text not null default '',         -- 지역 (필터용)
  start_time    timestamptz not null,
  duration_min  int not null default 120 check (duration_min between 30 and 600),
  skill_min     numeric(3,1) not null default 2.0,
  skill_max     numeric(3,1) not null default 8.0,
  max_players   int not null default 4 check (max_players between 2 and 32),
  fee           integer not null default 0,        -- 게스트비(원), 0=무료 (0033)
  require_approval boolean not null default true,   -- 참가 신청 승인 필요 여부 (0033, 0045 항상 승인제)
  image_url     text,                              -- 코트/장소 사진 (0034)
  court_id      uuid,                              -- 등록 코트 연결(선택) (0046). FK는 courts 정의 뒤(파일 끝)에서 추가
  dupr_certified boolean not null default false,   -- DUPR 인증 번개(0059): 연결자만 참여, 결과 DUPR 등록
  dupr_premium  boolean not null default false,    -- DUPR+ 전용(0084): PREMIUM_L1+VERIFIED_L1 만 참가
  discipline    text not null default 'any'        -- 종목(0086): any=자유 / singles=단식 / doubles=복식
                check (discipline in ('any', 'singles', 'doubles')),
  status        text not null default 'open',     -- 'open' | 'closed' | 'cancelled'
  created_at    timestamptz not null default now()
);

-- 번개 경기기록(0059) — 호스트가 기록, DUPR 등록 추적. 대회는 tournament_matches 사용.
create table if not exists public.meetup_matches (
  id            uuid primary key default gen_random_uuid(),
  meetup_id     uuid not null references public.meetups(id) on delete cascade,
  format        text not null check (format in ('singles','doubles')),
  a1            uuid not null references public.profiles(id) on delete cascade,
  a2            uuid references public.profiles(id) on delete set null,
  b1            uuid not null references public.profiles(id) on delete cascade,
  b2            uuid references public.profiles(id) on delete set null,
  games         jsonb not null default '[]',
  recorded_by   uuid references public.profiles(id) on delete set null,
  dupr_identifier   text unique,
  dupr_match_code   text,                          -- DUPR create 응답 matchCode(수정/삭제용)
  dupr_status       text not null default 'pending' check (dupr_status in ('pending','submitted','failed','skipped')),
  dupr_submitted_at timestamptz,
  dupr_error        text,
  created_at    timestamptz not null default now()
);
create index if not exists meetup_matches_meetup_idx on public.meetup_matches (meetup_id);

create index if not exists meetups_start_time_idx on public.meetups (start_time);
create index if not exists meetups_region_idx on public.meetups (region);

-- ============================================================
-- 3) meetup_participants : 모임 참가자 (M:N)
-- ============================================================
create table if not exists public.meetup_participants (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  status    text not null default 'approved', -- 'pending' | 'approved' (0033)
  joined_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create index if not exists participants_user_idx on public.meetup_participants (user_id);

-- ============================================================
-- 트리거: 회원가입 시 profiles 자동 생성
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 이메일 가입은 nickname 메타데이터, 카카오 등 소셜은 name/nickname/닉네임이 없으면 이메일/기본값
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '피클러'
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 호스트는 모임 생성 시 자동으로 참가자에 포함
create or replace function public.handle_new_meetup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.meetup_participants (meetup_id, user_id)
  values (new.id, new.host_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_meetup_created on public.meetups;
create trigger on_meetup_created
  after insert on public.meetups
  for each row execute function public.handle_new_meetup();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.meetups enable row level security;
alter table public.meetup_participants enable row level security;

-- profiles: 모두 조회 가능, 본인만 수정
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- 사용자 전화번호 (0093) — 개인정보라 공개 profiles 대신 본인 전용 테이블에 저장.
-- 로그인 방식과 무관하게 온보딩에서 1회 수집. service_role 은 RLS 우회(추후 서버 발송용).
create table if not exists public.user_contact (
  id         uuid primary key references public.profiles(id) on delete cascade,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_contact enable row level security;
drop policy if exists "user_contact_select_own" on public.user_contact;
create policy "user_contact_select_own" on public.user_contact
  for select using (auth.uid() = id);
drop policy if exists "user_contact_insert_own" on public.user_contact;
create policy "user_contact_insert_own" on public.user_contact
  for insert with check (auth.uid() = id);
drop policy if exists "user_contact_update_own" on public.user_contact;
create policy "user_contact_update_own" on public.user_contact
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- meetup_matches: 조회 공개, 쓰기는 해당 번개 호스트만 (0059).
alter table public.meetup_matches enable row level security;
drop policy if exists meetup_matches_select on public.meetup_matches;
create policy meetup_matches_select on public.meetup_matches for select using (true);
-- 쓰기 정책은 0085 에서 분리(insert/update/delete) — my_role() 정의 이후, 파일 하단 참조.

-- dupr_rating_history: 본인 것은 항상, 남의 것은 공개(dupr_public)일 때만. 쓰기는 service_role 전용.
alter table public.dupr_rating_history enable row level security;
drop policy if exists dupr_history_select on public.dupr_rating_history;
create policy dupr_history_select on public.dupr_rating_history
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = dupr_rating_history.user_id and p.dupr_public = true)
  );

-- 권한(역할) 헬퍼 + super_admin 역할 부여 + 자기 role 변경 차단
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'player');
$$;

drop policy if exists "profiles_update_superadmin" on public.profiles;
create policy "profiles_update_superadmin" on public.profiles
  for update using (public.my_role() = 'super_admin');

create or replace function public.enforce_role_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- auth.uid() 가 null 이면 백엔드/SQL Editor(신뢰) 컨텍스트 → 허용(부트스트랩용)
  if new.role is distinct from old.role
     and auth.uid() is not null
     and public.my_role() <> 'super_admin' then
    new.role := old.role;  -- 인증된 비-super_admin 의 role 변경만 무시
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change
  before update on public.profiles
  for each row execute function public.enforce_role_change();

-- meetups: 로그인 사용자 조회 가능, 호스트만 생성/수정/삭제
drop policy if exists "meetups_select" on public.meetups;
create policy "meetups_select" on public.meetups
  for select using (true);

drop policy if exists "meetups_insert_host" on public.meetups;
create policy "meetups_insert_host" on public.meetups
  for insert with check (auth.uid() = host_id);

drop policy if exists "meetups_update_host" on public.meetups;
create policy "meetups_update_host" on public.meetups
  for update using (auth.uid() = host_id);

drop policy if exists "meetups_delete_host" on public.meetups;
create policy "meetups_delete_host" on public.meetups
  for delete using (auth.uid() = host_id);

-- participants: 모두 조회, 본인만 참가/취소
drop policy if exists "participants_select" on public.meetup_participants;
create policy "participants_select" on public.meetup_participants
  for select using (true);

drop policy if exists "participants_insert_self" on public.meetup_participants;
create policy "participants_insert_self" on public.meetup_participants
  for insert with check (auth.uid() = user_id);

drop policy if exists "participants_delete_self" on public.meetup_participants;
create policy "participants_delete_self" on public.meetup_participants
  for delete using (auth.uid() = user_id);

-- 호스트는 자기 모임 참가 신청을 승인(상태 변경)/거절(삭제) 가능 (0033)
drop policy if exists "participants_update_host" on public.meetup_participants;
create policy "participants_update_host" on public.meetup_participants
  for update using (exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = auth.uid()));

drop policy if exists "participants_delete_host" on public.meetup_participants;
create policy "participants_delete_host" on public.meetup_participants
  for delete using (exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = auth.uid()));

-- ============================================================
-- 편의 뷰: 모임 + 참가자 수 + 호스트 정보
-- ============================================================
create or replace view public.meetups_with_counts
with (security_invoker = true)
as
select
  m.*,
  p.nickname    as host_nickname,
  p.avatar_url  as host_avatar_url,
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id and mp.status = 'approved') as participant_count,
  (select count(*) from public.meetup_matches mm where mm.meetup_id = m.id) as match_count -- 경기 기록 수(0087) — 기록되면 목록에서 숨김
from public.meetups m
join public.profiles p on p.id = m.host_id;

-- meetup-images 스토리지 버킷 (공개 조회, 로그인 사용자 업로드) (0034)
insert into storage.buckets (id, name, public) values ('meetup-images', 'meetup-images', true) on conflict (id) do nothing;
drop policy if exists "meetup_images_read" on storage.objects;
create policy "meetup_images_read" on storage.objects for select using (bucket_id = 'meetup-images');
drop policy if exists "meetup_images_insert" on storage.objects;
create policy "meetup_images_insert" on storage.objects for insert with check (bucket_id = 'meetup-images' and auth.uid() is not null);
drop policy if exists "meetup_images_update" on storage.objects;
create policy "meetup_images_update" on storage.objects for update using (bucket_id = 'meetup-images' and auth.uid() is not null);

-- ============================================================
-- 클럽(동호회)
-- ============================================================
create table if not exists public.clubs (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text not null default '',
  region      text not null default '',
  image_url   text,                                       -- 클럽 대표 사진 (0031)
  require_approval boolean not null default true,          -- 가입 승인 필요 (항상 승인제, 0032/0042)
  tier        text not null default 'free' check (tier in ('free','premium')),
  premium_status text not null default 'none' check (premium_status in ('none','trialing','active','past_due','canceled')),
  premium_trial_ends_at timestamptz,
  premium_started_at timestamptz,
  premium_plan text not null default 'premium' check (premium_plan in ('premium', 'premium_plus')),  -- 유료 플랜 구분, tier='premium' 일 때만 의미 (0096)
  created_at  timestamptz not null default now()
);
create index if not exists clubs_region_idx on public.clubs (region);

create table if not exists public.club_members (
  club_id   uuid not null references public.clubs(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'officer', 'member')),  -- officer=임원 (0064), CHECK (0095)
  status    text not null default 'approved' check (status in ('pending', 'approved')),    -- (0032), CHECK (0095)
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists club_members_user_idx on public.club_members (user_id);

create table if not exists public.club_match_results (
  id             uuid primary key default uuid_generate_v4(),
  club_id        uuid not null references public.clubs(id) on delete cascade,
  recorded_by    uuid not null references public.profiles(id) on delete cascade,
  match_date     date not null default current_date,
  team1_player1  uuid not null references public.profiles(id) on delete cascade,
  team1_player2  uuid references public.profiles(id) on delete set null,
  team2_player1  uuid not null references public.profiles(id) on delete cascade,
  team2_player2  uuid references public.profiles(id) on delete set null,
  team1_score    int not null check (team1_score between 0 and 99),
  team2_score    int not null check (team2_score between 0 and 99),
  note           text not null default '',
  -- DUPR 등록 상태(0065): 번개/대회와 동일. 엣지함수 dupr-match source='club'.
  dupr_identifier   text unique,
  dupr_match_code   text,
  dupr_status       text not null default 'pending' check (dupr_status in ('pending','submitted','failed','skipped')),
  dupr_submitted_at timestamptz,
  dupr_error        text,
  created_at     timestamptz not null default now(),
  check (team1_player1 <> team2_player1)
);
create index if not exists club_match_results_club_date_idx on public.club_match_results (club_id, match_date desc, created_at desc);

-- 클럽 생성 시 개설자를 owner 멤버로 자동 등록
create or replace function public.handle_new_club()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.club_members (club_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_club_created on public.clubs;
create trigger on_club_created
  after insert on public.clubs
  for each row execute function public.handle_new_club();

-- 플랜 가격표 (0096) — 가격의 기준은 서버. 앱·엣지함수는 여기서 읽는다.
--   등급 저장: clubs.tier 는 'premium' 유지 + premium_plan 으로 구분 → 구버전 앱은 플러스 클럽도 프리미엄으로 인식.
--   플러스 판매는 active 로 켠다(회비 기능 출시 전까지 운영은 false).
create table if not exists public.club_plans (
  plan          text primary key check (plan in ('premium', 'premium_plus')),
  name          text not null,
  monthly_price int  not null check (monthly_price > 0),
  trial_months  int  not null default 1 check (trial_months between 0 and 12),
  active        boolean not null default true,   -- false = 신규 체험·구독·업그레이드 중지(기존 구독은 유지)
  sort          int  not null default 0,
  updated_at    timestamptz not null default now()
);
alter table public.club_plans enable row level security;
drop policy if exists "club_plans_select" on public.club_plans;
create policy "club_plans_select" on public.club_plans for select using (true);
drop policy if exists "club_plans_write_admin" on public.club_plans;
create policy "club_plans_write_admin" on public.club_plans
  for all using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');
insert into public.club_plans (plan, name, monthly_price, trial_months, active, sort) values
  ('premium', '프리미엄', 5500, 1, true, 1),
  ('premium_plus', '프리미엄 플러스', 9900, 1, false, 2)
on conflict (plan) do nothing;

-- 클럽 플랜·권한 공용 함수 (0095·0096) --------------------------------------------
-- 지금 실제로 쓸 수 있는 플랜. 체험 만료·해지 후 기간 종료까지 서버 기준으로 판단(club_subscriptions 는 클럽장만 조회 → definer).
create or replace function public.club_effective_plan(p_club_id uuid)
returns text
language plpgsql
stable security definer set search_path = public
as $$
declare
  c record;
begin
  select tier, premium_status, premium_trial_ends_at, premium_plan into c from public.clubs where id = p_club_id;
  if not found or c.tier is distinct from 'premium' then
    return 'free';
  end if;
  if not (c.premium_status = 'active'
          or (c.premium_status = 'trialing' and c.premium_trial_ends_at is not null and c.premium_trial_ends_at > now())) then
    return 'free';
  end if;
  if exists (select 1 from public.club_subscriptions s
              where s.club_id = p_club_id and s.status = 'canceled'
                and s.current_period_end is not null and s.current_period_end <= now()) then
    return 'free';
  end if;
  return coalesce(c.premium_plan, 'premium');
end;
$$;

create or replace function public.club_plan_rank(p_plan text)
returns int
language sql
immutable set search_path = public
as $$
  select case p_plan when 'premium_plus' then 2 when 'premium' then 1 else 0 end;
$$;

create or replace function public.club_plan_usable(p_club_id uuid, p_min text default 'premium')
returns boolean
language sql
stable security definer set search_path = public
as $$
  select public.club_plan_rank(public.club_effective_plan(p_club_id)) >= public.club_plan_rank(p_min);
$$;

-- 클럽 관리자 = 클럽장 또는 승인된 임원 (is_club_session_manager 의 클럽 단위 버전)
create or replace function public.is_club_manager(p_club_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (select 1 from public.clubs c where c.id = p_club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members m
                  where m.club_id = p_club_id and m.user_id = auth.uid()
                    and m.role = 'officer' and m.status = 'approved');
$$;

-- 무료 체험 시작: 플랜 지정 (클럽장, 클럽당 1회). 판매 중인 플랜만, 기간은 가격표의 trial_months, 날짜는 서버 기준. (0095·0096)
drop function if exists public.start_club_trial(uuid);
create or replace function public.start_club_trial(p_club_id uuid, p_plan text default 'premium')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_active boolean;
  v_months int;
begin
  select owner_id, premium_status into v_owner, v_status from public.clubs where id = p_club_id for update;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  if v_status <> 'none' then return 'already_used'; end if;
  select active, trial_months into v_active, v_months from public.club_plans where plan = p_plan;
  if v_active is not true then return 'plan_unavailable'; end if;
  if v_months <= 0 then return 'no_trial'; end if;
  update public.clubs
     set tier = 'premium', premium_plan = p_plan, premium_status = 'trialing',
         premium_started_at = now(), premium_trial_ends_at = now() + make_interval(months => v_months)
   where id = p_club_id;
  return 'ok';
end;
$$;

-- 뷰(clubs_with_counts)는 비로그인 화면에서도 읽힐 수 있어 effective_plan 은 anon 에도 허용(등급 배지 수준 정보).
revoke execute on function public.club_effective_plan(uuid) from public;
grant execute on function public.club_effective_plan(uuid) to anon, authenticated;
revoke execute on function public.club_plan_rank(text) from public, anon;
grant execute on function public.club_plan_rank(text) to authenticated;
revoke execute on function public.club_plan_usable(uuid, text) from public, anon;
grant execute on function public.club_plan_usable(uuid, text) to authenticated;
revoke execute on function public.is_club_manager(uuid) from public, anon;
grant execute on function public.is_club_manager(uuid) to authenticated;
revoke execute on function public.start_club_trial(uuid, text) from public, anon;
grant execute on function public.start_club_trial(uuid, text) to authenticated;

-- 🔒 등급 컬럼 보호 (0095·0096): tier/premium_plan/premium_* 는 서버(서비스롤 Edge·definer 함수·cron)만 변경.
--    앱(로그인 사용자) 쓰기는 조용히 교정 — 생성 시 유료 플랜 선택=무료 체험(판매 중인 플랜만), 상세의 체험 시작(none→trialing)만 허용.
create or replace function public.protect_club_plan_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_active boolean;
  v_months int;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.tier = 'premium' then
      select active, trial_months into v_active, v_months from public.club_plans where plan = new.premium_plan;
      if v_active is not true or coalesce(v_months, 0) <= 0 then
        -- 판매 중이 아니거나 체험이 없는 플랜을 고르면 기본 프리미엄 체험으로
        new.premium_plan := 'premium';
        select trial_months into v_months from public.club_plans where plan = 'premium';
      end if;
      new.premium_status := 'trialing';
      new.premium_started_at := now();
      new.premium_trial_ends_at := now() + make_interval(months => greatest(coalesce(v_months, 1), 1));
    else
      new.tier := 'free';
      new.premium_plan := 'premium';
      new.premium_status := 'none';
      new.premium_started_at := null;
      new.premium_trial_ends_at := null;
    end if;
    return new;
  end if;

  if new.tier is not distinct from old.tier
     and new.premium_plan is not distinct from old.premium_plan
     and new.premium_status is not distinct from old.premium_status
     and new.premium_started_at is not distinct from old.premium_started_at
     and new.premium_trial_ends_at is not distinct from old.premium_trial_ends_at then
    return new;
  end if;

  -- 구버전 앱의 '1개월 무료 체험 시작'(none → trialing)만 허용: 프리미엄 체험, 날짜는 서버 기준
  if old.premium_status = 'none' and new.premium_status = 'trialing' then
    select trial_months into v_months from public.club_plans where plan = 'premium';
    new.tier := 'premium';
    new.premium_plan := 'premium';
    new.premium_started_at := now();
    new.premium_trial_ends_at := now() + make_interval(months => greatest(coalesce(v_months, 1), 1));
    return new;
  end if;

  -- 그 외 앱의 등급·플랜 변경은 무시(이전 값 유지)
  new.tier := old.tier;
  new.premium_plan := old.premium_plan;
  new.premium_status := old.premium_status;
  new.premium_started_at := old.premium_started_at;
  new.premium_trial_ends_at := old.premium_trial_ends_at;
  return new;
end;
$$;

drop trigger if exists on_club_protect_plan on public.clubs;
create trigger on_club_protect_plan
  before insert or update on public.clubs
  for each row execute function public.protect_club_plan_columns();

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_match_results enable row level security;

drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select" on public.clubs for select using (true);

drop policy if exists "clubs_insert_owner" on public.clubs;
create policy "clubs_insert_owner" on public.clubs
  for insert with check (auth.uid() = owner_id);

drop policy if exists "clubs_update_owner" on public.clubs;
create policy "clubs_update_owner" on public.clubs
  for update using (auth.uid() = owner_id);

drop policy if exists "clubs_delete_owner" on public.clubs;
create policy "clubs_delete_owner" on public.clubs
  for delete using (auth.uid() = owner_id);

drop policy if exists "club_members_select" on public.club_members;
create policy "club_members_select" on public.club_members for select using (true);

-- 셀프 가입은 일반 회원·승인 대기로만 (0095 — 승인된 임원 셀프 삽입 차단). 클럽장 행은 handle_new_club 트리거가 넣음.
drop policy if exists "club_members_insert_self" on public.club_members;
create policy "club_members_insert_self" on public.club_members
  for insert with check (auth.uid() = user_id and role = 'member' and status = 'pending');

drop policy if exists "club_members_delete_self" on public.club_members;
create policy "club_members_delete_self" on public.club_members
  for delete using (auth.uid() = user_id);

-- owner 는 자기 클럽 멤버의 상태 변경(가입 승인) 가능 (0032)
drop policy if exists "club_members_update_owner" on public.club_members;
create policy "club_members_update_owner" on public.club_members
  for update using (exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid()));

-- owner 는 자기 클럽 멤버 삭제(가입 거절/추방) 가능 (0032)
drop policy if exists "club_members_delete_owner" on public.club_members;
create policy "club_members_delete_owner" on public.club_members
  for delete using (exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid()));

drop policy if exists "club_match_results_select" on public.club_match_results;
create policy "club_match_results_select" on public.club_match_results for select using (true);

drop policy if exists "club_match_results_insert_premium_member" on public.club_match_results;
create policy "club_match_results_insert_premium_member" on public.club_match_results
  for insert with check (
    auth.uid() = recorded_by
    and exists (
      select 1 from public.club_members cm
      where cm.club_id = club_match_results.club_id
        and cm.user_id = auth.uid()
        and cm.status = 'approved'
    )
    and public.club_plan_usable(club_match_results.club_id)  -- 0095
  );

drop policy if exists "club_match_results_update_recorder_or_owner" on public.club_match_results;
create policy "club_match_results_update_recorder_or_owner" on public.club_match_results
  for update using (
    auth.uid() = recorded_by
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );

drop policy if exists "club_match_results_delete_recorder_or_owner" on public.club_match_results;
create policy "club_match_results_delete_recorder_or_owner" on public.club_match_results
  for delete using (
    auth.uid() = recorded_by
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );

-- ── 프리미엄 클럽 구독 (0080): Toss 빌링키 정기결제 ──────────
create table if not exists public.club_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  club_id              uuid not null unique references public.clubs(id) on delete cascade,
  owner_id             uuid not null references public.profiles(id) on delete cascade,
  billing_key          text not null,
  customer_key         text not null,
  card_company         text not null default '',
  card_number_masked   text not null default '',
  amount               int  not null default 5500 check (amount >= 0),
  status               text not null default 'active' check (status in ('active','past_due','canceled')),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  next_charge_at       timestamptz,
  last_charge_at       timestamptz,
  fail_count           int  not null default 0,
  canceled_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  plan                 text not null default 'premium' references public.club_plans(plan),  -- 현재 결제 플랜 (0096)
  pending_plan         text references public.club_plans(plan),                            -- 다음 결제일부터 바뀔 플랜(다운그레이드 예약)
  billing_anchor_day   int check (billing_anchor_day between 1 and 31),                    -- 결제 기준일(월말 밀림 방지)
  first_charge_notified_at timestamptz                                                     -- 체험 후 첫 결제 사전 안내 시각
);
create index if not exists club_subscriptions_due_idx
  on public.club_subscriptions (next_charge_at) where status in ('active', 'past_due');
alter table public.club_subscriptions enable row level security;
drop policy if exists "club_subs_select_owner" on public.club_subscriptions;
create policy "club_subs_select_owner" on public.club_subscriptions for select using (auth.uid() = owner_id);
revoke select on public.club_subscriptions from authenticated, anon;
grant select (id, club_id, owner_id, card_company, card_number_masked, amount, status,
              current_period_start, current_period_end, next_charge_at, last_charge_at,
              fail_count, canceled_at, created_at, updated_at, plan, pending_plan)
  on public.club_subscriptions to authenticated;

create table if not exists public.club_subscription_charges (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.club_subscriptions(id) on delete cascade,  -- 구독 행이 없던 주문(첫 카드 등록 중 환불)은 null (0096)
  club_id         uuid not null references public.clubs(id) on delete cascade,
  amount          int not null,
  status          text not null check (status in ('paid','failed')),
  toss_payment_key text,
  order_id        text,
  fail_reason     text,
  charged_at      timestamptz not null default now(),
  kind            text not null default 'renewal' check (kind in ('initial', 'renewal', 'upgrade')),  -- 첫 결제/갱신/업그레이드 차액 (0096)
  plan            text
);
create index if not exists club_sub_charges_sub_idx
  on public.club_subscription_charges (subscription_id, charged_at desc);
-- 주문번호 중복 방지(0096) — 같은 결제가 두 번 기록되지 않게. NULL 은 여러 개 허용.
create unique index if not exists club_sub_charges_order_uniq on public.club_subscription_charges (order_id);
alter table public.club_subscription_charges enable row level security;
drop policy if exists "club_sub_charges_select_owner" on public.club_subscription_charges;
create policy "club_sub_charges_select_owner" on public.club_subscription_charges for select using (
  exists (select 1 from public.club_subscriptions s where s.id = subscription_id and s.owner_id = auth.uid())
);

-- ── 구독 결제 결과 반영 (0096) ──────────
-- 엣지함수(service_role) 전용.

-- 미확정 주문(클럽당 1건): 결제를 보내기 "전에" 남기고, 결과가 반영되면(아래 commit 함수) 같은 트랜잭션에서 지운다.
--   결과를 모른 채 끝난 주문이 남아 있으면, 다른 주문번호로 결제하기 전에 반드시 그 주문부터 확인한다
--   (결제돼 있으면 환불 후 진행) → 카드 재등록처럼 주문번호가 달라지는 경로에서도 이중 결제가 나지 않는다.
create table if not exists public.club_billing_pending_orders (
  club_id    uuid primary key references public.clubs(id) on delete cascade,
  order_id   text not null,
  kind       text not null check (kind in ('initial', 'renewal', 'upgrade')),
  amount     int  not null,
  created_at timestamptz not null default now()
);
alter table public.club_billing_pending_orders enable row level security;  -- 정책 없음 = 서비스롤만
revoke all on public.club_billing_pending_orders from anon, authenticated;

-- 반영 함수들: 구독·과금 이력·클럽 등급을 한 트랜잭션으로 묶어
-- "결제는 됐는데 구독이 안 생긴" 상태나 등급 불일치가 남지 않게 한다.

-- 과금 이력 기록: 주문번호당 1행. 이미 결과가 기록된 주문번호는 건드리지 않는다
-- (실패·환불로 끝난 주문이 나중에 '결제'로 되살아나면 안 된다 — 엣지함수도 기록된 주문번호는 다시 보내지 않는다).
create or replace function public.club_billing_record_charge(
  p_sub_id uuid, p_club_id uuid, p_amount int, p_status text, p_kind text, p_plan text,
  p_order_id text, p_payment_key text, p_fail_reason text
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.club_subscription_charges
    (subscription_id, club_id, amount, status, kind, plan, order_id, toss_payment_key, fail_reason)
  values (p_sub_id, p_club_id, p_amount, p_status, p_kind, p_plan, p_order_id, p_payment_key, p_fail_reason)
  on conflict (order_id) do nothing;
end;
$$;

-- 구독 시작·재개(카드 등록) 반영. p_charge_order_id 가 있으면 과금 이력도 함께.
create or replace function public.club_billing_commit_issue(
  p_club_id uuid, p_owner_id uuid, p_billing_key text, p_customer_key text, p_card_company text, p_card_masked text,
  p_plan text, p_pending_plan text, p_amount int,
  p_period_start timestamptz, p_period_end timestamptz, p_next_charge_at timestamptz, p_last_charge_at timestamptz,
  p_anchor_day int,
  p_charge_amount int default 0, p_charge_kind text default null, p_charge_order_id text default null, p_charge_payment_key text default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  -- 환불·취소로 끝난 주문(다른 요청이 정리함)은 반영하지 않는다
  if p_charge_order_id is not null and exists (
    select 1 from public.club_subscription_charges where order_id = p_charge_order_id and status = 'failed'
  ) then
    raise exception 'order_closed: %', p_charge_order_id;
  end if;

  insert into public.club_subscriptions
    (club_id, owner_id, billing_key, customer_key, card_company, card_number_masked, plan, pending_plan, amount, status,
     current_period_start, current_period_end, next_charge_at, last_charge_at, billing_anchor_day,
     first_charge_notified_at, fail_count, canceled_at, updated_at)
  values
    (p_club_id, p_owner_id, p_billing_key, p_customer_key, coalesce(p_card_company, ''), coalesce(p_card_masked, ''), p_plan, p_pending_plan, p_amount, 'active',
     p_period_start, p_period_end, p_next_charge_at, p_last_charge_at, p_anchor_day,
     null, 0, null, now())
  on conflict (club_id) do update
    set owner_id = excluded.owner_id, billing_key = excluded.billing_key, customer_key = excluded.customer_key,
        card_company = excluded.card_company, card_number_masked = excluded.card_number_masked,
        plan = excluded.plan, pending_plan = excluded.pending_plan, amount = excluded.amount, status = 'active',
        current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
        next_charge_at = excluded.next_charge_at, last_charge_at = excluded.last_charge_at,
        billing_anchor_day = excluded.billing_anchor_day, first_charge_notified_at = null,
        fail_count = 0, canceled_at = null, updated_at = now()
  returning id into v_id;

  if p_charge_order_id is not null then
    perform public.club_billing_record_charge(v_id, p_club_id, p_charge_amount, 'paid', p_charge_kind, p_plan, p_charge_order_id, p_charge_payment_key, null);
  end if;

  update public.clubs
     set tier = 'premium', premium_plan = p_plan, premium_status = 'active',
         premium_started_at = coalesce(premium_started_at, now())
   where id = p_club_id;
  -- 자기 주문의 미확정 기록만 지운다(다른 요청이 진행 중인 주문 기록은 그대로 — 그 결제를 계속 추적해야 한다)
  if p_charge_order_id is not null then
    delete from public.club_billing_pending_orders where club_id = p_club_id and order_id = p_charge_order_id;
  end if;
  return v_id;
end;
$$;

-- 갱신 성공 반영. 구독이 "과금 직전에 본 상태"(결제 예정 시각·실패 차수·플랜·예약 플랜) 그대로일 때만 넘긴다.
--   'ok'        반영함
--   'duplicate' 같은 주문이 이미 반영돼 있음(중복 실행) — 할 일 없음
--   'stale'     결제는 됐지만 그 사이 구독이 바뀜(해지·카드 재등록·플랜 변경) — 반영하지 않는다. 호출자가 환불한다.
--   'closed'    환불·취소로 끝난 주문 — 반영하지 않는다
-- (개발 중 쓰던 11개 인자 버전이 남아 있으면 제거 — 운영에는 만들어진 적 없음)
drop function if exists public.club_billing_commit_renewal(uuid, timestamptz, int, text, int, timestamptz, timestamptz, int, text, text, text);
create or replace function public.club_billing_commit_renewal(
  p_sub_id uuid, p_expect_next timestamptz, p_expect_fails int, p_expect_plan text, p_expect_pending text,
  p_plan text, p_amount int, p_period_start timestamptz, p_period_end timestamptz, p_anchor_day int,
  p_kind text, p_order_id text, p_payment_key text
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  v_recorded text;
begin
  select * into s from public.club_subscriptions where id = p_sub_id for update;
  if not found then return 'not_found'; end if;
  select status into v_recorded from public.club_subscription_charges where order_id = p_order_id;
  if v_recorded = 'failed' then return 'closed'; end if;
  if s.status = 'canceled'
     or s.next_charge_at is distinct from p_expect_next or s.fail_count is distinct from p_expect_fails
     or s.plan is distinct from p_expect_plan or s.pending_plan is distinct from p_expect_pending then
    if v_recorded = 'paid' then
      delete from public.club_billing_pending_orders where club_id = s.club_id and order_id = p_order_id;
      return 'duplicate';
    end if;
    return 'stale';
  end if;
  perform public.club_billing_record_charge(p_sub_id, s.club_id, p_amount, 'paid', p_kind, p_plan, p_order_id, p_payment_key, null);
  delete from public.club_billing_pending_orders where club_id = s.club_id and order_id = p_order_id;
  update public.club_subscriptions
     set status = 'active', plan = p_plan, pending_plan = null, amount = p_amount,
         current_period_start = p_period_start, current_period_end = p_period_end, next_charge_at = p_period_end,
         last_charge_at = now(), billing_anchor_day = p_anchor_day, fail_count = 0, updated_at = now()
   where id = p_sub_id;
  update public.clubs set tier = 'premium', premium_plan = p_plan, premium_status = 'active' where id = s.club_id;
  return 'ok';
end;
$$;

-- 갱신 실패(카드사 확정 거절) 반영. 예정 상태가 같을 때만, 그리고 그 주문이 이미 결제된 게 아닐 때만.
create or replace function public.club_billing_commit_failure(
  p_sub_id uuid, p_expect_next timestamptz, p_expect_fails int,
  p_plan text, p_amount int, p_kind text, p_order_id text, p_reason text,
  p_max_fails int, p_retry_at timestamptz
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  v_fails int;
begin
  select * into s from public.club_subscriptions where id = p_sub_id for update;
  if not found then return 'not_found'; end if;
  -- 확정 거절된 주문이므로 미확정 기록은 정리한다
  delete from public.club_billing_pending_orders where club_id = s.club_id and order_id = p_order_id;
  if s.next_charge_at is distinct from p_expect_next or s.fail_count is distinct from p_expect_fails then
    return 'stale';
  end if;
  if exists (select 1 from public.club_subscription_charges where order_id = p_order_id and status = 'paid') then
    return 'already_paid';
  end if;
  perform public.club_billing_record_charge(p_sub_id, s.club_id, p_amount, 'failed', p_kind, p_plan, p_order_id, null, p_reason);
  v_fails := coalesce(s.fail_count, 0) + 1;
  if v_fails > p_max_fails then
    -- 유예 초과 → 구독 중지 + 클럽 강등
    update public.club_subscriptions set status = 'past_due', fail_count = v_fails, next_charge_at = null, updated_at = now() where id = p_sub_id;
    update public.clubs set premium_status = 'past_due' where id = s.club_id;
  else
    -- 다시 시도. 그동안 클럽은 유예로 계속 이용
    update public.club_subscriptions set status = 'past_due', fail_count = v_fails, next_charge_at = p_retry_at, updated_at = now() where id = p_sub_id;
  end if;
  return 'ok';
end;
$$;

-- 플랜 변경 반영(체험 중 전환 / 업그레이드 / 다운그레이드 예약·취소).
--   p_sub_id 가 null 이면 구독 없이 클럽 플랜만 바꾼다(체험 중·카드 미등록).
--   p_set_club_plan=false 면 클럽 플랜은 그대로(다운그레이드 예약·취소).
create or replace function public.club_billing_commit_plan_change(
  p_club_id uuid, p_sub_id uuid, p_plan text, p_amount int, p_pending_plan text, p_set_club_plan boolean,
  p_charge_amount int default 0, p_charge_order_id text default null, p_charge_payment_key text default null
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_charge_order_id is not null and exists (
    select 1 from public.club_subscription_charges where order_id = p_charge_order_id and status = 'failed'
  ) then
    raise exception 'order_closed: %', p_charge_order_id;
  end if;
  if p_sub_id is not null then
    update public.club_subscriptions
       set plan = p_plan, amount = p_amount, pending_plan = p_pending_plan,
           first_charge_notified_at = case when plan is distinct from p_plan then null else first_charge_notified_at end,
           updated_at = now()
     where id = p_sub_id and club_id = p_club_id;
    if p_charge_order_id is not null then
      perform public.club_billing_record_charge(p_sub_id, p_club_id, p_charge_amount, 'paid', 'upgrade', p_plan, p_charge_order_id, p_charge_payment_key, null);
      delete from public.club_billing_pending_orders where club_id = p_club_id and order_id = p_charge_order_id;
    end if;
  end if;
  if p_set_club_plan then
    update public.clubs set premium_plan = p_plan where id = p_club_id and tier = 'premium';
  end if;
end;
$$;

-- 위 함수들은 엣지함수(service_role) 전용
revoke all on function public.club_billing_record_charge(uuid, uuid, int, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.club_billing_commit_issue(uuid, uuid, text, text, text, text, text, text, int, timestamptz, timestamptz, timestamptz, timestamptz, int, int, text, text, text) from public, anon, authenticated;
revoke all on function public.club_billing_commit_renewal(uuid, timestamptz, int, text, text, text, int, timestamptz, timestamptz, int, text, text, text) from public, anon, authenticated;
revoke all on function public.club_billing_commit_failure(uuid, timestamptz, int, text, int, text, text, text, int, timestamptz) from public, anon, authenticated;
revoke all on function public.club_billing_commit_plan_change(uuid, uuid, text, int, text, boolean, int, text, text) from public, anon, authenticated;
grant execute on function public.club_billing_record_charge(uuid, uuid, int, text, text, text, text, text, text) to service_role;
grant execute on function public.club_billing_commit_issue(uuid, uuid, text, text, text, text, text, text, int, timestamptz, timestamptz, timestamptz, timestamptz, int, int, text, text, text) to service_role;
grant execute on function public.club_billing_commit_renewal(uuid, timestamptz, int, text, text, text, int, timestamptz, timestamptz, int, text, text, text) to service_role;
grant execute on function public.club_billing_commit_failure(uuid, timestamptz, int, text, int, text, text, text, int, timestamptz) to service_role;
grant execute on function public.club_billing_commit_plan_change(uuid, uuid, text, int, text, boolean, int, text, text) to service_role;
-- ── /구독 결제 결과 반영 ──────────

-- ── 정기모임 반복 스케줄 (0077): 매주 지정 요일 자동 개설·투표오픈 ──────────
create table if not exists public.club_session_schedules (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id) on delete cascade,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  weekday         int  not null check (weekday between 0 and 6),   -- 0=일 … 6=토
  start_time      time not null default '19:00',
  vote_open_days  int  not null default 5 check (vote_open_days between 0 and 21),
  vote_close_days int  not null default 1 check (vote_close_days between 0 and 21),
  title           text not null default '정기모임',
  location        text not null default '',
  court_count     int  not null default 2 check (court_count between 1 and 20),
  point_target    int  not null default 16 check (point_target between 1 and 99),
  format          text not null default 'americano' check (format in ('americano')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint css_vote_order_chk check (vote_open_days >= vote_close_days)
);
create index if not exists club_session_schedules_club_idx on public.club_session_schedules (club_id);
alter table public.club_session_schedules enable row level security;
drop policy if exists "css_select" on public.club_session_schedules;
create policy "css_select" on public.club_session_schedules for select using (
  exists (select 1 from public.club_members m
          where m.club_id = club_session_schedules.club_id and m.user_id = auth.uid() and m.status = 'approved')
  or exists (select 1 from public.clubs c
             where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
);
drop policy if exists "css_write_owner" on public.club_session_schedules;
create policy "css_write_owner" on public.club_session_schedules for all using (
  exists (select 1 from public.clubs c where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.clubs c where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
);

-- ── 클럽 정기모임(세션): 참석 투표 → 아메리카노 대진 → 결과 (0067) ──────────
create table if not exists public.club_sessions (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  schedule_id  uuid references public.club_session_schedules(id) on delete set null, -- 반복 스케줄로 자동생성된 회차(0077)
  created_by   uuid not null references public.profiles(id) on delete cascade,
  title        text not null default '',
  session_date date not null default current_date,
  start_at     timestamptz,
  vote_deadline timestamptz,                                   -- 투표 마감(0068). 그 전까지만 일반 클럽원 투표
  location     text not null default '',
  court_count  int  not null default 1 check (court_count between 1 and 20),
  point_target int  not null default 16 check (point_target between 1 and 99),
  format       text not null default 'americano' check (format in ('americano')),
  status       text not null default 'voting'
               check (status in ('voting', 'matched', 'ongoing', 'finished', 'canceled')),
  created_at   timestamptz not null default now()
);
create index if not exists club_sessions_club_idx on public.club_sessions (club_id, session_date desc, created_at desc);
create unique index if not exists club_sessions_schedule_date_uniq
  on public.club_sessions (schedule_id, session_date) where schedule_id is not null;

-- 반복 스케줄에서 도래한 회차 자동 생성 (0077). p_club_id 주면 해당 클럽만, null=전체(cron).
create or replace function public.generate_due_club_sessions(p_club_id uuid default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int := 0;
  r record;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_next date;
begin
  for r in
    select s.* from public.club_session_schedules s
    where s.active
      and (p_club_id is null or s.club_id = p_club_id)
      and public.club_plan_usable(s.club_id)  -- 0095
  loop
    v_next := v_today + ((r.weekday - extract(dow from v_today)::int + 7) % 7);
    if v_today > (v_next - r.vote_close_days) then
      v_next := v_next + 7;
    end if;
    if v_today >= (v_next - r.vote_open_days)
       and not exists (select 1 from public.club_sessions where schedule_id = r.id and session_date = v_next) then
      begin
        insert into public.club_sessions
          (club_id, created_by, schedule_id, title, session_date, start_at, vote_deadline,
           location, court_count, point_target, format, status)
        values
          (r.club_id, r.created_by, r.id, r.title, v_next,
           (v_next + r.start_time) at time zone 'Asia/Seoul',
           ((v_next - r.vote_close_days) + r.start_time) at time zone 'Asia/Seoul',
           r.location, r.court_count, r.point_target, r.format, 'voting');
        v_count := v_count + 1;
      exception when unique_violation then
        null;
      end;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.generate_due_club_sessions(uuid) from public, anon;
grant execute on function public.generate_due_club_sessions(uuid) to authenticated;

create table if not exists public.club_session_players (
  session_id uuid not null references public.club_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'in' check (status in ('in', 'out')),
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.club_session_matches (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.club_sessions(id) on delete cascade,
  round_no       int not null,
  court_no       int not null,
  team1_player1  uuid not null references public.profiles(id) on delete cascade,
  team1_player2  uuid references public.profiles(id) on delete set null,
  team2_player1  uuid not null references public.profiles(id) on delete cascade,
  team2_player2  uuid references public.profiles(id) on delete set null,
  team1_score    int not null default 0 check (team1_score between 0 and 99),
  team2_score    int not null default 0 check (team2_score between 0 and 99),
  status         text not null default 'scheduled' check (status in ('scheduled', 'ongoing', 'done')),
  dupr_mode      boolean not null default false,   -- 경기 시작 시 선택: true=DUPR 반영, false=일반(친선) (0070)
  dupr_identifier   text unique,
  dupr_match_code   text,
  dupr_status       text not null default 'pending' check (dupr_status in ('pending', 'submitted', 'failed', 'skipped')),
  dupr_submitted_at timestamptz,
  dupr_error        text,
  created_at     timestamptz not null default now()
);
create index if not exists club_session_matches_session_idx on public.club_session_matches (session_id, round_no, court_no);

create or replace function public.is_club_session_manager(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_sessions s
    join public.clubs c on c.id = s.club_id
    where s.id = p_session_id and c.owner_id = auth.uid()
  ) or exists (
    select 1 from public.club_sessions s
    join public.club_members m on m.club_id = s.club_id
    where s.id = p_session_id and m.user_id = auth.uid()
      and m.role = 'officer' and m.status = 'approved'
  );
$$;

create or replace function public.is_club_session_member(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_sessions s
    join public.club_members m on m.club_id = s.club_id
    where s.id = p_session_id and m.user_id = auth.uid() and m.status = 'approved'
  );
$$;

create or replace function public.is_club_session_voting_open(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_sessions s
    where s.id = p_session_id
      and s.status = 'voting'
      and (s.vote_deadline is null or now() < s.vote_deadline)
  );
$$;

create or replace function public.is_club_session_match_player(p_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_session_matches m
    where m.id = p_match_id
      and auth.uid() in (m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2)
  );
$$;

alter table public.club_sessions enable row level security;
alter table public.club_session_players enable row level security;
alter table public.club_session_matches enable row level security;

drop policy if exists "club_sessions_select" on public.club_sessions;
create policy "club_sessions_select" on public.club_sessions for select using (true);
drop policy if exists "club_sessions_insert_manager" on public.club_sessions;
create policy "club_sessions_insert_manager" on public.club_sessions
  for insert with check (
    auth.uid() = created_by
    and (
      exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members m
                  where m.club_id = club_sessions.club_id and m.user_id = auth.uid()
                    and m.role = 'officer' and m.status = 'approved')
    )
    and public.club_plan_usable(club_sessions.club_id)  -- 프리미엄 이상 (0095)
  );
drop policy if exists "club_sessions_update_manager" on public.club_sessions;
create policy "club_sessions_update_manager" on public.club_sessions
  for update using (
    exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members m
                where m.club_id = club_sessions.club_id and m.user_id = auth.uid()
                  and m.role = 'officer' and m.status = 'approved')
  );
drop policy if exists "club_sessions_delete_manager" on public.club_sessions;
create policy "club_sessions_delete_manager" on public.club_sessions
  for delete using (
    exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );

drop policy if exists "club_session_players_select" on public.club_session_players;
create policy "club_session_players_select" on public.club_session_players for select using (true);
drop policy if exists "club_session_players_upsert_self" on public.club_session_players;
create policy "club_session_players_upsert_self" on public.club_session_players
  for insert with check (
    (auth.uid() = user_id
      and public.is_club_session_member(session_id)
      and public.is_club_session_voting_open(session_id))
    or public.is_club_session_manager(session_id)
  );
drop policy if exists "club_session_players_update_self" on public.club_session_players;
create policy "club_session_players_update_self" on public.club_session_players
  for update using (
    (auth.uid() = user_id and public.is_club_session_voting_open(session_id))
    or public.is_club_session_manager(session_id)
  );
drop policy if exists "club_session_players_delete_self" on public.club_session_players;
create policy "club_session_players_delete_self" on public.club_session_players
  for delete using (auth.uid() = user_id or public.is_club_session_manager(session_id));

drop policy if exists "club_session_matches_select" on public.club_session_matches;
create policy "club_session_matches_select" on public.club_session_matches for select using (true);
drop policy if exists "club_session_matches_insert_manager" on public.club_session_matches;
create policy "club_session_matches_insert_manager" on public.club_session_matches
  for insert with check (public.is_club_session_manager(session_id));
drop policy if exists "club_session_matches_update_manager" on public.club_session_matches;
create policy "club_session_matches_update_manager" on public.club_session_matches
  for update using (
    public.is_club_session_manager(session_id)
    or public.is_club_session_match_player(id)
  );
drop policy if exists "club_session_matches_delete_manager" on public.club_session_matches;
create policy "club_session_matches_delete_manager" on public.club_session_matches
  for delete using (public.is_club_session_manager(session_id));

-- 편의 뷰: 클럽 + 개설자 + 멤버 수 (승인된 멤버만 카운트)
create or replace view public.clubs_with_counts
with (security_invoker = true)
as
select
  c.*,
  p.nickname   as owner_nickname,
  p.avatar_url as owner_avatar_url,
  (select count(*) from public.club_members cm where cm.club_id = c.id and cm.status = 'approved') as member_count,
  public.club_effective_plan(c.id) as effective_plan  -- 서버 계산 사용 가능 플랜 (0095)
from public.clubs c
join public.profiles p on p.id = c.owner_id;

-- club-images 스토리지 버킷 (공개 조회, 로그인 사용자 업로드) (0031)
insert into storage.buckets (id, name, public) values ('club-images', 'club-images', true) on conflict (id) do nothing;
drop policy if exists "club_images_read" on storage.objects;
create policy "club_images_read" on storage.objects for select using (bucket_id = 'club-images');
drop policy if exists "club_images_insert" on storage.objects;
create policy "club_images_insert" on storage.objects for insert with check (bucket_id = 'club-images' and auth.uid() is not null);
drop policy if exists "club_images_update" on storage.objects;
create policy "club_images_update" on storage.objects for update using (bucket_id = 'club-images' and auth.uid() is not null);

-- ============================================================
-- 대회 (tournaments)  — 주최자(organizer)가 개설·운영, 사용자는 참가 신청
-- ============================================================
create table if not exists public.tournaments (
  id                    uuid primary key default uuid_generate_v4(),
  organizer_id          uuid not null references public.profiles(id) on delete cascade,
  title                 text not null,
  description           text not null default '',
  region                text not null default '',
  venue                 text not null default '',       -- 장소
  start_at              timestamptz not null,           -- 대회 시작
  registration_deadline timestamptz,                    -- 접수 마감
  max_participants      int not null default 16 check (max_participants between 2 and 256),
  skill_min             numeric(3,1) not null default 2.0,
  skill_max             numeric(3,1) not null default 8.0,
  fee                   int not null default 0,          -- 참가비(원)
  discipline            text not null default 'singles'  -- 'singles' | 'doubles'
                        check (discipline in ('singles', 'doubles')),
  format                text not null default 'group_knockout' -- 진행 방식 (0036): group_knockout | kdk | team
                        check (format in ('group_knockout', 'kdk', 'team')),
  status                text not null default 'registration', -- registration | ongoing | finished | cancelled
  dupr_certified        boolean not null default false,       -- DUPR 인증 대회(0059): 연결자만 참가, 결과 DUPR 등록
  dupr_premium          boolean not null default false,       -- DUPR+ 전용(0084): PREMIUM_L1+VERIFIED_L1 만 참가
  club_id               uuid references public.clubs(id) on delete set null, -- 클럽 월례대회(0064). null=일반 대회
  group_count           int,                                  -- 조 개수 (대진 생성 시)
  advance_per_group     int,                                  -- 조별 진출 인원
  team_min_size         int not null default 2,               -- 단체전: 팀당 최소 인원 (0037)
  tie_singles           int not null default 2,               -- 단체전: 타이당 단식 매치 수 (0037)
  tie_doubles           int not null default 1,               -- 단체전: 타이당 복식 매치 수 (0037)
  images                text[] not null default '{}',          -- 대회 사진(첫 장=메인 커버) (0043→0044)
  created_at            timestamptz not null default now()
);
create index if not exists tournaments_start_idx on public.tournaments (start_at);
create index if not exists tournaments_region_idx on public.tournaments (region);

-- 단체전 팀/팀원 (0037)
create table if not exists public.tournament_teams (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null,
  captain_id    uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  seed          int,
  created_at    timestamptz not null default now()
);
create index if not exists team_tournament_idx on public.tournament_teams (tournament_id);

create table if not exists public.tournament_team_members (
  team_id    uuid not null references public.tournament_teams(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_member_user_idx on public.tournament_team_members (user_id);

alter table public.tournament_teams enable row level security;
alter table public.tournament_team_members enable row level security;

drop policy if exists "teams_select" on public.tournament_teams;
create policy "teams_select" on public.tournament_teams for select using (true);
drop policy if exists "teams_insert_captain" on public.tournament_teams;
create policy "teams_insert_captain" on public.tournament_teams for insert with check (auth.uid() = captain_id);
drop policy if exists "teams_update_owner" on public.tournament_teams;
create policy "teams_update_owner" on public.tournament_teams for update using (
  auth.uid() = captain_id
  or exists (select 1 from public.tournaments t where t.id = tournament_id and t.organizer_id = auth.uid())
);
drop policy if exists "teams_delete_owner" on public.tournament_teams;
create policy "teams_delete_owner" on public.tournament_teams for delete using (
  auth.uid() = captain_id
  or exists (select 1 from public.tournaments t where t.id = tournament_id and t.organizer_id = auth.uid())
);

drop policy if exists "team_members_select" on public.tournament_team_members;
create policy "team_members_select" on public.tournament_team_members for select using (true);
drop policy if exists "team_members_insert_captain" on public.tournament_team_members;
create policy "team_members_insert_captain" on public.tournament_team_members for insert with check (
  exists (select 1 from public.tournament_teams tt where tt.id = team_id and tt.captain_id = auth.uid())
);
drop policy if exists "team_members_delete_captain" on public.tournament_team_members;
create policy "team_members_delete_captain" on public.tournament_team_members for delete using (
  exists (select 1 from public.tournament_teams tt where tt.id = team_id and tt.captain_id = auth.uid())
);

-- 단체전 진행: tie(팀 대 팀 한 판) + tie_matches(서브매치) (0039)
create table if not exists public.tournament_ties (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  phase          text not null default 'group',   -- 'group' | 'knockout'
  group_no       int,
  round_order    int,
  round_name     text,
  slot           int not null default 0,
  team1_id       uuid references public.tournament_teams(id) on delete set null,
  team2_id       uuid references public.tournament_teams(id) on delete set null,
  winner_team_id uuid references public.tournament_teams(id) on delete set null,
  status         text not null default 'scheduled',
  court_id       uuid references public.tournament_courts(id) on delete set null,
  team1_lineup_ready boolean not null default false,  -- 오더 제출(잠금) (0041)
  team2_lineup_ready boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists ties_tournament_idx on public.tournament_ties (tournament_id);

create table if not exists public.tie_matches (
  id            uuid primary key default uuid_generate_v4(),
  tie_id        uuid not null references public.tournament_ties(id) on delete cascade,
  kind          text not null,               -- 'singles' | 'doubles'
  slot          int not null default 0,
  team1_players uuid[] not null default '{}',
  team2_players uuid[] not null default '{}',
  score1        int,
  score2        int,
  winner        text,                        -- 'team1' | 'team2'
  status        text not null default 'scheduled',
  created_at    timestamptz not null default now()
);
create index if not exists tie_matches_tie_idx on public.tie_matches (tie_id);

alter table public.tournament_ties enable row level security;
alter table public.tie_matches enable row level security;

drop policy if exists "ties_select" on public.tournament_ties;
create policy "ties_select" on public.tournament_ties for select using (true);
drop policy if exists "ties_write_organizer" on public.tournament_ties;
create policy "ties_write_organizer" on public.tournament_ties for all using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and t.organizer_id = auth.uid())
) with check (
  exists (select 1 from public.tournaments t where t.id = tournament_id and t.organizer_id = auth.uid())
);

drop policy if exists "tie_matches_select" on public.tie_matches;
create policy "tie_matches_select" on public.tie_matches for select using (true);
drop policy if exists "tie_matches_write_organizer" on public.tie_matches;
create policy "tie_matches_write_organizer" on public.tie_matches for all using (
  exists (select 1 from public.tournament_ties tt join public.tournaments t on t.id = tt.tournament_id
          where tt.id = tie_id and t.organizer_id = auth.uid())
) with check (
  exists (select 1 from public.tournament_ties tt join public.tournaments t on t.id = tt.tournament_id
          where tt.id = tie_id and t.organizer_id = auth.uid())
);

-- 오더(라인업): 주장이 자기 팀 서브매치 출전 선수 지정 (0040/0041). 제출 후 수정 불가.
--   (0102) 정확한 인원·같은 게임 안 중복 없음·그 팀 선수만. 다른 게임과 겹치는지는 제출 때 검사한다
--   (게임별로 저장하므로 여기서 막으면 두 게임의 선수를 맞바꿀 수 없게 된다). 오류 문구는 한국어.
create or replace function public.set_tie_lineup(p_tie_match uuid, p_side text, p_players uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_tie uuid;
  v_team uuid;
  v_ready boolean;
  v_needed int;
  v_member_count int;
  v_unique_count int;
begin
  if p_side not in ('team1', 'team2') then raise exception '잘못된 요청이에요.'; end if;

  select tm.tie_id,
         case when p_side = 'team1' then tt.team1_id else tt.team2_id end,
         case when p_side = 'team1' then tt.team1_lineup_ready else tt.team2_lineup_ready end,
         case when tm.kind = 'singles' then 1 else 2 end
    into v_tie, v_team, v_ready, v_needed
  from public.tie_matches tm
  join public.tournament_ties tt on tt.id = tm.tie_id
  join public.tournament_teams team
    on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
  where tm.id = p_tie_match and team.captain_id = auth.uid();

  if v_tie is null then raise exception '우리 팀 주장만 오더를 정할 수 있어요.'; end if;
  if v_ready then raise exception '이미 제출한 오더는 바꿀 수 없어요.'; end if;
  if coalesce(cardinality(p_players), 0) <> v_needed then raise exception '단식은 1명, 복식은 2명을 골라 주세요.'; end if;

  select count(distinct player_id) into v_unique_count from unnest(p_players) as player_ids(player_id);
  if v_unique_count <> v_needed then raise exception '한 게임에 같은 선수를 두 번 넣을 수 없어요.'; end if;

  select count(*) into v_member_count
  from public.tournament_team_members
  where team_id = v_team and user_id = any(p_players);
  if v_member_count <> v_needed then raise exception '우리 팀 선수만 넣을 수 있어요.'; end if;

  if p_side = 'team1' then
    update public.tie_matches set team1_players = p_players where id = p_tie_match;
  else
    update public.tie_matches set team2_players = p_players where id = p_tie_match;
  end if;
end;
$$;

-- 오더 제출(잠금): 모든 서브매치 라인업 완성 시 제출 (0041). 양 팀 제출 시 공개.
--   (0102) 한 선수가 같은 대결의 두 게임 이상에 들어가 있으면 거절.
create or replace function public.submit_tie_lineup(p_tie uuid, p_side text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_cap boolean;
  v_incomplete int;
  v_assigned int;
  v_unique int;
begin
  if p_side not in ('team1', 'team2') then raise exception '잘못된 요청이에요.'; end if;
  select exists (
    select 1 from public.tournament_ties tt
    join public.tournament_teams team
      on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
    where tt.id = p_tie and team.captain_id = auth.uid()
  ) into v_cap;
  if not v_cap then raise exception '우리 팀 주장만 오더를 제출할 수 있어요.'; end if;

  select count(*) into v_incomplete
  from public.tie_matches tm
  where tm.tie_id = p_tie
    and coalesce(cardinality(case when p_side = 'team1' then tm.team1_players else tm.team2_players end), 0)
        <> (case when tm.kind = 'singles' then 1 else 2 end);
  if v_incomplete > 0 then raise exception '모든 게임의 선수를 먼저 정해 주세요.'; end if;

  select count(*), count(distinct player_id)
    into v_assigned, v_unique
  from public.tie_matches tm
  cross join lateral unnest(
    case when p_side = 'team1' then tm.team1_players else tm.team2_players end
  ) as assigned(player_id)
  where tm.tie_id = p_tie;
  if v_assigned <> v_unique then raise exception '한 선수는 같은 대결에서 한 게임만 나갈 수 있어요.'; end if;

  if p_side = 'team1' then
    update public.tournament_ties set team1_lineup_ready = true where id = p_tie;
  else
    update public.tournament_ties set team2_lineup_ready = true where id = p_tie;
  end if;
end;
$$;

create table if not exists public.tournament_entries (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending',   -- pending | approved | rejected | withdrawn
  partner_name  text,                              -- 복식 파트너 이름(표시용 스냅샷)
  partner_id    uuid references public.profiles(id) on delete set null, -- 복식 파트너(회원 연결)
  seed          int,                               -- 대진 시드(추후)
  checked_in_at timestamptz,                       -- 출전 신고(당일 체크인) 시각
  payment_id    uuid,                              -- 참가비 결제(0089, FK는 payments 생성 후 아래에서 부여)
  paid_at       timestamptz,                       -- 참가비 결제 완료 시각(0089)
  payment_deadline timestamptz,                    -- 결제 마감(0089, 유료 pending 24h)
  created_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
create index if not exists tournament_entries_user_idx on public.tournament_entries (user_id);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;

drop policy if exists "tournaments_select" on public.tournaments;
create policy "tournaments_select" on public.tournaments for select using (true);
drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer" on public.tournaments
  for insert with check (
    auth.uid() = organizer_id
    and (
      public.my_role() in ('organizer', 'court_manager', 'super_admin')
      or (club_id is not null
          and exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
          and public.club_plan_usable(club_id)) -- 클럽장 월례대회(0064), 프리미엄 이상(0095)
    )
  );
drop policy if exists "tournaments_update_organizer" on public.tournaments;
create policy "tournaments_update_organizer" on public.tournaments
  for update using (auth.uid() = organizer_id);
drop policy if exists "tournaments_delete_organizer" on public.tournaments;
create policy "tournaments_delete_organizer" on public.tournaments
  for delete using (auth.uid() = organizer_id);
create index if not exists tournaments_club_idx on public.tournaments (club_id, start_at desc);

-- 클럽 임원 임명/해제 (클럽장 전용) — 0064
create or replace function public.set_club_officer(p_club_id uuid, p_user_id uuid, p_make_officer boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.clubs where id = p_club_id and owner_id = auth.uid()) then
    raise exception 'forbidden: owner only';
  end if;
  update public.club_members
     set role = case when p_make_officer then 'officer' else 'member' end
   where club_id = p_club_id and user_id = p_user_id and role <> 'owner' and status = 'approved';
end $$;
grant execute on function public.set_club_officer(uuid, uuid, boolean) to authenticated;

-- 클럽 가입 승인/거절 (클럽장 또는 임원) — 0064
create or replace function public.review_club_member(p_club_id uuid, p_user_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_allowed boolean;
begin
  select exists (select 1 from public.clubs c where c.id = p_club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members m
                  where m.club_id = p_club_id and m.user_id = auth.uid()
                    and m.role = 'officer' and m.status = 'approved')
    into v_allowed;
  if not v_allowed then raise exception 'forbidden'; end if;
  if p_approve then
    update public.club_members set status = 'approved'
     where club_id = p_club_id and user_id = p_user_id and status = 'pending';
  else
    delete from public.club_members
     where club_id = p_club_id and user_id = p_user_id and status = 'pending';
  end if;
end $$;
grant execute on function public.review_club_member(uuid, uuid, boolean) to authenticated;

-- 참가 신청: 조회 공개, 신청은 본인, 수정은 본인(철회) 또는 주최자(승인/거절), 삭제는 본인
drop policy if exists "entries_select" on public.tournament_entries;
create policy "entries_select" on public.tournament_entries for select using (true);
drop policy if exists "entries_insert_self" on public.tournament_entries;
create policy "entries_insert_self" on public.tournament_entries
  for insert with check (auth.uid() = user_id);
drop policy if exists "entries_update_self_or_organizer" on public.tournament_entries;
create policy "entries_update_self_or_organizer" on public.tournament_entries
  for update using (
    auth.uid() = user_id
    or auth.uid() = (select t.organizer_id from public.tournaments t where t.id = tournament_id)
  );

-- 출전 확인은 운영자만 변경한다. 참가자는 파트너 정보 등 기존 허용 필드만 수정 가능하다. (0094)
create or replace function public.enforce_tournament_checkin_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_id uuid;
begin
  if new.checked_in_at is not distinct from old.checked_in_at then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  select organizer_id into v_organizer_id from public.tournaments where id = new.tournament_id;
  if auth.uid() is distinct from v_organizer_id then
    raise exception '출전 확인은 대회 운영자만 할 수 있어요.';
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_checkin_organizer_only on public.tournament_entries;
create trigger tournament_checkin_organizer_only
before update of checked_in_at on public.tournament_entries
for each row execute function public.enforce_tournament_checkin_organizer();

drop policy if exists "entries_delete_self" on public.tournament_entries;
create policy "entries_delete_self" on public.tournament_entries
  for delete using (auth.uid() = user_id);

-- 편의 뷰: 대회 + 주최자 + 승인 참가자 수
create or replace view public.tournaments_with_counts
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

-- tournament-images 스토리지 버킷 (공개 조회, 로그인 사용자 업로드) (0043)
insert into storage.buckets (id, name, public) values ('tournament-images', 'tournament-images', true) on conflict (id) do nothing;
drop policy if exists "tournament_images_read" on storage.objects;
create policy "tournament_images_read" on storage.objects for select using (bucket_id = 'tournament-images');
drop policy if exists "tournament_images_insert" on storage.objects;
create policy "tournament_images_insert" on storage.objects for insert with check (bucket_id = 'tournament-images' and auth.uid() is not null);
drop policy if exists "tournament_images_update" on storage.objects;
create policy "tournament_images_update" on storage.objects for update using (bucket_id = 'tournament-images' and auth.uid() is not null);

-- 대회 코트 구성 (코트명 + 실내/실외) — 대회마다 자유롭게 정의
create table if not exists public.tournament_courts (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null,                 -- 예: '1', 'A', '센터코트'
  indoor        boolean not null default true, -- true=실내, false=실외
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists tournament_courts_tid_idx on public.tournament_courts (tournament_id);

alter table public.tournament_courts enable row level security;
drop policy if exists "courts_select" on public.tournament_courts;
create policy "courts_select" on public.tournament_courts for select using (true);
drop policy if exists "courts_write_organizer" on public.tournament_courts;
create policy "courts_write_organizer" on public.tournament_courts
  for all using (
    public.my_role() = 'super_admin'
    or auth.uid() = (select t.organizer_id from public.tournaments t where t.id = tournament_id)
  )
  with check (
    public.my_role() = 'super_admin'
    or auth.uid() = (select t.organizer_id from public.tournaments t where t.id = tournament_id)
  );

-- 대회 진행: 경기(조별리그 + 토너먼트)
create table if not exists public.tournament_matches (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  phase         text not null,                 -- 'group' | 'knockout'
  group_no      int,
  round_order   int,
  round_name    text,
  slot          int not null default 0,
  entry1_id     uuid references public.profiles(id) on delete set null,
  entry2_id     uuid references public.profiles(id) on delete set null,
  score1        int,
  score2        int,
  winner_id     uuid references public.profiles(id) on delete set null,
  status        text not null default 'scheduled',
  court_id      uuid references public.tournament_courts(id) on delete set null,
  court_confirmed boolean not null default false, -- 코트 배정 확정(경기 시작) 여부
  created_at    timestamptz not null default now()
);
create index if not exists tournament_matches_tid_idx on public.tournament_matches (tournament_id);

alter table public.tournament_matches enable row level security;
drop policy if exists "matches_select" on public.tournament_matches;
create policy "matches_select" on public.tournament_matches for select using (true);
drop policy if exists "matches_write_organizer" on public.tournament_matches;
create policy "matches_write_organizer" on public.tournament_matches
  for all using (
    public.my_role() = 'super_admin'
    or auth.uid() = (select t.organizer_id from public.tournaments t where t.id = tournament_id)
  )
  with check (
    public.my_role() = 'super_admin'
    or auth.uid() = (select t.organizer_id from public.tournaments t where t.id = tournament_id)
  );

-- ============================================================
-- 코트 예약 (0018) — 예약 가능한 코트 시설 + 시간(1시간) 단위 슬롯 예약
-- ============================================================
create table if not exists public.courts (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  region       text not null default '',
  address      text not null default '',
  description  text not null default '',
  indoor       boolean not null default true,
  hourly_price int not null default 0 check (hourly_price >= 0),
  open_hour    int not null default 6,
  close_hour   int not null default 22,
  image_url    text,
  owner_id     uuid references public.profiles(id) on delete set null,
  latitude     double precision,
  longitude    double precision,
  court_units  jsonb not null default '[]'::jsonb,   -- [{name, surface}] 면별 바닥
  amenities    text[] not null default '{}'::text[], -- 편의시설 키(shower/parking…)
  lessons      boolean not null default false,        -- 레슨 가능 여부
  images       text[] not null default '{}'::text[], -- 코트 사진 URL 배열
  auto_open_days int not null default 0 check (auto_open_days >= 0 and auto_open_days <= 60), -- 예약 자동 오픈 롤링 기간(일). 0=수동만
  refund_policy jsonb not null default '[{"days_before":1,"rate":100}]'::jsonb, -- 취소 환불 단계: [{days_before, rate%}] 내림차순 평가, 해당 없으면 0%
  created_at   timestamptz not null default now(),
  constraint courts_hours_chk check (open_hour >= 0 and close_hour <= 24 and open_hour < close_hour)
);
create index if not exists courts_region_idx on public.courts (region);
create index if not exists courts_geo_idx on public.courts (latitude, longitude)
  where latitude is not null and longitude is not null;
alter table public.courts enable row level security;
drop policy if exists "courts_facility_select" on public.courts;
create policy "courts_facility_select" on public.courts for select using (true);
drop policy if exists "courts_facility_write" on public.courts;
-- 쓰기: 최고관리자는 전체, 코트관리자는 자기 코트(owner_id=본인)만
create policy "courts_facility_write" on public.courts
  for all using (public.my_role() = 'super_admin' or auth.uid() = owner_id)
  with check (public.my_role() = 'super_admin' or auth.uid() = owner_id);

create table if not exists public.court_reservations (
  id         uuid primary key default uuid_generate_v4(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  court_unit text not null default '',                        -- 면(코트) 이름. '' = 시설 단위
  slot_date  date not null,
  hour       int not null check (hour >= 0 and hour <= 23),
  status     text not null default 'reserved',
  expires_at timestamptz,                                     -- NULL=확정(영구), 미래=활성 홀드, 과거=만료
  created_at timestamptz not null default now()
);
create index if not exists court_reservations_expires_idx on public.court_reservations (expires_at);
create index if not exists court_reservations_court_date_idx on public.court_reservations (court_id, slot_date);
create index if not exists court_reservations_user_idx on public.court_reservations (user_id);
-- 중복 방지: (코트, 면, 날짜, 시각) 단위
create unique index if not exists court_reservations_slot_uniq
  on public.court_reservations (court_id, court_unit, slot_date, hour) where status = 'reserved';
alter table public.court_reservations enable row level security;
drop policy if exists "reservations_select" on public.court_reservations;
create policy "reservations_select" on public.court_reservations for select using (true);
drop policy if exists "reservations_insert_self" on public.court_reservations;
create policy "reservations_insert_self" on public.court_reservations
  for insert with check (auth.uid() = user_id);
drop policy if exists "reservations_update_self" on public.court_reservations;
create policy "reservations_update_self" on public.court_reservations
  for update using (auth.uid() = user_id);
drop policy if exists "reservations_delete_self" on public.court_reservations;
create policy "reservations_delete_self" on public.court_reservations
  for delete using (auth.uid() = user_id);

-- 홀드 생성(만료 홀드 정리 후 삽입, 충돌 시 conflict). security definer 로 만료 홀드 정리 가능.
create or replace function public.reserve_court_hold(
  p_court_id uuid, p_court_unit text, p_slot_date date, p_hours int[],
  p_user_id uuid, p_payment_id uuid, p_minutes int default 10
) returns text
language plpgsql security definer set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then return 'forbidden'; end if;
  delete from public.court_reservations
   where court_id = p_court_id and court_unit = p_court_unit and slot_date = p_slot_date
     and hour = any(p_hours) and status = 'reserved' and expires_at is not null and expires_at < now();
  insert into public.court_reservations (court_id, user_id, court_unit, slot_date, hour, payment_id, status, expires_at)
  select p_court_id, p_user_id, p_court_unit, p_slot_date, h, p_payment_id, 'reserved', now() + make_interval(mins => p_minutes)
  from unnest(p_hours) as h;
  return 'ok';
exception when unique_violation then
  return 'conflict';
end $$;
grant execute on function public.reserve_court_hold(uuid, text, date, int[], uuid, uuid, int) to authenticated;

-- 만료 홀드 일괄 정리(pg_cron 용)
create or replace function public.release_expired_court_holds() returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  with del as (
    delete from public.court_reservations
     where status = 'reserved' and expires_at is not null and expires_at < now() returning 1
  ) select count(*) into n from del;
  return coalesce(n, 0);
end $$;

-- 코트 예약 가능일(오픈일) — 0024. 관리자가 연 날짜만 사용자에게 노출.
create table if not exists public.court_open_days (
  court_id   uuid not null references public.courts(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (court_id, day)
);
create index if not exists court_open_days_court_idx on public.court_open_days (court_id, day);
alter table public.court_open_days enable row level security;
drop policy if exists "open_days_select" on public.court_open_days;
create policy "open_days_select" on public.court_open_days for select using (true);
drop policy if exists "open_days_write" on public.court_open_days;
create policy "open_days_write" on public.court_open_days
  for all using (public.my_role() = 'super_admin' or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id))
  with check (public.my_role() = 'super_admin' or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id));

-- 코트 예약 결제(court_payments) — 0026. 주문 1건 = 슬롯 N개 결제.
-- 결제 (payments, 0052 범용화: 코트 예약 + 대회 참가비 공용)
create table if not exists public.payments (
  id           uuid primary key default uuid_generate_v4(),
  order_id     text not null unique,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  order_type   text not null default 'court' check (order_type in ('court','tournament')),
  target_id    uuid,                                        -- 대회 결제 시 tournament_id
  order_name   text not null default '',
  court_id     uuid references public.courts(id) on delete cascade,   -- 코트 주문(대회는 null)
  court_unit   text not null default '',
  slot_date    date,
  hours        int[] not null default '{}',
  amount       int not null default 0,
  refund_amount int not null default 0 check (refund_amount >= 0),        -- 실제 환불 금액(부분환불 대응). 0=미환불
  status       text not null default 'pending' check (status in ('pending','paid','failed','canceled','refunded')),
  provider     text not null default 'portone',
  provider_tx  text,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at);
create index if not exists payments_target_idx on public.payments (order_type, target_id);

-- 대회 참가비 결제 FK (0089) — tournament_entries 는 payments 보다 먼저 생성되므로 여기서 부여
alter table public.tournament_entries drop constraint if exists tournament_entries_payment_id_fkey;
alter table public.tournament_entries
  add constraint tournament_entries_payment_id_fkey
  foreign key (payment_id) references public.payments(id) on delete set null;
alter table public.payments enable row level security;
drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    auth.uid() = user_id or public.my_role() = 'super_admin'
    or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id)
  );
drop policy if exists "payments_insert_self" on public.payments;
create policy "payments_insert_self" on public.payments for insert with check (auth.uid() = user_id);
drop policy if exists "payments_update_self" on public.payments;
create policy "payments_update_self" on public.payments for update using (auth.uid() = user_id);

alter table public.court_reservations add column if not exists payment_id uuid references public.payments(id) on delete set null;
create index if not exists court_reservations_payment_idx on public.court_reservations (payment_id);

-- 코트 연대관(정기 대관) — 0027. 매주 반복 예약 차단 시간대. [start_hour, end_hour)
create table if not exists public.court_blocks (
  id         uuid primary key default uuid_generate_v4(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  weekday    int not null check (weekday between 0 and 6),
  start_hour int not null check (start_hour between 0 and 23),
  end_hour   int not null check (end_hour between 1 and 24),
  label      text not null default '',
  created_at timestamptz not null default now(),
  constraint court_blocks_range_chk check (start_hour < end_hour)
);
create index if not exists court_blocks_court_idx on public.court_blocks (court_id);
alter table public.court_blocks enable row level security;
drop policy if exists "blocks_select" on public.court_blocks;
create policy "blocks_select" on public.court_blocks for select using (true);
drop policy if exists "blocks_write" on public.court_blocks;
create policy "blocks_write" on public.court_blocks
  for all using (public.my_role() = 'super_admin' or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id))
  with check (public.my_role() = 'super_admin' or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id));

-- 연대관 시간대 예약 차단(서버 강제)
create or replace function public.enforce_court_block()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.court_blocks b
    where b.court_id = new.court_id
      and b.weekday = extract(dow from new.slot_date)::int
      and new.hour >= b.start_hour and new.hour < b.end_hour
  ) then
    raise exception '연대관(정기 대관) 시간대는 예약할 수 없습니다.';
  end if;
  return new;
end;
$$;
drop trigger if exists court_reservations_block_check on public.court_reservations;
create trigger court_reservations_block_check
  before insert on public.court_reservations
  for each row execute function public.enforce_court_block();

-- ============================================================
-- 감사 로그(audit log) — 0009
-- 주요 행위(승인/거절/생성/수정/권한변경)를 트리거로 자동 기록.
-- ============================================================
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null, -- 누가
  actor_role  text,                                                   -- 당시 역할
  action      text not null,          -- 무엇을 (예: tournament_entries.UPDATE)
  entity_type text not null,          -- 대상 테이블
  entity_id   text,                   -- 대상 식별자(복합키는 'tid:uid')
  old_data    jsonb,                  -- 변경 전
  new_data    jsonb,                  -- 변경 후
  created_at  timestamptz not null default now()  -- 언제
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 회원 탈퇴로 연쇄 삭제될 때는 프로필이 이미 지워져 있다 → 그때는 행위자를 비워 둔다(외래키 오류 방지, 0100)
  v_actor uuid := (select p.id from public.profiles p where p.id = auth.uid());
  v_row   jsonb := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_entity text;
begin
  v_entity := coalesce(
    v_row->>'id',
    (v_row->>'tournament_id') || coalesce(':' || (v_row->>'user_id'), '')
  );
  insert into public.audit_logs(
    actor_id, actor_role, action, entity_type, entity_id, old_data, new_data
  ) values (
    v_actor,
    case when v_actor is null then null else public.my_role() end,
    TG_TABLE_NAME || '.' || TG_OP,
    TG_TABLE_NAME,
    v_entity,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end
  );
  return null;
end;
$$;

drop trigger if exists audit_tournaments on public.tournaments;
create trigger audit_tournaments
  after insert or update or delete on public.tournaments
  for each row execute function public.audit_trigger();

drop trigger if exists audit_entries on public.tournament_entries;
create trigger audit_entries
  after insert or update or delete on public.tournament_entries
  for each row execute function public.audit_trigger();

drop trigger if exists audit_matches on public.tournament_matches;
create trigger audit_matches
  after insert or update or delete on public.tournament_matches
  for each row execute function public.audit_trigger();

drop trigger if exists audit_profile_role on public.profiles;
create trigger audit_profile_role
  after update on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.audit_trigger();

alter table public.audit_logs enable row level security;
drop policy if exists "audit_select_super" on public.audit_logs;
create policy "audit_select_super" on public.audit_logs
  for select using (public.my_role() = 'super_admin');

-- ============================================================
-- 프로필 사진(아바타) Storage — 0011
-- 경로: avatars/{user_id}/파일명. 조회 공개, 쓰기는 본인 폴더만.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 코트 사진 Storage — 0028. court-images 버킷(공개), 쓰기는 코트관리자/최고관리자.
insert into storage.buckets (id, name, public) values ('court-images', 'court-images', true) on conflict (id) do nothing;
drop policy if exists "court_images_read" on storage.objects;
create policy "court_images_read" on storage.objects for select using (bucket_id = 'court-images');
drop policy if exists "court_images_insert" on storage.objects;
create policy "court_images_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'court-images' and public.my_role() in ('court_manager', 'super_admin'));
drop policy if exists "court_images_delete" on storage.objects;
create policy "court_images_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'court-images' and public.my_role() in ('court_manager', 'super_admin'));

-- ============================================================
-- 회원 탈퇴 (계정 삭제) — 0012, 0100
-- SECURITY DEFINER RPC 로 본인 auth.users 삭제 → profiles 등 연쇄 정리.
-- 탈퇴 자체를 감사 기록에 한 줄 남긴다(account.delete, 0100). 연쇄 삭제된 행들의 기록은 행위자가 비어 있지만
-- 같은 시각의 이 줄로 누구의 탈퇴 때문인지 알 수 있다. 닉네임·이메일 같은 개인정보는 남기지 않는다.
-- ============================================================
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;
  -- 탈퇴 기록: 개인정보 없이 회원 식별자와 당시 역할만. 행위자는 비운다(프로필이 이미 없다).
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id)
  values (null, v_role, 'account.delete', 'profiles', v_uid::text);
end;
$$;
revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;

-- ============================================================
-- 대회 중복 참가 방지 — 0013
-- 신청자·파트너가 이미 그 대회에 참가(신청자/파트너)면 신청 거부.
-- ============================================================
create or replace function public.enforce_no_double_entry()
returns trigger
language plpgsql
as $$
begin
  if new.partner_id is not null and new.partner_id = new.user_id then
    raise exception '본인을 파트너로 지정할 수 없어요.';
  end if;
  if tg_op = 'INSERT' and exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = new.tournament_id
      and (e.user_id = new.user_id or e.partner_id = new.user_id)
  ) then
    raise exception '이미 이 대회에 참가 신청되어 있어요.';
  end if;
  if new.partner_id is not null and exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = new.tournament_id
      and e.user_id <> new.user_id -- 내 행(파트너 변경 대상)은 제외 (0090)
      and (e.user_id = new.partner_id or e.partner_id = new.partner_id)
  ) then
    raise exception '선택한 파트너는 이미 이 대회에 참가 중이에요.';
  end if;
  return new;
end;
$$;
drop trigger if exists on_no_double_entry on public.tournament_entries;
create trigger on_no_double_entry
  before insert or update of partner_id on public.tournament_entries
  for each row execute function public.enforce_no_double_entry();

-- 대기열: 정원 초과 신청은 waitlist, 슬롯이 비면 대기 맨 앞 자동 승격 (0016, 0089 결제 확장)
--   · 유료(fee>0): 정원 내 신청 = '결제 대기'(pending) + 24h payment_deadline. 결제 완료(toss-confirm)가 approved.
--   · 무료(fee=0): 신청 즉시 approved (선착순).
create or replace function public.enforce_waitlist()
returns trigger language plpgsql security definer as $$
declare cap int; occupied int; vfee int;
begin
  if new.status = 'pending' then
    select max_participants, fee into cap, vfee from public.tournaments where id = new.tournament_id;
    select count(*) into occupied from public.tournament_entries
      where tournament_id = new.tournament_id and status in ('pending', 'approved');
    if cap is not null and occupied >= cap then
      new.status := 'waitlist';
      new.payment_deadline := null;
    elsif coalesce(vfee, 0) > 0 then
      new.payment_deadline := now() + interval '24 hours';
    else
      new.status := 'approved';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists on_waitlist_insert on public.tournament_entries;
create trigger on_waitlist_insert
  before insert on public.tournament_entries
  for each row execute function public.enforce_waitlist();

create or replace function public.promote_waitlist()
returns trigger language plpgsql security definer as $$
declare cap int; vfee int; vtitle text; occupied int; tid uuid; nextw uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  tid := coalesce(new.tournament_id, old.tournament_id);
  select max_participants, fee, title into cap, vfee, vtitle from public.tournaments where id = tid;
  if cap is null then return null; end if;
  loop
    select count(*) into occupied from public.tournament_entries
      where tournament_id = tid and status in ('pending', 'approved');
    exit when occupied >= cap;
    select user_id into nextw from public.tournament_entries
      where tournament_id = tid and status = 'waitlist'
      order by created_at asc limit 1;
    exit when nextw is null;
    if coalesce(vfee, 0) > 0 then
      update public.tournament_entries
        set status = 'pending', payment_deadline = now() + interval '24 hours'
        where tournament_id = tid and user_id = nextw;
      perform public.push_notify(nextw, 'system', '대기열 승격 🎉',
        coalesce(vtitle, '대회') || ' 자리가 났어요! 24시간 안에 참가비를 결제하면 참가가 확정됩니다.',
        'tournament', tid);
    else
      update public.tournament_entries set status = 'approved'
        where tournament_id = tid and user_id = nextw;
      perform public.push_notify(nextw, 'system', '참가 확정 🎉',
        coalesce(vtitle, '대회') || ' 대기열에서 승격되어 참가가 확정됐어요.',
        'tournament', tid);
    end if;
  end loop;
  return null;
end; $$;
drop trigger if exists on_waitlist_promote on public.tournament_entries;
create trigger on_waitlist_promote
  after update or delete on public.tournament_entries
  for each row execute function public.promote_waitlist();

-- 결제 기한 만료 정리(0089) — 앱이 대회 상세 로드 시 호출(on-read) + (선택) pg_cron
create or replace function public.expire_unpaid_tournament_entries(p_tournament_id uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; v record;
begin
  for v in
    select e.tournament_id, e.user_id
    from public.tournament_entries e
    join public.tournaments t on t.id = e.tournament_id
    where t.fee > 0 and e.status = 'pending' and e.paid_at is null
      and e.payment_deadline is not null and e.payment_deadline < now()
      and (p_tournament_id is null or e.tournament_id = p_tournament_id)
  loop
    delete from public.tournament_entries
      where tournament_id = v.tournament_id and user_id = v.user_id;
    perform public.push_notify(v.user_id, 'system', '대회 신청 만료',
      '결제 기한(24시간)이 지나 참가 신청이 자동 취소됐어요. 자리가 남아 있으면 다시 신청할 수 있어요.',
      'tournament', v.tournament_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
revoke execute on function public.expire_unpaid_tournament_entries(uuid) from public, anon;
grant execute on function public.expire_unpaid_tournament_entries(uuid) to authenticated, service_role;

-- 결제 우회 차단(0089) — 참가자 본인은 결제 컬럼·유료 대회 확정 상태를 직접 못 바꾼다
--   (승인 주체: 결제 서버(service_role) / 주최자 / super_admin. 체크인 등 다른 컬럼은 허용)
create or replace function public.protect_entry_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare vfee int; vorg uuid;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;
  if auth.uid() is null then return new; end if; -- 서버측 세션(콘솔·크론)
  select fee, organizer_id into vfee, vorg from public.tournaments where id = new.tournament_id;
  if auth.uid() = vorg or public.my_role() = 'super_admin' then return new; end if;
  if new.paid_at is distinct from old.paid_at
     or new.payment_id is distinct from old.payment_id
     or new.payment_deadline is distinct from old.payment_deadline then
    raise exception 'payment fields are server-managed';
  end if;
  if coalesce(vfee, 0) > 0 and new.status = 'approved' and old.status is distinct from 'approved' then
    raise exception 'paid tournament entries are confirmed by payment';
  end if;
  return new;
end; $$;
drop trigger if exists on_protect_entry_payment on public.tournament_entries;
create trigger on_protect_entry_payment
  before update on public.tournament_entries
  for each row execute function public.protect_entry_payment();

-- 조추첨 후 참가 잠금(0091) — 대진 생성된 대회의 approved 참가자는 스스로 취소 불가
create or replace function public.protect_entry_after_draw()
returns trigger language plpgsql security definer set search_path = public as $$
declare vorg uuid;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return old; end if;
  if auth.uid() is null then return old; end if;
  if old.status <> 'approved' then return old; end if;
  if not exists (select 1 from public.tournament_matches m where m.tournament_id = old.tournament_id) then
    return old;
  end if;
  select organizer_id into vorg from public.tournaments where id = old.tournament_id;
  if auth.uid() = vorg or public.my_role() = 'super_admin' then return old; end if;
  raise exception '대진 확정 후에는 참가를 취소할 수 없어요. 운영자에게 문의해 주세요.';
end; $$;
drop trigger if exists on_protect_entry_after_draw on public.tournament_entries;
create trigger on_protect_entry_after_draw
  before delete on public.tournament_entries
  for each row execute function public.protect_entry_after_draw();

-- 코트 배정 알림(0092) — 확정(court_confirmed) 순간 해당 경기 선수(+파트너)에게 푸시
create or replace function public.notify_court_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare vtitle text; vcourt text; vindoor boolean; u uuid;
begin
  if new.court_id is null or new.court_confirmed is not true then return new; end if;
  if coalesce(old.court_confirmed, false) = true and new.court_id is not distinct from old.court_id then
    return new;
  end if;
  select title into vtitle from public.tournaments where id = new.tournament_id;
  select name, indoor into vcourt, vindoor from public.tournament_courts where id = new.court_id;
  for u in
    select e.user_id from public.tournament_entries e
      where e.tournament_id = new.tournament_id and e.user_id in (new.entry1_id, new.entry2_id)
    union
    select e.partner_id from public.tournament_entries e
      where e.tournament_id = new.tournament_id and e.user_id in (new.entry1_id, new.entry2_id)
        and e.partner_id is not null
  loop
    perform public.push_notify(
      u, 'match_turn', '코트 배정 🏟️',
      coalesce(vtitle, '대회') || ' — ' || coalesce(vcourt, '코트')
        || case when vindoor is true then ' (실내)' when vindoor is false then ' (실외)' else '' end
        || ' 코트로 배정됐어요. 경기 준비해 주세요!',
      'tournament', new.tournament_id);
  end loop;
  return new;
end; $$;
drop trigger if exists on_notify_court_assigned on public.tournament_matches;
create trigger on_notify_court_assigned
  after update on public.tournament_matches
  for each row execute function public.notify_court_assigned();

-- ============================================================
-- UGC 신고·차단 (moderation) — 0030
-- ============================================================
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "blocks_select_own" on public.user_blocks;
create policy "blocks_select_own" on public.user_blocks for select using (auth.uid() = blocker_id);
drop policy if exists "blocks_insert_own" on public.user_blocks;
create policy "blocks_insert_own" on public.user_blocks for insert with check (auth.uid() = blocker_id);
drop policy if exists "blocks_delete_own" on public.user_blocks;
create policy "blocks_delete_own" on public.user_blocks for delete using (auth.uid() = blocker_id);

create table if not exists public.reports (
  id             uuid primary key default uuid_generate_v4(),
  reporter_id    uuid not null references public.profiles(id) on delete cascade,
  target_type    text not null check (target_type in ('meetup','club','profile','tournament','community_post','community_comment','court_review')),
  target_id      uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason         text not null,
  detail         text not null default '',
  status         text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at     timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
drop policy if exists "reports_insert_self" on public.reports;
create policy "reports_insert_self" on public.reports for insert with check (auth.uid() = reporter_id);
drop policy if exists "reports_select" on public.reports;
create policy "reports_select" on public.reports
  for select using (auth.uid() = reporter_id or public.my_role() in ('organizer','court_manager','super_admin'));
drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin" on public.reports
  for update using (public.my_role() in ('organizer','court_manager','super_admin'));

-- ============================================================
-- 신청 알림: 클럽 가입 / 번개 참가 pending 시 주최자에게 Expo 푸시 (0035)
-- ============================================================
create extension if not exists pg_net;

create or replace function public.notify_host_on_pending()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_host  uuid;
  v_token text;
  v_title text;
  v_who   text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if tg_table_name = 'club_members' then
    select owner_id into v_host from public.clubs where id = new.club_id;
    v_title := '클럽 가입 신청';
  elsif tg_table_name = 'meetup_participants' then
    select host_id into v_host from public.meetups where id = new.meetup_id;
    v_title := '번개모임 참가 신청';
  else
    return new;
  end if;

  if v_host is null then return new; end if;

  select push_token into v_token from public.profiles where id = v_host;
  if v_token is null or v_token = '' then return new; end if;

  select nickname into v_who from public.profiles where id = new.user_id;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', v_token,
      'sound', 'default',
      'title', v_title,
      'body', coalesce(v_who, '누군가') || '님이 신청했어요. 승인/거절을 확인해 주세요.'
    )
  );

  return new;
end;
$$;

drop trigger if exists on_club_member_pending on public.club_members;
create trigger on_club_member_pending
  after insert on public.club_members
  for each row execute function public.notify_host_on_pending();

drop trigger if exists on_meetup_participant_pending on public.meetup_participants;
create trigger on_meetup_participant_pending
  after insert on public.meetup_participants
  for each row execute function public.notify_host_on_pending();

-- ============================================================
-- 플레이어 리뷰 (0045) — 같이 친 사람만 작성, 별점+한줄평, 프로필/승인 화면에 DUPR과 함께 표시
-- ============================================================

-- 함께 플레이 여부 (리뷰 작성 자격 게이트)
create or replace function public.have_played_together(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b and (
    exists (
      select 1 from meetup_participants p1
      join meetup_participants p2 on p1.meetup_id = p2.meetup_id
      where p1.user_id = a and p1.status = 'approved'
        and p2.user_id = b and p2.status = 'approved'
    )
    or exists (
      select 1 from meetups m
      join meetup_participants p on p.meetup_id = m.id and p.status = 'approved'
      where (m.host_id = a and p.user_id = b) or (m.host_id = b and p.user_id = a)
    )
  );
$$;

create table if not exists public.player_reviews (
  id           uuid primary key default uuid_generate_v4(),
  reviewer_id  uuid not null references public.profiles(id) on delete cascade,
  reviewee_id  uuid not null references public.profiles(id) on delete cascade,
  rating       int  not null check (rating between 1 and 5),
  comment      text not null default '',
  meetup_id    uuid references public.meetups(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (reviewer_id <> reviewee_id),
  unique (reviewer_id, reviewee_id)
);
create index if not exists player_reviews_reviewee_idx on public.player_reviews (reviewee_id);

alter table public.player_reviews enable row level security;
drop policy if exists "player_reviews_select" on public.player_reviews;
create policy "player_reviews_select" on public.player_reviews for select using (true);
drop policy if exists "player_reviews_insert" on public.player_reviews;
create policy "player_reviews_insert" on public.player_reviews for insert
  with check (reviewer_id = auth.uid() and public.have_played_together(auth.uid(), reviewee_id));
drop policy if exists "player_reviews_update" on public.player_reviews;
create policy "player_reviews_update" on public.player_reviews for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
drop policy if exists "player_reviews_delete" on public.player_reviews;
create policy "player_reviews_delete" on public.player_reviews for delete
  using (reviewer_id = auth.uid());

create or replace view public.player_reviews_with_reviewer
with (security_invoker = true) as
select r.*, p.nickname as reviewer_nickname, p.avatar_url as reviewer_avatar_url, p.skill_level as reviewer_skill
from public.player_reviews r
join public.profiles p on p.id = r.reviewer_id;

create or replace view public.player_review_stats
with (security_invoker = true) as
select reviewee_id, count(*)::int as review_count, round(avg(rating)::numeric, 1) as avg_rating
from public.player_reviews
group by reviewee_id;

-- ============================================================
-- 코트 등록 요청 (0046) — 검색에 없는 코트를 유저가 요청 → 운영자 승인 시 courts 에 추가
-- ============================================================
create table if not exists public.court_registration_requests (
  id           uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  address      text not null default '',
  region       text not null default '',
  note         text not null default '',
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  court_id     uuid references public.courts(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists court_reg_req_status_idx on public.court_registration_requests (status);

alter table public.court_registration_requests enable row level security;
drop policy if exists "court_reg_req_select" on public.court_registration_requests;
create policy "court_reg_req_select" on public.court_registration_requests for select
  using (requester_id = auth.uid() or public.my_role() in ('organizer','court_manager','super_admin'));
drop policy if exists "court_reg_req_insert" on public.court_registration_requests;
create policy "court_reg_req_insert" on public.court_registration_requests for insert
  with check (requester_id = auth.uid());
drop policy if exists "court_reg_req_update" on public.court_registration_requests;
create policy "court_reg_req_update" on public.court_registration_requests for update
  using (public.my_role() in ('court_manager','super_admin'))
  with check (public.my_role() in ('court_manager','super_admin'));

-- meetups.court_id → courts FK (courts 가 위에서 정의된 뒤 추가; 재실행 안전)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'meetups_court_id_fkey') then
    alter table public.meetups
      add constraint meetups_court_id_fkey foreign key (court_id) references public.courts(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- 이벤트 팝업 (0047) — 관리자 웹에서 등록/올리기·내리기/기간 설정, 앱 홈에 노출
-- ============================================================
create table if not exists public.event_popups (
  id         uuid primary key default uuid_generate_v4(),
  title      text not null,
  body       text not null default '',
  active     boolean not null default false,
  starts_at  timestamptz,
  ends_at    timestamptz,
  image_url  text,                                  -- 배너 이미지(선택) (0048)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_popups_active_idx on public.event_popups (active, starts_at, ends_at);

alter table public.event_popups enable row level security;
drop policy if exists "event_popups_select" on public.event_popups;
create policy "event_popups_select" on public.event_popups for select using (true);
drop policy if exists "event_popups_insert" on public.event_popups;
create policy "event_popups_insert" on public.event_popups for insert
  with check (public.my_role() = 'super_admin');
drop policy if exists "event_popups_update" on public.event_popups;
create policy "event_popups_update" on public.event_popups for update
  using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');
drop policy if exists "event_popups_delete" on public.event_popups;
create policy "event_popups_delete" on public.event_popups for delete
  using (public.my_role() = 'super_admin');

-- event-images 스토리지 버킷 (0048)
insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true) on conflict (id) do nothing;
drop policy if exists "event_images_read" on storage.objects;
create policy "event_images_read" on storage.objects for select using (bucket_id = 'event-images');
drop policy if exists "event_images_insert" on storage.objects;
create policy "event_images_insert" on storage.objects for insert with check (bucket_id = 'event-images' and auth.uid() is not null);
drop policy if exists "event_images_update" on storage.objects;
create policy "event_images_update" on storage.objects for update using (bucket_id = 'event-images' and auth.uid() is not null);

-- ============================================================
-- 커뮤니티 (0049) — 전체 공개 게시판(카테고리별) + 글·사진·댓글·좋아요
-- ============================================================
create table if not exists public.community_posts (
  id         uuid primary key default uuid_generate_v4(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  category   text not null default 'free'
             check (category in ('free','question','market','review','tip')), -- 자유/질문/장터/후기/팁·정보
  title      text not null,
  body       text not null default '',
  images     text[] not null default '{}',   -- 여러 장, 첫 장이 커버
  is_pinned  boolean not null default false,  -- 운영자 공지 고정(향후)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_posts_category_idx on public.community_posts (category, created_at desc);
create index if not exists community_posts_created_idx on public.community_posts (created_at desc);

create table if not exists public.community_comments (
  id         uuid primary key default uuid_generate_v4(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);

create table if not exists public.community_post_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists community_post_likes_user_idx on public.community_post_likes (user_id);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_post_likes enable row level security;

drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts for select using (true);
drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts for insert with check (auth.uid() = author_id);
drop policy if exists "community_posts_update" on public.community_posts;
create policy "community_posts_update" on public.community_posts for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists "community_posts_delete" on public.community_posts;
create policy "community_posts_delete" on public.community_posts for delete
  using (auth.uid() = author_id or public.my_role() in ('organizer','court_manager','super_admin'));

drop policy if exists "community_comments_select" on public.community_comments;
create policy "community_comments_select" on public.community_comments for select using (true);
drop policy if exists "community_comments_insert" on public.community_comments;
create policy "community_comments_insert" on public.community_comments for insert with check (auth.uid() = author_id);
drop policy if exists "community_comments_delete" on public.community_comments;
create policy "community_comments_delete" on public.community_comments for delete
  using (
    auth.uid() = author_id
    or public.my_role() in ('organizer','court_manager','super_admin')
    or exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid())
  );

drop policy if exists "community_post_likes_select" on public.community_post_likes;
create policy "community_post_likes_select" on public.community_post_likes for select using (true);
drop policy if exists "community_post_likes_insert" on public.community_post_likes;
create policy "community_post_likes_insert" on public.community_post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "community_post_likes_delete" on public.community_post_likes;
create policy "community_post_likes_delete" on public.community_post_likes for delete using (auth.uid() = user_id);

create or replace view public.community_posts_with_counts
with (security_invoker = true)
as
select
  cp.*,
  p.nickname    as author_nickname,
  p.avatar_url  as author_avatar_url,
  p.skill_level as author_skill,
  (select count(*) from public.community_post_likes l where l.post_id = cp.id) as like_count,
  (select count(*) from public.community_comments  c where c.post_id = cp.id) as comment_count
from public.community_posts cp
join public.profiles p on p.id = cp.author_id;

-- community-images 스토리지 버킷 (0049)
insert into storage.buckets (id, name, public) values ('community-images', 'community-images', true) on conflict (id) do nothing;
drop policy if exists "community_images_read" on storage.objects;
create policy "community_images_read" on storage.objects for select using (bucket_id = 'community-images');
drop policy if exists "community_images_insert" on storage.objects;
create policy "community_images_insert" on storage.objects for insert with check (bucket_id = 'community-images' and auth.uid() is not null);

-- ============================================================
-- 코트 리뷰 (0050) — 별점+한줄평, 그 코트 예약한 사람만 작성
-- ============================================================
create or replace function public.has_reserved_court(a uuid, c uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from court_reservations r
    where r.user_id = a and r.court_id = c and r.status = 'reserved'
  );
$$;

create table if not exists public.court_reviews (
  id         uuid primary key default uuid_generate_v4(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  rating     int  not null check (rating between 1 and 5),
  comment    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (court_id, user_id)
);
create index if not exists court_reviews_court_idx on public.court_reviews (court_id, created_at desc);

alter table public.court_reviews enable row level security;
drop policy if exists "court_reviews_select" on public.court_reviews;
create policy "court_reviews_select" on public.court_reviews for select using (true);
drop policy if exists "court_reviews_insert" on public.court_reviews;
create policy "court_reviews_insert" on public.court_reviews for insert
  with check (user_id = auth.uid() and public.has_reserved_court(auth.uid(), court_id));
drop policy if exists "court_reviews_update" on public.court_reviews;
create policy "court_reviews_update" on public.court_reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "court_reviews_delete" on public.court_reviews;
create policy "court_reviews_delete" on public.court_reviews for delete
  using (user_id = auth.uid() or public.my_role() in ('organizer','court_manager','super_admin'));

create or replace view public.court_reviews_with_author
with (security_invoker = true) as
select r.*, p.nickname as author_nickname, p.avatar_url as author_avatar_url, p.skill_level as author_skill
from public.court_reviews r
join public.profiles p on p.id = r.user_id;

create or replace view public.court_review_stats
with (security_invoker = true) as
select court_id, count(*)::int as review_count, round(avg(rating)::numeric, 1) as avg_rating
from public.court_reviews
group by court_id;

-- ============================================================
-- 미결제 홀드 자동정리 (0051) — pending 주문+홀드 N분 후 해제(유령 슬롯 방지)
-- pg_cron 스케줄은 마이그레이션 0051 주석 참고.
-- ============================================================
create or replace function public.release_stale_court_holds(p_minutes int default 15)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
  from public.payments
  where order_type = 'court' and status = 'pending'
    and created_at < now() - make_interval(mins => p_minutes);

  if v_ids is null then
    return 0;
  end if;

  delete from public.court_reservations where payment_id = any(v_ids);
  update public.payments set status = 'canceled' where id = any(v_ids);

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;
-- 0053: 인앱 알림 센터 — 중앙 notifications 테이블 + 단일 발송 함수(push_notify).
--   지금까지 푸시는 "쏘고 끝"이라 기록이 없어 종모양 안읽음 숫자를 못 셌다.
--   → 모든 알림을 여기 저장하고(종 뱃지용) 동시에 Expo 푸시도 보낸다.
--   기존 트리거(0035 신청 알림)도 이 함수로 통일한다.
create extension if not exists pg_net;

-- (A) 알림 저장 테이블 -----------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade, -- 받는 사람
  type        text not null,          -- join_request | join_approved | comment | match_turn | tie | system
  title       text not null,
  body        text not null default '',
  target_type text,                    -- meetup | club | community_post | tournament | court
  target_id   uuid,
  actor_id    uuid references public.profiles(id) on delete set null, -- 유발한 사람(선택)
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- 조회/수정/삭제는 본인 것만. insert 정책은 없음 → 클라이언트 직접 삽입 불가(발송 함수만).
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using (user_id = auth.uid());

-- 실시간 구독(종 뱃지 즉시 갱신)
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- (B) 단일 발송 함수 — 행 저장 + (토큰 있으면) Expo 푸시 --------------------
create or replace function public.push_notify(
  p_user        uuid,
  p_type        text,
  p_title       text,
  p_body        text,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_actor       uuid default null
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text;
begin
  if p_user is null then return; end if;
  -- 내가 유발한 알림은 나에게 보내지 않음 (내 글에 내가 댓글 등)
  if p_actor is not null and p_actor = p_user then return; end if;

  -- 푸시는 notifications AFTER INSERT 트리거(push_on_notification, 0090)가 전담한다
  insert into public.notifications (user_id, type, title, body, target_type, target_id, actor_id)
  values (p_user, p_type, p_title, p_body, p_target_type, p_target_id, p_actor);
end;
$$;

-- "모든 알림은 푸시로" (0090) — 어떤 경로로 알림이 쌓여도 Expo 푸시 발송
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text;
begin
  select push_token into v_token from public.profiles where id = new.user_id;
  if v_token is null or v_token = '' then return null; end if;
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', v_token,
      'sound', 'default',
      'title', new.title,
      'body', new.body,
      'data', jsonb_build_object('target_type', new.target_type, 'target_id', new.target_id)
    )
  );
  return null;
end;
$$;
drop trigger if exists on_notification_push on public.notifications;
create trigger on_notification_push
  after insert on public.notifications
  for each row execute function public.push_on_notification();

-- (C) 안읽음 읽음처리 RPC (전체 또는 특정 id 목록) --------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer set search_path = public
as $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));
$$;

-- (D) 기존 신청 알림(0035)을 발송 함수로 통일 — 이제 종에도 쌓인다 -----------
create or replace function public.notify_host_on_pending()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_host  uuid;
  v_title text;
  v_ttype text;
  v_tid   uuid;
  v_who   text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if tg_table_name = 'club_members' then
    select owner_id into v_host from public.clubs where id = new.club_id;
    v_title := '클럽 가입 신청';
    v_ttype := 'club';  v_tid := new.club_id;
  elsif tg_table_name = 'meetup_participants' then
    select host_id into v_host from public.meetups where id = new.meetup_id;
    v_title := '번개모임 참가 신청';
    v_ttype := 'meetup'; v_tid := new.meetup_id;
  else
    return new;
  end if;

  if v_host is null then return new; end if;
  select nickname into v_who from public.profiles where id = new.user_id;

  perform public.push_notify(
    v_host, 'join_request', v_title,
    coalesce(v_who, '누군가') || '님이 신청했어요. 승인/거절을 확인해 주세요.',
    v_ttype, v_tid, new.user_id
  );
  return new;
end;
$$;
-- 트리거 자체는 0035 에서 이미 걸려 있음(club_members / meetup_participants insert).

-- (E) 신청 승인 알림 — pending → approved 로 바뀌면 신청자에게 -------------
create or replace function public.notify_member_on_approved()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_ttype text;
  v_tid   uuid;
  v_actor uuid;
  v_name  text;
begin
  if new.status is not distinct from old.status or new.status <> 'approved' then
    return new;
  end if;

  if tg_table_name = 'club_members' then
    select owner_id, name into v_actor, v_name from public.clubs where id = new.club_id;
    v_ttype := 'club';   v_tid := new.club_id;
    perform public.push_notify(new.user_id, 'join_approved', '가입이 승인됐어요',
      coalesce(v_name, '클럽') || ' 가입이 수락됐어요. 지금 확인해 보세요!', v_ttype, v_tid, v_actor);
  elsif tg_table_name = 'meetup_participants' then
    select host_id, title into v_actor, v_name from public.meetups where id = new.meetup_id;
    v_ttype := 'meetup'; v_tid := new.meetup_id;
    perform public.push_notify(new.user_id, 'join_approved', '참가가 승인됐어요',
      coalesce(v_name, '번개모임') || ' 참가가 수락됐어요. 코트에서 만나요!', v_ttype, v_tid, v_actor);
  end if;
  return new;
end;
$$;

drop trigger if exists on_club_member_approved on public.club_members;
create trigger on_club_member_approved
  after update on public.club_members
  for each row execute function public.notify_member_on_approved();

drop trigger if exists on_meetup_participant_approved on public.meetup_participants;
create trigger on_meetup_participant_approved
  after update on public.meetup_participants
  for each row execute function public.notify_member_on_approved();

-- (F) 커뮤니티 댓글 알림 — 내 글에 댓글이 달리면 글쓴이에게 -----------------
create or replace function public.notify_post_author_on_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_author uuid;
  v_who    text;
begin
  select author_id into v_author from public.community_posts where id = new.post_id;
  if v_author is null then return new; end if;
  select nickname into v_who from public.profiles where id = new.author_id;

  perform public.push_notify(
    v_author, 'comment', '새 댓글',
    coalesce(v_who, '누군가') || '님이 회원님 글에 댓글을 남겼어요.',
    'community_post', new.post_id, new.author_id
  );
  return new;
end;
$$;

drop trigger if exists on_community_comment_notify on public.community_comments;
create trigger on_community_comment_notify
  after insert on public.community_comments
  for each row execute function public.notify_post_author_on_comment();

-- (F) 정기모임 생성 → 승인 클럽원에게 참석 투표 알림 (0075) ------------------
create or replace function public.notify_club_members_on_session()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_club_name text;
  v_body text;
  r record;
begin
  select name into v_club_name from public.clubs where id = new.club_id;
  v_body := coalesce(v_club_name, '클럽') || ' · ' || to_char(new.session_date, 'MM/DD')
            || ' 정기모임 참석 투표를 해주세요.';
  for r in
    select user_id from public.club_members
    where club_id = new.club_id and status = 'approved' and user_id <> new.created_by
  loop
    perform public.push_notify(
      r.user_id, 'session_vote', '정기모임 참석 투표', v_body,
      'club_session', new.id, new.created_by
    );
  end loop;
  return new;
end;
$$;
drop trigger if exists on_club_session_notify on public.club_sessions;
create trigger on_club_session_notify
  after insert on public.club_sessions
  for each row execute function public.notify_club_members_on_session();

-- 0054: 내부 전용 함수의 실행 권한 회수 (보안).
--
--   Postgres 는 함수 생성 시 PUBLIC 에 EXECUTE 를 기본 부여한다. 그래서 아래 두
--   security definer 함수를 anon/authenticated 가 PostgREST 로 직접 호출할 수 있었다.
--   (2026-07-24 확인: anon 키만으로 push_notify 호출이 실제로 성공함)
--
--   · push_notify              → 아무에게나 가짜 알림 + 실제 폰 푸시 발송 가능(피싱/스팸)
--   · release_stale_court_holds→ p_minutes:0 으로 대기중 결제·예약을 전부 취소 가능(파괴적)
--
--   두 함수는 각각 트리거와 스케줄러(pg_cron)에서만 쓰인다. 트리거 함수들도
--   security definer(소유자=postgres)라 내부 호출은 권한 회수 후에도 정상 동작한다.
--
--   유지: mark_notifications_read 는 auth.uid() 로 본인 범위만 갱신하므로 계속 호출 가능.

revoke all on function public.push_notify(uuid, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.release_stale_court_holds(int)
  from public, anon, authenticated;
-- 0055: push_notify 를 service_role 에만 다시 허용 (Edge Function 용).
--
--   0054 에서 PUBLIC 의 EXECUTE 를 회수하면서, PUBLIC 에 기대던 service_role 도
--   함께 막혔다. 트리거는 소유자(postgres) 권한으로 돌아 영향이 없지만,
--   Edge Function 은 service_role 로 PostgREST 를 호출하므로 명시적 부여가 필요하다.
--
--   service_role 키는 서버(Edge Function)에만 있고 클라이언트에 노출되지 않으므로
--   anon/authenticated 가 막힌 상태는 그대로 유지된다.

grant execute on function public.push_notify(uuid, text, text, text, text, uuid, uuid)
  to service_role;
-- 0056: DUPR 연동 — 레이팅 표시(A) + 소유 인증(B) 지원 + 보안.
--
--   기존: dupr_id(자가입력) · dupr_rating · dupr_verified.
--   추가: 복식/단식 분리 저장 + 연동 상태 + 동기화 시각.
--
--   🔒 보안 핵심: dupr_rating/verified/status 는 서버(Edge Function=service_role)만
--   쓸 수 있어야 한다. 안 그러면 사용자가 프로필 업데이트로 dupr_verified=true 를
--   스스로 켜서 "인증 배지"를 위조할 수 있다. 아래 트리거가 이를 막는다.

alter table public.profiles
  add column if not exists dupr_doubles  numeric(3,1),
  add column if not exists dupr_singles  numeric(3,1),
  add column if not exists dupr_status   text not null default 'none'
    check (dupr_status in ('none', 'linked', 'verified')),
  add column if not exists dupr_synced_at timestamptz;

comment on column public.profiles.dupr_status is
  'none=미연동 / linked=레이팅만 표시(A) / verified=DUPR 로그인 소유인증(B)';

-- 기존에 dupr_verified=true 인 행(없겠지만)을 status 와 정합화
update public.profiles set dupr_status = 'verified'
  where dupr_verified = true and dupr_status = 'none';

-- 🔒 DUPR 결과·엔티틀먼트·ID 컬럼은 service_role(Edge) 만 변경 가능(0061·0081). 일반 사용자 업데이트는 이전 값 유지.
--    연결은 SSO(dupr-verify)로만 → dupr_id 자가입력·dupr_basic 자가위조 차단. dupr_public(공개 토글)은 사용자 편집 허용.
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

drop trigger if exists on_profile_protect_dupr on public.profiles;
create trigger on_profile_protect_dupr
  before update on public.profiles
  for each row execute function public.protect_dupr_columns();

-- DUPR 계정 1:1 — 한 dupr_id 는 한 프로필에만(0082).
create unique index if not exists profiles_dupr_id_uniq
  on public.profiles (dupr_id) where dupr_id is not null;

-- 앱 버전 게이트 설정(0083). min_version 미만=강제, latest_version 미만=권장. '0.0.0'=비활성.
create table if not exists public.app_config (
  id             int primary key default 1 check (id = 1),
  min_version    text not null default '0.0.0',
  latest_version text not null default '0.0.0',
  ios_url        text not null default '',
  android_url    text not null default 'https://play.google.com/store/apps/details?id=com.pinut.app',
  notice         text not null default '',
  updated_at     timestamptz not null default now()
);
insert into public.app_config (id) values (1) on conflict (id) do nothing;
alter table public.app_config enable row level security;
drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read" on public.app_config for select using (true);
drop policy if exists "app_config_write" on public.app_config;
create policy "app_config_write" on public.app_config for all
  using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');
-- 0057: 대회 코트 배정 방식 (auto=자동배정+수동수정 / manual=완전 수동).
--   auto: 점수 입력 등 진행 시 빈 코트에 자동 배정, 운영자가 이후 수동 변경 가능.
--   manual: 운영자가 경기마다 직접 코트 지정(자동 배정 안 함).
alter table public.tournaments
  add column if not exists court_assign_mode text not null default 'auto'
    check (court_assign_mode in ('auto', 'manual'));

comment on column public.tournaments.court_assign_mode is
  'auto=자동배정(수동수정 가능) / manual=완전 수동';

-- ── 0085: DUPR 경기 수정·삭제 요청 + meetup_matches 쓰기 정책 강화 ──────────
--   DUPR 등록된(submitted) 경기는 호스트가 직접 수정/삭제 불가 → 운영자에게 요청.
--   (레이팅 조작 방지 · 관리자 매개 변경 — DUPR 통합 리뷰 요건 정합)
drop policy if exists meetup_matches_write_host on public.meetup_matches;
drop policy if exists meetup_matches_insert_host on public.meetup_matches;
create policy meetup_matches_insert_host on public.meetup_matches
  for insert with check (
    exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
  );
drop policy if exists meetup_matches_update_host on public.meetup_matches;
create policy meetup_matches_update_host on public.meetup_matches
  for update using (
    public.my_role() = 'super_admin'
    or (
      dupr_status <> 'submitted'
      and exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
    )
  );
drop policy if exists meetup_matches_delete_host on public.meetup_matches;
create policy meetup_matches_delete_host on public.meetup_matches
  for delete using (
    public.my_role() = 'super_admin'
    or (
      dupr_status <> 'submitted'
      and exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
    )
  );

create table if not exists public.match_change_requests (
  id           uuid primary key default gen_random_uuid(),
  source       text not null default 'meetup' check (source in ('meetup')),
  match_id     uuid not null references public.meetup_matches(id) on delete cascade,
  meetup_id    uuid not null references public.meetups(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('edit', 'delete')),
  message      text not null default '',              -- 요청 사유(수정이면 바뀔 내용)
  status       text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  resolved_by  uuid references public.profiles(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.match_change_requests enable row level security;
drop policy if exists match_change_requests_select on public.match_change_requests;
create policy match_change_requests_select on public.match_change_requests
  for select using (requester_id = auth.uid() or public.my_role() = 'super_admin');
drop policy if exists match_change_requests_insert on public.match_change_requests;
create policy match_change_requests_insert on public.match_change_requests
  for insert with check (
    requester_id = auth.uid()
    and exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = auth.uid())
  );
drop policy if exists match_change_requests_update on public.match_change_requests;
create policy match_change_requests_update on public.match_change_requests
  for update using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

-- tournaments_with_counts 뷰 재생성 (court_assign_mode 포함 — t.* 고정 이슈).
-- 컬럼 순서 변경으로 create or replace 가 거부(42P16)되므로 drop 후 재생성.
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

-- 0088: 클럽 게시판 — 클럽원 전용 글/댓글 + 공지(운영진).
--   조회/작성 = 승인 멤버·클럽장만(RLS). 공지(is_notice)는 클럽장/임원만 지정.

create table if not exists public.club_posts (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text not null default '',
  is_notice  boolean not null default false,   -- 공지(클럽장/임원만)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists club_posts_club_time on public.club_posts (club_id, is_notice desc, created_at desc);

create table if not exists public.club_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.club_posts(id) on delete cascade,
  club_id    uuid not null references public.clubs(id) on delete cascade, -- RLS 단순화를 위한 비정규화
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists club_post_comments_post_time on public.club_post_comments (post_id, created_at);

alter table public.club_posts enable row level security;
alter table public.club_post_comments enable row level security;

-- 조회: 승인 멤버 또는 클럽장
drop policy if exists club_posts_select on public.club_posts;
create policy club_posts_select on public.club_posts
  for select using (
    exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved')
  );

-- 작성: 본인 + 승인 멤버/클럽장. 공지는 클럽장/임원만.
drop policy if exists club_posts_insert on public.club_posts;
create policy club_posts_insert on public.club_posts
  for insert with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved')
    )
    and (
      is_notice = false
      or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved' and cm.role = 'officer')
    )
  );

-- 수정: 작성자 본인만 (공지 지정 조건은 insert 와 동일하게 유지)
drop policy if exists club_posts_update on public.club_posts;
create policy club_posts_update on public.club_posts
  for update using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and (
      is_notice = false
      or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved' and cm.role = 'officer')
    )
  );

-- 삭제: 작성자 본인 또는 클럽장/임원(운영 정리)
drop policy if exists club_posts_delete on public.club_posts;
create policy club_posts_delete on public.club_posts
  for delete using (
    author_id = auth.uid()
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved' and cm.role = 'officer')
  );

-- 댓글: 조회/작성 = 멤버·클럽장, 삭제 = 본인 또는 클럽장/임원
drop policy if exists club_post_comments_select on public.club_post_comments;
create policy club_post_comments_select on public.club_post_comments
  for select using (
    exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members cm where cm.club_id = club_post_comments.club_id and cm.user_id = auth.uid() and cm.status = 'approved')
  );

drop policy if exists club_post_comments_insert on public.club_post_comments;
create policy club_post_comments_insert on public.club_post_comments
  for insert with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members cm where cm.club_id = club_post_comments.club_id and cm.user_id = auth.uid() and cm.status = 'approved')
    )
  );

drop policy if exists club_post_comments_delete on public.club_post_comments;
create policy club_post_comments_delete on public.club_post_comments
  for delete using (
    author_id = auth.uid()
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members cm where cm.club_id = club_post_comments.club_id and cm.user_id = auth.uid() and cm.status = 'approved' and cm.role = 'officer')
  );

-- 목록용 뷰 — 작성자 + 댓글 수 (security_invoker: 기반 RLS 그대로 적용)
drop view if exists public.club_posts_with_authors;
create view public.club_posts_with_authors
with (security_invoker = true)
as
select
  p.*,
  pr.nickname   as author_nickname,
  pr.avatar_url as author_avatar_url,
  (select count(*) from public.club_post_comments cc where cc.post_id = p.id) as comment_count
from public.club_posts p
join public.profiles pr on pr.id = p.author_id;

-- ══ 클럽 회비 — 데이터·규칙 ══ (0097_club_dues.sql 과 같은 내용)
-- 0097: 클럽 회비 — 데이터·규칙 (프리미엄 플러스 전용)
--   돈의 흐름: 회원 카드 → 피넛 토스 가맹점 → 클럽 정산.
--   원칙: 앱(회원·운영진)은 회비 표에 직접 쓰지 않는다 — 전부 서버 함수(RPC·엣지함수) 경유.
--   스위치: platform_billing_settings.dues_enabled(운영은 false 로 시작) 또는 pilot_club_ids 에 든 클럽만 동작.
--   날짜 계산은 모두 한국 시간(KST) 기준.

-- ── 0) 클럽 회원의 승인 시각 — "납부일 이후 승인된 회원은 다음 기간부터" 판단용 ──────────
alter table public.club_members add column if not exists approved_at timestamptz;
update public.club_members set approved_at = joined_at where status = 'approved' and approved_at is null;

create or replace function public.club_members_set_approved_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then
      new.approved_at := now();
    else
      new.approved_at := old.approved_at;  -- 승인 시각은 한 번 정해지면 바꿀 수 없다
    end if;
  else
    new.approved_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists on_club_member_approved_at on public.club_members;
create trigger on_club_member_approved_at
  before insert or update on public.club_members
  for each row execute function public.club_members_set_approved_at();

-- ── 1) 플랫폼 설정·수수료 ──────────
create table if not exists public.platform_billing_settings (
  id              boolean primary key default true check (id),      -- 단일 행
  dues_enabled    boolean not null default false,                   -- 회비 기능 전체 스위치
  pilot_club_ids  uuid[]  not null default '{}',                    -- 전체 스위치가 꺼져 있어도 켜 둘 클럽
  default_fee_bps int     not null default 350 check (default_fee_bps between 0 and 3000),  -- 기본 수수료 3.5%(카드 수수료 포함)
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);
insert into public.platform_billing_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_billing_settings enable row level security;
drop policy if exists "platform_billing_settings_admin" on public.platform_billing_settings;
create policy "platform_billing_settings_admin" on public.platform_billing_settings
  for all using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

create table if not exists public.club_fee_overrides (
  club_id    uuid primary key references public.clubs(id) on delete cascade,
  fee_bps    int  not null check (fee_bps between 0 and 3000),
  note       text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.club_fee_overrides enable row level security;
drop policy if exists "club_fee_overrides_admin" on public.club_fee_overrides;
create policy "club_fee_overrides_admin" on public.club_fee_overrides
  for all using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

create or replace function public.dues_enabled_for(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select s.dues_enabled or p_club_id = any (s.pilot_club_ids) from public.platform_billing_settings s where s.id), false);
$$;

-- 클럽에 적용되는 수수료율(만분율): 클럽별 예외 → 기본값
create or replace function public.club_fee_bps(p_club_id uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select o.fee_bps from public.club_fee_overrides o where o.club_id = p_club_id),
    (select s.default_fee_bps from public.platform_billing_settings s where s.id),
    350);
$$;

create or replace function public.dues_fee_amount(p_amount int, p_bps int)
returns int language sql immutable
as $$ select round(p_amount::numeric * p_bps / 10000)::int; $$;  -- numeric 으로 계산(큰 금액×높은 요율에서 정수 넘침 방지)

-- 호출자가 최고관리자이거나 서버(서비스롤·cron)인가 — 관리자용 함수의 공통 검사
create or replace function public.dues_is_admin_or_service()
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    -- 요청 정보(JWT)가 아예 없는 실행 = DB 안에서 직접 부른 것(cron 등). 요청 정보가 있으면 서비스롤·최고관리자만.
    when nullif(current_setting('request.jwt.claims', true), '') is null
         and nullif(current_setting('request.jwt.claim.role', true), '') is null then true
    else coalesce(auth.role(), '') = 'service_role' or public.my_role() = 'super_admin'
  end;
$$;

-- ── 2) 기간 계산 (KST) ──────────
create or replace function public.dues_today()
returns date language sql stable
as $$ select (now() at time zone 'Asia/Seoul')::date; $$;

-- 날짜가 속한 회비 기간. period_end 는 다음 기간의 시작일.
--   매월 'M2026-10' / 분기 'Q2026-4'(1·4·7·10월 시작) / 연 'Y2026-03'(시작 월 기준)
create or replace function public.dues_period_of(p_cycle text, p_start_month int, p_on date)
returns table (period_key text, period_start date, period_end date)
language plpgsql immutable
as $$
declare
  v_start date;
begin
  if p_cycle = 'monthly' then
    v_start := date_trunc('month', p_on)::date;
    return query select 'M' || to_char(v_start, 'YYYY-MM'), v_start, (v_start + interval '1 month')::date;
  elsif p_cycle = 'quarterly' then
    v_start := date_trunc('quarter', p_on)::date;
    return query select 'Q' || to_char(v_start, 'YYYY') || '-' || to_char(v_start, 'Q'), v_start, (v_start + interval '3 months')::date;
  elsif p_cycle = 'yearly' then
    v_start := make_date(extract(year from p_on)::int, p_start_month, 1);
    if v_start > p_on then
      v_start := (v_start - interval '1 year')::date;
    end if;
    return query select 'Y' || to_char(v_start, 'YYYY-MM'), v_start, (v_start + interval '1 year')::date;
  else
    raise exception 'unknown dues cycle: %', p_cycle;
  end if;
end;
$$;

-- 납부일의 자동결제 시각: 그날 오전 10시(KST)
create or replace function public.dues_due_at(p_due date)
returns timestamptz language sql immutable
as $$ select (p_due::timestamp + interval '10 hours') at time zone 'Asia/Seoul'; $$;

-- 회비 행을 만들거나 되살릴 때의 자동결제 시각: 납부일 10시와 "다음 오전 10시" 중 늦은 쪽.
--   납부일이 이미 지난 행이 생겨도 그 자리에서 바로 청구하지 않고, 일일 작업(9시)의 안내가 먼저 나간 뒤 청구한다.
--   그래서 오늘 10시 자리는 오늘 9시(일일 작업) 전에 생긴 행만 쓴다. 9시 이후에 생긴 행은 내일 10시.
create or replace function public.dues_next_slot(p_due date)
returns timestamptz language sql stable
as $$
  select greatest(
    public.dues_due_at(p_due),
    public.dues_due_at(case when now() < public.dues_due_at(public.dues_today()) - interval '1 hour'
                            then public.dues_today() else public.dues_today() + 1 end));
$$;

-- ── 3) 회비 규칙 (클럽당 1행) ──────────
create table if not exists public.club_dues_plans (
  club_id            uuid primary key references public.clubs(id) on delete cascade,
  active             boolean not null default true,
  cycle              text not null check (cycle in ('monthly', 'quarterly', 'yearly')),
  amount             int  not null check (amount between 1000 and 1000000 and amount % 100 = 0),
  due_day            int  not null check (due_day between 1 and 28),          -- 기간 첫 달의 납부일
  start_month        int  not null default 1 check (start_month between 1 and 12),  -- 연 회비의 시작 월(다른 주기에서는 쓰지 않음)
  include_owner      boolean not null default false,                          -- 클럽장도 회비 대상에 포함
  first_period_start date not null,                                           -- 회비를 받기 시작한 기간의 시작일
  next_amount        int check (next_amount is null or (next_amount between 1000 and 1000000 and next_amount % 100 = 0)),
  next_amount_from   date,                                                    -- 바뀐 금액이 적용되는 기간의 시작일
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.club_dues_plans enable row level security;
drop policy if exists "club_dues_plans_select" on public.club_dues_plans;
create policy "club_dues_plans_select" on public.club_dues_plans for select using (true);

-- ── 4) 정산 계좌 (클럽당 1행) — 토스 지급대행 판매자 등록에 필요한 항목을 처음부터 받는다 ──────────
create table if not exists public.club_payout_accounts (
  club_id         uuid primary key references public.clubs(id) on delete cascade,
  holder_type     text not null check (holder_type in ('individual', 'business')),
  holder_name     text not null,
  bank_name       text not null,
  account_number  text not null,
  business_number text,
  contact_phone   text not null default '',
  contact_email   text,
  verified        boolean not null default false,       -- 관리자가 계좌를 확인했는가(정산 확정의 조건)
  verified_by     uuid references public.profiles(id) on delete set null,
  verified_at     timestamptz,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.club_payout_accounts enable row level security;
-- 계좌번호가 들어 있으므로 표 조회는 최고관리자만. 클럽장은 club_payout_account_get(끝 4자리만)으로 본다.
drop policy if exists "club_payout_accounts_admin" on public.club_payout_accounts;
create policy "club_payout_accounts_admin" on public.club_payout_accounts
  for select using (public.my_role() = 'super_admin');

-- ── 5) 회원 결제 카드(회원당 1장)·자동결제 동의 ──────────
create table if not exists public.member_billing_cards (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  billing_key        text not null,
  customer_key       text not null,
  card_company       text not null default '',
  card_number_masked text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.member_billing_cards enable row level security;
drop policy if exists "member_billing_cards_select_own" on public.member_billing_cards;
create policy "member_billing_cards_select_own" on public.member_billing_cards for select using (auth.uid() = user_id);
-- 결제 키는 앱에 내려가지 않는다
revoke all on public.member_billing_cards from anon, authenticated;
grant select (user_id, card_company, card_number_masked, created_at, updated_at) on public.member_billing_cards to authenticated;

create table if not exists public.club_dues_mandates (
  club_id          uuid not null references public.clubs(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'needs_reconsent', 'revoked')),
  consented_amount int  not null,                 -- 동의한 회비 금액 — 이보다 큰 금액은 다시 동의해야 청구된다
  consented_cycle  text not null check (consented_cycle in ('monthly', 'quarterly', 'yearly')),
  consent_text     text not null,                 -- 동의 당시 안내 문구(그대로 보관)
  consented_at     timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_reason   text,
  updated_at       timestamptz not null default now(),
  primary key (club_id, user_id)
);
alter table public.club_dues_mandates enable row level security;
drop policy if exists "club_dues_mandates_select" on public.club_dues_mandates;
create policy "club_dues_mandates_select" on public.club_dues_mandates
  for select using (auth.uid() = user_id or public.is_club_manager(club_id));

-- ── 6) 정산(클럽×월) ──────────
create table if not exists public.club_dues_settlements (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid references public.clubs(id) on delete set null,
  club_name        text not null default '',      -- 기록 보존용
  period_month     text not null,                 -- 'YYYY-MM' (결제일 기준, KST)
  gross_amount     int  not null default 0,       -- 그 달에 결제된 회비 합계
  refund_amount    int  not null default 0,       -- 그중 환불된 금액
  fee_amount       int  not null default 0,       -- 피넛 수수료(환불 건 제외)
  net_amount       int  not null default 0,       -- 정산액 = 합계 − 환불 − 수수료
  charge_count     int  not null default 0,
  status           text not null default 'draft' check (status in ('draft', 'confirmed', 'paid')),
  account_snapshot jsonb,                         -- 확정 시점의 정산 계좌
  confirmed_by     uuid references public.profiles(id) on delete set null,
  confirmed_at     timestamptz,
  paid_by          uuid references public.profiles(id) on delete set null,
  paid_at          timestamptz,
  paid_reference   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (club_id, period_month)
);
alter table public.club_dues_settlements enable row level security;
drop policy if exists "club_dues_settlements_select" on public.club_dues_settlements;
create policy "club_dues_settlements_select" on public.club_dues_settlements
  for select using (
    public.my_role() = 'super_admin'
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );
-- 계좌 스냅샷은 앱에 내려가지 않는다(관리자 화면은 전용 함수로 조회)
revoke all on public.club_dues_settlements from anon, authenticated;
grant select (id, club_id, club_name, period_month, gross_amount, refund_amount, fee_amount, net_amount, charge_count,
              status, confirmed_at, paid_at, created_at, updated_at)
  on public.club_dues_settlements to authenticated;

-- ── 7) 회비(회원×기간 1행)·결제 시도 장부 ──────────
create table if not exists public.club_dues (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  period_key       text not null,
  period_start     date not null,
  period_end       date not null,                 -- 다음 기간의 시작일
  due_date         date not null,
  amount           int  not null,
  status           text not null default 'open'
                   check (status in ('open', 'processing', 'paid', 'failed', 'exempt', 'refunded', 'void')),
  paid_via         text check (paid_via in ('card', 'cash')),
  paid_at          timestamptz,
  marked_by        uuid references public.profiles(id) on delete set null,  -- 현금 납부·면제를 처리한 운영진
  note             text not null default '',
  attempt_count    int  not null default 0,       -- 카드가 확정 거절된 횟수
  next_attempt_at  timestamptz,                   -- 자동결제 다음 시도 시각(null = 예정 없음)
  last_fail_reason text,
  notified_d3_at   timestamptz,                   -- 납부 사전 안내를 보낸 시각
  void_reason      text check (void_reason in ('plan_disabled', 'left_club')),  -- 무효가 된 이유(되살릴 수 있는지 판단)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (club_id, user_id, period_key)
);
create index if not exists club_dues_club_period_idx on public.club_dues (club_id, period_start desc);
create index if not exists club_dues_user_idx on public.club_dues (user_id, period_start desc);
create index if not exists club_dues_attempt_idx on public.club_dues (next_attempt_at) where status = 'open';
alter table public.club_dues enable row level security;
drop policy if exists "club_dues_select" on public.club_dues;
create policy "club_dues_select" on public.club_dues
  for select using (auth.uid() = user_id or public.is_club_manager(club_id));

-- 결제 시도 장부: 시도마다 1행(주문번호 고유). 돈의 기록이라 클럽·회원이 지워져도 남는다.
create table if not exists public.club_dues_charges (
  id               uuid primary key default gen_random_uuid(),
  dues_id          uuid references public.club_dues(id) on delete set null,
  club_id          uuid references public.clubs(id) on delete set null,
  user_id          uuid references public.profiles(id) on delete set null,
  club_name        text not null default '',
  payer_name       text not null default '',
  period_key       text not null,
  amount           int  not null check (amount > 0),
  fee_bps          int  not null,                 -- 결제 시점의 수수료율(이후 요율이 바뀌어도 그대로)
  fee_amount       int  not null check (fee_amount >= 0),
  net_amount       int  not null,                 -- 클럽 정산액 = amount − fee_amount
  order_id         text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  attempt_no       int  not null default 1,
  source           text not null default 'auto' check (source in ('auto', 'manual')),  -- 자동결제 / 회원이 직접 '지금 결제'
  toss_payment_key text,
  fail_reason      text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz,
  refunded_at      timestamptz,
  refund_reason    text,
  refunded_by      uuid references public.profiles(id) on delete set null,
  refund_requested_at timestamptz,                -- 환불을 시작한 시각(진행 중에는 정산을 확정하지 않는다)
  settlement_id    uuid references public.club_dues_settlements(id) on delete set null,
  check (net_amount = amount - fee_amount),
  check (status not in ('paid', 'refunded') or paid_at is not null)  -- 결제 시각이 없으면 어느 달 정산에도 들어가지 못한다
);
-- 같은 회비에 결제 완료 1건·진행 중 1건만 — 이중 결제를 DB 가 막는다
create unique index if not exists club_dues_charges_one_paid on public.club_dues_charges (dues_id) where status = 'paid';
create unique index if not exists club_dues_charges_one_pending on public.club_dues_charges (dues_id) where status = 'pending';
create unique index if not exists club_dues_charges_payment_key_uniq on public.club_dues_charges (toss_payment_key) where toss_payment_key is not null;
create index if not exists club_dues_charges_club_paid_idx on public.club_dues_charges (club_id, paid_at);
create index if not exists club_dues_charges_pending_idx on public.club_dues_charges (created_at) where status = 'pending';
alter table public.club_dues_charges enable row level security;
drop policy if exists "club_dues_charges_select" on public.club_dues_charges;
create policy "club_dues_charges_select" on public.club_dues_charges
  for select using (auth.uid() = user_id or public.is_club_manager(club_id) or public.my_role() = 'super_admin');
-- 토스 결제 키와 수수료(요율·금액·정산액)는 앱에 내려가지 않는다 — 수수료는 운영진이 club_dues_status·정산 내역으로 본다
revoke all on public.club_dues_charges from anon, authenticated;
grant select (id, dues_id, club_id, user_id, club_name, payer_name, period_key, amount,
              status, attempt_no, source, fail_reason, created_at, paid_at, refunded_at, refund_reason, settlement_id)
  on public.club_dues_charges to authenticated;

-- 확정·지급된 정산에 묶인 결제 건은 바꿀 수 없다(환불·금액 수정 차단 — 정산 금액과 어긋나지 않게)
create or replace function public.dues_charges_lock_settled()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.settlement_id is not null
     and (new.settlement_id is distinct from old.settlement_id
          or new.status is distinct from old.status or new.amount is distinct from old.amount
          or new.fee_amount is distinct from old.fee_amount or new.net_amount is distinct from old.net_amount
          or new.paid_at is distinct from old.paid_at or new.club_id is distinct from old.club_id and new.club_id is not null)
     and exists (select 1 from public.club_dues_settlements s where s.id = old.settlement_id and s.status in ('confirmed', 'paid')) then
    raise exception '정산이 확정된 결제는 바꿀 수 없어요.';
  end if;
  return new;
end;
$$;
drop trigger if exists on_dues_charge_lock_settled on public.club_dues_charges;
create trigger on_dues_charge_lock_settled
  before update on public.club_dues_charges
  for each row execute function public.dues_charges_lock_settled();

-- 자동 작업 실행 기록(회비 생성·결제 워커·정산 초안)
create table if not exists public.dues_job_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  summary     jsonb
);
create index if not exists dues_job_runs_job_idx on public.dues_job_runs (job, started_at desc);
alter table public.dues_job_runs enable row level security;
drop policy if exists "dues_job_runs_admin" on public.dues_job_runs;
create policy "dues_job_runs_admin" on public.dues_job_runs for select using (public.my_role() = 'super_admin');

-- ── 8) 변경 기록(감사) — 규칙·수수료·정산의 변경을 남긴다. 계좌번호·사업자번호는 끝자리만. ──────────
create or replace function public.dues_audit_trigger()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  -- 회원 탈퇴로 연쇄 삭제될 때는 프로필이 이미 지워져 있다 → 그때는 행위자를 비워 둔다(외래키 오류 방지)
  v_actor uuid := (select p.id from public.profiles p where p.id = auth.uid());
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if v_old ? 'account_number' then
    v_old := v_old || jsonb_build_object('account_number', '****' || right(v_old->>'account_number', 4),
                                         'business_number', case when v_old->>'business_number' is null then null else '****' || right(v_old->>'business_number', 4) end);
  end if;
  if v_new ? 'account_number' then
    v_new := v_new || jsonb_build_object('account_number', '****' || right(v_new->>'account_number', 4),
                                         'business_number', case when v_new->>'business_number' is null then null else '****' || right(v_new->>'business_number', 4) end);
  end if;
  if v_old ? 'account_snapshot' then v_old := v_old - 'account_snapshot'; end if;
  if v_new ? 'account_snapshot' then v_new := v_new - 'account_snapshot'; end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (v_actor, case when v_actor is null then null else public.my_role() end,
          tg_table_name || '.' || tg_op, tg_table_name, coalesce(v_row->>'id', v_row->>'club_id'), v_old, v_new);
  return null;
end;
$$;

drop trigger if exists audit_club_dues_plans on public.club_dues_plans;
create trigger audit_club_dues_plans after insert or update or delete on public.club_dues_plans
  for each row execute function public.dues_audit_trigger();
drop trigger if exists audit_club_payout_accounts on public.club_payout_accounts;
create trigger audit_club_payout_accounts after insert or update or delete on public.club_payout_accounts
  for each row execute function public.dues_audit_trigger();
drop trigger if exists audit_club_dues_settlements on public.club_dues_settlements;
create trigger audit_club_dues_settlements after insert or update or delete on public.club_dues_settlements
  for each row execute function public.dues_audit_trigger();
drop trigger if exists audit_club_fee_overrides on public.club_fee_overrides;
create trigger audit_club_fee_overrides after insert or update or delete on public.club_fee_overrides
  for each row execute function public.dues_audit_trigger();
drop trigger if exists audit_platform_billing_settings on public.platform_billing_settings;
create trigger audit_platform_billing_settings after update on public.platform_billing_settings
  for each row execute function public.dues_audit_trigger();

-- ── 9) 규칙 함수 ──────────

-- 클럽 승인 회원 전원에게 회비 알림(유발한 사람 제외)
create or replace function public.dues_notify_members(p_club_id uuid, p_title text, p_body text, p_actor uuid default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  m record;
begin
  for m in select user_id from public.club_members where club_id = p_club_id and status = 'approved' loop
    perform public.push_notify(m.user_id, 'dues', p_title, p_body, 'club_dues', p_club_id, p_actor);
  end loop;
end;
$$;

-- 이번 기간(과 납부일이 3일 안으로 다가온 다음 기간)의 회비 행을 만든다. 이미 있으면 건드리지 않는다.
--   대상: 승인된 회원 중 납부일까지 승인된 사람(이후 승인자는 다음 기간부터). 클럽장은 include_owner 일 때만.
--   행은 납부일 3일 전부터 그 기간이 끝나기 전까지 만들어진다.
create or replace function public.dues_ensure_rows(p_club_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  pl record;
  per record;
  cur record;
  v_today date := public.dues_today();
  v_on date;
  v_due date;
  v_existing_due date;
  v_amount int;
  v_n int;
  v_count int := 0;
begin
  select * into pl from public.club_dues_plans where club_id = p_club_id for update;
  if not found or not pl.active then return 0; end if;
  if not public.dues_enabled_for(p_club_id) or not public.club_plan_usable(p_club_id, 'premium_plus') then return 0; end if;

  -- 예약된 금액 변경은 적용 기간이 실제로 시작된 날 규칙에 반영한다
  select * into cur from public.dues_period_of(pl.cycle, pl.start_month, v_today);
  if pl.next_amount is not null and pl.next_amount_from is not null and cur.period_start >= pl.next_amount_from then
    update public.club_dues_plans
       set amount = pl.next_amount, next_amount = null, next_amount_from = null, updated_at = now()
     where club_id = p_club_id;
    pl.amount := pl.next_amount;
    pl.next_amount := null;
    pl.next_amount_from := null;
  end if;

  foreach v_on in array array[v_today, v_today + 3] loop
    select * into per from public.dues_period_of(pl.cycle, pl.start_month, v_on);
    continue when per.period_start < pl.first_period_start;
    -- 그 기간에 적용되는 금액(다음 기간의 행을 미리 만들 때는 예약된 금액)
    v_amount := case when pl.next_amount is not null and pl.next_amount_from is not null and per.period_start >= pl.next_amount_from
                     then pl.next_amount else pl.amount end;
    -- 납부일: 그 기간의 행이 이미 있으면 그 납부일을 따른다(기간 중에 납부일 설정을 바꿔도 대상·납부일이 달라지지 않게)
    select min(d.due_date) into v_existing_due
      from public.club_dues d where d.club_id = p_club_id and d.period_key = per.period_key and d.status <> 'void';
    v_due := coalesce(v_existing_due, per.period_start + (pl.due_day - 1));
    continue when v_today < v_due - 3 or v_today >= per.period_end;

    -- 무효가 된 행(탈퇴했다가 납부일 전에 다시 승인된 회원 등)은 지금 대상이면 되살린다
    update public.club_dues d
       set status = 'open', void_reason = null, amount = v_amount, due_date = v_due, attempt_count = 0,
           last_fail_reason = null, notified_d3_at = null,
           next_attempt_at = public.dues_next_slot(v_due), updated_at = now()
      from public.club_members m
     where d.club_id = p_club_id and d.period_key = per.period_key and d.status = 'void'
       and m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'approved'
       and (pl.include_owner or m.role <> 'owner')
       and (coalesce(m.approved_at, m.joined_at) at time zone 'Asia/Seoul')::date <= v_due;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;

    insert into public.club_dues (club_id, user_id, period_key, period_start, period_end, due_date, amount, next_attempt_at)
    select p_club_id, m.user_id, per.period_key, per.period_start, per.period_end, v_due, v_amount,
           public.dues_next_slot(v_due)
      from public.club_members m
     where m.club_id = p_club_id and m.status = 'approved'
       and (pl.include_owner or m.role <> 'owner')
       and (coalesce(m.approved_at, m.joined_at) at time zone 'Asia/Seoul')::date <= v_due
    on conflict (club_id, user_id, period_key) do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end loop;
  return v_count;
end;
$$;

-- 회비 화면이 쓰는 상태 요약. 수수료율은 운영진에게만, 정산 계좌 상태는 클럽장에게만.
create or replace function public.club_dues_status(p_club_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_owner boolean := exists (select 1 from public.clubs c where c.id = p_club_id and c.owner_id = auth.uid());
  v_manager boolean := public.is_club_manager(p_club_id);
begin
  return jsonb_build_object(
    'enabled', public.dues_enabled_for(p_club_id),
    'plus', public.club_plan_usable(p_club_id, 'premium_plus'),
    'plan_active', exists (select 1 from public.club_dues_plans p where p.club_id = p_club_id and p.active),
    'is_owner', v_owner,
    'is_manager', v_manager,
    'is_member', exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = auth.uid() and m.status = 'approved'),
    -- 이 클럽에 내 자동결제 동의나 회비 기록이 남아 있는가 — 회비가 꺼져도 해지·카드 삭제·기록 확인으로 갈 길을 열어 둔다.
    --   동의는 해지했지만 카드만 남은 회원도 포함(회비를 설정한 적 있는 클럽의 승인 회원이면 그 클럽 화면에서 카드를 지울 수 있게).
    'has_mine', auth.uid() is not null and (
      exists (select 1 from public.club_dues_mandates x where x.club_id = p_club_id and x.user_id = auth.uid() and x.status <> 'revoked')
      or exists (select 1 from public.club_dues d where d.club_id = p_club_id and d.user_id = auth.uid() and d.status <> 'void')
      or (exists (select 1 from public.member_billing_cards c where c.user_id = auth.uid())
          and exists (select 1 from public.club_dues_plans p where p.club_id = p_club_id)
          and exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = auth.uid() and m.status = 'approved'))),
    -- 운영진이 볼 회비 기록이 이 클럽에 남아 있는가 — 회비가 꺼져도 납부 명단·환불·정산 내역으로 갈 길을 열어 둔다
    --   (회비 대상이 아닌 클럽장·임원은 본인 기록이 없어 has_mine 으로는 들어올 수 없다)
    'has_roster', v_manager and exists (select 1 from public.club_dues d where d.club_id = p_club_id),
    'fee_bps', case when v_manager then public.club_fee_bps(p_club_id) end,
    'payout_registered', case when v_owner then exists (select 1 from public.club_payout_accounts a where a.club_id = p_club_id) end,
    'payout_verified', case when v_owner then coalesce((select a.verified from public.club_payout_accounts a where a.club_id = p_club_id), false) end
  );
end;
$$;

-- 회비 규칙 설정(클럽장). 켜져 있는 규칙의 금액 변경은 다음 기간부터, 주기 변경은 끄고 다시 설정.
--   결과: ok / not_found / forbidden / disabled(회비 기능 꺼짐) / plan_required(플러스 아님) /
--         payout_required(정산 계좌 없음) / invalid / cycle_locked
create or replace function public.club_dues_plan_set(
  p_club_id uuid, p_cycle text, p_amount int, p_due_day int, p_start_month int default 1, p_include_owner boolean default false
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
  pl record;
  per record;
  v_found boolean;
  v_same_cycle boolean;
  v_today date := public.dues_today();
  v_due date;
  v_first date;
  v_last_end date;
  v_amount int;
  v_next int;
  v_next_from date;
  v_cycle_label text;
begin
  select owner_id, name into v_owner, v_name from public.clubs where id = p_club_id;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  if not public.dues_enabled_for(p_club_id) then return 'disabled'; end if;
  if not public.club_plan_usable(p_club_id, 'premium_plus') then return 'plan_required'; end if;
  if p_cycle is null or p_cycle not in ('monthly', 'quarterly', 'yearly')
     or p_amount is null or p_amount < 1000 or p_amount > 1000000 or p_amount % 100 <> 0
     or p_due_day is null or p_due_day < 1 or p_due_day > 28
     or p_start_month is null or p_start_month < 1 or p_start_month > 12 then
    return 'invalid';
  end if;
  if not exists (select 1 from public.club_payout_accounts a where a.club_id = p_club_id) then return 'payout_required'; end if;

  v_cycle_label := case p_cycle when 'monthly' then '매월' when 'quarterly' then '분기마다' else '매년' end;
  select * into pl from public.club_dues_plans where club_id = p_club_id for update;
  v_found := found;

  -- ── 켜져 있는 규칙 수정: 납부일·클럽장 포함은 앞으로 만들어지는 행부터, 금액은 다음 기간부터
  if v_found and pl.active then
    if pl.cycle <> p_cycle or (p_cycle = 'yearly' and pl.start_month <> p_start_month) then return 'cycle_locked'; end if;
    select * into per from public.dues_period_of(pl.cycle, pl.start_month, v_today);
    update public.club_dues_plans
       set due_day = p_due_day, include_owner = coalesce(p_include_owner, false), updated_at = now()
     where club_id = p_club_id;
    if p_amount = pl.amount then
      -- 예약돼 있던 변경을 취소: 미리 만들어 둔 다음 기간 행도 원래 금액으로
      if pl.next_amount is not null then
        update public.club_dues
           set amount = pl.amount, notified_d3_at = null, updated_at = now()
         where club_id = p_club_id and period_start >= pl.next_amount_from and status = 'open' and attempt_count = 0;
      end if;
      update public.club_dues_plans set next_amount = null, next_amount_from = null where club_id = p_club_id;
    elsif pl.next_amount is not null and p_amount = pl.next_amount then
      null;  -- 이미 같은 금액으로 예약돼 있다(다른 항목만 고쳐 저장한 경우) — 다시 예약하거나 회원에게 또 알리지 않는다
    elsif not exists (select 1 from public.club_dues d where d.club_id = p_club_id and d.period_start >= pl.first_period_start and d.status <> 'void') then
      -- 아직 한 번도 청구한 적이 없으면 바로 적용
      update public.club_dues_plans set amount = p_amount, next_amount = null, next_amount_from = null where club_id = p_club_id;
    else
      update public.club_dues_plans set next_amount = p_amount, next_amount_from = per.period_end where club_id = p_club_id;
      -- 다음 기간 행이 (납부일 3일 전이라) 이미 만들어져 있었다면 아직 청구 전인 것만 새 금액으로 맞추고 안내를 다시 보낸다
      update public.club_dues
         set amount = p_amount, notified_d3_at = null, updated_at = now()
       where club_id = p_club_id and period_start >= per.period_end and status = 'open' and attempt_count = 0;
      perform public.dues_notify_members(
        p_club_id, v_name || ' 회비가 바뀌어요',
        to_char(per.period_end, 'FMMM"월" FMDD"일"') || ' 기간부터 ' || to_char(pl.amount, 'FM999,999,999') || '원 → ' || to_char(p_amount, 'FM999,999,999') || '원.'
          || case when p_amount > pl.amount then ' 자동결제를 계속하려면 회비 화면에서 다시 동의해주세요.' else '' end,
        auth.uid());
    end if;
    perform public.dues_ensure_rows(p_club_id);
    return 'ok';
  end if;

  -- ── 새로 켜기 / 껐다가 다시 켜기
  -- 이번 기간의 납부일이 아직 안 지났으면 이번 기간부터, 지났으면 다음 기간부터
  select * into per from public.dues_period_of(p_cycle, p_start_month, v_today);
  v_due := per.period_start + (p_due_day - 1);
  v_first := case when v_today <= v_due then per.period_start else per.period_end end;
  v_same_cycle := v_found and pl.cycle = p_cycle and (p_cycle <> 'yearly' or pl.start_month = p_start_month);
  v_amount := p_amount;
  v_next := null;
  v_next_from := null;

  if v_found and not v_same_cycle then
    -- 주기를 바꿔 다시 켤 때: 이미 회비를 받은(결제 중 포함) 옛 주기의 기간과 겹치지 않도록, 그 기간이 끝난 뒤에 시작하는 첫 기간부터 받는다
    select max(d.period_end) into v_last_end from public.club_dues d where d.club_id = p_club_id and d.status in ('paid', 'processing');
    while v_last_end is not null and v_first < v_last_end loop
      select k.period_end into v_first from public.dues_period_of(p_cycle, p_start_month, v_first) k;
    end loop;
  elsif v_same_cycle and p_amount <> pl.amount
        and exists (select 1 from public.club_dues d where d.club_id = p_club_id and d.period_start >= v_first) then
    -- 같은 주기로 다시 켜면서 금액을 바꾼 경우: 이미 청구가 시작된 기간은 원래 금액 그대로, 새 금액은 그다음 기간부터
    v_amount := pl.amount;
    v_next := p_amount;
    select max(d.period_end) into v_next_from from public.club_dues d where d.club_id = p_club_id and d.period_start >= v_first;
  end if;

  insert into public.club_dues_plans
    (club_id, active, cycle, amount, due_day, start_month, include_owner, first_period_start, next_amount, next_amount_from, created_by)
  values
    (p_club_id, true, p_cycle, v_amount, p_due_day, p_start_month, coalesce(p_include_owner, false), v_first, v_next, v_next_from, auth.uid())
  on conflict (club_id) do update
    set active = true, cycle = excluded.cycle, amount = excluded.amount, due_day = excluded.due_day,
        start_month = excluded.start_month, include_owner = excluded.include_owner,
        first_period_start = excluded.first_period_start, next_amount = excluded.next_amount,
        next_amount_from = excluded.next_amount_from, updated_at = now();

  -- 끄면서 무효 처리했던 행 되살리기: 같은 주기의 행(기간 키가 새 규칙과 같은 것)만, 납부일은 원래대로, 지금도 승인 회원인 사람만.
  -- 금액은 그 기간에 적용되는 규칙 금액으로 맞춘다(끄기 전에 예약돼 있던 금액이 남지 않게).
  update public.club_dues d
     set status = 'open', void_reason = null, attempt_count = 0, last_fail_reason = null, notified_d3_at = null,
         amount = case when v_next is not null and d.period_start >= v_next_from then v_next else v_amount end,
         next_attempt_at = public.dues_next_slot(d.due_date), updated_at = now()
   where d.club_id = p_club_id and d.status = 'void' and d.void_reason = 'plan_disabled' and d.period_start >= v_first
     and d.period_key = (select k.period_key from public.dues_period_of(p_cycle, p_start_month, d.period_start) k)
     and exists (select 1 from public.club_members m where m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'approved');

  -- 주기(연 회비는 시작 월 포함)가 달라졌으면 예전 동의로는 청구하지 않는다(다시 동의)
  if v_found and not v_same_cycle then
    update public.club_dues_mandates
       set status = 'needs_reconsent', updated_at = now()
     where club_id = p_club_id and status = 'active';
  end if;

  perform public.dues_ensure_rows(p_club_id);
  perform public.dues_notify_members(
    p_club_id, v_name || ' 회비 안내',
    v_cycle_label || ' ' || to_char(v_amount, 'FM999,999,999') || '원, 첫 납부일은 ' || to_char(v_first + (p_due_day - 1), 'YYYY"년" FMMM"월" FMDD"일"')
      || '이에요. 회비 화면에서 카드를 등록하면 자동으로 납부돼요.',
    auth.uid());
  if v_next is not null then
    perform public.dues_notify_members(
      p_club_id, v_name || ' 회비가 바뀌어요',
      to_char(v_next_from, 'FMMM"월" FMDD"일"') || ' 기간부터 ' || to_char(v_amount, 'FM999,999,999') || '원 → ' || to_char(v_next, 'FM999,999,999') || '원.'
        || case when v_next > v_amount then ' 자동결제를 계속하려면 회비 화면에서 다시 동의해주세요.' else '' end,
      auth.uid());
  end if;
  return 'ok';
end;
$$;

-- 회비 끄기(클럽장). 이번·이후 기간의 미납 행은 무효 처리, 지난 기간의 미납 기록은 남긴다.
create or replace function public.club_dues_plan_disable(p_club_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.clubs where id = p_club_id;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  update public.club_dues_plans
     set active = false, next_amount = null, next_amount_from = null, updated_at = now()
   where club_id = p_club_id;
  if not found then return 'not_found'; end if;
  update public.club_dues
     set status = 'void', void_reason = 'plan_disabled', next_attempt_at = null, updated_at = now()
   where club_id = p_club_id and status in ('open', 'failed') and period_end > public.dues_today();
  -- 지난 기간의 미납 기록은 남기되 자동 청구 예정은 없앤다
  update public.club_dues
     set next_attempt_at = null, updated_at = now()
   where club_id = p_club_id and status in ('open', 'failed') and next_attempt_at is not null;
  return 'ok';
end;
$$;

-- 정산 계좌 등록·변경(클럽장). 계좌가 바뀌면 관리자 확인을 다시 받아야 한다.
--   결과: ok / not_found / forbidden / disabled(회비 기능 꺼짐) / plan_required(플러스 아님) / invalid
create or replace function public.club_payout_account_set(
  p_club_id uuid, p_holder_type text, p_holder_name text, p_bank_name text, p_account_number text,
  p_business_number text default null, p_contact_phone text default '', p_contact_email text default null
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
  v_account text := regexp_replace(coalesce(p_account_number, ''), '[^0-9]', '', 'g');
  v_biz text := nullif(regexp_replace(coalesce(p_business_number, ''), '[^0-9]', '', 'g'), '');
  v_phone text := regexp_replace(coalesce(p_contact_phone, ''), '[^0-9]', '', 'g');
  v_holder text := btrim(coalesce(p_holder_name, ''));
  v_bank text := btrim(coalesce(p_bank_name, ''));
  old_row record;
  v_existed boolean;
  v_changed boolean;
begin
  select owner_id, name into v_owner, v_name from public.clubs where id = p_club_id;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  if not public.dues_enabled_for(p_club_id) then return 'disabled'; end if;
  if not public.club_plan_usable(p_club_id, 'premium_plus') then return 'plan_required'; end if;
  if p_holder_type is null or p_holder_type not in ('individual', 'business')
     or length(v_holder) < 2 or length(v_holder) > 40
     or length(v_bank) < 2 or length(v_bank) > 30
     or length(v_account) < 8 or length(v_account) > 16
     or length(v_phone) < 9 or length(v_phone) > 11
     or (p_holder_type = 'business' and (v_biz is null or length(v_biz) <> 10))
     or (p_holder_type = 'individual' and v_biz is not null and length(v_biz) <> 10) then
    return 'invalid';
  end if;

  select * into old_row from public.club_payout_accounts where club_id = p_club_id for update;
  v_existed := found;
  v_changed := not v_existed
    or old_row.holder_type <> p_holder_type or old_row.holder_name <> v_holder or old_row.bank_name <> v_bank
    or old_row.account_number <> v_account or old_row.business_number is distinct from v_biz;

  insert into public.club_payout_accounts
    (club_id, holder_type, holder_name, bank_name, account_number, business_number, contact_phone, contact_email, verified, updated_by, updated_at)
  values
    (p_club_id, p_holder_type, v_holder, v_bank, v_account, v_biz, v_phone, nullif(btrim(coalesce(p_contact_email, '')), ''), false, auth.uid(), clock_timestamp())
  on conflict (club_id) do update
    set holder_type = excluded.holder_type, holder_name = excluded.holder_name, bank_name = excluded.bank_name,
        account_number = excluded.account_number, business_number = excluded.business_number,
        contact_phone = excluded.contact_phone, contact_email = excluded.contact_email,
        verified = case when v_changed then false else public.club_payout_accounts.verified end,
        verified_by = case when v_changed then null else public.club_payout_accounts.verified_by end,
        verified_at = case when v_changed then null else public.club_payout_accounts.verified_at end,
        -- 계좌가 바뀐 실제 시각(now() 는 트랜잭션 시작 시각이라 쓰지 않는다) — 관리자 확인이 이 값으로 "본 계좌"를 식별한다
        updated_by = auth.uid(), updated_at = clock_timestamp();

  if v_changed then
    -- 본인 확인용 알림(계좌를 바꾼 사람 = 클럽장 본인에게도 보낸다)
    perform public.push_notify(
      v_owner, 'dues', v_name || ' 정산 계좌가 ' || case when v_existed then '변경' else '등록' end || '됐어요',
      v_bank || ' ****' || right(v_account, 4) || ' (' || v_holder || '). 직접 한 일이 아니면 바로 고객센터로 알려주세요.',
      'club_dues', p_club_id, null);
  end if;
  return 'ok';
end;
$$;

-- 정산 계좌 조회(클럽장·최고관리자) — 계좌번호·사업자번호는 끝 4자리만
create or replace function public.club_payout_account_get(p_club_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  a record;
begin
  if not (public.my_role() = 'super_admin'
          or exists (select 1 from public.clubs c where c.id = p_club_id and c.owner_id = auth.uid())) then
    return null;
  end if;
  select * into a from public.club_payout_accounts where club_id = p_club_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'holder_type', a.holder_type, 'holder_name', a.holder_name, 'bank_name', a.bank_name,
    'account_masked', '****' || right(a.account_number, 4),
    'business_masked', case when a.business_number is null then null else '****' || right(a.business_number, 4) end,
    'contact_phone', a.contact_phone, 'contact_email', a.contact_email,
    'verified', a.verified, 'updated_at', a.updated_at);
end;
$$;

-- 운영진의 납부 처리: 현금 납부 확인 / 면제 / 되돌리기
--   임원은 자기 회비를 처리할 수 없다(클럽장은 가능). 카드로 결제된 회비는 여기서 되돌릴 수 없다(환불로만).
--   결과: ok / not_found / forbidden / self_not_allowed / in_progress / already_paid / card_refund_only / invalid
create or replace function public.club_dues_mark(p_dues_id uuid, p_action text, p_note text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  d record;
  v_owner uuid;
  v_name text;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
  v_old jsonb;
  v_resume boolean;
begin
  select * into d from public.club_dues where id = p_dues_id for update;
  if not found then return 'not_found'; end if;
  if auth.uid() is null or not public.is_club_manager(d.club_id) then return 'forbidden'; end if;
  select owner_id, name into v_owner, v_name from public.clubs where id = d.club_id;
  if d.user_id = auth.uid() and auth.uid() <> v_owner then return 'self_not_allowed'; end if;
  if d.status = 'processing' then return 'in_progress'; end if;
  v_old := jsonb_build_object('status', d.status, 'paid_via', d.paid_via, 'note', d.note);

  if p_action = 'cash_paid' then
    if d.status = 'paid' then return 'already_paid'; end if;
    if d.status not in ('open', 'failed', 'refunded') then return 'invalid'; end if;
    update public.club_dues
       set status = 'paid', paid_via = 'cash', paid_at = now(), marked_by = auth.uid(), note = v_note,
           next_attempt_at = null, updated_at = now()
     where id = p_dues_id;
    perform public.push_notify(d.user_id, 'dues', v_name || ' 회비 납부 확인',
      to_char(d.amount, 'FM999,999,999') || '원 납부가 확인됐어요.', 'club_dues', d.club_id, auth.uid());
  elsif p_action = 'exempt' then
    if d.status = 'paid' then return 'already_paid'; end if;
    if d.status not in ('open', 'failed', 'refunded') then return 'invalid'; end if;
    update public.club_dues
       set status = 'exempt', paid_via = null, paid_at = null, marked_by = auth.uid(), note = v_note,
           next_attempt_at = null, updated_at = now()
     where id = p_dues_id;
    perform public.push_notify(d.user_id, 'dues', v_name || ' 회비 면제',
      '이번 회비는 면제 처리됐어요.', 'club_dues', d.club_id, auth.uid());
  elsif p_action = 'revert' then
    if d.status = 'paid' and d.paid_via = 'card' then return 'card_refund_only'; end if;
    if not (d.status = 'exempt' or (d.status = 'paid' and d.paid_via = 'cash')) then return 'invalid'; end if;
    -- 자동결제 대상으로 되돌리는 건 "기간이 안 끝났고, 회비가 켜져 있고, 지금도 승인 회원"일 때만
    v_resume := d.period_end > public.dues_today()
      and exists (select 1 from public.club_dues_plans p where p.club_id = d.club_id and p.active)
      and exists (select 1 from public.club_members m where m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'approved');
    update public.club_dues
       set status = 'open', paid_via = null, paid_at = null, marked_by = auth.uid(), note = v_note,
           next_attempt_at = case when v_resume then public.dues_next_slot(d.due_date) else null end,
           updated_at = now()
     where id = p_dues_id;
    perform public.push_notify(d.user_id, 'dues', v_name || ' 회비 처리 취소',
      '회비 ' || case when d.status = 'exempt' then '면제가' else '납부 확인이' end || ' 취소돼 다시 미납 상태가 됐어요.', 'club_dues', d.club_id, auth.uid());
  else
    return 'invalid';
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'club_dues.' || p_action, 'club_dues', p_dues_id::text, v_old,
          jsonb_build_object('note', v_note, 'user_id', d.user_id, 'period_key', d.period_key, 'amount', d.amount));
  return 'ok';
end;
$$;

-- 자동결제 동의 해지(회원 본인). 이미 생긴 회비는 그대로 남고 자동 청구만 멈춘다.
create or replace function public.club_dues_mandate_revoke(p_club_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then return 'forbidden'; end if;
  update public.club_dues_mandates
     set status = 'revoked', revoked_at = now(), revoked_reason = 'member', updated_at = now()
   where club_id = p_club_id and user_id = auth.uid() and status <> 'revoked';
  if not found then return 'not_found'; end if;
  return 'ok';
end;
$$;

-- 기간별 납부 명단(운영진). 자동결제 여부는 "동의 + 카드 등록" 여부만 알려준다(카드 정보는 주지 않는다).
drop function if exists public.club_dues_roster(uuid, text);
create or replace function public.club_dues_roster(p_club_id uuid, p_period_key text)
returns table (
  dues_id uuid, user_id uuid, nickname text, avatar_url text, member_role text, status text, amount int, due_date date,
  paid_via text, paid_at timestamptz, note text, attempt_count int, last_fail_reason text, autopay boolean,
  paid_charge_id uuid, refundable boolean
)
language sql stable
security definer set search_path = public
as $$
  select d.id, d.user_id, p.nickname, p.avatar_url, coalesce(m.role, 'left'), d.status, d.amount, d.due_date,
         d.paid_via, d.paid_at, d.note, d.attempt_count, d.last_fail_reason,
         exists (select 1 from public.club_dues_mandates x where x.club_id = d.club_id and x.user_id = d.user_id and x.status = 'active')
           and exists (select 1 from public.member_billing_cards c where c.user_id = d.user_id),
         pc.id,                                             -- 카드로 결제된 건(환불할 때 쓴다)
         (pc.id is not null and pc.settlement_id is null)   -- 정산 확정 전이라 환불할 수 있는가
    from public.club_dues d
    join public.profiles p on p.id = d.user_id
    left join public.club_members m on m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'approved'
    left join public.club_dues_charges pc on pc.dues_id = d.id and pc.status = 'paid'
   where d.club_id = p_club_id and d.period_key = p_period_key and public.is_club_manager(p_club_id)
   order by case d.status when 'failed' then 0 when 'open' then 1 when 'processing' then 2 when 'refunded' then 3 when 'paid' then 4 else 5 end, p.nickname;
$$;

-- 기간 목록과 납부 요약(운영진)
create or replace function public.club_dues_periods(p_club_id uuid)
returns table (period_key text, period_start date, due_date date, total int, paid int, exempt int, unpaid int, collected int)
language sql stable
security definer set search_path = public
as $$
  select d.period_key, min(d.period_start), min(d.due_date),
         (count(*) filter (where d.status <> 'void'))::int,
         (count(*) filter (where d.status = 'paid'))::int,
         (count(*) filter (where d.status = 'exempt'))::int,
         (count(*) filter (where d.status in ('open', 'failed', 'processing', 'refunded')))::int,
         coalesce(sum(d.amount) filter (where d.status = 'paid'), 0)::int
    from public.club_dues d
   where d.club_id = p_club_id and public.is_club_manager(p_club_id)
   group by d.period_key
   order by min(d.period_start) desc;
$$;

-- ── 10) 회원 탈퇴·클럽 삭제 ──────────
-- 회원이 클럽을 떠나면(탈퇴·내보내기) 자동결제 동의를 해지하고 미납 회비는 무효 처리한다.
create or replace function public.dues_on_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 승인 회원이 아니게 된 경우에만(탈퇴·내보내기·승인 취소)
  if tg_op = 'UPDATE' and not (old.status = 'approved' and new.status is distinct from 'approved') then
    return null;
  end if;
  update public.club_dues_mandates
     set status = 'revoked', revoked_at = now(), revoked_reason = 'left_club', updated_at = now()
   where club_id = old.club_id and user_id = old.user_id and status <> 'revoked';
  update public.club_dues
     set status = 'void', void_reason = 'left_club', next_attempt_at = null, updated_at = now()
   where club_id = old.club_id and user_id = old.user_id and status in ('open', 'failed');
  return null;
end;
$$;
drop trigger if exists on_club_member_removed_dues on public.club_members;
create trigger on_club_member_removed_dues
  after delete or update of status on public.club_members
  for each row execute function public.dues_on_member_removed();

-- 정산이 끝나지 않은 회비 결제가 있는 클럽은 삭제할 수 없다.
create or replace function public.dues_block_club_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1
      from public.club_dues_charges c
      left join public.club_dues_settlements s on s.id = c.settlement_id
     where c.club_id = old.id
       and (c.status = 'pending' or (c.status = 'paid' and coalesce(s.status, 'none') <> 'paid'))
  ) then
    raise exception '정산이 끝나지 않은 회비가 있어 클럽을 삭제할 수 없어요. 정산이 끝난 뒤 다시 시도해주세요.';
  end if;
  return old;
end;
$$;
drop trigger if exists on_club_delete_dues_guard on public.clubs;
create trigger on_club_delete_dues_guard
  before delete on public.clubs
  for each row execute function public.dues_block_club_delete();

-- ── 11) 관리자: 계좌 확인·정산 ──────────
drop function if exists public.dues_payout_account_verify(uuid, boolean);
create or replace function public.dues_payout_account_verify(p_club_id uuid, p_verified boolean, p_expected_updated_at timestamptz default null)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  a record;
  v_owner uuid;
  v_name text;
begin
  if not public.dues_is_admin_or_service() then return 'forbidden'; end if;
  select * into a from public.club_payout_accounts where club_id = p_club_id for update;
  if not found then return 'not_found'; end if;
  -- 확인 처리는 "관리자가 본 그 계좌"에만: 본 뒤에 계좌가 바뀌었으면 거절한다
  if coalesce(p_verified, false) and (p_expected_updated_at is null or a.updated_at is distinct from p_expected_updated_at) then
    return 'changed';
  end if;
  -- updated_at 은 계좌 내용이 바뀐 시각이라 여기서는 건드리지 않는다
  update public.club_payout_accounts
     set verified = coalesce(p_verified, false),
         verified_by = case when coalesce(p_verified, false) then auth.uid() else null end,
         verified_at = case when coalesce(p_verified, false) then now() else null end
   where club_id = p_club_id;
  if coalesce(p_verified, false) then
    select owner_id, name into v_owner, v_name from public.clubs where id = p_club_id;
    perform public.push_notify(v_owner, 'dues', v_name || ' 정산 계좌 확인 완료', '정산 계좌 확인이 끝났어요. 이제 회비가 이 계좌로 정산돼요.', 'club_dues', p_club_id, null);
  end if;
  return 'ok';
end;
$$;

-- 정산 금액 다시 계산(초안일 때만). 그 달(KST)에 결제된 건 기준: 합계 − 환불 − 수수료(환불 건 제외) = 정산액
create or replace function public.dues_settlement_recalc(p_settlement_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.club_dues_settlements where id = p_settlement_id for update;
  if not found or s.status <> 'draft' then return; end if;
  update public.club_dues_settlements t
     set gross_amount = x.gross, refund_amount = x.refunded, fee_amount = x.fee,
         net_amount = x.gross - x.refunded - x.fee, charge_count = x.cnt, updated_at = now()
    from (
      select coalesce(sum(c.amount), 0)::int as gross,
             coalesce(sum(c.amount) filter (where c.status = 'refunded'), 0)::int as refunded,
             coalesce(sum(c.fee_amount) filter (where c.status = 'paid'), 0)::int as fee,
             (count(*) filter (where c.status = 'paid'))::int as cnt
        from public.club_dues_charges c
       where c.club_id = s.club_id and c.status in ('paid', 'refunded')
         and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = s.period_month
    ) x
   where t.id = p_settlement_id;
end;
$$;

-- 한 달치 정산 초안 만들기(이미 확정·지급된 정산은 건드리지 않는다). 만들거나 갱신한 건수를 돌려준다.
create or replace function public.dues_settlement_generate(p_month text)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_id uuid;
  v_count int := 0;
begin
  if not public.dues_is_admin_or_service() then raise exception 'forbidden'; end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month: %', p_month; end if;
  -- 끝난 달만 정산한다(진행 중인 달을 확정하면 그 뒤의 결제가 어느 정산에도 들어가지 못한다)
  if p_month >= to_char(public.dues_today(), 'YYYY-MM') then raise exception 'month not finished: %', p_month; end if;
  for r in
    select c.club_id, max(c.club_name) as club_name
      from public.club_dues_charges c
     where c.club_id is not null and c.status in ('paid', 'refunded')
       and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = p_month
     group by c.club_id
  loop
    insert into public.club_dues_settlements (club_id, club_name, period_month)
    values (r.club_id, r.club_name, p_month)
    on conflict (club_id, period_month) do nothing;
    select id into v_id from public.club_dues_settlements
     where club_id = r.club_id and period_month = p_month and status = 'draft';
    continue when v_id is null;  -- 이미 확정·지급된 정산
    perform public.dues_settlement_recalc(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 정산 확정: 금액을 마지막으로 다시 계산해 잠그고, 그 달의 결제 건을 이 정산에 묶는다. 확정 뒤에는 환불할 수 없다.
--   결과: ok / forbidden / not_found / not_draft / month_not_finished / payout_unverified / pending_exists / refund_in_progress
create or replace function public.dues_settlement_confirm(p_settlement_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  a record;
  v_owner uuid;
begin
  if not public.dues_is_admin_or_service() then return 'forbidden'; end if;
  select * into s from public.club_dues_settlements where id = p_settlement_id for update;
  if not found then return 'not_found'; end if;
  if s.status <> 'draft' then return 'not_draft'; end if;
  if s.period_month >= to_char(public.dues_today(), 'YYYY-MM') then return 'month_not_finished'; end if;
  select * into a from public.club_payout_accounts where club_id = s.club_id;
  if not found or not a.verified then return 'payout_unverified'; end if;
  -- 그 달의 결제 건을 먼저 잠근다 — 환불 준비(dues_refund_prepare)도 같은 행을 잠그므로,
  -- "검사는 통과했는데 묶기 직전에 환불이 시작되는" 틈이 생기지 않는다(환불 쪽이 기다렸다가 '정산 확정됨'으로 거절된다).
  perform 1 from public.club_dues_charges c
    where c.club_id = s.club_id and c.status in ('paid', 'refunded')
      and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = s.period_month
    for update;
  -- 결과를 모르는 결제 시도나 진행 중인 환불이 있으면 금액이 아직 확정되지 않은 것
  if exists (select 1 from public.club_dues_charges c
              where c.club_id = s.club_id and c.status = 'pending'
                and to_char(c.created_at at time zone 'Asia/Seoul', 'YYYY-MM') <= s.period_month) then
    return 'pending_exists';
  end if;
  -- 환불이 시작된 건은 끝날 때까지(환불 반영 또는 "취소되지 않음" 확인으로 표시가 지워질 때까지) 확정하지 않는다
  if exists (select 1 from public.club_dues_charges c
              where c.club_id = s.club_id and c.status = 'paid' and c.refund_requested_at is not null
                and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = s.period_month) then
    return 'refund_in_progress';
  end if;

  perform public.dues_settlement_recalc(p_settlement_id);
  update public.club_dues_charges c
     set settlement_id = p_settlement_id
   where c.club_id = s.club_id and c.status in ('paid', 'refunded')
     and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = s.period_month;
  update public.club_dues_settlements
     set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now(),
         account_snapshot = jsonb_build_object(
           'holder_type', a.holder_type, 'holder_name', a.holder_name, 'bank_name', a.bank_name,
           'account_number', a.account_number, 'business_number', a.business_number)
   where id = p_settlement_id
   returning * into s;
  select owner_id into v_owner from public.clubs where id = s.club_id;
  perform public.push_notify(v_owner, 'dues', s.club_name || ' ' || right(s.period_month, 2)::int || '월 회비 정산 확정',
    '정산액 ' || to_char(s.net_amount, 'FM999,999,999') || '원 (수수료 ' || to_char(s.fee_amount, 'FM999,999,999') || '원 제외). 곧 등록된 계좌로 입금돼요.',
    'club_dues', s.club_id, null);
  return 'ok';
end;
$$;

-- 지급 완료 기록
create or replace function public.dues_settlement_mark_paid(p_settlement_id uuid, p_reference text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  v_owner uuid;
begin
  if not public.dues_is_admin_or_service() then return 'forbidden'; end if;
  select * into s from public.club_dues_settlements where id = p_settlement_id for update;
  if not found then return 'not_found'; end if;
  if s.status <> 'confirmed' then return 'not_confirmed'; end if;
  update public.club_dues_settlements
     set status = 'paid', paid_by = auth.uid(), paid_at = now(), paid_reference = left(coalesce(p_reference, ''), 200), updated_at = now()
   where id = p_settlement_id;
  select owner_id into v_owner from public.clubs where id = s.club_id;
  perform public.push_notify(v_owner, 'dues', s.club_name || ' 회비 정산 입금',
    to_char(s.net_amount, 'FM999,999,999') || '원이 정산 계좌로 입금됐어요.', 'club_dues', s.club_id, null);
  return 'ok';
end;
$$;

-- ── 12) 권한 ──────────
-- 회비 표는 앱에서 쓸 수 없다(RLS 에 쓰기 정책이 없고, 표 권한도 회수한다). 설정·수수료 표는 최고관리자가 관리자 웹에서 고친다.
revoke insert, update, delete, truncate, references, trigger on public.club_dues_plans, public.club_payout_accounts, public.club_dues_mandates,
  public.club_dues, public.dues_job_runs from anon, authenticated;
revoke truncate, references, trigger on public.platform_billing_settings, public.club_fee_overrides from authenticated;
revoke all on public.platform_billing_settings, public.club_fee_overrides, public.club_payout_accounts, public.dues_job_runs from anon;

-- 내부용(다른 함수·서버만): 앱에서 직접 부를 수 없다
revoke all on function public.dues_ensure_rows(uuid) from public, anon, authenticated;
revoke all on function public.dues_notify_members(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.dues_settlement_recalc(uuid) from public, anon, authenticated;
revoke all on function public.club_fee_bps(uuid) from public, anon, authenticated;  -- 수수료율은 club_dues_status 로 운영진에게만
revoke all on function public.dues_enabled_for(uuid) from public, anon, authenticated;
revoke all on function public.dues_next_slot(date) from public, anon, authenticated;
grant execute on function public.dues_next_slot(date) to service_role;
revoke all on function public.dues_is_admin_or_service() from public, anon, authenticated;
grant execute on function public.club_fee_bps(uuid) to service_role;
grant execute on function public.dues_enabled_for(uuid) to service_role;
grant execute on function public.dues_is_admin_or_service() to service_role;
grant execute on function public.dues_ensure_rows(uuid) to service_role;
grant execute on function public.dues_notify_members(uuid, text, text, uuid) to service_role;
grant execute on function public.dues_settlement_recalc(uuid) to service_role;

-- 앱(로그인 사용자)이 부르는 함수 — 권한은 함수 안에서 검사한다
revoke all on function public.club_dues_status(uuid) from public, anon;
revoke all on function public.club_dues_plan_set(uuid, text, int, int, int, boolean) from public, anon;
revoke all on function public.club_dues_plan_disable(uuid) from public, anon;
revoke all on function public.club_payout_account_set(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.club_payout_account_get(uuid) from public, anon;
revoke all on function public.club_dues_mark(uuid, text, text) from public, anon;
revoke all on function public.club_dues_mandate_revoke(uuid) from public, anon;
revoke all on function public.club_dues_roster(uuid, text) from public, anon;
revoke all on function public.club_dues_periods(uuid) from public, anon;
grant execute on function public.club_dues_status(uuid) to authenticated, service_role;
grant execute on function public.club_dues_plan_set(uuid, text, int, int, int, boolean) to authenticated;
grant execute on function public.club_dues_plan_disable(uuid) to authenticated;
grant execute on function public.club_payout_account_set(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.club_payout_account_get(uuid) to authenticated;
grant execute on function public.club_dues_mark(uuid, text, text) to authenticated;
grant execute on function public.club_dues_mandate_revoke(uuid) to authenticated;
grant execute on function public.club_dues_roster(uuid, text) to authenticated;
grant execute on function public.club_dues_periods(uuid) to authenticated;

-- 관리자·서버용
revoke all on function public.dues_payout_account_verify(uuid, boolean, timestamptz) from public, anon;
revoke all on function public.dues_settlement_generate(text) from public, anon;
revoke all on function public.dues_settlement_confirm(uuid) from public, anon;
revoke all on function public.dues_settlement_mark_paid(uuid, text) from public, anon;
grant execute on function public.dues_payout_account_verify(uuid, boolean, timestamptz) to authenticated, service_role;
grant execute on function public.dues_settlement_generate(text) to authenticated, service_role;
grant execute on function public.dues_settlement_confirm(uuid) to authenticated, service_role;
grant execute on function public.dues_settlement_mark_paid(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
-- ══ /클럽 회비 — 데이터·규칙 ══

-- ══ 클럽 회비 — 자동결제 엔진 ══ (0098_club_dues_engine.sql 과 같은 내용)
-- 0098: 클럽 회비 — 자동결제 엔진 (서버 전용 함수 + 일일 작업)
--   엣지함수(club-dues-*)가 서비스롤로 호출한다. 앱(로그인 사용자)은 이 함수들을 직접 부를 수 없다.
--   결제 한 번 = club_dues_charges 한 행(주문번호 고유). 흐름:
--     선점(회비 processing + 시도 pending 기록) → 토스 과금 → 결과 반영(paid / failed) — 결과를 모르면 pending 그대로 두고 나중에 조회로 확정.
--   같은 주문번호는 다시 보내지 않는다(다시 시도 = 새 행·새 주문번호).

-- ── 1) 카드 ──────────
-- 카드 등록·교체. 교체하면 실패했던 이번 기간 회비를 다시 시도하도록 예약한다.
--   결과: created / replaced
create or replace function public.dues_card_upsert(
  p_user_id uuid, p_billing_key text, p_customer_key text, p_card_company text, p_card_masked text
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old text;
begin
  select c.billing_key into v_old from public.member_billing_cards c where c.user_id = p_user_id for update;
  insert into public.member_billing_cards (user_id, billing_key, customer_key, card_company, card_number_masked)
  values (p_user_id, p_billing_key, p_customer_key, coalesce(p_card_company, ''), coalesce(p_card_masked, ''))
  on conflict (user_id) do update
    set billing_key = excluded.billing_key, customer_key = excluded.customer_key,
        card_company = excluded.card_company, card_number_masked = excluded.card_number_masked, updated_at = now();
  if v_old is null then return 'created'; end if;
  if v_old is distinct from p_billing_key then
    -- 새 카드: 자동결제가 실패로 끝났거나 재시도 중이던 이번 기간 회비를 곧 다시 시도한다(동의가 살아 있는 클럽만)
    update public.club_dues d
       set status = 'open', attempt_count = 0, last_fail_reason = null, next_attempt_at = now(), updated_at = now()
     where d.user_id = p_user_id and d.period_end > public.dues_today()
       and (d.status = 'failed' or (d.status = 'open' and d.attempt_count > 0))
       and exists (select 1 from public.club_dues_mandates m
                    where m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'active');
  end if;
  return 'replaced';
end;
$$;

-- 카드 삭제. 카드가 없으면 자동결제를 할 수 없으므로 모든 클럽의 동의도 함께 해지한다(다시 쓰려면 다시 동의).
create or replace function public.dues_card_delete(p_user_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.member_billing_cards where user_id = p_user_id;
  if not found then return 'not_found'; end if;
  update public.club_dues_mandates
     set status = 'revoked', revoked_at = now(), revoked_reason = 'card_removed', updated_at = now()
   where user_id = p_user_id and status <> 'revoked';
  return 'ok';
end;
$$;

-- ── 2) 자동결제 동의 ──────────
-- 회원이 화면에서 본 금액·주기가 지금 규칙과 같을 때만 받는다.
--   동의 금액 = 현재 금액과 예약된 금액 중 큰 값(인상이 예약돼 있으면 그 금액까지 동의).
--   결과: ok / disabled / no_plan / not_member / plan_changed / invalid
--   p_check_only = true 면 검사만 하고 저장하지 않는다(카드를 등록하기 전에 거절될 요청을 걸러내는 용도).
drop function if exists public.dues_mandate_upsert(uuid, uuid, int, text, text);
create or replace function public.dues_mandate_upsert(p_club_id uuid, p_user_id uuid, p_amount int, p_cycle text, p_text text, p_check_only boolean default false)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  pl record;
begin
  if not public.dues_enabled_for(p_club_id) or not public.club_plan_usable(p_club_id, 'premium_plus') then return 'disabled'; end if;
  select * into pl from public.club_dues_plans where club_id = p_club_id;
  if not found or not pl.active then return 'no_plan'; end if;
  if not exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = p_user_id and m.status = 'approved') then
    return 'not_member';
  end if;
  if p_cycle is distinct from pl.cycle or p_amount is null or p_amount <> greatest(pl.amount, coalesce(pl.next_amount, 0)) then
    return 'plan_changed';
  end if;
  if coalesce(length(btrim(p_text)), 0) < 10 then return 'invalid'; end if;
  if coalesce(p_check_only, false) then return 'ok'; end if;
  insert into public.club_dues_mandates (club_id, user_id, status, consented_amount, consented_cycle, consent_text)
  values (p_club_id, p_user_id, 'active', p_amount, p_cycle, left(p_text, 2000))
  on conflict (club_id, user_id) do update
    set status = 'active', consented_amount = excluded.consented_amount, consented_cycle = excluded.consented_cycle,
        consent_text = excluded.consent_text, consented_at = now(), revoked_at = null, revoked_reason = null, updated_at = now();
  return 'ok';
end;
$$;

-- ── 3) 결제 선점 ──────────
-- 자동결제 대상 선점: 납부 시각이 된 미납 회비 중 "동의 유효 + 카드 있음 + 클럽 사용 가능"인 것.
--   동의한 금액보다 큰 회비·주기가 달라진 동의는 청구하지 않는다(재동의 필요). 기간이 끝난 회비는 자동으로 청구하지 않는다.
--   클럽을 떠났거나 승인이 취소된 회원도 청구하지 않는다.
--   선점된 회비는 processing 이 되고 결제 시도(pending)가 기록된다. 동시에 여러 번 불려도 겹치지 않는다(skip locked).
create or replace function public.dues_claim_due(p_limit int default 20)
returns table (
  charge_id uuid, dues_id uuid, club_id uuid, user_id uuid, amount int, order_id text,
  billing_key text, customer_key text, club_name text, period_key text
)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  d record;
  v_charge uuid;
  v_order text;
  v_bps int;
  v_fee int;
  v_n int;
begin
  for d in
    select du.id, du.club_id as d_club, du.user_id as d_user, du.amount as d_amount, du.period_key as d_period,
           c.billing_key as d_bk, c.customer_key as d_ck, cl.name as d_club_name, p.nickname as d_payer
      from public.club_dues du
      join public.club_dues_plans pl on pl.club_id = du.club_id and pl.active
      join public.club_dues_mandates m on m.club_id = du.club_id and m.user_id = du.user_id
                                      and m.status = 'active' and m.consented_cycle = pl.cycle and m.consented_amount >= du.amount
      join public.member_billing_cards c on c.user_id = du.user_id
      join public.club_members cm on cm.club_id = du.club_id and cm.user_id = du.user_id and cm.status = 'approved'
      join public.clubs cl on cl.id = du.club_id
      join public.profiles p on p.id = du.user_id
     where du.status = 'open' and du.next_attempt_at is not null and du.next_attempt_at <= now()
       and du.period_end > public.dues_today()
       and public.dues_enabled_for(du.club_id) and public.club_plan_usable(du.club_id, 'premium_plus')
     order by du.next_attempt_at
     limit greatest(coalesce(p_limit, 20), 1)
     for update of du skip locked
  loop
    -- 한 건의 선점이 실패해도(진행 중 시도가 남아 있는 어긋난 행 등) 나머지 회원의 청구는 계속한다
    begin
      select count(*) into v_n from public.club_dues_charges ch where ch.dues_id = d.id;
      v_order := 'due-' || d.id || '-' || (v_n + 1);
      v_bps := public.club_fee_bps(d.d_club);
      v_fee := public.dues_fee_amount(d.d_amount, v_bps);
      insert into public.club_dues_charges
        (dues_id, club_id, user_id, club_name, payer_name, period_key, amount, fee_bps, fee_amount, net_amount, order_id, status, attempt_no, source)
      values
        (d.id, d.d_club, d.d_user, d.d_club_name, d.d_payer, d.d_period, d.d_amount, v_bps, v_fee, d.d_amount - v_fee, v_order, 'pending', v_n + 1, 'auto')
      returning id into v_charge;
      update public.club_dues set status = 'processing', updated_at = now() where id = d.id;
    exception when others then
      raise warning 'dues_claim_due: skip dues % (%)', d.id, sqlerrm;
      -- 같은 실행에서 계속 다시 걸리지 않게 15분 뒤로 미룬다
      update public.club_dues set next_attempt_at = now() + interval '15 minutes', updated_at = now() where id = d.id;
      continue;
    end;
    charge_id := v_charge; dues_id := d.id; club_id := d.d_club; user_id := d.d_user; amount := d.d_amount; order_id := v_order;
    billing_key := d.d_bk; customer_key := d.d_ck; club_name := d.d_club_name; period_key := d.d_period;
    return next;
  end loop;
end;
$$;

-- 회원이 직접 결제('지금 결제', 카드 등록 직후 즉시 결제)할 회비 한 건 선점. 동의는 필요 없고 카드만 있으면 된다.
--   결과: { code: 'ok', claim: {...} } / code: not_found | forbidden | already_paid | in_progress | not_payable | disabled | card_required | too_many
create or replace function public.dues_claim_one(p_dues_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  d record;
  c record;
  v_club_name text;
  v_payer text;
  v_charge uuid;
  v_order text;
  v_bps int;
  v_fee int;
  v_n int;
begin
  select * into d from public.club_dues where id = p_dues_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  if d.user_id <> p_user_id then return jsonb_build_object('code', 'forbidden'); end if;
  if d.status = 'paid' then return jsonb_build_object('code', 'already_paid'); end if;
  if d.status = 'processing' then return jsonb_build_object('code', 'in_progress'); end if;
  if d.status not in ('open', 'failed') then return jsonb_build_object('code', 'not_payable'); end if;
  if not exists (select 1 from public.club_members m where m.club_id = d.club_id and m.user_id = p_user_id and m.status = 'approved') then
    return jsonb_build_object('code', 'forbidden');
  end if;
  if not public.dues_enabled_for(d.club_id) or not public.club_plan_usable(d.club_id, 'premium_plus') then
    return jsonb_build_object('code', 'disabled');
  end if;
  select * into c from public.member_billing_cards where user_id = p_user_id;
  if not found then return jsonb_build_object('code', 'card_required'); end if;
  -- 직접 결제는 10분에 5번까지(카드가 계속 거절되는데 연달아 누르는 경우)
  if (select count(*) from public.club_dues_charges ch
       where ch.dues_id = d.id and ch.source = 'manual' and ch.created_at > now() - interval '10 minutes') >= 5 then
    return jsonb_build_object('code', 'too_many');
  end if;
  select name into v_club_name from public.clubs where id = d.club_id;
  select nickname into v_payer from public.profiles where id = p_user_id;

  select count(*) into v_n from public.club_dues_charges ch where ch.dues_id = d.id;
  v_order := 'due-' || d.id || '-' || (v_n + 1);
  v_bps := public.club_fee_bps(d.club_id);
  v_fee := public.dues_fee_amount(d.amount, v_bps);
  insert into public.club_dues_charges
    (dues_id, club_id, user_id, club_name, payer_name, period_key, amount, fee_bps, fee_amount, net_amount, order_id, status, attempt_no, source)
  values
    (d.id, d.club_id, d.user_id, coalesce(v_club_name, ''), coalesce(v_payer, ''), d.period_key, d.amount, v_bps, v_fee, d.amount - v_fee, v_order, 'pending', v_n + 1, 'manual')
  returning id into v_charge;
  update public.club_dues set status = 'processing', updated_at = now() where id = d.id;
  return jsonb_build_object('code', 'ok', 'claim', jsonb_build_object(
    'charge_id', v_charge, 'dues_id', d.id, 'club_id', d.club_id, 'user_id', d.user_id, 'amount', d.amount, 'order_id', v_order,
    'billing_key', c.billing_key, 'customer_key', c.customer_key, 'club_name', coalesce(v_club_name, ''), 'period_key', d.period_key));
end;
$$;

-- ── 4) 결제 결과 반영 ──────────
-- 결제 승인 반영: 시도 paid + 회비 paid 를 한 트랜잭션으로.
--   ok        반영함
--   duplicate 이미 이 시도가 결제로 반영돼 있음(할 일 없음)
--   closed / mismatch / orphan  반영할 수 없는 결제(이미 실패로 닫힌 시도·금액 불일치·회비 행이 사라짐) → 호출자가 환불한다
create or replace function public.dues_charge_commit_paid(p_charge_id uuid, p_payment_key text, p_amount int)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  d record;
begin
  select * into c from public.club_dues_charges where id = p_charge_id for update;
  if not found then return 'not_found'; end if;
  if c.status = 'paid' then return 'duplicate'; end if;
  if c.status <> 'pending' then return 'closed'; end if;
  if p_amount is distinct from c.amount then return 'mismatch'; end if;
  if c.dues_id is null then return 'orphan'; end if;
  select * into d from public.club_dues where id = c.dues_id for update;
  if not found then return 'orphan'; end if;
  if d.status <> 'processing' then return 'closed'; end if;

  update public.club_dues_charges set status = 'paid', paid_at = now(), toss_payment_key = p_payment_key where id = p_charge_id;
  update public.club_dues
     set status = 'paid', paid_via = 'card', paid_at = now(), next_attempt_at = null, last_fail_reason = null, updated_at = now()
   where id = d.id;
  perform public.push_notify(d.user_id, 'dues', c.club_name || ' 회비 결제 완료',
    to_char(c.amount, 'FM999,999,999') || '원이 결제됐어요.', 'club_dues', d.club_id, null);
  return 'ok';
end;
$$;

-- 결제 실패 반영.
--   p_count_attempt: 카드가 확정 거절한 경우 true(재시도 횟수에 포함). 요청이 전달되지 않았거나 환불로 닫는 경우 false.
--   자동결제는 납부일부터 하루 한 번, 총 4회까지. 다 실패하면 회비는 failed 가 되고 회원이 직접 결제하거나 운영진이 처리한다.
--   전달되지 않은 요청은 15분 뒤 다시 보내되, 시도가 12건을 넘으면 하루 한 번으로 늦춘다(실패로 끝내지는 않는다).
create or replace function public.dues_charge_commit_failed(p_charge_id uuid, p_reason text, p_count_attempt boolean default true)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  d record;
  v_attempts int;
  v_tries int;
  v_reason text := left(coalesce(p_reason, ''), 200);
  c_max constant int := 4;
begin
  select * into c from public.club_dues_charges where id = p_charge_id for update;
  if not found then return 'not_found'; end if;
  if c.status <> 'pending' then return 'closed'; end if;
  update public.club_dues_charges set status = 'failed', fail_reason = v_reason where id = p_charge_id;
  if c.dues_id is null then return 'ok'; end if;
  select * into d from public.club_dues where id = c.dues_id for update;
  if not found or d.status <> 'processing' then return 'ok'; end if;

  if c.source = 'manual' then
    -- 회원이 직접 누른 결제: 자동결제 횟수와 예정은 건드리지 않고 원래 상태로 되돌린다
    update public.club_dues
       set status = case when d.attempt_count >= c_max then 'failed' else 'open' end, last_fail_reason = v_reason, updated_at = now()
     where id = d.id;
    return 'ok';
  end if;

  v_attempts := d.attempt_count + case when coalesce(p_count_attempt, true) then 1 else 0 end;
  select count(*) into v_tries from public.club_dues_charges ch where ch.dues_id = d.id;
  if v_attempts >= c_max then
    update public.club_dues
       set status = 'failed', attempt_count = v_attempts, next_attempt_at = null, last_fail_reason = v_reason, updated_at = now()
     where id = d.id;
    perform public.push_notify(d.user_id, 'dues', c.club_name || ' 회비 결제 실패',
      '카드 결제가 계속 실패해 자동결제를 멈췄어요. 회비 화면에서 카드를 확인하고 직접 결제해주세요.', 'club_dues', d.club_id, null);
  elsif v_tries >= 12 then
    -- 카드가 거절된 게 아니라 결제 요청이 계속 전달되지 않은 경우(결제사 장애 등): 실패로 끝내지 않고 하루 한 번으로 늦춘다.
    -- 회원 잘못이 아니므로 "카드를 확인하라"는 알림도 보내지 않는다(오래된 미확정·밀린 청구는 일일 작업이 운영자에게 알린다).
    update public.club_dues
       set status = 'open', attempt_count = v_attempts, last_fail_reason = v_reason,
           next_attempt_at = public.dues_due_at(public.dues_today() + 1), updated_at = now()
     where id = d.id;
  else
    update public.club_dues
       set status = 'open', attempt_count = v_attempts, last_fail_reason = v_reason,
           -- 확정 거절: 다음 날 오전 10시에 다시. 요청이 전달되지 않은 경우: 곧 다시.
           next_attempt_at = case when coalesce(p_count_attempt, true) then public.dues_due_at(public.dues_today() + 1) else now() + interval '15 minutes' end,
           updated_at = now()
     where id = d.id;
    if coalesce(p_count_attempt, true) and v_attempts = 1 then
      perform public.push_notify(d.user_id, 'dues', c.club_name || ' 회비 결제 실패',
        '카드 결제에 실패했어요. 내일 오전에 다시 시도해요. 회비 화면에서 카드를 확인해주세요.', 'club_dues', d.club_id, null);
    end if;
  end if;
  return 'ok';
end;
$$;

-- ── 5) 환불 ──────────
-- 환불 전 확인(운영진, 정산 확정 전 건만). 통과하면 환불 진행 중으로 표시해 그 사이 정산이 확정되지 않게 한다.
--   결과: { code: 'ok', payment_key, order_id, amount } / code: not_found | forbidden | self_not_allowed | already_refunded | not_paid | settled
create or replace function public.dues_refund_prepare(p_charge_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  v_is_owner boolean;
  v_is_officer boolean;
begin
  select * into c from public.club_dues_charges where id = p_charge_id for update;
  if not found or c.club_id is null then return jsonb_build_object('code', 'not_found'); end if;
  -- 운영진 판정은 is_club_manager 와 같은 기준: 클럽장(clubs.owner_id) 또는 승인된 임원
  select (cl.owner_id = p_actor) into v_is_owner from public.clubs cl where cl.id = c.club_id;
  v_is_officer := exists (select 1 from public.club_members m
                           where m.club_id = c.club_id and m.user_id = p_actor and m.status = 'approved' and m.role = 'officer');
  if not (coalesce(v_is_owner, false) or v_is_officer) then return jsonb_build_object('code', 'forbidden'); end if;
  if c.user_id = p_actor and not coalesce(v_is_owner, false) then return jsonb_build_object('code', 'self_not_allowed'); end if;
  if c.status = 'refunded' then return jsonb_build_object('code', 'already_refunded'); end if;
  if c.status <> 'paid' or c.toss_payment_key is null then return jsonb_build_object('code', 'not_paid'); end if;
  if c.settlement_id is not null then return jsonb_build_object('code', 'settled'); end if;
  update public.club_dues_charges set refund_requested_at = now() where id = p_charge_id;
  return jsonb_build_object('code', 'ok', 'payment_key', c.toss_payment_key, 'order_id', c.order_id, 'amount', c.amount);
end;
$$;

-- 환불 반영(토스 취소가 끝난 뒤). 회비는 '환불됨'이 되고, 그 달의 정산 초안이 있으면 다시 계산한다.
create or replace function public.dues_charge_commit_refund(p_charge_id uuid, p_actor uuid, p_reason text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  v_set uuid;
begin
  select * into c from public.club_dues_charges where id = p_charge_id for update;
  if not found then return 'not_found'; end if;
  if c.status = 'refunded' then return 'duplicate'; end if;
  if c.status <> 'paid' then return 'not_paid'; end if;
  if c.settlement_id is not null then
    -- 카드는 이미 환불됐는데 정산이 확정돼 반영할 수 없는 상태 — 사람이 정산을 바로잡아야 한다
    perform public.push_notify(a.id, 'system', '회비 환불·정산 불일치',
      c.club_name || ' 결제 ' || to_char(c.amount, 'FM999,999,999') || '원이 카드로는 환불됐는데 확정된 정산에 들어가 있어요. 주문번호 ' || c.order_id, null, null, null)
      from public.profiles a where a.role = 'super_admin';
    return 'settled';
  end if;
  update public.club_dues_charges
     set status = 'refunded', refunded_at = now(), refund_reason = left(coalesce(p_reason, ''), 200), refunded_by = p_actor
   where id = p_charge_id;
  update public.club_dues
     set status = 'refunded', next_attempt_at = null, updated_at = now()
   where id = c.dues_id and status = 'paid';
  select s.id into v_set from public.club_dues_settlements s
   where s.club_id = c.club_id and s.status = 'draft'
     and s.period_month = to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM');
  if v_set is not null then perform public.dues_settlement_recalc(v_set); end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (p_actor, (select role from public.profiles where id = p_actor), 'club_dues_charges.refund', 'club_dues_charges', p_charge_id::text,
          jsonb_build_object('status', 'paid'), jsonb_build_object('amount', c.amount, 'order_id', c.order_id, 'reason', left(coalesce(p_reason, ''), 200)));
  if c.user_id is not null then
    perform public.push_notify(c.user_id, 'dues', c.club_name || ' 회비 환불',
      to_char(c.amount, 'FM999,999,999') || '원이 환불됐어요. 카드사에 따라 며칠 걸릴 수 있어요.', 'club_dues', c.club_id, null);
  end if;
  return 'ok';
end;
$$;

-- 환불 진행 표시 지우기 — 토스 조회로 그 결제가 취소되지 않았음이 확인됐을 때만(워커가 부른다)
--   p_expected: 워커가 읽었던 표시 시각. 그 사이 운영진이 환불을 다시 시작했으면(시각이 달라짐) 지우지 않는다.
drop function if exists public.dues_refund_flag_clear(uuid);
create or replace function public.dues_refund_flag_clear(p_charge_id uuid, p_expected timestamptz)
returns void
language sql
security definer set search_path = public
as $$
  update public.club_dues_charges set refund_requested_at = null
   where id = p_charge_id and status = 'paid' and refund_requested_at = p_expected;
$$;

-- ── 6) 일일 작업 ──────────
create or replace function public.dues_job_log(p_job text, p_ok boolean, p_summary jsonb)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.dues_job_runs (job, finished_at, ok, summary) values (p_job, now(), p_ok, p_summary);
$$;

-- 매일 오전 9시(KST): 회비 행 만들기 → 재동의가 필요한 동의 표시 → 납부 사전 안내 → 결제 작업 점검
create or replace function public.dues_daily_tick()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  pl record;
  r record;
  a record;
  v_today date := public.dues_today();
  v_rows int := 0;
  v_reconsent int := 0;
  v_notices int := 0;
  v_alert boolean := false;
  v_stale int := 0;
  v_errors int := 0;
  v_summary jsonb;
begin
  for pl in select club_id from public.club_dues_plans where active loop
    begin
      v_rows := v_rows + public.dues_ensure_rows(pl.club_id);
    exception when others then
      v_errors := v_errors + 1;  -- 한 클럽의 오류가 다른 클럽의 회비 생성·안내를 막지 않게
      raise warning 'dues_daily_tick: ensure_rows failed for club % (%)', pl.club_id, sqlerrm;
    end;
  end loop;

  -- 동의한 금액보다 큰 회비가 생겼거나 주기가 달라진 동의는 자동결제를 멈추고 다시 동의를 받는다
  for r in
    select m.club_id, m.user_id, c.name
      from public.club_dues_mandates m
      join public.club_dues_plans p on p.club_id = m.club_id and p.active
      join public.clubs c on c.id = m.club_id
     where m.status = 'active'
       and (m.consented_cycle <> p.cycle
            or exists (select 1 from public.club_dues d
                        where d.club_id = m.club_id and d.user_id = m.user_id and d.status = 'open' and d.amount > m.consented_amount
                          and d.period_end > v_today and d.next_attempt_at is not null))
  loop
    update public.club_dues_mandates set status = 'needs_reconsent', updated_at = now()
     where club_id = r.club_id and user_id = r.user_id;
    perform public.push_notify(r.user_id, 'dues', r.name || ' 회비 자동결제 다시 동의',
      '회비가 바뀌어 자동결제가 멈췄어요. 회비 화면에서 바뀐 내용을 확인하고 다시 동의해주세요.', 'club_dues', r.club_id, null);
    v_reconsent := v_reconsent + 1;
  end loop;

  -- 납부 사전 안내: 납부일 3일 전부터, 회비마다 한 번(납부일이 지난 채 만들어진 행도 청구 전에 안내한다)
  for r in
    select d.id, d.club_id, d.user_id, d.amount, d.due_date, c.name,
           (coalesce(d.next_attempt_at, public.dues_due_at(d.due_date)) at time zone 'Asia/Seoul')::date as charge_date,
           (exists (select 1 from public.club_dues_mandates m
                     where m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'active' and m.consented_amount >= d.amount)
            and exists (select 1 from public.member_billing_cards b where b.user_id = d.user_id)) as autopay
      from public.club_dues d
      join public.clubs c on c.id = d.club_id
     where d.status = 'open' and d.notified_d3_at is null and d.due_date <= v_today + 3 and d.period_end > v_today
       and public.dues_enabled_for(d.club_id) and public.club_plan_usable(d.club_id, 'premium_plus')
  loop
    if r.autopay then
      perform public.push_notify(r.user_id, 'dues', r.name || ' 회비 자동결제 예정',
        to_char(r.charge_date, 'FMMM"월" FMDD"일"') || ' 오전에 ' || to_char(r.amount, 'FM999,999,999') || '원이 등록한 카드로 결제돼요. 원하지 않으면 회비 화면에서 자동결제를 해지할 수 있어요.',
        'club_dues', r.club_id, null);
    else
      perform public.push_notify(r.user_id, 'dues', r.name || ' 회비 납부 안내',
        '납부일은 ' || to_char(r.due_date, 'FMMM"월" FMDD"일"') || ', ' || to_char(r.amount, 'FM999,999,999') || '원이에요. 회비 화면에서 카드를 등록하면 자동으로 납부돼요.',
        'club_dues', r.club_id, null);
    end if;
    update public.club_dues set notified_d3_at = now() where id = r.id;
    v_notices := v_notices + 1;
  end loop;

  -- 청구할 회비가 하루 넘게 밀려 있는데 결제 작업의 성공 기록이 없으면 운영자에게 알린다
  if exists (
       select 1 from public.club_dues d
         join public.club_dues_mandates m on m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'active' and m.consented_amount >= d.amount
         join public.member_billing_cards b on b.user_id = d.user_id
        where d.status = 'open' and d.next_attempt_at < now() - interval '26 hours' and d.period_end > v_today
          and public.dues_enabled_for(d.club_id) and public.club_plan_usable(d.club_id, 'premium_plus'))
     and not exists (select 1 from public.dues_job_runs j where j.job = 'dues_charge' and j.ok and j.started_at > now() - interval '26 hours') then
    v_alert := true;
    for a in select id from public.profiles where role = 'super_admin' loop
      perform public.push_notify(a.id, 'system', '회비 결제 작업 확인 필요',
        '청구할 회비가 하루 넘게 밀려 있어요. 결제 작업(club-dues-charge)이 돌고 있는지 확인해주세요.', null, null, null);
    end loop;
  end if;

  -- 결과를 모른 채 6시간 넘게 남은 결제 시도(토스 조회가 계속 실패하는 경우 등)
  select count(*) into v_stale from public.club_dues_charges c
   where (c.status = 'pending' and c.created_at < now() - interval '6 hours')
      or (c.status = 'paid' and c.refund_requested_at < now() - interval '6 hours');  -- 끝나지 않은 환불
  if v_stale > 0 or v_errors > 0 then
    for a in select id from public.profiles where role = 'super_admin' loop
      perform public.push_notify(a.id, 'system', '회비 결제 확인 필요',
        '결과가 확정되지 않은 회비 결제·환불이 ' || v_stale || '건, 회비 생성 오류가 ' || v_errors || '건 있어요. 결제 작업(club-dues-charge) 로그를 확인해주세요.', null, null, null);
    end loop;
  end if;

  v_summary := jsonb_build_object('rows_created', v_rows, 'reconsent', v_reconsent, 'notices', v_notices, 'worker_alert', v_alert, 'stale_pending', v_stale, 'errors', v_errors);
  perform public.dues_job_log('dues_daily_tick', true, v_summary);
  return v_summary;
end;
$$;

-- 매월 2일: 지난달 정산 초안 만들기
create or replace function public.dues_settlement_generate_prev_month()
returns int
language sql
security definer set search_path = public
as $$
  select public.dues_settlement_generate(to_char(public.dues_today() - interval '1 month', 'YYYY-MM'));
$$;

-- ── 7) 권한: 전부 서버 전용 ──────────
revoke all on function public.dues_card_upsert(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.dues_card_delete(uuid) from public, anon, authenticated;
revoke all on function public.dues_mandate_upsert(uuid, uuid, int, text, text, boolean) from public, anon, authenticated;
revoke all on function public.dues_claim_due(int) from public, anon, authenticated;
revoke all on function public.dues_claim_one(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dues_charge_commit_paid(uuid, text, int) from public, anon, authenticated;
revoke all on function public.dues_charge_commit_failed(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.dues_refund_prepare(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dues_charge_commit_refund(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.dues_refund_flag_clear(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.dues_refund_flag_clear(uuid, timestamptz) to service_role;
revoke all on function public.dues_job_log(text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.dues_daily_tick() from public, anon, authenticated;
revoke all on function public.dues_settlement_generate_prev_month() from public, anon, authenticated;
grant execute on function public.dues_card_upsert(uuid, text, text, text, text) to service_role;
grant execute on function public.dues_card_delete(uuid) to service_role;
grant execute on function public.dues_mandate_upsert(uuid, uuid, int, text, text, boolean) to service_role;
grant execute on function public.dues_claim_due(int) to service_role;
grant execute on function public.dues_claim_one(uuid, uuid) to service_role;
grant execute on function public.dues_charge_commit_paid(uuid, text, int) to service_role;
grant execute on function public.dues_charge_commit_failed(uuid, text, boolean) to service_role;
grant execute on function public.dues_refund_prepare(uuid, uuid) to service_role;
grant execute on function public.dues_charge_commit_refund(uuid, uuid, text) to service_role;
grant execute on function public.dues_job_log(text, boolean, jsonb) to service_role;
grant execute on function public.dues_daily_tick() to service_role;
grant execute on function public.dues_settlement_generate_prev_month() to service_role;

notify pgrst, 'reload schema';
-- ══ /클럽 회비 — 자동결제 엔진 ══

-- ══ 번개 완료·출석 + 챌린지 ══ (0099_meetup_challenge.sql 과 같은 내용)
-- 0099: 번개 완료·출석 확정 + 챌린지(이벤트) 집계
--
-- 왜: "피넛 10매치 챌린지"(기간 중 번개 10회 참석)처럼 번개 참석 실적으로 하는 이벤트를 서버에서 계산하기 위해.
--   · meetups.status 의 'closed' 는 모집 마감이라 "실제로 모였다"는 뜻이 아니다 → 완료·출석을 따로 저장한다.
--   · 기존 표(meetups · meetup_participants)의 열은 건드리지 않는다. 새 표 4개 + 함수 + 정책·트리거만 추가한다.
--   · 과거 번개는 자동으로 완료 처리하지 않는다(완료 행이 없으면 "미확정").
--   · 횟수는 저장하지 않고 출석 기록에서 매번 계산한다 → 운영자가 출석을 고치면 바로 반영되고, 앱이 숫자를 올릴 길이 없다.
--   · 완료·출석 표에는 쓰기 정책이 없다. 기록은 아래 함수로만 된다(호스트: meetup_complete / 운영자: *_admin_*).
--   · 완료 기록은 번개와 따로 살아남는다: 번개가 지워져도(호스트 탈퇴 등) 완료·출석은 남고, 판정에 쓰는 값
--     (번개 제목·장소·시작 시각·참석 인원)은 완료 시점에 완료 행에 적어 둔다.
--
-- 챌린지 규칙(kind = 'meetup_attendance'):
--   · 참여 신청제: 회원이 직접 인스타그램 아이디를 등록해 참여 신청해야 집계된다(challenge_enrollments). 신청하지 않은 사람은 번개에 참석해도
--     이 챌린지와 무관하다. 신청 시각 이후에 완료 처리된 참석만 인정한다(그 전 기록은 내역에 보이되 인정되지 않는다).
--   · 인정 대상: 완료 처리된(무효 아님) 번개에 '참석'으로 확정된 사람. 그 번개의 참석자가 2명 이상이고, 취소된 번개가 아닐 것.
--   · 기간: 번개가 [starts_at, ends_at] 안에 열리고, 완료 처리가 starts_at ~ (ends_at + completion_grace_days 일) 안에 이뤄질 것.
--     (종료 직전에 열린 번개를 호스트가 조금 늦게 완료 처리해도 인정하려는 유예. 초 단위로 끝 포함)
--   · 인정 날짜 = 완료 처리 시각의 한국 날짜(Asia/Seoul).
--   · 하루 한도(daily_limit)는 두 날짜에 모두 건다: 완료 처리한 날 기준으로도, 번개가 열린 날 기준으로도 한도까지만 인정한다.
--     완료 처리가 빠른 것부터 차례로 따진다. (같은 날 친 번개를 다른 날에 나눠 완료하거나, 여러 날 치를 하루에 몰아 완료해도 하루 한도를 넘지 않게)
--   · 진행률 = min(인정 횟수, goal_count). 달성 시각 = goal_count 번째 인정 건의 완료 처리 시각.

-- ── 1) 번개 완료 기록 (번개당 1행) ──────────
create table if not exists public.meetup_completions (
  id                uuid primary key default gen_random_uuid(),
  meetup_id         uuid unique references public.meetups(id) on delete set null,   -- 번개가 지워져도 기록은 남는다
  host_id           uuid references public.profiles(id) on delete set null,
  meetup_title      text not null,                       -- 아래 넷은 완료 시점의 값(판정·표시에 쓴다)
  location_name     text not null default '',
  meetup_start_time timestamptz not null,
  present_count     int  not null default 0,             -- 참석으로 확정된 인원. 회원이 탈퇴해도 줄지 않는다(함수가 관리)
  status            text not null default 'completed' check (status in ('completed', 'voided')),  -- voided = 운영자가 무효 처리
  completed_at      timestamptz not null default now(),  -- 완료 처리 시각(챌린지 인정 날짜의 기준)
  completed_by      uuid references public.profiles(id) on delete set null,
  voided_at         timestamptz,                         -- 무효 사유·처리자는 감사로그(audit_logs)에 남는다
  updated_at        timestamptz not null default now()
);
create index if not exists meetup_completions_completed_idx on public.meetup_completions (completed_at);
create index if not exists meetup_completions_host_idx on public.meetup_completions (host_id);

-- ── 2) 출석 (완료 기록 × 회원) — 완료 처리 때 승인 참가자 전원의 행이 만들어진다 ──────────
--   present = 참석 / absent = 불참 / unknown = 미확인(호스트가 고르지 않음)
create table if not exists public.meetup_attendance (
  completion_id uuid not null references public.meetup_completions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  meetup_id     uuid references public.meetups(id) on delete set null,   -- 조회 편의(번개가 지워지면 null)
  status        text not null default 'unknown' check (status in ('present', 'absent', 'unknown')),
  marked_by     uuid references public.profiles(id) on delete set null,
  marked_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (completion_id, user_id)
);
create index if not exists meetup_attendance_user_idx on public.meetup_attendance (user_id);
create index if not exists meetup_attendance_meetup_idx on public.meetup_attendance (meetup_id);

alter table public.meetup_completions enable row level security;
alter table public.meetup_attendance enable row level security;

-- 완료 여부·참석 인원은 번개 상세에 보여주는 정보라 로그인한 사용자는 조회 가능
drop policy if exists "meetup_completions_select" on public.meetup_completions;
create policy "meetup_completions_select" on public.meetup_completions
  for select using (auth.uid() is not null);

-- 출석은 본인 것, 그 번개의 호스트, 운영자만 조회
drop policy if exists "meetup_attendance_select" on public.meetup_attendance;
create policy "meetup_attendance_select" on public.meetup_attendance
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.meetup_completions c where c.id = completion_id and c.host_id = auth.uid())
    or public.my_role() = 'super_admin'
  );

-- 쓰기 정책은 두지 않는다 + 표 권한도 조회만 남긴다(함수로만 기록)
revoke all on public.meetup_completions from anon, authenticated;
revoke all on public.meetup_attendance from anon, authenticated;
grant select on public.meetup_completions to authenticated;
grant select on public.meetup_attendance to authenticated;

-- ── 3) 기존 번개 권한의 빈틈 막기 ──────────
-- 완료 처리는 "승인된 참가자"와 "번개 시작 시각"을 믿는다. 둘 다 앱 화면에서만 지켜지고 서버는 막지 않던 것을 여기서 막는다.
--   (a) 참가자 행의 번개·회원은 바꿀 수 없다 — 호스트가 자기 번개의 참가자 행을 다른 회원으로 바꿔치기하는 것 방지.
--   (b) 승인제 번개에 호스트가 아닌 사람이 스스로 넣는 행은 항상 '승인 대기' — 스스로 '승인'으로 넣는 것 방지.
--   앱은 참가자 행의 status 만 고치고, 참가 신청은 원래 '승인 대기'로 넣으므로 정상 동작은 달라지지 않는다.
create or replace function public.meetup_participants_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_host uuid;
  v_need_approval boolean;
begin
  if tg_op = 'UPDATE' then
    if new.meetup_id is distinct from old.meetup_id or new.user_id is distinct from old.user_id then
      raise exception '참가자 행의 모임·회원은 바꿀 수 없어요.' using errcode = '42501';
    end if;
    return new;
  end if;
  -- 로그인 사용자가 넣는 행만 본다(서버·트리거·SQL 직접 실행은 그대로)
  if auth.uid() is null then return new; end if;
  select m.host_id, m.require_approval into v_host, v_need_approval from public.meetups m where m.id = new.meetup_id;
  if v_host is distinct from auth.uid() and coalesce(v_need_approval, true) then
    new.status := 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists meetup_participants_guard on public.meetup_participants;
create trigger meetup_participants_guard
  before insert or update on public.meetup_participants
  for each row execute function public.meetup_participants_guard();

-- 그 번개가 (무효가 아닌) 완료 처리 상태인가 — 정책·트리거에서 쓴다
create or replace function public.meetup_is_completed(p_meetup_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.meetup_completions c where c.meetup_id = p_meetup_id and c.status = 'completed');
$$;

--   (c) 로그인 사용자는 이미 지난 시각으로 번개를 만들 수 없고(10분 여유), 이미 시작한 번개의 시작 시각을 바꿀 수 없다
--       — 지난 시각의 번개를 만들거나 옛 번개의 시각을 고쳐 곧바로 완료 처리하는 것, 완료 뒤 시각을 옮겨 실적을 지우는 것 방지.
--   (d) 완료 처리된 번개는 호스트가 취소할 수 없다 — 취소하면 참석자들의 실적이 사라지기 때문. 잘못된 완료는 운영자가 무효 처리.
--   운영자와 서버(로그인 사용자 아님)는 그대로 통과한다.
create or replace function public.meetups_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.my_role() = 'super_admin' then return new; end if;
  if tg_op = 'INSERT' then
    if new.start_time < now() - interval '10 minutes' then
      raise exception '이미 지난 시간으로는 모임을 만들 수 없어요.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.start_time is distinct from old.start_time then
    if old.start_time <= now() then
      raise exception '이미 시작한 모임의 시간은 바꿀 수 없어요.' using errcode = '22023';
    end if;
    if new.start_time < now() - interval '10 minutes' then
      raise exception '이미 지난 시간으로는 바꿀 수 없어요.' using errcode = '22023';
    end if;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and public.meetup_is_completed(old.id) then
    raise exception '완료 처리된 모임은 취소할 수 없어요.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists meetups_guard on public.meetups;
create trigger meetups_guard
  before insert or update on public.meetups
  for each row execute function public.meetups_guard();

-- ── 4) 완료 처리된 번개는 호스트가 지울 수 없다 ──────────
--   제한 정책(restrictive)이라 기존 정책의 허용 범위를 넓히지 않고, 완료 행이 없는 번개에는 영향이 없다.
--   회원 탈퇴로 번개가 함께 지워지는 것(참조 무결성)은 이 정책과 무관하게 진행된다 — 그때도 완료·출석 기록은 남는다.
drop policy if exists "meetups_completed_no_delete" on public.meetups;
create policy "meetups_completed_no_delete" on public.meetups as restrictive
  for delete using (public.my_role() = 'super_admin' or not public.meetup_is_completed(id));

-- ── 5) 챌린지(이벤트) 설정 — 특정 이벤트를 코드에 박지 않는다 ──────────
create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'meetup_attendance' check (kind in ('meetup_attendance')),  -- 실적을 세는 방식
  title       text not null check (length(btrim(title)) between 1 and 60),
  description text not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  goal_count  int not null check (goal_count between 1 and 1000),
  daily_limit int not null default 1 check (daily_limit between 1 and 100),   -- 하루(한국 날짜)에 인정하는 최대 횟수
  active      boolean not null default false,
  completion_grace_days  int not null default 3 check (completion_grace_days between 0 and 30),    -- 종료 뒤 며칠까지의 완료 처리를 인정할지
  visible_days_after_end int not null default 7 check (visible_days_after_end between 0 and 365),  -- 종료 뒤 며칠 동안 앱에 카드·메뉴를 보여줄지
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint challenges_period_check check (ends_at > starts_at)
);
-- (이미 표가 있는 DB 용)
alter table public.challenges add column if not exists completion_grace_days int not null default 3 check (completion_grace_days between 0 and 30);
alter table public.challenges add column if not exists visible_days_after_end int not null default 7 check (visible_days_after_end between 0 and 365);

alter table public.challenges enable row level security;
-- 일반 사용자는 켜진 챌린지만, 운영자는 전부
drop policy if exists "challenges_select" on public.challenges;
create policy "challenges_select" on public.challenges
  for select using (active or public.my_role() = 'super_admin');
drop policy if exists "challenges_insert" on public.challenges;
create policy "challenges_insert" on public.challenges
  for insert with check (public.my_role() = 'super_admin');
drop policy if exists "challenges_update" on public.challenges;
create policy "challenges_update" on public.challenges
  for update using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');
drop policy if exists "challenges_delete" on public.challenges;
create policy "challenges_delete" on public.challenges
  for delete using (public.my_role() = 'super_admin');

-- 설정을 바꾸면 수정 시각을 찍고 변경 기록을 남긴다(기간·목표를 바꾸면 달성 여부가 달라지므로)
create or replace function public.challenges_touch()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values ((select p.id from public.profiles p where p.id = auth.uid()), public.my_role(), 'challenge.' || lower(tg_op), 'challenges',
          coalesce(new.id, old.id)::text,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
drop trigger if exists challenges_touch on public.challenges;
create trigger challenges_touch before insert or update or delete on public.challenges
  for each row execute function public.challenges_touch();

-- 참여 신청(챌린지 × 회원) = 인스타그램 아이디 등록. 신청 시각은 서버가 찍는다 — 앱이 과거 시각으로 넣을 수 없도록 쓰기는 함수로만.
--   인스타그램 아이디는 본인과 운영자만 볼 수 있다. 한 챌린지에서 같은 아이디는 한 사람만 쓸 수 있다(여러 계정으로 중복 참여 방지).
create table if not exists public.challenge_enrollments (
  challenge_id uuid not null references public.challenges(id) on delete restrict,   -- 신청자가 있는 챌린지는 지울 수 없다(끄기만)
  user_id      uuid not null references public.profiles(id) on delete cascade,
  instagram_id text not null check (instagram_id ~ '^[a-z0-9._]{1,30}$'),   -- '@' 없이, 소문자
  enrolled_at  timestamptz not null default now(),   -- 이 시각 이후에 완료 처리된 참석만 인정
  updated_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists challenge_enrollments_user_idx on public.challenge_enrollments (user_id);
create unique index if not exists challenge_enrollments_instagram_idx on public.challenge_enrollments (challenge_id, instagram_id);

alter table public.challenge_enrollments enable row level security;
-- 내 신청만(운영자는 전부)
drop policy if exists "challenge_enrollments_select" on public.challenge_enrollments;
create policy "challenge_enrollments_select" on public.challenge_enrollments
  for select using (auth.uid() = user_id or public.my_role() = 'super_admin');
revoke all on public.challenge_enrollments from anon, authenticated;
grant select on public.challenge_enrollments to authenticated;

-- 입력한 인스타그램 아이디 다듬기: 앞의 '@', 프로필 주소(instagram.com/아이디), 대문자를 정리한다. 형식이 아니면 null.
--   인스타그램 아이디 규칙: 영문·숫자·밑줄·마침표, 30자 이하.
create or replace function public.normalize_instagram_id(p text)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  v text := lower(btrim(coalesce(p, ''), E' \t\n\r'));
begin
  v := regexp_replace(v, '^(https?://)?(www\.|m\.)?instagram\.com/(_u/)?', '');   -- 프로필 주소(앞의 http·www 는 없어도 된다. _u/ 는 앱으로 여는 주소)
  v := regexp_replace(v, '[/?#].*$', '');
  v := regexp_replace(v, '^@+', '');
  if v !~ '^[a-z0-9._]{1,30}$' then return null; end if;
  -- 게시물·릴스·공유 주소 등을 붙여 넣었을 때 남는 경로 이름은 아이디가 아니다
  if v in ('p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct', 'share', '_u') then return null; end if;
  -- 주소만 넣었거나 다른 하위 도메인(business. 등)을 넣었을 때 남는 도메인도 아이디가 아니다
  if v ~ '(^|\.)instagram\.com$' then return null; end if;
  return v;
end;
$$;

-- 참여 신청(회원 본인): 인스타그램 아이디를 등록한다. 켜져 있고 아직 끝나지 않은 챌린지에만 새로 신청할 수 있다.
--   이미 신청한 사람이 다시 부르면 아이디만 바꾼다(신청 시각은 그대로 — 끝난 뒤에도 아이디는 고칠 수 있다).
--   결과: ok(신청됨) / updated(아이디 변경) / forbidden / not_found(없거나 꺼진 챌린지) / ended /
--         invalid_instagram(아이디 형식 아님) / instagram_taken(다른 사람이 이미 등록한 아이디)
create or replace function public.challenge_join(p_challenge_id uuid, p_instagram_id text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  v_ig text := public.normalize_instagram_id(p_instagram_id);
  v_old text;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  select id, ends_at, active into c from public.challenges where id = p_challenge_id;
  if not found or not c.active then return 'not_found'; end if;
  if v_ig is null then return 'invalid_instagram'; end if;
  if exists (select 1 from public.challenge_enrollments e
              where e.challenge_id = p_challenge_id and e.instagram_id = v_ig and e.user_id <> auth.uid()) then
    return 'instagram_taken';
  end if;

  select e.instagram_id into v_old from public.challenge_enrollments e where e.challenge_id = p_challenge_id and e.user_id = auth.uid();
  if found then
    if v_old = v_ig then return 'updated'; end if;
    begin
      update public.challenge_enrollments set instagram_id = v_ig, updated_at = now() where challenge_id = p_challenge_id and user_id = auth.uid();
    exception when unique_violation then
      return 'instagram_taken';   -- 같은 순간에 다른 사람이 같은 아이디로 등록
    end;
    insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
    values (auth.uid(), public.my_role(), 'challenge.instagram', 'challenge_enrollments', p_challenge_id::text || ':' || auth.uid()::text,
            jsonb_build_object('instagram_id', v_old), jsonb_build_object('instagram_id', v_ig));
    return 'updated';
  end if;

  if now() > c.ends_at then return 'ended'; end if;
  begin
    insert into public.challenge_enrollments (challenge_id, user_id, instagram_id) values (p_challenge_id, auth.uid(), v_ig);
  exception when unique_violation then
    -- 같은 순간의 중복: 내 신청이 이미 들어갔으면(두 번 눌림) 성공, 아니면 다른 사람이 같은 아이디를 먼저 등록한 것
    if exists (select 1 from public.challenge_enrollments e where e.challenge_id = p_challenge_id and e.user_id = auth.uid()) then return 'ok'; end if;
    return 'instagram_taken';
  end;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'challenge.join', 'challenge_enrollments', p_challenge_id::text || ':' || auth.uid()::text, null,
          jsonb_build_object('enrolled_at', now(), 'instagram_id', v_ig));
  return 'ok';
end;
$$;

-- 참여 취소(회원 본인). 지금까지의 기록이 이 챌린지에서 빠진다. 다시 신청하면 그 시각부터 새로 인정된다.
--   끝난 챌린지는 취소할 수 없다(다시 신청할 수 없어 되돌릴 길이 없다. 필요하면 운영자에게 요청).
--   결과: ok / forbidden / not_found(신청한 적 없음) / ended
create or replace function public.challenge_leave(p_challenge_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old record;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  if exists (select 1 from public.challenges c where c.id = p_challenge_id and now() > c.ends_at) then return 'ended'; end if;
  delete from public.challenge_enrollments where challenge_id = p_challenge_id and user_id = auth.uid()
  returning enrolled_at, instagram_id into v_old;
  if not found then return 'not_found'; end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'challenge.leave', 'challenge_enrollments', p_challenge_id::text || ':' || auth.uid()::text,
          jsonb_build_object('enrolled_at', v_old.enrolled_at, 'instagram_id', v_old.instagram_id), null);
  return 'ok';
end;
$$;

-- 참여 신청 정정·대리 신청(운영자): 신청 시각과 인스타그램 아이디. 신청 시각 이후의 참석만 인정되므로,
--   신청이 늦었다는 문의를 바로잡는 수단. 값을 주지 않은 항목(null)은 그대로 둔다. 새로 넣을 때는 둘 다 필요하다.
--   결과: ok / forbidden / not_found(챌린지·회원 없음) / invalid(시각이 미래, 새로 넣는데 값이 빠짐) /
--         invalid_instagram / instagram_taken
create or replace function public.challenge_enrollment_admin_set(
  p_challenge_id uuid, p_user_id uuid, p_enrolled_at timestamptz default null, p_instagram_id text default null, p_note text default ''
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old record;
  v_found boolean;
  v_ig text := public.normalize_instagram_id(p_instagram_id);
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  if not exists (select 1 from public.challenges c where c.id = p_challenge_id)
     or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return 'not_found';
  end if;
  if p_enrolled_at is not null and p_enrolled_at > now() then return 'invalid'; end if;
  if p_instagram_id is not null and v_ig is null then return 'invalid_instagram'; end if;
  if v_ig is not null and exists (select 1 from public.challenge_enrollments e
                                   where e.challenge_id = p_challenge_id and e.instagram_id = v_ig and e.user_id <> p_user_id) then
    return 'instagram_taken';
  end if;

  select e.enrolled_at, e.instagram_id into v_old from public.challenge_enrollments e where e.challenge_id = p_challenge_id and e.user_id = p_user_id;
  v_found := found;
  if v_found then
    update public.challenge_enrollments
       set enrolled_at = coalesce(p_enrolled_at, enrolled_at), instagram_id = coalesce(v_ig, instagram_id), updated_at = now()
     where challenge_id = p_challenge_id and user_id = p_user_id;
  else
    if p_enrolled_at is null or v_ig is null then return 'invalid'; end if;
    insert into public.challenge_enrollments (challenge_id, user_id, instagram_id, enrolled_at) values (p_challenge_id, p_user_id, v_ig, p_enrolled_at);
  end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'challenge.enrollment_set', 'challenge_enrollments', p_challenge_id::text || ':' || p_user_id::text,
          case when v_found then jsonb_build_object('enrolled_at', v_old.enrolled_at, 'instagram_id', v_old.instagram_id) end,
          jsonb_build_object('enrolled_at', p_enrolled_at, 'instagram_id', v_ig, 'note', left(btrim(coalesce(p_note, '')), 200)));
  return 'ok';
end;
$$;

-- ── 6) 번개 완료 처리 (호스트) ──────────
-- 번개 시작 시각이 지난 뒤, 호스트가 실제로 온 사람을 골라 확정한다. 한 번 확정하면 호스트는 고칠 수 없다(운영자만).
--   p_present = 참석한 사람 / p_absent = 불참한 사람 / 둘 다 아닌 승인 참가자는 미확인으로 남는다.
--   호스트 본인도 p_present 에 있어야 참석으로 인정된다.
--   결과: ok / not_found / forbidden / cancelled / not_started / already_completed / voided(운영자가 무효 처리한 번개) /
--         invalid_member(승인 참가자가 아닌 사람이 섞임) / need_two(참석자 2명 미만)
create or replace function public.meetup_complete(p_meetup_id uuid, p_present uuid[], p_absent uuid[] default '{}')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  m record;
  v_uid uuid := auth.uid();
  v_done text;
  v_id uuid;
  v_members uuid[];
  v_present uuid[];
  v_absent uuid[];
begin
  if v_uid is null then return 'forbidden'; end if;
  select id, host_id, status, start_time, title, location_name into m from public.meetups where id = p_meetup_id for no key update;
  if not found then return 'not_found'; end if;
  if m.host_id <> v_uid and public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  if m.status = 'cancelled' then return 'cancelled'; end if;
  if m.start_time > now() then return 'not_started'; end if;
  select c.status into v_done from public.meetup_completions c where c.meetup_id = p_meetup_id;
  if found then return case when v_done = 'voided' then 'voided' else 'already_completed' end; end if;

  -- 고를 수 있는 사람: 승인된 참가자 + 호스트
  select array_agg(distinct s.u) into v_members
    from (select p.user_id as u from public.meetup_participants p where p.meetup_id = p_meetup_id and p.status = 'approved'
          union select m.host_id) s;
  select coalesce(array_agg(distinct x), '{}') into v_present from unnest(coalesce(p_present, '{}'::uuid[])) x where x is not null;
  select coalesce(array_agg(distinct x), '{}') into v_absent from unnest(coalesce(p_absent, '{}'::uuid[])) x where x is not null;
  if not (v_present <@ v_members) or not (v_absent <@ v_members) or (v_present && v_absent) then return 'invalid_member'; end if;
  if cardinality(v_present) < 2 then return 'need_two'; end if;

  insert into public.meetup_completions (meetup_id, host_id, meetup_title, location_name, meetup_start_time, present_count, status, completed_at, completed_by)
  values (p_meetup_id, m.host_id, m.title, m.location_name, m.start_time, cardinality(v_present), 'completed', now(), v_uid)
  returning id into v_id;
  insert into public.meetup_attendance (completion_id, user_id, meetup_id, status, marked_by)
  select v_id, x, p_meetup_id,
         case when x = any (v_present) then 'present' when x = any (v_absent) then 'absent' else 'unknown' end,
         v_uid
    from unnest(v_members) x;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (v_uid, public.my_role(), 'meetup.complete', 'meetup_completions', v_id::text, null,
          jsonb_build_object('meetup_id', p_meetup_id, 'present', to_jsonb(v_present), 'absent', to_jsonb(v_absent), 'members', cardinality(v_members)));
  return 'ok';
end;
$$;

-- ── 7) 운영자 정정 ──────────
-- 출석 고치기. 결과: ok / forbidden / invalid / not_found / invalid_member
create or replace function public.meetup_attendance_admin_set(p_completion_id uuid, p_user_id uuid, p_status text, p_note text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  v_old text;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  if p_status is null or p_status not in ('present', 'absent', 'unknown') then return 'invalid'; end if;
  select id, meetup_id, host_id into c from public.meetup_completions where id = p_completion_id for update;
  if not found then return 'not_found'; end if;

  select a.status into v_old from public.meetup_attendance a where a.completion_id = p_completion_id and a.user_id = p_user_id;
  if not found then
    -- 출석 명단에 없던 사람은 그 번개의 승인 참가자이거나 호스트일 때만 넣을 수 있다
    if not exists (select 1 from public.meetup_participants p where p.meetup_id = c.meetup_id and p.user_id = p_user_id and p.status = 'approved')
       and c.host_id is distinct from p_user_id then
      return 'invalid_member';
    end if;
    insert into public.meetup_attendance (completion_id, user_id, meetup_id, status, marked_by)
    values (p_completion_id, p_user_id, c.meetup_id, p_status, auth.uid());
  else
    update public.meetup_attendance
       set status = p_status, marked_by = auth.uid(), marked_at = now(), updated_at = now()
     where completion_id = p_completion_id and user_id = p_user_id;
  end if;
  -- 참석 인원은 바뀐 만큼만 더하고 뺀다(탈퇴로 출석 행이 사라진 사람 몫은 그대로 둔다)
  update public.meetup_completions
     set present_count = greatest(0, present_count + (p_status = 'present')::int - (coalesce(v_old, '') = 'present')::int), updated_at = now()
   where id = p_completion_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'meetup.attendance_set', 'meetup_attendance', p_completion_id::text || ':' || p_user_id::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'note', left(btrim(coalesce(p_note, '')), 200)));
  return 'ok';
end;
$$;

-- 완료 무효 처리 / 무효 취소. p_status: 'voided' | 'completed'. 결과: ok / forbidden / invalid / not_found /
--   cancelled(무효로 둔 사이 호스트가 번개를 취소함 — 취소된 번개는 인정하지 않으므로 무효를 되돌릴 수 없다)
--   완료 처리 시각(completed_at)은 바꾸지 않는다 → 무효를 취소하면 원래 날짜로 다시 인정된다.
create or replace function public.meetup_completion_admin_set(p_completion_id uuid, p_status text, p_reason text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old text;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  if p_status is null or p_status not in ('voided', 'completed') then return 'invalid'; end if;
  select c.status into v_old from public.meetup_completions c where c.id = p_completion_id for update;
  if not found then return 'not_found'; end if;
  if p_status = 'completed' and exists (select 1 from public.meetup_completions c join public.meetups m on m.id = c.meetup_id
                                         where c.id = p_completion_id and m.status = 'cancelled') then
    return 'cancelled';
  end if;

  update public.meetup_completions
     set status = p_status, voided_at = case when p_status = 'voided' then now() else null end, updated_at = now()
   where id = p_completion_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'meetup.completion_set', 'meetup_completions', p_completion_id::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'reason', left(btrim(coalesce(p_reason, '')), 200)));
  return 'ok';
end;
$$;

-- 완료 처리 시각 정정(운영자). 인정 날짜가 완료 처리 시각을 따르므로, 호스트가 늦게 처리했거나 몰아서 처리한 것을 바로잡는 수단.
--   번개 시작 시각 이후 ~ 지금 사이로만 옮길 수 있다. 결과: ok / forbidden / invalid / not_found
create or replace function public.meetup_completion_admin_set_time(p_completion_id uuid, p_completed_at timestamptz, p_note text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  select id, completed_at, meetup_start_time into c from public.meetup_completions where id = p_completion_id for update;
  if not found then return 'not_found'; end if;
  if p_completed_at is null or p_completed_at < c.meetup_start_time or p_completed_at > now() then return 'invalid'; end if;

  update public.meetup_completions set completed_at = p_completed_at, updated_at = now() where id = p_completion_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'meetup.completion_time', 'meetup_completions', p_completion_id::text,
          jsonb_build_object('completed_at', c.completed_at),
          jsonb_build_object('completed_at', p_completed_at, 'note', left(btrim(coalesce(p_note, '')), 200)));
  return 'ok';
end;
$$;

-- ── 8) 집계 ──────────
-- 챌린지 장부(내부용): 참여 신청한 사람의, 기간 안에 완료 처리된 번개 출석 기록 한 줄씩 + 인정 여부.
--   p_user_id 가 null 이면 신청한 모든 사람. 앱에서는 직접 부를 수 없다(아래 함수들이 권한을 확인하고 부른다).
--   참여 신청을 하지 않은 사람은 나오지 않는다.
--   counted  = 실제 참석으로 치는가(신청 이후 + 참석 확정 + 완료 유효 + 취소 아님 + 참석자 2명 이상)
--   credited = 챌린지 실적으로 인정하는가(counted 중, 완료 처리한 날·번개가 열린 날 둘 다 daily_limit 안)
--   reason   = 인정되지 않은 이유: voided / cancelled / absent / unknown / too_few / before_join(참여 신청 전) / daily_limit
--   credit_no = 그 사람의 몇 번째 인정 건인가(완료 처리 시각 순)
--   meetup_id 는 번개가 지워졌으면 null 이다(기록 자체는 남는다).
create or replace function public.challenge_ledger(p_challenge_id uuid, p_user_id uuid default null)
returns table (
  user_id uuid, completion_id uuid, meetup_id uuid, meetup_title text, location_name text, meetup_start_time timestamptz,
  completed_at timestamptz, credit_date date, attendance text, counted boolean, credited boolean, reason text, credit_no int
)
language plpgsql stable
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  ch record;
  rec record;
  v_user uuid := null;
  v_by_done jsonb := '{}';   -- 완료 처리한 날짜별 인정 건수
  v_by_play jsonb := '{}';   -- 번개가 열린 날짜별 인정 건수
  v_no int := 0;
  v_done_key text;
  v_play_key text;
  v_done_n int;
  v_play_n int;
begin
  select c.* into ch from public.challenges c where c.id = p_challenge_id and c.kind = 'meetup_attendance';
  if not found then return; end if;

  for rec in
    select t.uid, t.att, mc.id as cid, mc.meetup_id as mid, mc.meetup_title as title, mc.location_name as loc,
           mc.meetup_start_time as started, mc.status as cstatus, mc.completed_at as done_at, mc.present_count as pc,
           (mc.completed_at >= t.joined) as after_join,                              -- 참여 신청한 뒤에 완료 처리됐는가
           (mc.completed_at at time zone 'Asia/Seoul')::date as done_date,           -- 완료 처리한 날(한국 날짜) = 인정 날짜
           (mc.meetup_start_time at time zone 'Asia/Seoul')::date as play_date,      -- 번개가 열린 날(한국 날짜)
           coalesce(m.status, '') as mstatus                                         -- 번개가 지워졌으면 취소로 보지 않는다
      from (
        -- 한 사람 것: 그 사람의 신청 행·출석 행에서 출발한다(인덱스) — 홈 화면에서 매번 부르는 경로
        select a.user_id as uid, a.completion_id as cid, a.status as att, e.enrolled_at as joined
          from public.challenge_enrollments e
          join public.meetup_attendance a on a.user_id = e.user_id
         where p_user_id is not null and e.challenge_id = p_challenge_id and e.user_id = p_user_id
        union all
        -- 신청한 모든 사람(운영자 현황)
        select a.user_id, a.completion_id, a.status, e.enrolled_at
          from public.challenge_enrollments e
          join public.meetup_attendance a on a.user_id = e.user_id
         where p_user_id is null and e.challenge_id = p_challenge_id
      ) t
      join public.meetup_completions mc on mc.id = t.cid
      left join public.meetups m on m.id = mc.meetup_id
     where mc.meetup_start_time >= ch.starts_at    -- 완료 시점에 적어 둔 시작 시각(나중에 번개를 고쳐도 달라지지 않는다)
       and mc.meetup_start_time <= ch.ends_at
       and mc.completed_at >= ch.starts_at
       and date_trunc('second', mc.completed_at) <= ch.ends_at + make_interval(days => ch.completion_grace_days)
     order by t.uid, mc.completed_at, mc.id        -- 사람별로, 완료 처리가 빠른 것부터 차례로 따진다
  loop
    if v_user is distinct from rec.uid then
      v_user := rec.uid;
      v_by_done := '{}';
      v_by_play := '{}';
      v_no := 0;
    end if;

    user_id := rec.uid;
    completion_id := rec.cid;
    meetup_id := rec.mid;
    meetup_title := rec.title;
    location_name := rec.loc;
    meetup_start_time := rec.started;
    completed_at := rec.done_at;
    credit_date := rec.done_date;
    attendance := rec.att;
    counted := rec.after_join and rec.att = 'present' and rec.cstatus = 'completed' and rec.mstatus <> 'cancelled' and rec.pc >= 2;
    credited := false;
    credit_no := null;
    reason := null;

    if counted then
      v_done_key := rec.done_date::text;
      v_play_key := rec.play_date::text;
      v_done_n := coalesce((v_by_done ->> v_done_key)::int, 0);
      v_play_n := coalesce((v_by_play ->> v_play_key)::int, 0);
      if v_done_n < ch.daily_limit and v_play_n < ch.daily_limit then
        credited := true;
        v_no := v_no + 1;
        credit_no := v_no;
        v_by_done := jsonb_set(v_by_done, array[v_done_key], to_jsonb(v_done_n + 1), true);
        v_by_play := jsonb_set(v_by_play, array[v_play_key], to_jsonb(v_play_n + 1), true);
      else
        reason := 'daily_limit';   -- 그 날(완료 처리한 날 또는 번개가 열린 날)의 한도를 이미 채움
      end if;
    else
      reason := case when rec.cstatus = 'voided' then 'voided'
                     when rec.mstatus = 'cancelled' then 'cancelled'
                     when not rec.after_join then 'before_join'   -- 출석 상태보다 먼저(출석을 고쳐도 인정되지 않는 기록)
                     when rec.att = 'absent' then 'absent'
                     when rec.att = 'unknown' then 'unknown'
                     else 'too_few' end;
    end if;
    return next;
  end loop;
end;
$$;

-- 내 인정 내역(최근 순). 참여 신청을 하지 않았으면 빈 결과. 다른 사람 것은 운영자만. 꺼진 챌린지는 운영자만.
create or replace function public.challenge_entries(p_challenge_id uuid, p_user_id uuid default null)
returns table (
  user_id uuid, completion_id uuid, meetup_id uuid, meetup_title text, location_name text, meetup_start_time timestamptz,
  completed_at timestamptz, credit_date date, attendance text, counted boolean, credited boolean, reason text, credit_no int
)
language sql stable
security definer set search_path = public
as $$
  select l.*
    from public.challenge_ledger(p_challenge_id, coalesce(p_user_id, auth.uid())) l
   where auth.uid() is not null
     and (coalesce(p_user_id, auth.uid()) = auth.uid() or public.my_role() = 'super_admin')
     and (public.my_role() = 'super_admin'
          or exists (select 1 from public.challenges c where c.id = p_challenge_id and c.active))
   order by l.completed_at desc, l.completion_id;
$$;

-- 내 진행률 한 줄(+ 내 신청 시각·인스타그램 아이디). 참여 신청 전이어도 한 줄이 나온다(enrolled = false, 횟수 0). 꺼졌거나 없는 챌린지는 0줄. 다른 사람 것은 운영자만.
--   actual_count = 실제 참석 횟수 / credited_count = 하루 한도를 적용한 인정 횟수 / progress = min(인정, 목표)
create or replace function public.challenge_progress(p_challenge_id uuid, p_user_id uuid default null)
returns table (
  challenge_id uuid, user_id uuid, enrolled boolean, enrolled_at timestamptz, instagram_id text,
  actual_count int, credited_count int, goal_count int, progress int, achieved boolean, achieved_at timestamptz
)
language sql stable
security definer set search_path = public
as $$
  select ch.id, coalesce(p_user_id, auth.uid()), e.user_id is not null, e.enrolled_at, e.instagram_id,
         coalesce(s.actual_count, 0), coalesce(s.credited_count, 0), ch.goal_count,
         least(coalesce(s.credited_count, 0), ch.goal_count),
         coalesce(s.credited_count, 0) >= ch.goal_count,
         s.achieved_at
    from public.challenges ch
    left join public.challenge_enrollments e on e.challenge_id = ch.id and e.user_id = coalesce(p_user_id, auth.uid())
    left join lateral (
      select (count(*) filter (where l.counted))::int as actual_count,
             (count(*) filter (where l.credited))::int as credited_count,
             min(l.completed_at) filter (where l.credit_no = ch.goal_count) as achieved_at
        from public.challenge_ledger(ch.id, coalesce(p_user_id, auth.uid())) l
    ) s on true
   where ch.id = p_challenge_id
     and auth.uid() is not null
     and (coalesce(p_user_id, auth.uid()) = auth.uid() or public.my_role() = 'super_admin')
     and (ch.active or public.my_role() = 'super_admin');
$$;

-- 참여 현황(운영자): 참여 신청한 모든 사람의 요약(기록이 아직 없는 사람 포함). 인정 횟수 많은 순, 같으면 먼저 달성한 순.
--   마지막 정렬 기준은 회원 id — 닉네임은 겹칠 수 있어, 나눠 읽을 때 순서가 흔들리지 않게 한다.
create or replace function public.challenge_participants(p_challenge_id uuid)
returns table (
  user_id uuid, nickname text, email text, actual_count int, credited_count int, goal_count int,
  progress int, achieved boolean, achieved_at timestamptz, last_credited_at timestamptz, enrolled_at timestamptz, instagram_id text
)
language sql stable
security definer set search_path = public
as $$
  select e.user_id, p.nickname, u.email::text,
         coalesce(s.actual_count, 0), coalesce(s.credited_count, 0), ch.goal_count,
         least(coalesce(s.credited_count, 0), ch.goal_count),
         coalesce(s.credited_count, 0) >= ch.goal_count,
         s.achieved_at, s.last_credited_at, e.enrolled_at, e.instagram_id
    from public.challenges ch
    join public.challenge_enrollments e on e.challenge_id = ch.id
    join public.profiles p on p.id = e.user_id
    left join auth.users u on u.id = e.user_id
    left join (
      select l.user_id,
             (count(*) filter (where l.counted))::int as actual_count,
             (count(*) filter (where l.credited))::int as credited_count,
             min(l.completed_at) filter (where l.credit_no = (select c.goal_count from public.challenges c where c.id = p_challenge_id)) as achieved_at,
             max(l.completed_at) filter (where l.credited) as last_credited_at
        from public.challenge_ledger(p_challenge_id, null) l
       group by l.user_id
    ) s on s.user_id = e.user_id
   where ch.id = p_challenge_id
     and public.my_role() = 'super_admin'
   order by 5 desc, 9 asc nulls last, 2, 1;
$$;

-- ── 9) 실행 권한 ──────────
revoke all on function public.meetup_participants_guard() from public, anon, authenticated;
revoke all on function public.meetups_guard() from public, anon, authenticated;
revoke all on function public.challenges_touch() from public, anon, authenticated;
revoke all on function public.meetup_is_completed(uuid) from public;
revoke all on function public.meetup_complete(uuid, uuid[], uuid[]) from public, anon;
revoke all on function public.meetup_attendance_admin_set(uuid, uuid, text, text) from public, anon;
revoke all on function public.meetup_completion_admin_set(uuid, text, text) from public, anon;
revoke all on function public.meetup_completion_admin_set_time(uuid, timestamptz, text) from public, anon;
revoke all on function public.normalize_instagram_id(text) from public, anon;
revoke all on function public.challenge_join(uuid, text) from public, anon;
revoke all on function public.challenge_leave(uuid) from public, anon;
revoke all on function public.challenge_enrollment_admin_set(uuid, uuid, timestamptz, text, text) from public, anon;
revoke all on function public.challenge_ledger(uuid, uuid) from public, anon, authenticated;   -- 내부용
revoke all on function public.challenge_entries(uuid, uuid) from public, anon;
revoke all on function public.challenge_progress(uuid, uuid) from public, anon;
revoke all on function public.challenge_participants(uuid) from public, anon;
grant execute on function public.meetup_is_completed(uuid) to anon, authenticated, service_role;   -- 삭제 제한 정책이 요청자 권한으로 부른다
grant execute on function public.meetup_complete(uuid, uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.meetup_attendance_admin_set(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.meetup_completion_admin_set(uuid, text, text) to authenticated, service_role;
grant execute on function public.meetup_completion_admin_set_time(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.normalize_instagram_id(text) to authenticated, service_role;
grant execute on function public.challenge_join(uuid, text) to authenticated, service_role;
grant execute on function public.challenge_leave(uuid) to authenticated, service_role;
grant execute on function public.challenge_enrollment_admin_set(uuid, uuid, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.challenge_ledger(uuid, uuid) to service_role;
grant execute on function public.challenge_entries(uuid, uuid) to authenticated, service_role;
grant execute on function public.challenge_progress(uuid, uuid) to authenticated, service_role;
grant execute on function public.challenge_participants(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
-- ══ /번개 완료·출석 + 챌린지 ══

-- ══ 단체전 소속 클럽 + 용병 ══ (0101_team_club.sql 과 같은 내용)
-- 0101: 단체전 팀의 소속 클럽 + 용병
--
-- 단체전은 주장이 자기가 속한(승인된) 클럽을 골라 신청한다. 팀원은 그 클럽의 승인 회원이 기본이고,
-- 클럽 밖 회원은 '용병'으로 표시해 넣는다. 한 클럽에서 여러 팀이 나갈 수 있다(팀 이름으로 구분 —
-- 기본은 클럽 이름, 주장이 바꿀 수 있고 운영자도 관리자 웹에서 고칠 수 있다).
-- 클럽을 고르지 않은 팀(이 기능이 없는 옛 앱)도 그대로 받는다 — 운영자가 신청현황에서 클럽·용병을 보고 승인한다.
--
-- 서버가 막는 것(앱 화면만 믿지 않게):
--   · 클럽을 고른 팀의 주장은 그 클럽의 승인 회원이어야 한다
--   · 클럽을 고른 팀에 용병이 아닌 팀원으로 넣는 사람도 그 클럽의 승인 회원이어야 한다
--   운영자(super_admin)와 서버(로그인 없음)는 통과 — 데이터 정정용.

alter table public.tournament_teams
  add column if not exists club_id uuid references public.clubs(id) on delete set null;
create index if not exists tournament_teams_club_idx on public.tournament_teams (club_id);

alter table public.tournament_team_members
  add column if not exists is_guest boolean not null default false;   -- 용병(클럽 밖 회원)

create or replace function public.tournament_team_club_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_club uuid;
  v_captain uuid;
begin
  if auth.uid() is null or public.my_role() = 'super_admin' then
    return new;
  end if;

  if tg_table_name = 'tournament_teams' then
    if new.club_id is not null
       and (tg_op = 'INSERT' or new.club_id is distinct from old.club_id or new.captain_id is distinct from old.captain_id)
       and not exists (select 1 from public.club_members cm
                        where cm.club_id = new.club_id and cm.user_id = new.captain_id and cm.status = 'approved') then
      raise exception '자기가 속한 클럽으로만 신청할 수 있어요.';
    end if;
    return new;
  end if;

  -- tournament_team_members
  select tt.club_id, tt.captain_id into v_club, v_captain from public.tournament_teams tt where tt.id = new.team_id;
  if v_club is not null and not new.is_guest and new.user_id is distinct from v_captain
     and not exists (select 1 from public.club_members cm
                      where cm.club_id = v_club and cm.user_id = new.user_id and cm.status = 'approved') then
    raise exception '클럽 회원이 아닌 사람은 용병으로 추가해 주세요.';
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_teams_club_guard on public.tournament_teams;
create trigger tournament_teams_club_guard
  before insert or update of club_id, captain_id on public.tournament_teams
  for each row execute function public.tournament_team_club_guard();

drop trigger if exists tournament_team_members_club_guard on public.tournament_team_members;
create trigger tournament_team_members_club_guard
  before insert or update of user_id, is_guest on public.tournament_team_members
  for each row execute function public.tournament_team_club_guard();

revoke all on function public.tournament_team_club_guard() from public, anon, authenticated;

-- 대회 목록·상세의 "참가 현황": 단체전은 개인 신청이 아니라 팀 수를 센다(전에는 늘 0 으로 보였다).
--   뷰만 바꾸므로 이미 깔린 앱에도 바로 반영된다. t.* 를 쓰는 뷰라 drop 후 다시 만든다(0059·0084 와 같은 방식).
drop view if exists public.tournaments_with_counts;
create view public.tournaments_with_counts
with (security_invoker = true)
as
select
  t.*,
  p.nickname   as organizer_nickname,
  p.avatar_url as organizer_avatar_url,
  case when t.format = 'team'
       then (select count(*) from public.tournament_teams tt where tt.tournament_id = t.id and tt.status = 'approved')
       else (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.status = 'approved')
  end as approved_count,
  case when t.format = 'team'
       then (select count(*) from public.tournament_teams tt where tt.tournament_id = t.id and tt.status = 'pending')
       else (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.status = 'pending')
  end as pending_count
from public.tournaments t
join public.profiles p on p.id = t.organizer_id;

notify pgrst, 'reload schema';
-- ══ /단체전 소속 클럽 + 용병 ══

-- ══ 단체전 팀 최소 인원 보정 ══ (0103_team_min_size.sql 과 같은 내용)
-- 0103: 단체전 팀 최소 인원·종목 표시 보정
--
-- ① 팀 최소 인원: 0102 로 한 대결 안에서 한 선수는 한 게임만 나간다. 그래서 팀에는 적어도 '단식 수 + 복식 수×2' 명이
--    있어야 오더를 낼 수 있다. 단체전을 만들거나 대결 구성을 바꿀 때 팀 최소 인원(team_min_size)이 그보다 작으면
--    서버가 그 수로 올린다 — 관리자 웹·앱 클럽 대회 만들기 모두(앱 클럽 대회는 기본값 2명·단식 2·복식 1 을 그대로 쓴다).
--    그보다 크게 잡은 값은 그대로 둔다.
-- ② 종목(discipline): 단체전 만들기 화면에는 종목 칸이 없어 기본값 '단식'으로 들어갔다 — 복식만 하는 단체전에도
--    '단식' 배지가 붙었다. 단체전은 대결 구성에서 정한다: 복식만 있으면 복식, 단식만 있으면 단식(섞여 있으면 그대로).
-- 개인전·KDK 는 건드리지 않는다.
create or replace function public.tournament_team_min_size_fix()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.format = 'team' then
    new.team_min_size := greatest(coalesce(new.team_min_size, 0),
                                  coalesce(new.tie_singles, 0) + 2 * coalesce(new.tie_doubles, 0));
    new.discipline := case
      when coalesce(new.tie_singles, 0) = 0 and coalesce(new.tie_doubles, 0) > 0 then 'doubles'
      when coalesce(new.tie_doubles, 0) = 0 and coalesce(new.tie_singles, 0) > 0 then 'singles'
      else new.discipline
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_team_min_size_fix on public.tournaments;
create trigger tournaments_team_min_size_fix
  before insert or update of format, discipline, team_min_size, tie_singles, tie_doubles on public.tournaments
  for each row execute function public.tournament_team_min_size_fix();

revoke all on function public.tournament_team_min_size_fix() from public, anon, authenticated;

-- 이미 있는 단체전도 맞춘다(위 트리거가 같은 값으로 계산한다)
update public.tournaments
   set team_min_size = greatest(team_min_size, tie_singles + 2 * tie_doubles)
 where format = 'team'
   and (team_min_size < tie_singles + 2 * tie_doubles
        or (tie_singles = 0 and tie_doubles > 0 and discipline <> 'doubles')
        or (tie_doubles = 0 and tie_singles > 0 and discipline <> 'singles'));
-- ══ /단체전 팀 최소 인원 보정 ══
