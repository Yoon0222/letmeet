-- 0039: 단체전 진행 — tie(팀 대 팀 한 판) + tie_matches(타이 안 서브매치).
-- 팀 대진은 tournament_ties 에, 각 타이의 개별 경기는 tie_matches 에 저장한다.

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
  status         text not null default 'scheduled', -- 'scheduled' | 'done'
  court_id       uuid references public.tournament_courts(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists ties_tournament_idx on public.tournament_ties (tournament_id);

create table if not exists public.tie_matches (
  id            uuid primary key default uuid_generate_v4(),
  tie_id        uuid not null references public.tournament_ties(id) on delete cascade,
  kind          text not null,               -- 'singles' | 'doubles'
  slot          int not null default 0,      -- 타이 내 순서
  team1_players uuid[] not null default '{}', -- 오더(라인업) — team1 출전 선수 (5단계)
  team2_players uuid[] not null default '{}', -- 오더(라인업) — team2 출전 선수 (5단계)
  score1        int,
  score2        int,
  winner        text,                        -- 'team1' | 'team2'
  status        text not null default 'scheduled', -- 'scheduled' | 'done'
  created_at    timestamptz not null default now()
);
create index if not exists tie_matches_tie_idx on public.tie_matches (tie_id);

alter table public.tournament_ties enable row level security;
alter table public.tie_matches enable row level security;

-- 조회 공개. 쓰기(진행)는 대회 주최자만.
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
  exists (
    select 1 from public.tournament_ties tt
    join public.tournaments t on t.id = tt.tournament_id
    where tt.id = tie_id and t.organizer_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.tournament_ties tt
    join public.tournaments t on t.id = tt.tournament_id
    where tt.id = tie_id and t.organizer_id = auth.uid()
  )
);
