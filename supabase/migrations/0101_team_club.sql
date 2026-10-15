-- 0101: 단체전 팀의 소속 클럽 + 용병
--
-- 단체전은 주장이 자기가 속한(승인된) 클럽을 골라 신청한다. 팀원은 그 클럽의 승인 회원이 기본이고,
-- 클럽 밖 회원은 '용병'으로 표시해 넣는다. 한 클럽에서 여러 팀이 나갈 수 있다(팀 이름으로 구분 —
-- 기본은 클럽 이름, 주장이 바꿀 수 있고 운영자도 관리자 웹에서 고칠 수 있다).
-- 클럽을 고르지 않은 팀(이 기능이 없는 옛 앱)도 그대로 받는다 — 운영자가 신청현황에서 클럽·용병을 보고 승인한다.
--
-- 서버가 막는 것(앱 화면만 믿지 않게):
--   · 클럽을 고른 팀의 주장은 그 클럽의 승인 회원이어야 한다
--   · 클럽을 고른 팀에 용병이 아닌 팀원으로 넣는 사람도 그 클럽의 승인 회원이어야 한다
--   운영자(super_admin)와 서버(로그인 없음)는 통과 — 데이터 정정용.

alter table public.tournament_teams
  add column if not exists club_id uuid references public.clubs(id) on delete set null;
create index if not exists tournament_teams_club_idx on public.tournament_teams (club_id);

alter table public.tournament_team_members
  add column if not exists is_guest boolean not null default false;   -- 용병(클럽 밖 회원)

create or replace function public.tournament_team_club_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_club uuid;
  v_captain uuid;
begin
  if auth.uid() is null or public.my_role() = 'super_admin' then
    return new;
  end if;

  if tg_table_name = 'tournament_teams' then
    if new.club_id is not null
       and (tg_op = 'INSERT' or new.club_id is distinct from old.club_id or new.captain_id is distinct from old.captain_id)
       and not exists (select 1 from public.club_members cm
                        where cm.club_id = new.club_id and cm.user_id = new.captain_id and cm.status = 'approved') then
      raise exception '자기가 속한 클럽으로만 신청할 수 있어요.';
    end if;
    return new;
  end if;

  -- tournament_team_members
  select tt.club_id, tt.captain_id into v_club, v_captain from public.tournament_teams tt where tt.id = new.team_id;
  if v_club is not null and not new.is_guest and new.user_id is distinct from v_captain
     and not exists (select 1 from public.club_members cm
                      where cm.club_id = v_club and cm.user_id = new.user_id and cm.status = 'approved') then
    raise exception '클럽 회원이 아닌 사람은 용병으로 추가해 주세요.';
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_teams_club_guard on public.tournament_teams;
create trigger tournament_teams_club_guard
  before insert or update of club_id, captain_id on public.tournament_teams
  for each row execute function public.tournament_team_club_guard();

drop trigger if exists tournament_team_members_club_guard on public.tournament_team_members;
create trigger tournament_team_members_club_guard
  before insert or update of user_id, is_guest on public.tournament_team_members
  for each row execute function public.tournament_team_club_guard();

revoke all on function public.tournament_team_club_guard() from public, anon, authenticated;

notify pgrst, 'reload schema';
