-- 0041: 오더 동시제출·블라인드 공개.
-- 각 팀이 오더를 '제출'하면 잠기고, 양 팀 모두 제출해야 상대 오더가 공개된다.
alter table public.tournament_ties add column if not exists team1_lineup_ready boolean not null default false;
alter table public.tournament_ties add column if not exists team2_lineup_ready boolean not null default false;

-- 라인업 지정 RPC — 제출(잠금) 후에는 수정 불가하도록 가드 추가.
create or replace function public.set_tie_lineup(p_tie_match uuid, p_side text, p_players uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ok boolean;
  v_ready boolean;
begin
  if p_side not in ('team1', 'team2') then raise exception 'invalid side'; end if;
  select exists (
    select 1 from public.tie_matches tm
    join public.tournament_ties tt on tt.id = tm.tie_id
    join public.tournament_teams team on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
    where tm.id = p_tie_match and team.captain_id = auth.uid()
  ) into v_ok;
  if not v_ok then raise exception 'not captain of this side'; end if;
  -- 이미 제출(잠금)된 쪽은 수정 불가
  select (case when p_side = 'team1' then tt.team1_lineup_ready else tt.team2_lineup_ready end)
    into v_ready
  from public.tie_matches tm join public.tournament_ties tt on tt.id = tm.tie_id
  where tm.id = p_tie_match;
  if v_ready then raise exception 'lineup already submitted'; end if;

  if p_side = 'team1' then
    update public.tie_matches set team1_players = p_players where id = p_tie_match;
  else
    update public.tie_matches set team2_players = p_players where id = p_tie_match;
  end if;
end;
$$;

-- 오더 제출(잠금) RPC — 모든 서브매치 라인업이 완성돼야 제출 가능.
create or replace function public.submit_tie_lineup(p_tie uuid, p_side text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_cap boolean;
  v_incomplete int;
begin
  if p_side not in ('team1', 'team2') then raise exception 'invalid side'; end if;
  select exists (
    select 1 from public.tournament_ties tt
    join public.tournament_teams team on team.id = (case when p_side = 'team1' then tt.team1_id else tt.team2_id end)
    where tt.id = p_tie and team.captain_id = auth.uid()
  ) into v_cap;
  if not v_cap then raise exception 'not captain of this side'; end if;

  select count(*) into v_incomplete
  from public.tie_matches tm
  where tm.tie_id = p_tie
    and coalesce(array_length(case when p_side = 'team1' then tm.team1_players else tm.team2_players end, 1), 0)
        <> (case when tm.kind = 'singles' then 1 else 2 end);
  if v_incomplete > 0 then raise exception 'lineup incomplete'; end if;

  if p_side = 'team1' then
    update public.tournament_ties set team1_lineup_ready = true where id = p_tie;
  else
    update public.tournament_ties set team2_lineup_ready = true where id = p_tie;
  end if;
end;
$$;
