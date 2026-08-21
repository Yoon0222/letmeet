-- 0075: 정기모임 생성 시 클럽원에게 참석 투표 알림(푸시 + 인앱).
--   push_notify(0053) 재사용. 승인된 클럽원 전원(개설자 제외)에게 발송.
--   알림 탭 → target_type 'club_session' → /club/session/:id 로 이동(앱 targetHref).

create or replace function public.notify_club_members_on_session()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_club_name text;
  v_body text;
  r record;
begin
  select name into v_club_name from public.clubs where id = new.club_id;
  v_body := coalesce(v_club_name, '클럽') || ' · ' || to_char(new.session_date, 'MM/DD')
            || ' 정기모임 참석 투표를 해주세요.';

  for r in
    select user_id from public.club_members
    where club_id = new.club_id and status = 'approved' and user_id <> new.created_by
  loop
    perform public.push_notify(
      r.user_id, 'session_vote', '정기모임 참석 투표', v_body,
      'club_session', new.id, new.created_by
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists on_club_session_notify on public.club_sessions;
create trigger on_club_session_notify
  after insert on public.club_sessions
  for each row execute function public.notify_club_members_on_session();
