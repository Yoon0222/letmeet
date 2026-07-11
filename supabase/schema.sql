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
  -- DUPR 연동 대비 (현재는 자가입력, 추후 파트너 API 로 검증)
  dupr_id       text,                              -- 사용자의 DUPR 계정 ID
  dupr_rating   numeric(3,1),                      -- DUPR 레이팅 (검증 시 채워짐)
  dupr_verified boolean not null default false,    -- API 로 검증되었는지 여부
  -- 권한(역할): player < organizer < court_manager < super_admin. 부여는 super_admin 만.
  role        text not null default 'player'
              check (role in ('player', 'organizer', 'court_manager', 'super_admin')),
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
  fee           integer not null default 0,        -- 게스트비(원), 0=무료 (0033)
  require_approval boolean not null default false,  -- 참가 신청 승인 필요 여부 (0033)
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
  require_approval boolean not null default false,         -- 가입 승인 필요 여부 (0032)
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
  format                text not null default 'single_elim',  -- 대진 방식(추후)
  status                text not null default 'registration', -- registration | ongoing | finished | cancelled
  group_count           int,                                  -- 조 개수 (대진 생성 시)
  advance_per_group     int,                                  -- 조별 진출 인원
  created_at            timestamptz not null default now()
);
create index if not exists tournaments_start_idx on public.tournaments (start_at);
create index if not exists tournaments_region_idx on public.tournaments (region);

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
    and public.my_role() in ('organizer', 'court_manager', 'super_admin')
  );
drop policy if exists "tournaments_update_organizer" on public.tournaments;
create policy "tournaments_update_organizer" on public.tournaments
  for update using (auth.uid() = organizer_id);
drop policy if exists "tournaments_delete_organizer" on public.tournaments;
create policy "tournaments_delete_organizer" on public.tournaments
  for delete using (auth.uid() = organizer_id);

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
  created_at timestamptz not null default now()
);
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
create table if not exists public.court_payments (
  id           uuid primary key default uuid_generate_v4(),
  order_id     text not null unique,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  court_id     uuid not null references public.courts(id) on delete cascade,
  court_unit   text not null default '',
  slot_date    date not null,
  hours        int[] not null default '{}',
  amount       int not null default 0,
  status       text not null default 'pending' check (status in ('pending','paid','failed','canceled','refunded')),
  provider     text not null default 'portone',
  provider_tx  text,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists court_payments_user_idx on public.court_payments (user_id, created_at desc);
create index if not exists court_payments_status_idx on public.court_payments (status, created_at);
alter table public.court_payments enable row level security;
drop policy if exists "payments_select" on public.court_payments;
create policy "payments_select" on public.court_payments
  for select using (
    auth.uid() = user_id or public.my_role() = 'super_admin'
    or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id)
  );
drop policy if exists "payments_insert_self" on public.court_payments;
create policy "payments_insert_self" on public.court_payments for insert with check (auth.uid() = user_id);
drop policy if exists "payments_update_self" on public.court_payments;
create policy "payments_update_self" on public.court_payments for update using (auth.uid() = user_id);

alter table public.court_reservations add column if not exists payment_id uuid references public.court_payments(id) on delete set null;
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
  target_type    text not null check (target_type in ('meetup','club','profile','tournament')),
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
