-- ⚠️ PROD 적용용 — 0091·0092 원본과 동일. 0089 → 0090 적용 후 실행.
--    0091: 대진 생성 후 확정 참가자 본인 취소 잠금 / 0092: 코트 확정 시 선수(+파트너) 푸시 알림.

-- ─────────────────────────────────────────────────────────────
-- 0091: 조추첨(대진 생성) 후 참가 잠금
--   · 대진이 생성된 대회의 '확정(approved)' 참가자는 스스로 취소 불가 (대진 파손 방지)
--     — 대기열·결제대기(pending)는 대진에 안 꼈으므로 계속 취소 가능, 만료 정리(expire)도 영향 없음
--   · 취소 주체: 주최자 / super_admin / 결제서버(service_role) 만
--   · 신규 신청 차단은 앱(canRegister)에서 처리 (status=registration && 대진 없음)

create or replace function public.protect_entry_after_draw()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  vorg uuid;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return old; end if;
  if auth.uid() is null then return old; end if; -- 서버측 세션(콘솔·크론)
  if old.status <> 'approved' then return old; end if; -- 대기열·결제대기는 허용
  if not exists (select 1 from public.tournament_matches m where m.tournament_id = old.tournament_id) then
    return old; -- 대진 생성 전이면 허용
  end if;
  select organizer_id into vorg from public.tournaments where id = old.tournament_id;
  if auth.uid() = vorg or public.my_role() = 'super_admin' then return old; end if;
  raise exception '대진 확정 후에는 참가를 취소할 수 없어요. 운영자에게 문의해 주세요.';
end;
$$;

drop trigger if exists on_protect_entry_after_draw on public.tournament_entries;
create trigger on_protect_entry_after_draw
  before delete on public.tournament_entries
  for each row execute function public.protect_entry_after_draw();

-- ─────────────────────────────────────────────────────────────
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
