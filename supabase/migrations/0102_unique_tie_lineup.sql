-- 한 팀 경기 안에서 같은 선수를 여러 서브매치에 중복 배정하지 못하게 한다.
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
  v_overlap boolean;
begin
  if p_side not in ('team1', 'team2') then raise exception 'invalid side'; end if;

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

  if v_tie is null then raise exception 'not captain of this side'; end if;
  if v_ready then raise exception 'lineup already submitted'; end if;
  if coalesce(cardinality(p_players), 0) <> v_needed then raise exception 'invalid player count'; end if;

  select count(distinct player_id) into v_unique_count from unnest(p_players) as player_ids(player_id);
  if v_unique_count <> v_needed then raise exception 'duplicate player in match'; end if;

  select count(*) into v_member_count
  from public.tournament_team_members
  where team_id = v_team and user_id = any(p_players);
  if v_member_count <> v_needed then raise exception 'player is not a team member'; end if;

  select exists (
    select 1
    from public.tie_matches other
    cross join lateral unnest(
      case when p_side = 'team1' then other.team1_players else other.team2_players end
    ) as assigned(existing_player)
    where other.tie_id = v_tie
      and other.id <> p_tie_match
      and existing_player = any(p_players)
  ) into v_overlap;
  if v_overlap then raise exception 'player already assigned to another match'; end if;

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
  if p_side not in ('team1', 'team2') then raise exception 'invalid side'; end if;
  select exists (
    select 1 from public.tournament_ties tt
    join public.tournament_teams team
      on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
    where tt.id = p_tie and team.captain_id = auth.uid()
  ) into v_cap;
  if not v_cap then raise exception 'not captain of this side'; end if;

  select count(*) into v_incomplete
  from public.tie_matches tm
  where tm.tie_id = p_tie
    and coalesce(cardinality(case when p_side = 'team1' then tm.team1_players else tm.team2_players end), 0)
        <> (case when tm.kind = 'singles' then 1 else 2 end);
  if v_incomplete > 0 then raise exception 'lineup incomplete'; end if;

  select count(*), count(distinct player_id)
    into v_assigned, v_unique
  from public.tie_matches tm
  cross join lateral unnest(
    case when p_side = 'team1' then tm.team1_players else tm.team2_players end
  ) as assigned(player_id)
  where tm.tie_id = p_tie;
  if v_assigned <> v_unique then raise exception 'duplicate player across matches'; end if;

  if p_side = 'team1' then
    update public.tournament_ties set team1_lineup_ready = true where id = p_tie;
  else
    update public.tournament_ties set team2_lineup_ready = true where id = p_tie;
  end if;
end;
$$;
