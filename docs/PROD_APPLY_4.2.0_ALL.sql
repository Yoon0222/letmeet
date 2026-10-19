-- ============================================================================
-- PROD 적용 총합본: 4.2.0 출시용 — 0101 · 0102 · 0103 (단체전 운영)
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)
-- 만든 날: 2026-10-19. 운영 DB 를 조회해 아직 적용되지 않은 것만 담았다(0100 까지는 이미 적용됨).
--
-- 실행 (둘 중 하나):
--   · 운영 Supabase SQL Editor 에 이 파일 전체를 붙여 넣고 Run
--   · npx supabase db query -f docs/PROD_APPLY_4.2.0_ALL.sql --linked --project-ref jbvtdthtmrlndduqiikj
-- 전체가 하나의 트랜잭션 — 중간에 하나라도 실패하면 아무것도 적용되지 않는다(원인을 고친 뒤 처음부터 다시 실행).
-- 다시 실행해도 안전하다(if not exists / or replace / drop if exists 로 작성됨).
-- (docs/PROD_APPLY_0101.sql 을 따로 실행했다면 이 파일을 실행해도 된다 — 0101 부분은 그대로 다시 적용될 뿐이다.)
--
-- 담긴 것 (이 순서대로):
--   0101 단체전 팀의 소속 클럽(club_id) + 용병(is_guest), 클럽 회원 검사 트리거, 대회 목록의 단체전 참가 수를 팀 수로
--   0102 단체전 오더: 한 대결 안에서 한 선수는 한 게임만 — 최종 제출 때 겹치면 거절. 게임별 저장은 인원·팀 선수만 검사
--        (저장 뒤 두 게임의 선수를 맞바꿀 수 있게). 오류 문구는 한국어
--   0103 단체전 팀 최소 인원을 '단식 수 + 복식 수×2' 아래로는 잡히지 않게 서버가 보정(관리자 웹·앱 클럽 대회 모두),
--        단체전 종목 표시를 대결 구성에서 정한다(복식만 → 복식, 단식만 → 단식 — 복식 단체전에 '단식' 배지가 붙던 것)
--
-- ⚠️ 4.2.0 출시 순서
--   1) 이 파일 실행 → 맨 아래 확인 쿼리의 값이 열 이름의 expect_ 값과 같은지 확인
--   2) 엣지함수 notify-tie 배포(차례 알림을 양 팀 주장에게만):
--        npx supabase functions deploy notify-tie --project-ref jbvtdthtmrlndduqiikj --use-api
--   3) 관리자 웹 배포: web-admin 폴더에서 npx vercel --prod
--        (단체전 조·예선/본선 선택, 대진표 트리, 코트 등록, 소속 클럽·용병 표시, 팀 이름 수정 — 0101 의 새 열을 읽으므로 1) 다음에)
--   4) 스토어: 4.2.0 심사 제출(iOS) / 업로드(Android). 4.1.0·4.1.1 빌드는 쓰지 않는다
--
-- 기존 동작에 미치는 영향:
--   · 지금 깔린 앱(4.0.0·4.1.1)도 그대로 동작한다. 클럽을 고르지 않은 단체전 신청도 받는다(운영자가 신청현황에서 확인).
--   · 옛 앱에서 같은 선수를 두 게임에 넣은 오더는 제출 때 거절된다("한 선수는 같은 대결에서 한 게임만 나갈 수 있어요.").
--   · 지금 운영에는 대회가 없다(2026-10-19 조회) — 기존 대회·팀 데이터에 바뀌는 것은 없다.
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════
-- 0101: 단체전 팀의 소속 클럽 + 용병   (supabase/migrations/0101_team_club.sql)
-- ════════════════════════════════════════════════════════════

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

-- 대회 목록·상세의 "참가 현황": 단체전은 개인 신청이 아니라 팀 수를 센다(전에는 늘 0 으로 보였다).
--   뷰만 바꾸므로 이미 깔린 앱에도 바로 반영된다. t.* 를 쓰는 뷰라 drop 후 다시 만든다(0059·0084 와 같은 방식).
drop view if exists public.tournaments_with_counts;
create view public.tournaments_with_counts
with (security_invoker = true)
as
select
  t.*,
  p.nickname   as organizer_nickname,
  p.avatar_url as organizer_avatar_url,
  case when t.format = 'team'
       then (select count(*) from public.tournament_teams tt where tt.tournament_id = t.id and tt.status = 'approved')
       else (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.status = 'approved')
  end as approved_count,
  case when t.format = 'team'
       then (select count(*) from public.tournament_teams tt where tt.tournament_id = t.id and tt.status = 'pending')
       else (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.status = 'pending')
  end as pending_count
from public.tournaments t
join public.profiles p on p.id = t.organizer_id;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- 0102: 단체전 오더 — 한 대결에서 한 선수는 한 게임만   (supabase/migrations/0102_unique_tie_lineup.sql)
-- ════════════════════════════════════════════════════════════

-- 0102: 단체전 오더 — 한 대결(팀 경기) 안에서 한 선수는 한 게임만 나간다 (2026-10-19 사용자 확정)
--
-- set_tie_lineup(게임 하나 저장): 단식 1명·복식 2명을 정확히, 같은 게임 안 중복 없이, 그 팀 선수만.
--   다른 게임과 겹치는지는 여기서 막지 않는다 — 게임별로 저장하므로 두 게임의 선수를 서로 바꾸려면
--   중간 저장에서 잠깐 겹칠 수밖에 없다(여기서 막으면 한 번 저장한 오더를 고칠 수 없게 된다).
-- submit_tie_lineup(최종 제출·잠금): 모든 게임이 채워졌고, 한 선수가 두 게임 이상에 들어가 있지 않아야 제출된다.
-- 옛 앱(4.1.1 이하)도 게임마다 정해진 인원만 저장하므로 그대로 동작한다(겹친 오더를 제출하면 거절된다).
-- 오류 문구는 한국어 — 옛 앱은 서버 문구를 그대로 보여 준다.
create or replace function public.set_tie_lineup(p_tie_match uuid, p_side text, p_players uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_tie uuid;
  v_team uuid;
  v_ready boolean;
  v_needed int;
  v_member_count int;
  v_unique_count int;
begin
  if p_side not in ('team1', 'team2') then raise exception '잘못된 요청이에요.'; end if;

  select tm.tie_id,
         case when p_side = 'team1' then tt.team1_id else tt.team2_id end,
         case when p_side = 'team1' then tt.team1_lineup_ready else tt.team2_lineup_ready end,
         case when tm.kind = 'singles' then 1 else 2 end
    into v_tie, v_team, v_ready, v_needed
  from public.tie_matches tm
  join public.tournament_ties tt on tt.id = tm.tie_id
  join public.tournament_teams team
    on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
  where tm.id = p_tie_match and team.captain_id = auth.uid();

  if v_tie is null then raise exception '우리 팀 주장만 오더를 정할 수 있어요.'; end if;
  if v_ready then raise exception '이미 제출한 오더는 바꿀 수 없어요.'; end if;
  if coalesce(cardinality(p_players), 0) <> v_needed then raise exception '단식은 1명, 복식은 2명을 골라 주세요.'; end if;

  select count(distinct player_id) into v_unique_count from unnest(p_players) as player_ids(player_id);
  if v_unique_count <> v_needed then raise exception '한 게임에 같은 선수를 두 번 넣을 수 없어요.'; end if;

  select count(*) into v_member_count
  from public.tournament_team_members
  where team_id = v_team and user_id = any(p_players);
  if v_member_count <> v_needed then raise exception '우리 팀 선수만 넣을 수 있어요.'; end if;

  if p_side = 'team1' then
    update public.tie_matches set team1_players = p_players where id = p_tie_match;
  else
    update public.tie_matches set team2_players = p_players where id = p_tie_match;
  end if;
end;
$$;

create or replace function public.submit_tie_lineup(p_tie uuid, p_side text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_cap boolean;
  v_incomplete int;
  v_assigned int;
  v_unique int;
begin
  if p_side not in ('team1', 'team2') then raise exception '잘못된 요청이에요.'; end if;
  select exists (
    select 1 from public.tournament_ties tt
    join public.tournament_teams team
      on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
    where tt.id = p_tie and team.captain_id = auth.uid()
  ) into v_cap;
  if not v_cap then raise exception '우리 팀 주장만 오더를 제출할 수 있어요.'; end if;

  select count(*) into v_incomplete
  from public.tie_matches tm
  where tm.tie_id = p_tie
    and coalesce(cardinality(case when p_side = 'team1' then tm.team1_players else tm.team2_players end), 0)
        <> (case when tm.kind = 'singles' then 1 else 2 end);
  if v_incomplete > 0 then raise exception '모든 게임의 선수를 먼저 정해 주세요.'; end if;

  select count(*), count(distinct player_id)
    into v_assigned, v_unique
  from public.tie_matches tm
  cross join lateral unnest(
    case when p_side = 'team1' then tm.team1_players else tm.team2_players end
  ) as assigned(player_id)
  where tm.tie_id = p_tie;
  if v_assigned <> v_unique then raise exception '한 선수는 같은 대결에서 한 게임만 나갈 수 있어요.'; end if;

  if p_side = 'team1' then
    update public.tournament_ties set team1_lineup_ready = true where id = p_tie;
  else
    update public.tournament_ties set team2_lineup_ready = true where id = p_tie;
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- 0103: 단체전 팀 최소 인원·종목 표시 보정   (supabase/migrations/0103_team_min_size.sql)
-- ════════════════════════════════════════════════════════════

-- 0103: 단체전 팀 최소 인원·종목 표시 보정
--
-- ① 팀 최소 인원: 0102 로 한 대결 안에서 한 선수는 한 게임만 나간다. 그래서 팀에는 적어도 '단식 수 + 복식 수×2' 명이
--    있어야 오더를 낼 수 있다. 단체전을 만들거나 대결 구성을 바꿀 때 팀 최소 인원(team_min_size)이 그보다 작으면
--    서버가 그 수로 올린다 — 관리자 웹·앱 클럽 대회 만들기 모두(앱 클럽 대회는 기본값 2명·단식 2·복식 1 을 그대로 쓴다).
--    그보다 크게 잡은 값은 그대로 둔다.
-- ② 종목(discipline): 단체전 만들기 화면에는 종목 칸이 없어 기본값 '단식'으로 들어갔다 — 복식만 하는 단체전에도
--    '단식' 배지가 붙었다. 단체전은 대결 구성에서 정한다: 복식만 있으면 복식, 단식만 있으면 단식(섞여 있으면 그대로).
-- 개인전·KDK 는 건드리지 않는다.
create or replace function public.tournament_team_min_size_fix()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.format = 'team' then
    new.team_min_size := greatest(coalesce(new.team_min_size, 0),
                                  coalesce(new.tie_singles, 0) + 2 * coalesce(new.tie_doubles, 0));
    new.discipline := case
      when coalesce(new.tie_singles, 0) = 0 and coalesce(new.tie_doubles, 0) > 0 then 'doubles'
      when coalesce(new.tie_doubles, 0) = 0 and coalesce(new.tie_singles, 0) > 0 then 'singles'
      else new.discipline
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_team_min_size_fix on public.tournaments;
create trigger tournaments_team_min_size_fix
  before insert or update of format, discipline, team_min_size, tie_singles, tie_doubles on public.tournaments
  for each row execute function public.tournament_team_min_size_fix();

revoke all on function public.tournament_team_min_size_fix() from public, anon, authenticated;

-- 이미 있는 단체전도 맞춘다(위 트리거가 같은 값으로 계산한다)
update public.tournaments
   set team_min_size = greatest(team_min_size, tie_singles + 2 * tie_doubles)
 where format = 'team'
   and (team_min_size < tie_singles + 2 * tie_doubles
        or (tie_singles = 0 and tie_doubles > 0 and discipline <> 'doubles')
        or (tie_doubles = 0 and tie_singles > 0 and discipline <> 'singles'));

commit;

-- ── 적용 후 확인 — 열 이름의 expect_ 값과 같아야 한다 ─────────────────────────────
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournament_teams' and column_name = 'club_id')
                                                                                                           as m0101_team_club_expect_true,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournament_team_members' and column_name = 'is_guest')
                                                                                                           as m0101_member_guest_expect_true,
  (select count(*) from pg_trigger where tgname in ('tournament_teams_club_guard', 'tournament_team_members_club_guard') and not tgisinternal)
                                                                                                           as m0101_guard_triggers_expect_2,
  position('tournament_teams' in pg_get_viewdef('public.tournaments_with_counts'::regclass)) > 0          as m0101_view_counts_teams_expect_true,
  position('우리 팀 선수만' in pg_get_functiondef('public.set_tie_lineup(uuid,text,uuid[])'::regprocedure)) > 0
                                                                                                           as m0102_set_checks_member_expect_true,
  position('한 게임만 나갈' in pg_get_functiondef('public.submit_tie_lineup(uuid,text)'::regprocedure)) > 0
                                                                                                           as m0102_submit_blocks_dup_expect_true,
  exists (select 1 from pg_trigger where tgname = 'tournaments_team_min_size_fix' and not tgisinternal)   as m0103_trigger_expect_true,
  (select count(*) from public.tournaments where format = 'team' and team_min_size < tie_singles + 2 * tie_doubles)
                                                                                                           as m0103_short_teams_expect_0,
  (select count(*) from public.tournaments where format = 'team'
     and ((tie_singles = 0 and tie_doubles > 0 and discipline <> 'doubles') or (tie_doubles = 0 and tie_singles > 0 and discipline <> 'singles')))
                                                                                                           as m0103_wrong_discipline_expect_0;
