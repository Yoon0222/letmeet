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
