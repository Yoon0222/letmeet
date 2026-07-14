-- 0040: 오더(라인업) — 주장이 자기 팀 서브매치 출전 선수를 지정한다.
-- 팀 주장만, 자기 팀(team1/team2) 쪽 players 컬럼만 바꿀 수 있게 RPC 로 제한.
create or replace function public.set_tie_lineup(p_tie_match uuid, p_side text, p_players uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_side not in ('team1', 'team2') then
    raise exception 'invalid side';
  end if;
  -- 호출자가 해당 타이의 그 쪽 팀 주장인지 확인
  select exists (
    select 1
    from public.tie_matches tm
    join public.tournament_ties tt on tt.id = tm.tie_id
    join public.tournament_teams team
      on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
    where tm.id = p_tie_match and team.captain_id = auth.uid()
  ) into v_ok;
  if not v_ok then
    raise exception 'not captain of this side';
  end if;

  if p_side = 'team1' then
    update public.tie_matches set team1_players = p_players where id = p_tie_match;
  else
    update public.tie_matches set team2_players = p_players where id = p_tie_match;
  end if;
end;
$$;
