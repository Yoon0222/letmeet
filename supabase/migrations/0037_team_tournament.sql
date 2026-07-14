-- 0037: 단체전(team) 모델 — 팀/팀원 + 대회별 단체전 설정.
--   team_min_size = 팀당 최소 인원, tie_singles/tie_doubles = 타이 1건의 단식/복식 매치 수.
alter table public.tournaments add column if not exists team_min_size int not null default 2;
alter table public.tournaments add column if not exists tie_singles   int not null default 2;
alter table public.tournaments add column if not exists tie_doubles   int not null default 1;

-- 팀(단체) — 주장이 팀명으로 생성하고 팀 단위로 참가 신청. 승인제 재사용(pending/approved).
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

-- 팀원 — 주장이 앱 가입 유저를 검색해 추가.
create table if not exists public.tournament_team_members (
  team_id    uuid not null references public.tournament_teams(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_member_user_idx on public.tournament_team_members (user_id);

alter table public.tournament_teams enable row level security;
alter table public.tournament_team_members enable row level security;

-- 팀: 조회 공개, 생성은 주장 본인, 수정/삭제는 주장 또는 대회 주최자
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

-- 팀원: 조회 공개, 추가/삭제는 팀 주장만
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
