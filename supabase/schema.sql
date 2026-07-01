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
  -- DUPR 연동 대비 (현재는 자가입력, 추후 파트너 API 로 검증)
  dupr_id       text,                              -- 사용자의 DUPR 계정 ID
  dupr_rating   numeric(3,1),                      -- DUPR 레이팅 (검증 시 채워짐)
  dupr_verified boolean not null default false,    -- API 로 검증되었는지 여부
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

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
  status        text not null default 'open',     -- 'open' | 'closed' | 'cancelled'
  created_at    timestamptz not null default now()
);

create index if not exists meetups_start_time_idx on public.meetups (start_time);
create index if not exists meetups_region_idx on public.meetups (region);

-- ============================================================
-- 3) meetup_participants : 모임 참가자 (M:N)
-- ============================================================
create table if not exists public.meetup_participants (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
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
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1))
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
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id) as participant_count
from public.meetups m
join public.profiles p on p.id = m.host_id;
