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
