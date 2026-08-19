-- ============================================================
-- 피넛 PROD 반영 — 알림(0053~0055) + DUPR(0056)
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)
-- 상황: iOS 정식 출시됨. 출시 빌드에 알림 센터 코드 포함 →
--       이 SQL 을 실행해야 라이브 앱의 알림 기능이 작동한다.
-- 확인(2026-08-04): 0042~0052 는 이미 반영됨. 여기부터가 누락분.
-- 실행: SQL Editor 에 통째로 붙여넣고 1회. begin/commit 로 전체 롤백 보장.
-- ============================================================

begin;

-- ══════════════════════════════════════════════════════════
-- 0053_notifications.sql
-- ══════════════════════════════════════════════════════════
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


-- ══════════════════════════════════════════════════════════
-- 0054_lock_internal_functions.sql
-- ══════════════════════════════════════════════════════════
-- 0054: 내부 전용 함수의 실행 권한 회수 (보안).
--
--   Postgres 는 함수 생성 시 PUBLIC 에 EXECUTE 를 기본 부여한다. 그래서 아래 두
--   security definer 함수를 anon/authenticated 가 PostgREST 로 직접 호출할 수 있었다.
--   (2026-07-24 확인: anon 키만으로 push_notify 호출이 실제로 성공함)
--
--   · push_notify              → 아무에게나 가짜 알림 + 실제 폰 푸시 발송 가능(피싱/스팸)
--   · release_stale_court_holds→ p_minutes:0 으로 대기중 결제·예약을 전부 취소 가능(파괴적)
--
--   두 함수는 각각 트리거와 스케줄러(pg_cron)에서만 쓰인다. 트리거 함수들도
--   security definer(소유자=postgres)라 내부 호출은 권한 회수 후에도 정상 동작한다.
--
--   유지: mark_notifications_read 는 auth.uid() 로 본인 범위만 갱신하므로 계속 호출 가능.

revoke all on function public.push_notify(uuid, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.release_stale_court_holds(int)
  from public, anon, authenticated;


-- ══════════════════════════════════════════════════════════
-- 0055_push_notify_service_role.sql
-- ══════════════════════════════════════════════════════════
-- 0055: push_notify 를 service_role 에만 다시 허용 (Edge Function 용).
--
--   0054 에서 PUBLIC 의 EXECUTE 를 회수하면서, PUBLIC 에 기대던 service_role 도
--   함께 막혔다. 트리거는 소유자(postgres) 권한으로 돌아 영향이 없지만,
--   Edge Function 은 service_role 로 PostgREST 를 호출하므로 명시적 부여가 필요하다.
--
--   service_role 키는 서버(Edge Function)에만 있고 클라이언트에 노출되지 않으므로
--   anon/authenticated 가 막힌 상태는 그대로 유지된다.

grant execute on function public.push_notify(uuid, text, text, text, text, uuid, uuid)
  to service_role;


-- ══════════════════════════════════════════════════════════
-- 0056_dupr_integration.sql
-- ══════════════════════════════════════════════════════════
-- 0056: DUPR 연동 — 레이팅 표시(A) + 소유 인증(B) 지원 + 보안.
--
--   기존: dupr_id(자가입력) · dupr_rating · dupr_verified.
--   추가: 복식/단식 분리 저장 + 연동 상태 + 동기화 시각.
--
--   🔒 보안 핵심: dupr_rating/verified/status 는 서버(Edge Function=service_role)만
--   쓸 수 있어야 한다. 안 그러면 사용자가 프로필 업데이트로 dupr_verified=true 를
--   스스로 켜서 "인증 배지"를 위조할 수 있다. 아래 트리거가 이를 막는다.

alter table public.profiles
  add column if not exists dupr_doubles  numeric(3,1),
  add column if not exists dupr_singles  numeric(3,1),
  add column if not exists dupr_status   text not null default 'none'
    check (dupr_status in ('none', 'linked', 'verified')),
  add column if not exists dupr_synced_at timestamptz;

comment on column public.profiles.dupr_status is
  'none=미연동 / linked=레이팅만 표시(A) / verified=DUPR 로그인 소유인증(B)';

-- 기존에 dupr_verified=true 인 행(없겠지만)을 status 와 정합화
update public.profiles set dupr_status = 'verified'
  where dupr_verified = true and dupr_status = 'none';

-- 🔒 DUPR 결과 컬럼은 service_role 만 변경 가능. 일반 사용자 업데이트는 이전 값 유지.
--    dupr_id 는 사용자가 입력하는 조회 키라 변경 허용.
create or replace function public.protect_dupr_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.dupr_rating    := old.dupr_rating;
    new.dupr_doubles   := old.dupr_doubles;
    new.dupr_singles   := old.dupr_singles;
    new.dupr_verified  := old.dupr_verified;
    new.dupr_status    := old.dupr_status;
    new.dupr_synced_at := old.dupr_synced_at;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_protect_dupr on public.profiles;
create trigger on_profile_protect_dupr
  before update on public.profiles
  for each row execute function public.protect_dupr_columns();


commit;
