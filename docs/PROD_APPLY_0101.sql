-- ============================================================================
-- PROD 적용: 0101 단체전 팀의 소속 클럽 + 용병
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj) — SQL Editor 에 이 파일 전체를 붙여 넣고 실행
--
-- 내용:
--   · tournament_teams.club_id(소속 클럽), tournament_team_members.is_guest(용병) 열 추가
--   · 검사 트리거: 클럽을 고른 팀은 주장이 그 클럽 승인 회원이어야 하고, 용병이 아닌 팀원도 그 클럽 승인 회원이어야 한다
--     (super_admin·서버는 통과)
--
-- 영향:
--   · 클럽을 고르지 않은 팀(이 기능이 없는 앱: 4.1.1 이하)도 그대로 받는다 — 옛 앱의 단체전 신청이 깨지지 않는다.
--     운영자는 관리자 웹 신청현황에서 소속 클럽·용병 여부를 보고 승인한다.
--   · 새 앱(클럽 선택이 든 버전)·관리자 웹은 새 열을 읽는다 → 이 파일을 먼저 적용한 뒤 내보낼 것
--     (없는 열을 읽으면 팀 목록이 비어 보인다).
--
-- ⚠️ 적용 순서: 이 파일 → 관리자 웹 배포 → 앱(OTA·스토어).
-- 안전성: 여러 번 실행해도 된다(if not exists / or replace / drop if exists). 기존 팀·팀원 행은 바뀌지 않는다(club_id null, is_guest false).
-- 검증(DEV): 규칙 시험 8개 — 남의 클럽으로 신청 거절, 클럽 회원 주장·팀원 통과, 클럽 밖 회원을 일반 팀원으로 거절,
--   용병 통과, 클럽 없는 팀은 누구나, 남의 클럽으로 바꾸기 거절, 이름만 바꾸기 통과.
-- ============================================================================

begin;

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

commit;

-- 적용 뒤 확인(모두 true)
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournament_teams' and column_name = 'club_id') as teams_club_id,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournament_team_members' and column_name = 'is_guest') as members_is_guest,
       (select count(*) = 2 from pg_trigger where tgname in ('tournament_teams_club_guard', 'tournament_team_members_club_guard') and not tgisinternal) as guard_triggers;
