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
