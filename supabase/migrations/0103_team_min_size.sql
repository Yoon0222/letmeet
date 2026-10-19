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
