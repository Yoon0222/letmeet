-- 0035: 클럽 가입 / 번개 참가 '신청'(pending) 시 주최자에게 Expo 푸시 알림.
-- pg_net(net.http_post)으로 Expo push API를 직접 호출한다 (notify-turn Edge Function과 동일 엔드포인트).
-- 실제 발송은 대상(주최자)이 push_token 을 가진 실기기 빌드에서만 이뤄진다.
create extension if not exists pg_net;

create or replace function public.notify_host_on_pending()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_host  uuid;
  v_token text;
  v_title text;
  v_who   text;
begin
  -- 승인 대기(pending) 신규 신청에만 알림. 즉시 승인(approved)은 제외.
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if tg_table_name = 'club_members' then
    select owner_id into v_host from public.clubs where id = new.club_id;
    v_title := '클럽 가입 신청';
  elsif tg_table_name = 'meetup_participants' then
    select host_id into v_host from public.meetups where id = new.meetup_id;
    v_title := '번개모임 참가 신청';
  else
    return new;
  end if;

  if v_host is null then return new; end if;

  select push_token into v_token from public.profiles where id = v_host;
  if v_token is null or v_token = '' then return new; end if;

  select nickname into v_who from public.profiles where id = new.user_id;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', v_token,
      'sound', 'default',
      'title', v_title,
      'body', coalesce(v_who, '누군가') || '님이 신청했어요. 승인/거절을 확인해 주세요.'
    )
  );

  return new;
end;
$$;

drop trigger if exists on_club_member_pending on public.club_members;
create trigger on_club_member_pending
  after insert on public.club_members
  for each row execute function public.notify_host_on_pending();

drop trigger if exists on_meetup_participant_pending on public.meetup_participants;
create trigger on_meetup_participant_pending
  after insert on public.meetup_participants
  for each row execute function public.notify_host_on_pending();
