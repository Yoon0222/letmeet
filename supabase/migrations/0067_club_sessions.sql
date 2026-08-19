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
