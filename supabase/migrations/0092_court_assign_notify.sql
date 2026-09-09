-- 0092: 코트 배정 알림
--   운영자가 경기를 코트에 '확정'(court_confirmed)하는 순간, 그 경기의 선수(+복식 파트너)들에게
--   푸시 알림을 보낸다. (배정만 하고 확정 전이면 발송하지 않음 — 재배정 스팸 방지)
--   확정 상태에서 코트가 바뀌어도 다시 알린다.

create or replace function public.notify_court_assigned()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  vtitle text;
  vcourt text;
  vindoor boolean;
  u uuid;
begin
  -- 확정된 배정만, 그리고 (새로 확정됐거나 확정 상태에서 코트가 바뀐 경우)만
  if new.court_id is null or new.court_confirmed is not true then return new; end if;
  if coalesce(old.court_confirmed, false) = true and new.court_id is not distinct from old.court_id then
    return new;
  end if;

  select title into vtitle from public.tournaments where id = new.tournament_id;
  select name, indoor into vcourt, vindoor from public.tournament_courts where id = new.court_id;

  for u in
    select e.user_id from public.tournament_entries e
      where e.tournament_id = new.tournament_id and e.user_id in (new.entry1_id, new.entry2_id)
    union
    select e.partner_id from public.tournament_entries e
      where e.tournament_id = new.tournament_id and e.user_id in (new.entry1_id, new.entry2_id)
        and e.partner_id is not null
  loop
    perform public.push_notify(
      u, 'match_turn', '코트 배정 🏟️',
      coalesce(vtitle, '대회') || ' — ' || coalesce(vcourt, '코트')
        || case when vindoor is true then ' (실내)' when vindoor is false then ' (실외)' else '' end
        || ' 코트로 배정됐어요. 경기 준비해 주세요!',
      'tournament', new.tournament_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists on_notify_court_assigned on public.tournament_matches;
create trigger on_notify_court_assigned
  after update on public.tournament_matches
  for each row execute function public.notify_court_assigned();
