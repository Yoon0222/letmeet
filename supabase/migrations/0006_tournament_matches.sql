-- ============================================================
-- 마이그레이션 0006 — 대회 진행(경기/대진)
-- 조별리그(라운드로빈) + 토너먼트(단판 토너먼트). 점수 입력·승자.
-- ============================================================

alter table public.tournaments
  add column if not exists group_count int,          -- 조 개수 (대진 생성 시 설정)
  add column if not exists advance_per_group int;    -- 조별 진출 인원

create table if not exists public.tournament_matches (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  phase         text not null,                 -- 'group' | 'knockout'
  group_no      int,                           -- 조별: 몇 조 (1..)
  round_order   int,                           -- 토너먼트: 1,2,.. (1=첫 라운드)
  round_name    text,                          -- '조별' | '준결승' | '결승' | '3·4위전' 등
  slot          int not null default 0,        -- 라운드/조 내 정렬
  entry1_id     uuid references public.profiles(id) on delete set null,
  entry2_id     uuid references public.profiles(id) on delete set null,  -- null = 부전승
  score1        int,
  score2        int,
  winner_id     uuid references public.profiles(id) on delete set null,
  status        text not null default 'scheduled',  -- 'scheduled' | 'done'
  created_at    timestamptz not null default now()
);
create index if not exists tournament_matches_tid_idx on public.tournament_matches (tournament_id);

-- tournaments 에 컬럼이 추가됐으니 뷰를 새 컬럼 포함해 재생성 (t.* 는 생성 시점 컬럼만 잡음)
drop view if exists public.tournaments_with_counts;
create view public.tournaments_with_counts
with (security_invoker = true)
as
select
  t.*,
  p.nickname   as organizer_nickname,
  p.avatar_url as organizer_avatar_url,
  (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.status = 'approved') as approved_count,
  (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.status = 'pending') as pending_count
from public.tournaments t
join public.profiles p on p.id = t.organizer_id;

alter table public.tournament_matches enable row level security;

drop policy if exists "matches_select" on public.tournament_matches;
create policy "matches_select" on public.tournament_matches for select using (true);

-- 생성/수정/삭제는 그 대회의 주최자(또는 super_admin)
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
