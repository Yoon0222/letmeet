-- ============================================================
-- 마이그레이션 0003 — 클럽(동호회) 테이블
--
-- 이미 이전 스키마를 실행했다면 이 파일을 SQL Editor 에 붙여 실행하세요.
-- (최신 schema.sql 에는 이미 포함되어 있습니다.)
-- ============================================================

create table if not exists public.clubs (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text not null default '',
  region      text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists clubs_region_idx on public.clubs (region);

create table if not exists public.club_members (
  club_id   uuid not null references public.clubs(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists club_members_user_idx on public.club_members (user_id);

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
create policy "clubs_insert_owner" on public.clubs for insert with check (auth.uid() = owner_id);
drop policy if exists "clubs_update_owner" on public.clubs;
create policy "clubs_update_owner" on public.clubs for update using (auth.uid() = owner_id);
drop policy if exists "clubs_delete_owner" on public.clubs;
create policy "clubs_delete_owner" on public.clubs for delete using (auth.uid() = owner_id);

drop policy if exists "club_members_select" on public.club_members;
create policy "club_members_select" on public.club_members for select using (true);
drop policy if exists "club_members_insert_self" on public.club_members;
create policy "club_members_insert_self" on public.club_members for insert with check (auth.uid() = user_id);
drop policy if exists "club_members_delete_self" on public.club_members;
create policy "club_members_delete_self" on public.club_members for delete using (auth.uid() = user_id);

create or replace view public.clubs_with_counts
with (security_invoker = true)
as
select
  c.*,
  p.nickname   as owner_nickname,
  p.avatar_url as owner_avatar_url,
  (select count(*) from public.club_members cm where cm.club_id = c.id) as member_count
from public.clubs c
join public.profiles p on p.id = c.owner_id;
