-- 0030: UGC 신고·차단 (App Store 가이드라인 1.2 대응)
-- user_blocks: 사용자 차단(차단한 사람의 콘텐츠 숨김). reports: 콘텐츠/사용자 신고.

-- 차단
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

-- 신고
create table if not exists public.reports (
  id             uuid primary key default uuid_generate_v4(),
  reporter_id    uuid not null references public.profiles(id) on delete cascade,
  target_type    text not null check (target_type in ('meetup','club','profile','tournament')),
  target_id      uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null, -- 신고 대상 사용자(있으면)
  reason         text not null,
  detail         text not null default '',
  status         text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at     timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
drop policy if exists "reports_insert_self" on public.reports;
create policy "reports_insert_self" on public.reports for insert with check (auth.uid() = reporter_id);
-- 조회: 본인 신고 또는 운영진(organizer 이상)
drop policy if exists "reports_select" on public.reports;
create policy "reports_select" on public.reports
  for select using (auth.uid() = reporter_id or public.my_role() in ('organizer','court_manager','super_admin'));
-- 상태 변경: 운영진
drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin" on public.reports
  for update using (public.my_role() in ('organizer','court_manager','super_admin'));
