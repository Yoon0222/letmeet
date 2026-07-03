-- ============================================================
-- 마이그레이션 0005 — 권한(역할) 체계
-- 단일 role 계층: player < organizer < court_manager < super_admin
-- 역할 부여는 super_admin 만. 최초 super_admin 은 아래 부트스트랩 참고.
-- ============================================================

alter table public.profiles
  add column if not exists role text not null default 'player';

-- 유효값 제약 (이미 있으면 무시)
do $$
begin
  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('player', 'organizer', 'court_manager', 'super_admin'));
exception when duplicate_object then null;
end $$;

-- 현재 사용자의 역할 (RLS 재귀 방지용 security definer 헬퍼)
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'player');
$$;

-- super_admin 은 아무 프로필이나 수정 가능 (역할 부여용)
drop policy if exists "profiles_update_superadmin" on public.profiles;
create policy "profiles_update_superadmin" on public.profiles
  for update using (public.my_role() = 'super_admin');

-- 본인이 자기 role 을 바꾸는 권한 상승 차단: super_admin 이 아니면 role 변경 무시(원복)
create or replace function public.enforce_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() 가 null 이면 백엔드/SQL Editor(신뢰) 컨텍스트 → 허용(부트스트랩용)
  if new.role is distinct from old.role
     and auth.uid() is not null
     and public.my_role() <> 'super_admin' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change
  before update on public.profiles
  for each row execute function public.enforce_role_change();

-- 대회 개설은 역할 있는 사람만 (player 는 개설 불가)
drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer" on public.tournaments
  for insert with check (
    auth.uid() = organizer_id
    and public.my_role() in ('organizer', 'court_manager', 'super_admin')
  );

-- ============================================================
-- 최초 super_admin 부트스트랩 — 아래 한 줄의 이메일을 본인 것으로 바꿔 실행:
--   update public.profiles set role = 'super_admin'
--   where id = (select id from auth.users where email = 'YOUR@EMAIL');
-- ============================================================
