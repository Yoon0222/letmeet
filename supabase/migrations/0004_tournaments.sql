-- ============================================================
-- 마이그레이션 0004 — 대회(tournaments) + 참가신청(tournament_entries)
-- 이미 이전 스키마를 실행했다면 이 파일을 SQL Editor 에 붙여 실행하세요.
-- ============================================================

create table if not exists public.tournaments (
  id                    uuid primary key default uuid_generate_v4(),
  organizer_id          uuid not null references public.profiles(id) on delete cascade,
  title                 text not null,
  description           text not null default '',
  region                text not null default '',
  venue                 text not null default '',
  start_at              timestamptz not null,
  registration_deadline timestamptz,
  max_participants      int not null default 16 check (max_participants between 2 and 256),
  skill_min             numeric(3,1) not null default 2.0,
  skill_max             numeric(3,1) not null default 8.0,
  fee                   int not null default 0,
  format                text not null default 'single_elim',
  status                text not null default 'registration',
  created_at            timestamptz not null default now()
);
create index if not exists tournaments_start_idx on public.tournaments (start_at);
create index if not exists tournaments_region_idx on public.tournaments (region);

create table if not exists public.tournament_entries (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending',
  partner_name  text,
  seed          int,
  created_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
create index if not exists tournament_entries_user_idx on public.tournament_entries (user_id);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;

drop policy if exists "tournaments_select" on public.tournaments;
create policy "tournaments_select" on public.tournaments for select using (true);
drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer" on public.tournaments for insert with check (auth.uid() = organizer_id);
drop policy if exists "tournaments_update_organizer" on public.tournaments;
create policy "tournaments_update_organizer" on public.tournaments for update using (auth.uid() = organizer_id);
drop policy if exists "tournaments_delete_organizer" on public.tournaments;
create policy "tournaments_delete_organizer" on public.tournaments for delete using (auth.uid() = organizer_id);

drop policy if exists "entries_select" on public.tournament_entries;
create policy "entries_select" on public.tournament_entries for select using (true);
drop policy if exists "entries_insert_self" on public.tournament_entries;
create policy "entries_insert_self" on public.tournament_entries for insert with check (auth.uid() = user_id);
drop policy if exists "entries_update_self_or_organizer" on public.tournament_entries;
create policy "entries_update_self_or_organizer" on public.tournament_entries
  for update using (
    auth.uid() = user_id
    or auth.uid() = (select t.organizer_id from public.tournaments t where t.id = tournament_id)
  );
drop policy if exists "entries_delete_self" on public.tournament_entries;
create policy "entries_delete_self" on public.tournament_entries for delete using (auth.uid() = user_id);

create or replace view public.tournaments_with_counts
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
