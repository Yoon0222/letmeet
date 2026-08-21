-- ============================================================
-- 피넛 PROD 반영 — 클럽 프리미엄/임원/월례대회/정기모임/DUPR/스토리지/알림
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)  ※ dev(pjfhxk…) 아님 주의
-- 범위: 마이그레이션 0063 ~ 0075 일괄 (전부 idempotent — 재실행 안전)
-- 선행: 0003(clubs)·0032(club_members)·0053~0056(알림/DUPR) 이 prod에 있어야 함.
--       (아래 스모크 쿼리로 먼저 확인 권장)
-- 실행: 운영 SQL Editor 에 통째로 붙여넣기.  적용 후 dupr-match 엣지함수 재배포 필수.
-- ============================================================


-- ═══════════════════════════════════════════════════════════
-- 0063_club_premium_match_results.sql
-- ═══════════════════════════════════════════════════════════
-- 0063: 클럽 프리미엄 상태 + 클럽 경기 결과 기록.

alter table public.clubs
  add column if not exists tier text not null default 'free',
  add column if not exists premium_status text not null default 'none',
  add column if not exists premium_trial_ends_at timestamptz,
  add column if not exists premium_started_at timestamptz;

alter table public.clubs drop constraint if exists clubs_tier_check;
alter table public.clubs add constraint clubs_tier_check check (tier in ('free','premium'));

alter table public.clubs drop constraint if exists clubs_premium_status_check;
alter table public.clubs add constraint clubs_premium_status_check
  check (premium_status in ('none','trialing','active','past_due','canceled'));

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
  created_at     timestamptz not null default now(),
  check (team1_player1 <> team2_player1)
);

create index if not exists club_match_results_club_date_idx
  on public.club_match_results (club_id, match_date desc, created_at desc);

alter table public.club_match_results enable row level security;

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

-- ═══════════════════════════════════════════════════════════
-- 0064_club_officers_tournaments.sql
-- ═══════════════════════════════════════════════════════════
-- 0064: 클럽 임원진(officer) + 클럽 월례대회(tournaments.club_id)
--   · 임원진: club_members.role 에 'officer' 사용(기존 컬럼, CHECK 없음). 임명=클럽장 전용,
--     가입 승인/거절=클럽장 또는 임원. 임원은 관리 도우미(승인/거절·경기결과 기록).
--   · 월례대회: tournaments.club_id 로 클럽에 연결. 클럽장이 자기 클럽 대회를 직접 생성.

-- 1) tournaments ↔ clubs 링크 (null = 일반 대회 / 값 = 클럽 월례대회)
alter table public.tournaments add column if not exists club_id uuid references public.clubs(id) on delete set null;
create index if not exists tournaments_club_idx on public.tournaments (club_id, start_at desc);

-- 2) 대회 생성 정책 확장: 기존 organizer/admin + "자기 클럽 대회를 만드는 클럽장"
drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer" on public.tournaments
  for insert with check (
    auth.uid() = organizer_id
    and (
      public.my_role() in ('organizer', 'court_manager', 'super_admin')
      or (club_id is not null and exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid()))
    )
  );

-- 3) 임원 임명/해제 (클럽장 전용). owner 는 변경 대상 아님.
create or replace function public.set_club_officer(p_club_id uuid, p_user_id uuid, p_make_officer boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.clubs where id = p_club_id and owner_id = auth.uid()) then
    raise exception 'forbidden: owner only';
  end if;
  update public.club_members
     set role = case when p_make_officer then 'officer' else 'member' end
   where club_id = p_club_id and user_id = p_user_id and role <> 'owner' and status = 'approved';
end $$;
grant execute on function public.set_club_officer(uuid, uuid, boolean) to authenticated;

-- 4) 가입 승인/거절 (클럽장 또는 임원). 승인=status 'approved', 거절=pending 행 삭제.
create or replace function public.review_club_member(p_club_id uuid, p_user_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public
as $$
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

-- ═══════════════════════════════════════════════════════════
-- 0065_club_match_dupr.sql
-- ═══════════════════════════════════════════════════════════
-- 0065: 클럽 경기결과(club_match_results) DUPR 등록 대비 컬럼
--   · 클럽 내부 경기결과도 DUPR 에 제출(match/create) → 레이팅 반영.
--     번개/대회와 동일한 dupr_* 상태 컬럼을 둔다(엣지함수 dupr-match 의 source='club').
--   · 단일 게임 스코어(team1_score:team2_score)를 1게임으로 매핑해 제출.

alter table public.club_match_results
  add column if not exists dupr_identifier   text unique,                   -- 'club:'||id
  add column if not exists dupr_match_code    text,                          -- DUPR matchCode(수정/삭제용)
  add column if not exists dupr_status         text not null default 'pending'
    check (dupr_status in ('pending', 'submitted', 'failed', 'skipped')),
  add column if not exists dupr_submitted_at   timestamptz,
  add column if not exists dupr_error          text;

-- ═══════════════════════════════════════════════════════════
-- 0066_clubs_view_premium.sql
-- ═══════════════════════════════════════════════════════════
-- 0066: clubs_with_counts 뷰 재생성 — 프리미엄 컬럼(0063) 노출 누락 수정.
--   Postgres 는 뷰 생성 시점의 c.* 를 컬럼 목록으로 고정한다. 0063 에서 clubs 에
--   tier/premium_status/premium_trial_ends_at/premium_started_at 를 추가했지만 뷰를
--   재생성하지 않아, 앱(clubs_with_counts 조회)에서 tier 등이 안 내려와 프리미엄 클럽이
--   무료로 취급됐다(무료체험 버튼 계속 노출). c.* 재확장으로 새 컬럼을 포함시킨다.

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

-- ═══════════════════════════════════════════════════════════
-- 0067_club_sessions.sql
-- ═══════════════════════════════════════════════════════════
-- 0067: 클럽 정기모임(세션) — 참석 투표 → 아메리카노 복식 대진 → 결과.
--   흐름: 클럽장/임원이 모임 생성 → 클럽원 참석 투표 → 투표자 기반 대진 자동 생성
--         → 코트별 진행 → 판별 결과 입력 → (DUPR 등록은 0068/엣지함수 source='club_session').
--   대진 편성 알고리즘은 클라이언트(src/lib/americano.ts)에서 계산해 아래 테이블에 insert.

-- 1) 세션(모임)
create table if not exists public.club_sessions (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  title        text not null default '',
  session_date date not null default current_date,
  start_at     timestamptz,                                   -- 모임 시각(선택)
  location     text not null default '',
  court_count  int  not null default 1 check (court_count between 1 and 20),
  point_target int  not null default 16 check (point_target between 1 and 99), -- 판당 목표 점수
  format       text not null default 'americano' check (format in ('americano')),
  status       text not null default 'voting'
               check (status in ('voting', 'matched', 'ongoing', 'finished', 'canceled')),
  created_at   timestamptz not null default now()
);
create index if not exists club_sessions_club_idx on public.club_sessions (club_id, session_date desc, created_at desc);

-- 2) 참석 투표 (본인이 참석/불참 표시)
create table if not exists public.club_session_players (
  session_id uuid not null references public.club_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'in' check (status in ('in', 'out')),
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- 3) 생성된 대진 + 결과 (아메리카노: 라운드×코트, 복식 고정)
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
  status         text not null default 'scheduled' check (status in ('scheduled', 'done')),
  -- DUPR (0068/엣지함수 source='club_session')
  dupr_identifier   text unique,
  dupr_match_code   text,
  dupr_status       text not null default 'pending' check (dupr_status in ('pending', 'submitted', 'failed', 'skipped')),
  dupr_submitted_at timestamptz,
  dupr_error        text,
  created_at     timestamptz not null default now()
);
create index if not exists club_session_matches_session_idx on public.club_session_matches (session_id, round_no, court_no);

-- ── 관리 권한 헬퍼: 해당 세션 클럽의 클럽장/임원인가 ──────────────────
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

-- 승인된 클럽원인가(참석 투표 자격)
create or replace function public.is_club_session_member(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_sessions s
    join public.club_members m on m.club_id = s.club_id
    where s.id = p_session_id and m.user_id = auth.uid() and m.status = 'approved'
  );
$$;

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.club_sessions enable row level security;
alter table public.club_session_players enable row level security;
alter table public.club_session_matches enable row level security;

-- 세션: 조회 공개, 생성/수정/삭제=클럽장/임원
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

-- 참석 투표: 조회 공개. 본인 투표는 본인이(승인 클럽원), 관리자는 누구든.
drop policy if exists "club_session_players_select" on public.club_session_players;
create policy "club_session_players_select" on public.club_session_players for select using (true);

drop policy if exists "club_session_players_upsert_self" on public.club_session_players;
create policy "club_session_players_upsert_self" on public.club_session_players
  for insert with check (
    (auth.uid() = user_id and public.is_club_session_member(session_id))
    or public.is_club_session_manager(session_id)
  );

drop policy if exists "club_session_players_update_self" on public.club_session_players;
create policy "club_session_players_update_self" on public.club_session_players
  for update using (auth.uid() = user_id or public.is_club_session_manager(session_id));

drop policy if exists "club_session_players_delete_self" on public.club_session_players;
create policy "club_session_players_delete_self" on public.club_session_players
  for delete using (auth.uid() = user_id or public.is_club_session_manager(session_id));

-- 대진/결과: 조회 공개, 생성/수정/삭제=클럽장/임원
drop policy if exists "club_session_matches_select" on public.club_session_matches;
create policy "club_session_matches_select" on public.club_session_matches for select using (true);

drop policy if exists "club_session_matches_insert_manager" on public.club_session_matches;
create policy "club_session_matches_insert_manager" on public.club_session_matches
  for insert with check (public.is_club_session_manager(session_id));

drop policy if exists "club_session_matches_update_manager" on public.club_session_matches;
create policy "club_session_matches_update_manager" on public.club_session_matches
  for update using (public.is_club_session_manager(session_id));

drop policy if exists "club_session_matches_delete_manager" on public.club_session_matches;
create policy "club_session_matches_delete_manager" on public.club_session_matches
  for delete using (public.is_club_session_manager(session_id));

-- ═══════════════════════════════════════════════════════════
-- 0068_club_session_rules.sql
-- ═══════════════════════════════════════════════════════════
-- 0068: 클럽 세션 운영 규칙 반영.
--   · 투표 마감일(vote_deadline): 마감 후엔 일반 클럽원 투표 불가(임원만 명단 조정).
--   · 결과 입력: 매치에 참여한 플레이어(4명 중 누구나)도 점수 입력 가능(관리자 외).
--   (대진 당일 00:01 오픈, 자동/수동/자동+수정은 클라이언트 로직으로 처리 — 스키마 변경 없음)

alter table public.club_sessions
  add column if not exists vote_deadline timestamptz;  -- 투표 마감(그 전까지만 일반 클럽원 투표)

-- 투표 진행중(마감 전)인가 — 일반 클럽원 자기 투표 가능 조건.
create or replace function public.is_club_session_voting_open(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_sessions s
    where s.id = p_session_id
      and s.status = 'voting'
      and (s.vote_deadline is null or now() < s.vote_deadline)
  );
$$;

-- 매치 참여 플레이어인가 — 결과 입력 권한.
create or replace function public.is_club_session_match_player(p_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_session_matches m
    where m.id = p_match_id
      and auth.uid() in (m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2)
  );
$$;

-- 참석 투표: 본인 투표는 "마감 전 + 승인 클럽원"만. 관리자는 언제든(마감 후 명단 조정 포함).
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

-- 대진/결과 수정: 관리자 또는 그 매치에 참여한 플레이어.
drop policy if exists "club_session_matches_update_manager" on public.club_session_matches;
create policy "club_session_matches_update_manager" on public.club_session_matches
  for update using (
    public.is_club_session_manager(session_id)
    or public.is_club_session_match_player(id)
  );

-- ═══════════════════════════════════════════════════════════
-- 0069_club_session_match_ongoing.sql
-- ═══════════════════════════════════════════════════════════
-- 0069: 클럽 세션 매치에 '진행 중(ongoing)' 상태 추가.
--   대진 확정 후 참여 선수가 '경기 시작'을 누르면 scheduled → ongoing,
--   결과 입력 시 ongoing → done. 모두가 대기/진행중/완료를 구분해 볼 수 있다.

alter table public.club_session_matches drop constraint if exists club_session_matches_status_check;
alter table public.club_session_matches
  add constraint club_session_matches_status_check check (status in ('scheduled', 'ongoing', 'done'));

-- ═══════════════════════════════════════════════════════════
-- 0070_club_session_match_dupr_mode.sql
-- ═══════════════════════════════════════════════════════════
-- 0070: 클럽 세션 매치에 DUPR 모드 플래그.
--   경기 시작 시 'DUPR 모드'(레이팅 반영) / '일반 모드'(친선) 선택.
--   dupr_mode=true 인 경기만 DUPR 일괄 등록 대상이 된다.

alter table public.club_session_matches
  add column if not exists dupr_mode boolean not null default false;

-- ═══════════════════════════════════════════════════════════
-- 0071_ensure_storage_buckets.sql
-- ═══════════════════════════════════════════════════════════
-- 0071: 스토리지 버킷 재보장.
--   운영/개발 DB 분리 시 storage.buckets 행이 딸려오지 않아 'bucket not found' 발생.
--   앱이 쓰는 모든 공개 버킷을 재삽입한다(이미 있으면 무시).

insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('meetup-images', 'meetup-images', true),
  ('club-images', 'club-images', true),
  ('tournament-images', 'tournament-images', true),
  ('court-images', 'court-images', true),
  ('event-images', 'event-images', true),
  ('community-images', 'community-images', true)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════
-- 0072_ensure_storage_policies.sql
-- ═══════════════════════════════════════════════════════════
-- 0072: 스토리지 정책 재보장.
--   운영/개발 DB 분리 시 storage.objects RLS 정책도 누락 → 업로드 시
--   'new row violates row-level security policy'. 모든 버킷 정책을 재생성한다.

-- meetup-images
drop policy if exists "meetup_images_read" on storage.objects;
create policy "meetup_images_read" on storage.objects for select using (bucket_id = 'meetup-images');
drop policy if exists "meetup_images_insert" on storage.objects;
create policy "meetup_images_insert" on storage.objects for insert with check (bucket_id = 'meetup-images' and auth.uid() is not null);
drop policy if exists "meetup_images_update" on storage.objects;
create policy "meetup_images_update" on storage.objects for update using (bucket_id = 'meetup-images' and auth.uid() is not null);

-- club-images
drop policy if exists "club_images_read" on storage.objects;
create policy "club_images_read" on storage.objects for select using (bucket_id = 'club-images');
drop policy if exists "club_images_insert" on storage.objects;
create policy "club_images_insert" on storage.objects for insert with check (bucket_id = 'club-images' and auth.uid() is not null);
drop policy if exists "club_images_update" on storage.objects;
create policy "club_images_update" on storage.objects for update using (bucket_id = 'club-images' and auth.uid() is not null);

-- tournament-images
drop policy if exists "tournament_images_read" on storage.objects;
create policy "tournament_images_read" on storage.objects for select using (bucket_id = 'tournament-images');
drop policy if exists "tournament_images_insert" on storage.objects;
create policy "tournament_images_insert" on storage.objects for insert with check (bucket_id = 'tournament-images' and auth.uid() is not null);
drop policy if exists "tournament_images_update" on storage.objects;
create policy "tournament_images_update" on storage.objects for update using (bucket_id = 'tournament-images' and auth.uid() is not null);

-- avatars (본인 폴더만 쓰기)
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- court-images (코트관리자/최고관리자만 쓰기)
drop policy if exists "court_images_read" on storage.objects;
create policy "court_images_read" on storage.objects for select using (bucket_id = 'court-images');
drop policy if exists "court_images_insert" on storage.objects;
create policy "court_images_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'court-images' and public.my_role() in ('court_manager', 'super_admin'));
drop policy if exists "court_images_delete" on storage.objects;
create policy "court_images_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'court-images' and public.my_role() in ('court_manager', 'super_admin'));

-- event-images
drop policy if exists "event_images_read" on storage.objects;
create policy "event_images_read" on storage.objects for select using (bucket_id = 'event-images');
drop policy if exists "event_images_insert" on storage.objects;
create policy "event_images_insert" on storage.objects for insert with check (bucket_id = 'event-images' and auth.uid() is not null);
drop policy if exists "event_images_update" on storage.objects;
create policy "event_images_update" on storage.objects for update using (bucket_id = 'event-images' and auth.uid() is not null);

-- community-images
drop policy if exists "community_images_read" on storage.objects;
create policy "community_images_read" on storage.objects for select using (bucket_id = 'community-images');
drop policy if exists "community_images_insert" on storage.objects;
create policy "community_images_insert" on storage.objects for insert with check (bucket_id = 'community-images' and auth.uid() is not null);

-- ═══════════════════════════════════════════════════════════
-- 0073_ensure_clubs_image_url.sql
-- ═══════════════════════════════════════════════════════════
-- 0073: clubs.image_url 컬럼 보장 (0031이 dev 에 실제 적용 안 됨 → 대표사진 저장 실패).
--   업로드는 성공했으나 clubs.image_url 컬럼이 없어 'Could not find the image_url column' 발생.

alter table public.clubs add column if not exists image_url text;

-- PostgREST 스키마 캐시 즉시 갱신
notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════
-- 0074_clubs_view_image_url.sql
-- ═══════════════════════════════════════════════════════════
-- 0074: clubs_with_counts 뷰 재생성 — image_url 노출 (0073에서 컬럼 추가 후).
--   0066에서 뷰를 재생성할 때 clubs.image_url 이 아직 없어 c.* 가 image_url 을 고정 누락 →
--   업로드·저장은 되는데 앱이 뷰에서 image_url 을 못 받아 대표사진이 안 보였다.

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

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════
-- 0075_notify_club_session.sql
-- ═══════════════════════════════════════════════════════════
-- 0075: 정기모임 생성 시 클럽원에게 참석 투표 알림(푸시 + 인앱).
--   push_notify(0053) 재사용. 승인된 클럽원 전원(개설자 제외)에게 발송.
--   알림 탭 → target_type 'club_session' → /club/session/:id 로 이동(앱 targetHref).

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

-- ============================================================
-- 적용 후 검증 (전부 true / 값 있어야 정상)
-- ============================================================
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='clubs' and column_name='image_url')                as clubs_image_url,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='clubs' and column_name='tier')                     as clubs_tier,
  to_regclass('public.club_match_results') is not null                                                                                            as club_match_results,
  to_regclass('public.club_sessions') is not null                                                                                                 as club_sessions,
  to_regclass('public.club_session_matches') is not null                                                                                          as club_session_matches,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='club_session_matches' and column_name='dupr_mode')  as session_dupr_mode,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='tournaments' and column_name='club_id')             as tournaments_club_id,
  to_regprocedure('public.set_club_officer(uuid,uuid,boolean)') is not null                                                                        as fn_set_officer,
  to_regprocedure('public.notify_club_members_on_session()') is not null                                                                           as fn_session_notify,
  (select count(*) from storage.buckets where id in ('avatars','meetup-images','club-images','tournament-images','court-images','event-images','community-images')) as buckets_present;
