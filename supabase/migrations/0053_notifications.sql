-- 0053: 인앱 알림 센터 — 중앙 notifications 테이블 + 단일 발송 함수(push_notify).
--   지금까지 푸시는 "쏘고 끝"이라 기록이 없어 종모양 안읽음 숫자를 못 셌다.
--   → 모든 알림을 여기 저장하고(종 뱃지용) 동시에 Expo 푸시도 보낸다.
--   기존 트리거(0035 신청 알림)도 이 함수로 통일한다.
create extension if not exists pg_net;

-- (A) 알림 저장 테이블 -----------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade, -- 받는 사람
  type        text not null,          -- join_request | join_approved | comment | match_turn | tie | system
  title       text not null,
  body        text not null default '',
  target_type text,                    -- meetup | club | community_post | tournament | court
  target_id   uuid,
  actor_id    uuid references public.profiles(id) on delete set null, -- 유발한 사람(선택)
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- 조회/수정/삭제는 본인 것만. insert 정책은 없음 → 클라이언트 직접 삽입 불가(발송 함수만).
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using (user_id = auth.uid());

-- 실시간 구독(종 뱃지 즉시 갱신)
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- (B) 단일 발송 함수 — 행 저장 + (토큰 있으면) Expo 푸시 --------------------
create or replace function public.push_notify(
  p_user        uuid,
  p_type        text,
  p_title       text,
  p_body        text,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_actor       uuid default null
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text;
begin
  if p_user is null then return; end if;
  -- 내가 유발한 알림은 나에게 보내지 않음 (내 글에 내가 댓글 등)
  if p_actor is not null and p_actor = p_user then return; end if;

  insert into public.notifications (user_id, type, title, body, target_type, target_id, actor_id)
  values (p_user, p_type, p_title, p_body, p_target_type, p_target_id, p_actor);

  select push_token into v_token from public.profiles where id = p_user;
  if v_token is null or v_token = '' then return; end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', v_token,
      'sound', 'default',
      'title', p_title,
      'body', p_body,
      'data', jsonb_build_object('target_type', p_target_type, 'target_id', p_target_id)
    )
  );
end;
$$;

-- (C) 안읽음 읽음처리 RPC (전체 또는 특정 id 목록) --------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer set search_path = public
as $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));
$$;

-- (D) 기존 신청 알림(0035)을 발송 함수로 통일 — 이제 종에도 쌓인다 -----------
create or replace function public.notify_host_on_pending()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_host  uuid;
  v_title text;
  v_ttype text;
  v_tid   uuid;
  v_who   text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if tg_table_name = 'club_members' then
    select owner_id into v_host from public.clubs where id = new.club_id;
    v_title := '클럽 가입 신청';
    v_ttype := 'club';  v_tid := new.club_id;
  elsif tg_table_name = 'meetup_participants' then
    select host_id into v_host from public.meetups where id = new.meetup_id;
    v_title := '번개모임 참가 신청';
    v_ttype := 'meetup'; v_tid := new.meetup_id;
  else
    return new;
  end if;

  if v_host is null then return new; end if;
  select nickname into v_who from public.profiles where id = new.user_id;

  perform public.push_notify(
    v_host, 'join_request', v_title,
    coalesce(v_who, '누군가') || '님이 신청했어요. 승인/거절을 확인해 주세요.',
    v_ttype, v_tid, new.user_id
  );
  return new;
end;
$$;
-- 트리거 자체는 0035 에서 이미 걸려 있음(club_members / meetup_participants insert).

-- (E) 신청 승인 알림 — pending → approved 로 바뀌면 신청자에게 -------------
create or replace function public.notify_member_on_approved()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_ttype text;
  v_tid   uuid;
  v_actor uuid;
  v_name  text;
begin
  if new.status is not distinct from old.status or new.status <> 'approved' then
    return new;
  end if;

  if tg_table_name = 'club_members' then
    select owner_id, name into v_actor, v_name from public.clubs where id = new.club_id;
    v_ttype := 'club';   v_tid := new.club_id;
    perform public.push_notify(new.user_id, 'join_approved', '가입이 승인됐어요',
      coalesce(v_name, '클럽') || ' 가입이 수락됐어요. 지금 확인해 보세요!', v_ttype, v_tid, v_actor);
  elsif tg_table_name = 'meetup_participants' then
    select host_id, title into v_actor, v_name from public.meetups where id = new.meetup_id;
    v_ttype := 'meetup'; v_tid := new.meetup_id;
    perform public.push_notify(new.user_id, 'join_approved', '참가가 승인됐어요',
      coalesce(v_name, '번개모임') || ' 참가가 수락됐어요. 코트에서 만나요!', v_ttype, v_tid, v_actor);
  end if;
  return new;
end;
$$;

drop trigger if exists on_club_member_approved on public.club_members;
create trigger on_club_member_approved
  after update on public.club_members
  for each row execute function public.notify_member_on_approved();

drop trigger if exists on_meetup_participant_approved on public.meetup_participants;
create trigger on_meetup_participant_approved
  after update on public.meetup_participants
  for each row execute function public.notify_member_on_approved();

-- (F) 커뮤니티 댓글 알림 — 내 글에 댓글이 달리면 글쓴이에게 -----------------
create or replace function public.notify_post_author_on_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_author uuid;
  v_who    text;
begin
  select author_id into v_author from public.community_posts where id = new.post_id;
  if v_author is null then return new; end if;
  select nickname into v_who from public.profiles where id = new.author_id;

  perform public.push_notify(
    v_author, 'comment', '새 댓글',
    coalesce(v_who, '누군가') || '님이 회원님 글에 댓글을 남겼어요.',
    'community_post', new.post_id, new.author_id
  );
  return new;
end;
$$;

drop trigger if exists on_community_comment_notify on public.community_comments;
create trigger on_community_comment_notify
  after insert on public.community_comments
  for each row execute function public.notify_post_author_on_comment();
