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

-- meetup_matches: 조회 공개, 쓰기는 해당 번개 호스트만 (0059).
alter table public.meetup_matches enable row level security;
drop policy if exists meetup_matches_select on public.meetup_matches;
create policy meetup_matches_select on public.meetup_matches for select using (true);
drop policy if exists meetup_matches_write_host on public.meetup_matches;
create policy meetup_matches_write_host on public.meetup_matches for all
  using (exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid()))
  with check (exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid()));

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
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id and mp.status = 'approved') as participant_count
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
  created_at  timestamptz not null default now()
);
create index if not exists clubs_region_idx on public.clubs (region);

create table if not exists public.club_members (
  club_id   uuid not null references public.clubs(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member',   -- 'owner' | 'member'
  status    text not null default 'approved', -- 'pending' | 'approved' (0032)
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

drop policy if exists "club_members_insert_self" on public.club_members;
create policy "club_members_insert_self" on public.club_members
  for insert with check (auth.uid() = user_id);

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
    and exists (
      select 1 from public.clubs c
      where c.id = club_match_results.club_id
        and c.tier = 'premium'
        and (
          c.premium_status = 'active'
          or (c.premium_status = 'trialing' and c.premium_trial_ends_at > now())
        )
    )
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
  updated_at           timestamptz not null default now()
);
create index if not exists club_subscriptions_due_idx
  on public.club_subscriptions (next_charge_at) where status in ('active', 'past_due');
alter table public.club_subscriptions enable row level security;
drop policy if exists "club_subs_select_owner" on public.club_subscriptions;
create policy "club_subs_select_owner" on public.club_subscriptions for select using (auth.uid() = owner_id);
revoke select on public.club_subscriptions from authenticated, anon;
grant select (id, club_id, owner_id, card_company, card_number_masked, amount, status,
              current_period_start, current_period_end, next_charge_at, last_charge_at,
              fail_count, canceled_at, created_at, updated_at)
  on public.club_subscriptions to authenticated;

create table if not exists public.club_subscription_charges (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.club_subscriptions(id) on delete cascade,
  club_id         uuid not null references public.clubs(id) on delete cascade,
  amount          int not null,
  status          text not null check (status in ('paid','failed')),
  toss_payment_key text,
  order_id        text,
  fail_reason     text,
  charged_at      timestamptz not null default now()
);
create index if not exists club_sub_charges_sub_idx
  on public.club_subscription_charges (subscription_id, charged_at desc);
alter table public.club_subscription_charges enable row level security;
drop policy if exists "club_sub_charges_select_owner" on public.club_subscription_charges;
create policy "club_sub_charges_select_owner" on public.club_subscription_charges for select using (
  exists (select 1 from public.club_subscriptions s where s.id = subscription_id and s.owner_id = auth.uid())
);

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
    join public.clubs c on c.id = s.club_id
    where s.active
      and (p_club_id is null or s.club_id = p_club_id)
      and c.tier = 'premium'
      and (c.premium_status = 'active'
           or (c.premium_status = 'trialing' and c.premium_trial_ends_at is not null and c.premium_trial_ends_at > now()))
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
  (select count(*) from public.club_members cm where cm.club_id = c.id and cm.status = 'approved') as member_count
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
create or replace function public.set_tie_lineup(p_tie_match uuid, p_side text, p_players uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ok boolean;
  v_ready boolean;
begin
  if p_side not in ('team1', 'team2') then raise exception 'invalid side'; end if;
  select exists (
    select 1 from public.tie_matches tm
    join public.tournament_ties tt on tt.id = tm.tie_id
    join public.tournament_teams team
      on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
    where tm.id = p_tie_match and team.captain_id = auth.uid()
  ) into v_ok;
  if not v_ok then raise exception 'not captain of this side'; end if;
  select (case when p_side = 'team1' then tt.team1_lineup_ready else tt.team2_lineup_ready end) into v_ready
  from public.tie_matches tm join public.tournament_ties tt on tt.id = tm.tie_id where tm.id = p_tie_match;
  if v_ready then raise exception 'lineup already submitted'; end if;
  if p_side = 'team1' then
    update public.tie_matches set team1_players = p_players where id = p_tie_match;
  else
    update public.tie_matches set team2_players = p_players where id = p_tie_match;
  end if;
end;
$$;

-- 오더 제출(잠금): 모든 서브매치 라인업 완성 시 제출 (0041). 양 팀 제출 시 공개.
create or replace function public.submit_tie_lineup(p_tie uuid, p_side text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_cap boolean;
  v_incomplete int;
begin
  if p_side not in ('team1', 'team2') then raise exception 'invalid side'; end if;
  select exists (
    select 1 from public.tournament_ties tt
    join public.tournament_teams team on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
    where tt.id = p_tie and team.captain_id = auth.uid()
  ) into v_cap;
  if not v_cap then raise exception 'not captain of this side'; end if;
  select count(*) into v_incomplete from public.tie_matches tm
  where tm.tie_id = p_tie
    and coalesce(array_length(case when p_side = 'team1' then tm.team1_players else tm.team2_players end, 1), 0)
        <> (case when tm.kind = 'singles' then 1 else 2 end);
  if v_incomplete > 0 then raise exception 'lineup incomplete'; end if;
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
      or (club_id is not null and exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())) -- 클럽장 월례대회(0064)
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
  v_actor uuid := auth.uid();
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
-- 회원 탈퇴 (계정 삭제) — 0012
-- SECURITY DEFINER RPC 로 본인 auth.users 삭제 → profiles 등 연쇄 정리.
-- ============================================================
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
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
  if exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = new.tournament_id
      and (e.user_id = new.user_id or e.partner_id = new.user_id)
  ) then
    raise exception '이미 이 대회에 참가 신청되어 있어요.';
  end if;
  if new.partner_id is not null and exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = new.tournament_id
      and (e.user_id = new.partner_id or e.partner_id = new.partner_id)
  ) then
    raise exception '선택한 파트너는 이미 이 대회에 참가 중이에요.';
  end if;
  return new;
end;
$$;
drop trigger if exists on_no_double_entry on public.tournament_entries;
create trigger on_no_double_entry
  before insert on public.tournament_entries
  for each row execute function public.enforce_no_double_entry();

-- 대기열: 정원 초과 신청은 waitlist, 슬롯이 비면 대기 맨 앞 자동 승격 (0016)
create or replace function public.enforce_waitlist()
returns trigger language plpgsql security definer as $$
declare cap int; occupied int;
begin
  if new.status = 'pending' then
    select max_participants into cap from public.tournaments where id = new.tournament_id;
    select count(*) into occupied from public.tournament_entries
      where tournament_id = new.tournament_id and status in ('pending', 'approved');
    if cap is not null and occupied >= cap then
      new.status := 'waitlist';
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
declare cap int; occupied int; tid uuid; nextw uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  tid := coalesce(new.tournament_id, old.tournament_id);
  select max_participants into cap from public.tournaments where id = tid;
  if cap is null then return null; end if;
  loop
    select count(*) into occupied from public.tournament_entries
      where tournament_id = tid and status in ('pending', 'approved');
    exit when occupied >= cap;
    select user_id into nextw from public.tournament_entries
      where tournament_id = tid and status = 'waitlist'
      order by created_at asc limit 1;
    exit when nextw is null;
    update public.tournament_entries set status = 'pending'
      where tournament_id = tid and user_id = nextw;
  end loop;
  return null;
end; $$;
drop trigger if exists on_waitlist_promote on public.tournament_entries;
create trigger on_waitlist_promote
  after update or delete on public.tournament_entries
  for each row execute function public.promote_waitlist();

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

  insert into public.notifications (user_id, type, title, body, target_type, target_id, actor_id)
  values (p_user, p_type, p_title, p_body, p_target_type, p_target_id, p_actor);

  select push_token into v_token from public.profiles where id = p_user;
  if v_token is null or v_token = '' then return; end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', v_token,
      'sound', 'default',
      'title', p_title,
      'body', p_body,
      'data', jsonb_build_object('target_type', p_target_type, 'target_id', p_target_id)
    )
  );
end;
$$;

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
