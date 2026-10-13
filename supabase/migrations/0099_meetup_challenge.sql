-- 0099: 번개 완료·출석 확정 + 챌린지(이벤트) 집계
--
-- 왜: "피넛 10매치 챌린지"(기간 중 번개 10회 참석)처럼 번개 참석 실적으로 하는 이벤트를 서버에서 계산하기 위해.
--   · meetups.status 의 'closed' 는 모집 마감이라 "실제로 모였다"는 뜻이 아니다 → 완료·출석을 따로 저장한다.
--   · 기존 표(meetups · meetup_participants)의 열은 건드리지 않는다. 새 표 4개 + 함수 + 정책·트리거만 추가한다.
--   · 과거 번개는 자동으로 완료 처리하지 않는다(완료 행이 없으면 "미확정").
--   · 횟수는 저장하지 않고 출석 기록에서 매번 계산한다 → 운영자가 출석을 고치면 바로 반영되고, 앱이 숫자를 올릴 길이 없다.
--   · 완료·출석 표에는 쓰기 정책이 없다. 기록은 아래 함수로만 된다(호스트: meetup_complete / 운영자: *_admin_*).
--   · 완료 기록은 번개와 따로 살아남는다: 번개가 지워져도(호스트 탈퇴 등) 완료·출석은 남고, 판정에 쓰는 값
--     (번개 제목·장소·시작 시각·참석 인원)은 완료 시점에 완료 행에 적어 둔다.
--
-- 챌린지 규칙(kind = 'meetup_attendance'):
--   · 참여 신청제: 회원이 직접 인스타그램 아이디를 등록해 참여 신청해야 집계된다(challenge_enrollments). 신청하지 않은 사람은 번개에 참석해도
--     이 챌린지와 무관하다. 신청 시각 이후에 완료 처리된 참석만 인정한다(그 전 기록은 내역에 보이되 인정되지 않는다).
--   · 인정 대상: 완료 처리된(무효 아님) 번개에 '참석'으로 확정된 사람. 그 번개의 참석자가 2명 이상이고, 취소된 번개가 아닐 것.
--   · 기간: 번개가 [starts_at, ends_at] 안에 열리고, 완료 처리가 starts_at ~ (ends_at + completion_grace_days 일) 안에 이뤄질 것.
--     (종료 직전에 열린 번개를 호스트가 조금 늦게 완료 처리해도 인정하려는 유예. 초 단위로 끝 포함)
--   · 인정 날짜 = 완료 처리 시각의 한국 날짜(Asia/Seoul).
--   · 하루 한도(daily_limit)는 두 날짜에 모두 건다: 완료 처리한 날 기준으로도, 번개가 열린 날 기준으로도 한도까지만 인정한다.
--     완료 처리가 빠른 것부터 차례로 따진다. (같은 날 친 번개를 다른 날에 나눠 완료하거나, 여러 날 치를 하루에 몰아 완료해도 하루 한도를 넘지 않게)
--   · 진행률 = min(인정 횟수, goal_count). 달성 시각 = goal_count 번째 인정 건의 완료 처리 시각.

-- ── 1) 번개 완료 기록 (번개당 1행) ──────────
create table if not exists public.meetup_completions (
  id                uuid primary key default gen_random_uuid(),
  meetup_id         uuid unique references public.meetups(id) on delete set null,   -- 번개가 지워져도 기록은 남는다
  host_id           uuid references public.profiles(id) on delete set null,
  meetup_title      text not null,                       -- 아래 넷은 완료 시점의 값(판정·표시에 쓴다)
  location_name     text not null default '',
  meetup_start_time timestamptz not null,
  present_count     int  not null default 0,             -- 참석으로 확정된 인원. 회원이 탈퇴해도 줄지 않는다(함수가 관리)
  status            text not null default 'completed' check (status in ('completed', 'voided')),  -- voided = 운영자가 무효 처리
  completed_at      timestamptz not null default now(),  -- 완료 처리 시각(챌린지 인정 날짜의 기준)
  completed_by      uuid references public.profiles(id) on delete set null,
  voided_at         timestamptz,                         -- 무효 사유·처리자는 감사로그(audit_logs)에 남는다
  updated_at        timestamptz not null default now()
);
create index if not exists meetup_completions_completed_idx on public.meetup_completions (completed_at);
create index if not exists meetup_completions_host_idx on public.meetup_completions (host_id);

-- ── 2) 출석 (완료 기록 × 회원) — 완료 처리 때 승인 참가자 전원의 행이 만들어진다 ──────────
--   present = 참석 / absent = 불참 / unknown = 미확인(호스트가 고르지 않음)
create table if not exists public.meetup_attendance (
  completion_id uuid not null references public.meetup_completions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  meetup_id     uuid references public.meetups(id) on delete set null,   -- 조회 편의(번개가 지워지면 null)
  status        text not null default 'unknown' check (status in ('present', 'absent', 'unknown')),
  marked_by     uuid references public.profiles(id) on delete set null,
  marked_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (completion_id, user_id)
);
create index if not exists meetup_attendance_user_idx on public.meetup_attendance (user_id);
create index if not exists meetup_attendance_meetup_idx on public.meetup_attendance (meetup_id);

alter table public.meetup_completions enable row level security;
alter table public.meetup_attendance enable row level security;

-- 완료 여부·참석 인원은 번개 상세에 보여주는 정보라 로그인한 사용자는 조회 가능
drop policy if exists "meetup_completions_select" on public.meetup_completions;
create policy "meetup_completions_select" on public.meetup_completions
  for select using (auth.uid() is not null);

-- 출석은 본인 것, 그 번개의 호스트, 운영자만 조회
drop policy if exists "meetup_attendance_select" on public.meetup_attendance;
create policy "meetup_attendance_select" on public.meetup_attendance
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.meetup_completions c where c.id = completion_id and c.host_id = auth.uid())
    or public.my_role() = 'super_admin'
  );

-- 쓰기 정책은 두지 않는다 + 표 권한도 조회만 남긴다(함수로만 기록)
revoke all on public.meetup_completions from anon, authenticated;
revoke all on public.meetup_attendance from anon, authenticated;
grant select on public.meetup_completions to authenticated;
grant select on public.meetup_attendance to authenticated;

-- ── 3) 기존 번개 권한의 빈틈 막기 ──────────
-- 완료 처리는 "승인된 참가자"와 "번개 시작 시각"을 믿는다. 둘 다 앱 화면에서만 지켜지고 서버는 막지 않던 것을 여기서 막는다.
--   (a) 참가자 행의 번개·회원은 바꿀 수 없다 — 호스트가 자기 번개의 참가자 행을 다른 회원으로 바꿔치기하는 것 방지.
--   (b) 승인제 번개에 호스트가 아닌 사람이 스스로 넣는 행은 항상 '승인 대기' — 스스로 '승인'으로 넣는 것 방지.
--   앱은 참가자 행의 status 만 고치고, 참가 신청은 원래 '승인 대기'로 넣으므로 정상 동작은 달라지지 않는다.
create or replace function public.meetup_participants_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_host uuid;
  v_need_approval boolean;
begin
  if tg_op = 'UPDATE' then
    if new.meetup_id is distinct from old.meetup_id or new.user_id is distinct from old.user_id then
      raise exception '참가자 행의 모임·회원은 바꿀 수 없어요.' using errcode = '42501';
    end if;
    return new;
  end if;
  -- 로그인 사용자가 넣는 행만 본다(서버·트리거·SQL 직접 실행은 그대로)
  if auth.uid() is null then return new; end if;
  select m.host_id, m.require_approval into v_host, v_need_approval from public.meetups m where m.id = new.meetup_id;
  if v_host is distinct from auth.uid() and coalesce(v_need_approval, true) then
    new.status := 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists meetup_participants_guard on public.meetup_participants;
create trigger meetup_participants_guard
  before insert or update on public.meetup_participants
  for each row execute function public.meetup_participants_guard();

-- 그 번개가 (무효가 아닌) 완료 처리 상태인가 — 정책·트리거에서 쓴다
create or replace function public.meetup_is_completed(p_meetup_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.meetup_completions c where c.meetup_id = p_meetup_id and c.status = 'completed');
$$;

--   (c) 로그인 사용자는 이미 지난 시각으로 번개를 만들 수 없고(10분 여유), 이미 시작한 번개의 시작 시각을 바꿀 수 없다
--       — 지난 시각의 번개를 만들거나 옛 번개의 시각을 고쳐 곧바로 완료 처리하는 것, 완료 뒤 시각을 옮겨 실적을 지우는 것 방지.
--   (d) 완료 처리된 번개는 호스트가 취소할 수 없다 — 취소하면 참석자들의 실적이 사라지기 때문. 잘못된 완료는 운영자가 무효 처리.
--   운영자와 서버(로그인 사용자 아님)는 그대로 통과한다.
create or replace function public.meetups_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.my_role() = 'super_admin' then return new; end if;
  if tg_op = 'INSERT' then
    if new.start_time < now() - interval '10 minutes' then
      raise exception '이미 지난 시간으로는 모임을 만들 수 없어요.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.start_time is distinct from old.start_time then
    if old.start_time <= now() then
      raise exception '이미 시작한 모임의 시간은 바꿀 수 없어요.' using errcode = '22023';
    end if;
    if new.start_time < now() - interval '10 minutes' then
      raise exception '이미 지난 시간으로는 바꿀 수 없어요.' using errcode = '22023';
    end if;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and public.meetup_is_completed(old.id) then
    raise exception '완료 처리된 모임은 취소할 수 없어요.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists meetups_guard on public.meetups;
create trigger meetups_guard
  before insert or update on public.meetups
  for each row execute function public.meetups_guard();

-- ── 4) 완료 처리된 번개는 호스트가 지울 수 없다 ──────────
--   제한 정책(restrictive)이라 기존 정책의 허용 범위를 넓히지 않고, 완료 행이 없는 번개에는 영향이 없다.
--   회원 탈퇴로 번개가 함께 지워지는 것(참조 무결성)은 이 정책과 무관하게 진행된다 — 그때도 완료·출석 기록은 남는다.
drop policy if exists "meetups_completed_no_delete" on public.meetups;
create policy "meetups_completed_no_delete" on public.meetups as restrictive
  for delete using (public.my_role() = 'super_admin' or not public.meetup_is_completed(id));

-- ── 5) 챌린지(이벤트) 설정 — 특정 이벤트를 코드에 박지 않는다 ──────────
create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'meetup_attendance' check (kind in ('meetup_attendance')),  -- 실적을 세는 방식
  title       text not null check (length(btrim(title)) between 1 and 60),
  description text not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  goal_count  int not null check (goal_count between 1 and 1000),
  daily_limit int not null default 1 check (daily_limit between 1 and 100),   -- 하루(한국 날짜)에 인정하는 최대 횟수
  active      boolean not null default false,
  completion_grace_days  int not null default 3 check (completion_grace_days between 0 and 30),    -- 종료 뒤 며칠까지의 완료 처리를 인정할지
  visible_days_after_end int not null default 7 check (visible_days_after_end between 0 and 365),  -- 종료 뒤 며칠 동안 앱에 카드·메뉴를 보여줄지
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint challenges_period_check check (ends_at > starts_at)
);
-- (이미 표가 있는 DB 용)
alter table public.challenges add column if not exists completion_grace_days int not null default 3 check (completion_grace_days between 0 and 30);
alter table public.challenges add column if not exists visible_days_after_end int not null default 7 check (visible_days_after_end between 0 and 365);

alter table public.challenges enable row level security;
-- 일반 사용자는 켜진 챌린지만, 운영자는 전부
drop policy if exists "challenges_select" on public.challenges;
create policy "challenges_select" on public.challenges
  for select using (active or public.my_role() = 'super_admin');
drop policy if exists "challenges_insert" on public.challenges;
create policy "challenges_insert" on public.challenges
  for insert with check (public.my_role() = 'super_admin');
drop policy if exists "challenges_update" on public.challenges;
create policy "challenges_update" on public.challenges
  for update using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');
drop policy if exists "challenges_delete" on public.challenges;
create policy "challenges_delete" on public.challenges
  for delete using (public.my_role() = 'super_admin');

-- 설정을 바꾸면 수정 시각을 찍고 변경 기록을 남긴다(기간·목표를 바꾸면 달성 여부가 달라지므로)
create or replace function public.challenges_touch()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values ((select p.id from public.profiles p where p.id = auth.uid()), public.my_role(), 'challenge.' || lower(tg_op), 'challenges',
          coalesce(new.id, old.id)::text,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
drop trigger if exists challenges_touch on public.challenges;
create trigger challenges_touch before insert or update or delete on public.challenges
  for each row execute function public.challenges_touch();

-- 참여 신청(챌린지 × 회원) = 인스타그램 아이디 등록. 신청 시각은 서버가 찍는다 — 앱이 과거 시각으로 넣을 수 없도록 쓰기는 함수로만.
--   인스타그램 아이디는 본인과 운영자만 볼 수 있다. 한 챌린지에서 같은 아이디는 한 사람만 쓸 수 있다(여러 계정으로 중복 참여 방지).
create table if not exists public.challenge_enrollments (
  challenge_id uuid not null references public.challenges(id) on delete restrict,   -- 신청자가 있는 챌린지는 지울 수 없다(끄기만)
  user_id      uuid not null references public.profiles(id) on delete cascade,
  instagram_id text not null check (instagram_id ~ '^[a-z0-9._]{1,30}$'),   -- '@' 없이, 소문자
  enrolled_at  timestamptz not null default now(),   -- 이 시각 이후에 완료 처리된 참석만 인정
  updated_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists challenge_enrollments_user_idx on public.challenge_enrollments (user_id);
create unique index if not exists challenge_enrollments_instagram_idx on public.challenge_enrollments (challenge_id, instagram_id);

alter table public.challenge_enrollments enable row level security;
-- 내 신청만(운영자는 전부)
drop policy if exists "challenge_enrollments_select" on public.challenge_enrollments;
create policy "challenge_enrollments_select" on public.challenge_enrollments
  for select using (auth.uid() = user_id or public.my_role() = 'super_admin');
revoke all on public.challenge_enrollments from anon, authenticated;
grant select on public.challenge_enrollments to authenticated;

-- 입력한 인스타그램 아이디 다듬기: 앞의 '@', 프로필 주소(instagram.com/아이디), 대문자를 정리한다. 형식이 아니면 null.
--   인스타그램 아이디 규칙: 영문·숫자·밑줄·마침표, 30자 이하.
create or replace function public.normalize_instagram_id(p text)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  v text := lower(btrim(coalesce(p, ''), E' \t\n\r'));
begin
  v := regexp_replace(v, '^(https?://)?(www\.|m\.)?instagram\.com/(_u/)?', '');   -- 프로필 주소(앞의 http·www 는 없어도 된다. _u/ 는 앱으로 여는 주소)
  v := regexp_replace(v, '[/?#].*$', '');
  v := regexp_replace(v, '^@+', '');
  if v !~ '^[a-z0-9._]{1,30}$' then return null; end if;
  -- 게시물·릴스·공유 주소 등을 붙여 넣었을 때 남는 경로 이름은 아이디가 아니다
  if v in ('p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct', 'share', '_u') then return null; end if;
  -- 주소만 넣었거나 다른 하위 도메인(business. 등)을 넣었을 때 남는 도메인도 아이디가 아니다
  if v ~ '(^|\.)instagram\.com$' then return null; end if;
  return v;
end;
$$;

-- 참여 신청(회원 본인): 인스타그램 아이디를 등록한다. 켜져 있고 아직 끝나지 않은 챌린지에만 새로 신청할 수 있다.
--   이미 신청한 사람이 다시 부르면 아이디만 바꾼다(신청 시각은 그대로 — 끝난 뒤에도 아이디는 고칠 수 있다).
--   결과: ok(신청됨) / updated(아이디 변경) / forbidden / not_found(없거나 꺼진 챌린지) / ended /
--         invalid_instagram(아이디 형식 아님) / instagram_taken(다른 사람이 이미 등록한 아이디)
create or replace function public.challenge_join(p_challenge_id uuid, p_instagram_id text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  v_ig text := public.normalize_instagram_id(p_instagram_id);
  v_old text;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  select id, ends_at, active into c from public.challenges where id = p_challenge_id;
  if not found or not c.active then return 'not_found'; end if;
  if v_ig is null then return 'invalid_instagram'; end if;
  if exists (select 1 from public.challenge_enrollments e
              where e.challenge_id = p_challenge_id and e.instagram_id = v_ig and e.user_id <> auth.uid()) then
    return 'instagram_taken';
  end if;

  select e.instagram_id into v_old from public.challenge_enrollments e where e.challenge_id = p_challenge_id and e.user_id = auth.uid();
  if found then
    if v_old = v_ig then return 'updated'; end if;
    begin
      update public.challenge_enrollments set instagram_id = v_ig, updated_at = now() where challenge_id = p_challenge_id and user_id = auth.uid();
    exception when unique_violation then
      return 'instagram_taken';   -- 같은 순간에 다른 사람이 같은 아이디로 등록
    end;
    insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
    values (auth.uid(), public.my_role(), 'challenge.instagram', 'challenge_enrollments', p_challenge_id::text || ':' || auth.uid()::text,
            jsonb_build_object('instagram_id', v_old), jsonb_build_object('instagram_id', v_ig));
    return 'updated';
  end if;

  if now() > c.ends_at then return 'ended'; end if;
  begin
    insert into public.challenge_enrollments (challenge_id, user_id, instagram_id) values (p_challenge_id, auth.uid(), v_ig);
  exception when unique_violation then
    -- 같은 순간의 중복: 내 신청이 이미 들어갔으면(두 번 눌림) 성공, 아니면 다른 사람이 같은 아이디를 먼저 등록한 것
    if exists (select 1 from public.challenge_enrollments e where e.challenge_id = p_challenge_id and e.user_id = auth.uid()) then return 'ok'; end if;
    return 'instagram_taken';
  end;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'challenge.join', 'challenge_enrollments', p_challenge_id::text || ':' || auth.uid()::text, null,
          jsonb_build_object('enrolled_at', now(), 'instagram_id', v_ig));
  return 'ok';
end;
$$;

-- 참여 취소(회원 본인). 지금까지의 기록이 이 챌린지에서 빠진다. 다시 신청하면 그 시각부터 새로 인정된다.
--   끝난 챌린지는 취소할 수 없다(다시 신청할 수 없어 되돌릴 길이 없다. 필요하면 운영자에게 요청).
--   결과: ok / forbidden / not_found(신청한 적 없음) / ended
create or replace function public.challenge_leave(p_challenge_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old record;
begin
  if auth.uid() is null then return 'forbidden'; end if;
  if exists (select 1 from public.challenges c where c.id = p_challenge_id and now() > c.ends_at) then return 'ended'; end if;
  delete from public.challenge_enrollments where challenge_id = p_challenge_id and user_id = auth.uid()
  returning enrolled_at, instagram_id into v_old;
  if not found then return 'not_found'; end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'challenge.leave', 'challenge_enrollments', p_challenge_id::text || ':' || auth.uid()::text,
          jsonb_build_object('enrolled_at', v_old.enrolled_at, 'instagram_id', v_old.instagram_id), null);
  return 'ok';
end;
$$;

-- 참여 신청 정정·대리 신청(운영자): 신청 시각과 인스타그램 아이디. 신청 시각 이후의 참석만 인정되므로,
--   신청이 늦었다는 문의를 바로잡는 수단. 값을 주지 않은 항목(null)은 그대로 둔다. 새로 넣을 때는 둘 다 필요하다.
--   결과: ok / forbidden / not_found(챌린지·회원 없음) / invalid(시각이 미래, 새로 넣는데 값이 빠짐) /
--         invalid_instagram / instagram_taken
create or replace function public.challenge_enrollment_admin_set(
  p_challenge_id uuid, p_user_id uuid, p_enrolled_at timestamptz default null, p_instagram_id text default null, p_note text default ''
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old record;
  v_found boolean;
  v_ig text := public.normalize_instagram_id(p_instagram_id);
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  if not exists (select 1 from public.challenges c where c.id = p_challenge_id)
     or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return 'not_found';
  end if;
  if p_enrolled_at is not null and p_enrolled_at > now() then return 'invalid'; end if;
  if p_instagram_id is not null and v_ig is null then return 'invalid_instagram'; end if;
  if v_ig is not null and exists (select 1 from public.challenge_enrollments e
                                   where e.challenge_id = p_challenge_id and e.instagram_id = v_ig and e.user_id <> p_user_id) then
    return 'instagram_taken';
  end if;

  select e.enrolled_at, e.instagram_id into v_old from public.challenge_enrollments e where e.challenge_id = p_challenge_id and e.user_id = p_user_id;
  v_found := found;
  if v_found then
    update public.challenge_enrollments
       set enrolled_at = coalesce(p_enrolled_at, enrolled_at), instagram_id = coalesce(v_ig, instagram_id), updated_at = now()
     where challenge_id = p_challenge_id and user_id = p_user_id;
  else
    if p_enrolled_at is null or v_ig is null then return 'invalid'; end if;
    insert into public.challenge_enrollments (challenge_id, user_id, instagram_id, enrolled_at) values (p_challenge_id, p_user_id, v_ig, p_enrolled_at);
  end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'challenge.enrollment_set', 'challenge_enrollments', p_challenge_id::text || ':' || p_user_id::text,
          case when v_found then jsonb_build_object('enrolled_at', v_old.enrolled_at, 'instagram_id', v_old.instagram_id) end,
          jsonb_build_object('enrolled_at', p_enrolled_at, 'instagram_id', v_ig, 'note', left(btrim(coalesce(p_note, '')), 200)));
  return 'ok';
end;
$$;

-- ── 6) 번개 완료 처리 (호스트) ──────────
-- 번개 시작 시각이 지난 뒤, 호스트가 실제로 온 사람을 골라 확정한다. 한 번 확정하면 호스트는 고칠 수 없다(운영자만).
--   p_present = 참석한 사람 / p_absent = 불참한 사람 / 둘 다 아닌 승인 참가자는 미확인으로 남는다.
--   호스트 본인도 p_present 에 있어야 참석으로 인정된다.
--   결과: ok / not_found / forbidden / cancelled / not_started / already_completed / voided(운영자가 무효 처리한 번개) /
--         invalid_member(승인 참가자가 아닌 사람이 섞임) / need_two(참석자 2명 미만)
create or replace function public.meetup_complete(p_meetup_id uuid, p_present uuid[], p_absent uuid[] default '{}')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  m record;
  v_uid uuid := auth.uid();
  v_done text;
  v_id uuid;
  v_members uuid[];
  v_present uuid[];
  v_absent uuid[];
begin
  if v_uid is null then return 'forbidden'; end if;
  select id, host_id, status, start_time, title, location_name into m from public.meetups where id = p_meetup_id for no key update;
  if not found then return 'not_found'; end if;
  if m.host_id <> v_uid and public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  if m.status = 'cancelled' then return 'cancelled'; end if;
  if m.start_time > now() then return 'not_started'; end if;
  select c.status into v_done from public.meetup_completions c where c.meetup_id = p_meetup_id;
  if found then return case when v_done = 'voided' then 'voided' else 'already_completed' end; end if;

  -- 고를 수 있는 사람: 승인된 참가자 + 호스트
  select array_agg(distinct s.u) into v_members
    from (select p.user_id as u from public.meetup_participants p where p.meetup_id = p_meetup_id and p.status = 'approved'
          union select m.host_id) s;
  select coalesce(array_agg(distinct x), '{}') into v_present from unnest(coalesce(p_present, '{}'::uuid[])) x where x is not null;
  select coalesce(array_agg(distinct x), '{}') into v_absent from unnest(coalesce(p_absent, '{}'::uuid[])) x where x is not null;
  if not (v_present <@ v_members) or not (v_absent <@ v_members) or (v_present && v_absent) then return 'invalid_member'; end if;
  if cardinality(v_present) < 2 then return 'need_two'; end if;

  insert into public.meetup_completions (meetup_id, host_id, meetup_title, location_name, meetup_start_time, present_count, status, completed_at, completed_by)
  values (p_meetup_id, m.host_id, m.title, m.location_name, m.start_time, cardinality(v_present), 'completed', now(), v_uid)
  returning id into v_id;
  insert into public.meetup_attendance (completion_id, user_id, meetup_id, status, marked_by)
  select v_id, x, p_meetup_id,
         case when x = any (v_present) then 'present' when x = any (v_absent) then 'absent' else 'unknown' end,
         v_uid
    from unnest(v_members) x;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (v_uid, public.my_role(), 'meetup.complete', 'meetup_completions', v_id::text, null,
          jsonb_build_object('meetup_id', p_meetup_id, 'present', to_jsonb(v_present), 'absent', to_jsonb(v_absent), 'members', cardinality(v_members)));
  return 'ok';
end;
$$;

-- ── 7) 운영자 정정 ──────────
-- 출석 고치기. 결과: ok / forbidden / invalid / not_found / invalid_member
create or replace function public.meetup_attendance_admin_set(p_completion_id uuid, p_user_id uuid, p_status text, p_note text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  v_old text;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  if p_status is null or p_status not in ('present', 'absent', 'unknown') then return 'invalid'; end if;
  select id, meetup_id, host_id into c from public.meetup_completions where id = p_completion_id for update;
  if not found then return 'not_found'; end if;

  select a.status into v_old from public.meetup_attendance a where a.completion_id = p_completion_id and a.user_id = p_user_id;
  if not found then
    -- 출석 명단에 없던 사람은 그 번개의 승인 참가자이거나 호스트일 때만 넣을 수 있다
    if not exists (select 1 from public.meetup_participants p where p.meetup_id = c.meetup_id and p.user_id = p_user_id and p.status = 'approved')
       and c.host_id is distinct from p_user_id then
      return 'invalid_member';
    end if;
    insert into public.meetup_attendance (completion_id, user_id, meetup_id, status, marked_by)
    values (p_completion_id, p_user_id, c.meetup_id, p_status, auth.uid());
  else
    update public.meetup_attendance
       set status = p_status, marked_by = auth.uid(), marked_at = now(), updated_at = now()
     where completion_id = p_completion_id and user_id = p_user_id;
  end if;
  -- 참석 인원은 바뀐 만큼만 더하고 뺀다(탈퇴로 출석 행이 사라진 사람 몫은 그대로 둔다)
  update public.meetup_completions
     set present_count = greatest(0, present_count + (p_status = 'present')::int - (coalesce(v_old, '') = 'present')::int), updated_at = now()
   where id = p_completion_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'meetup.attendance_set', 'meetup_attendance', p_completion_id::text || ':' || p_user_id::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'note', left(btrim(coalesce(p_note, '')), 200)));
  return 'ok';
end;
$$;

-- 완료 무효 처리 / 무효 취소. p_status: 'voided' | 'completed'. 결과: ok / forbidden / invalid / not_found /
--   cancelled(무효로 둔 사이 호스트가 번개를 취소함 — 취소된 번개는 인정하지 않으므로 무효를 되돌릴 수 없다)
--   완료 처리 시각(completed_at)은 바꾸지 않는다 → 무효를 취소하면 원래 날짜로 다시 인정된다.
create or replace function public.meetup_completion_admin_set(p_completion_id uuid, p_status text, p_reason text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old text;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  if p_status is null or p_status not in ('voided', 'completed') then return 'invalid'; end if;
  select c.status into v_old from public.meetup_completions c where c.id = p_completion_id for update;
  if not found then return 'not_found'; end if;
  if p_status = 'completed' and exists (select 1 from public.meetup_completions c join public.meetups m on m.id = c.meetup_id
                                         where c.id = p_completion_id and m.status = 'cancelled') then
    return 'cancelled';
  end if;

  update public.meetup_completions
     set status = p_status, voided_at = case when p_status = 'voided' then now() else null end, updated_at = now()
   where id = p_completion_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'meetup.completion_set', 'meetup_completions', p_completion_id::text,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'reason', left(btrim(coalesce(p_reason, '')), 200)));
  return 'ok';
end;
$$;

-- 완료 처리 시각 정정(운영자). 인정 날짜가 완료 처리 시각을 따르므로, 호스트가 늦게 처리했거나 몰아서 처리한 것을 바로잡는 수단.
--   번개 시작 시각 이후 ~ 지금 사이로만 옮길 수 있다. 결과: ok / forbidden / invalid / not_found
create or replace function public.meetup_completion_admin_set_time(p_completion_id uuid, p_completed_at timestamptz, p_note text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then return 'forbidden'; end if;
  select id, completed_at, meetup_start_time into c from public.meetup_completions where id = p_completion_id for update;
  if not found then return 'not_found'; end if;
  if p_completed_at is null or p_completed_at < c.meetup_start_time or p_completed_at > now() then return 'invalid'; end if;

  update public.meetup_completions set completed_at = p_completed_at, updated_at = now() where id = p_completion_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'meetup.completion_time', 'meetup_completions', p_completion_id::text,
          jsonb_build_object('completed_at', c.completed_at),
          jsonb_build_object('completed_at', p_completed_at, 'note', left(btrim(coalesce(p_note, '')), 200)));
  return 'ok';
end;
$$;

-- ── 8) 집계 ──────────
-- 챌린지 장부(내부용): 참여 신청한 사람의, 기간 안에 완료 처리된 번개 출석 기록 한 줄씩 + 인정 여부.
--   p_user_id 가 null 이면 신청한 모든 사람. 앱에서는 직접 부를 수 없다(아래 함수들이 권한을 확인하고 부른다).
--   참여 신청을 하지 않은 사람은 나오지 않는다.
--   counted  = 실제 참석으로 치는가(신청 이후 + 참석 확정 + 완료 유효 + 취소 아님 + 참석자 2명 이상)
--   credited = 챌린지 실적으로 인정하는가(counted 중, 완료 처리한 날·번개가 열린 날 둘 다 daily_limit 안)
--   reason   = 인정되지 않은 이유: voided / cancelled / absent / unknown / too_few / before_join(참여 신청 전) / daily_limit
--   credit_no = 그 사람의 몇 번째 인정 건인가(완료 처리 시각 순)
--   meetup_id 는 번개가 지워졌으면 null 이다(기록 자체는 남는다).
create or replace function public.challenge_ledger(p_challenge_id uuid, p_user_id uuid default null)
returns table (
  user_id uuid, completion_id uuid, meetup_id uuid, meetup_title text, location_name text, meetup_start_time timestamptz,
  completed_at timestamptz, credit_date date, attendance text, counted boolean, credited boolean, reason text, credit_no int
)
language plpgsql stable
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  ch record;
  rec record;
  v_user uuid := null;
  v_by_done jsonb := '{}';   -- 완료 처리한 날짜별 인정 건수
  v_by_play jsonb := '{}';   -- 번개가 열린 날짜별 인정 건수
  v_no int := 0;
  v_done_key text;
  v_play_key text;
  v_done_n int;
  v_play_n int;
begin
  select c.* into ch from public.challenges c where c.id = p_challenge_id and c.kind = 'meetup_attendance';
  if not found then return; end if;

  for rec in
    select t.uid, t.att, mc.id as cid, mc.meetup_id as mid, mc.meetup_title as title, mc.location_name as loc,
           mc.meetup_start_time as started, mc.status as cstatus, mc.completed_at as done_at, mc.present_count as pc,
           (mc.completed_at >= t.joined) as after_join,                              -- 참여 신청한 뒤에 완료 처리됐는가
           (mc.completed_at at time zone 'Asia/Seoul')::date as done_date,           -- 완료 처리한 날(한국 날짜) = 인정 날짜
           (mc.meetup_start_time at time zone 'Asia/Seoul')::date as play_date,      -- 번개가 열린 날(한국 날짜)
           coalesce(m.status, '') as mstatus                                         -- 번개가 지워졌으면 취소로 보지 않는다
      from (
        -- 한 사람 것: 그 사람의 신청 행·출석 행에서 출발한다(인덱스) — 홈 화면에서 매번 부르는 경로
        select a.user_id as uid, a.completion_id as cid, a.status as att, e.enrolled_at as joined
          from public.challenge_enrollments e
          join public.meetup_attendance a on a.user_id = e.user_id
         where p_user_id is not null and e.challenge_id = p_challenge_id and e.user_id = p_user_id
        union all
        -- 신청한 모든 사람(운영자 현황)
        select a.user_id, a.completion_id, a.status, e.enrolled_at
          from public.challenge_enrollments e
          join public.meetup_attendance a on a.user_id = e.user_id
         where p_user_id is null and e.challenge_id = p_challenge_id
      ) t
      join public.meetup_completions mc on mc.id = t.cid
      left join public.meetups m on m.id = mc.meetup_id
     where mc.meetup_start_time >= ch.starts_at    -- 완료 시점에 적어 둔 시작 시각(나중에 번개를 고쳐도 달라지지 않는다)
       and mc.meetup_start_time <= ch.ends_at
       and mc.completed_at >= ch.starts_at
       and date_trunc('second', mc.completed_at) <= ch.ends_at + make_interval(days => ch.completion_grace_days)
     order by t.uid, mc.completed_at, mc.id        -- 사람별로, 완료 처리가 빠른 것부터 차례로 따진다
  loop
    if v_user is distinct from rec.uid then
      v_user := rec.uid;
      v_by_done := '{}';
      v_by_play := '{}';
      v_no := 0;
    end if;

    user_id := rec.uid;
    completion_id := rec.cid;
    meetup_id := rec.mid;
    meetup_title := rec.title;
    location_name := rec.loc;
    meetup_start_time := rec.started;
    completed_at := rec.done_at;
    credit_date := rec.done_date;
    attendance := rec.att;
    counted := rec.after_join and rec.att = 'present' and rec.cstatus = 'completed' and rec.mstatus <> 'cancelled' and rec.pc >= 2;
    credited := false;
    credit_no := null;
    reason := null;

    if counted then
      v_done_key := rec.done_date::text;
      v_play_key := rec.play_date::text;
      v_done_n := coalesce((v_by_done ->> v_done_key)::int, 0);
      v_play_n := coalesce((v_by_play ->> v_play_key)::int, 0);
      if v_done_n < ch.daily_limit and v_play_n < ch.daily_limit then
        credited := true;
        v_no := v_no + 1;
        credit_no := v_no;
        v_by_done := jsonb_set(v_by_done, array[v_done_key], to_jsonb(v_done_n + 1), true);
        v_by_play := jsonb_set(v_by_play, array[v_play_key], to_jsonb(v_play_n + 1), true);
      else
        reason := 'daily_limit';   -- 그 날(완료 처리한 날 또는 번개가 열린 날)의 한도를 이미 채움
      end if;
    else
      reason := case when rec.cstatus = 'voided' then 'voided'
                     when rec.mstatus = 'cancelled' then 'cancelled'
                     when not rec.after_join then 'before_join'   -- 출석 상태보다 먼저(출석을 고쳐도 인정되지 않는 기록)
                     when rec.att = 'absent' then 'absent'
                     when rec.att = 'unknown' then 'unknown'
                     else 'too_few' end;
    end if;
    return next;
  end loop;
end;
$$;

-- 내 인정 내역(최근 순). 참여 신청을 하지 않았으면 빈 결과. 다른 사람 것은 운영자만. 꺼진 챌린지는 운영자만.
create or replace function public.challenge_entries(p_challenge_id uuid, p_user_id uuid default null)
returns table (
  user_id uuid, completion_id uuid, meetup_id uuid, meetup_title text, location_name text, meetup_start_time timestamptz,
  completed_at timestamptz, credit_date date, attendance text, counted boolean, credited boolean, reason text, credit_no int
)
language sql stable
security definer set search_path = public
as $$
  select l.*
    from public.challenge_ledger(p_challenge_id, coalesce(p_user_id, auth.uid())) l
   where auth.uid() is not null
     and (coalesce(p_user_id, auth.uid()) = auth.uid() or public.my_role() = 'super_admin')
     and (public.my_role() = 'super_admin'
          or exists (select 1 from public.challenges c where c.id = p_challenge_id and c.active))
   order by l.completed_at desc, l.completion_id;
$$;

-- 내 진행률 한 줄(+ 내 신청 시각·인스타그램 아이디). 참여 신청 전이어도 한 줄이 나온다(enrolled = false, 횟수 0). 꺼졌거나 없는 챌린지는 0줄. 다른 사람 것은 운영자만.
--   actual_count = 실제 참석 횟수 / credited_count = 하루 한도를 적용한 인정 횟수 / progress = min(인정, 목표)
create or replace function public.challenge_progress(p_challenge_id uuid, p_user_id uuid default null)
returns table (
  challenge_id uuid, user_id uuid, enrolled boolean, enrolled_at timestamptz, instagram_id text,
  actual_count int, credited_count int, goal_count int, progress int, achieved boolean, achieved_at timestamptz
)
language sql stable
security definer set search_path = public
as $$
  select ch.id, coalesce(p_user_id, auth.uid()), e.user_id is not null, e.enrolled_at, e.instagram_id,
         coalesce(s.actual_count, 0), coalesce(s.credited_count, 0), ch.goal_count,
         least(coalesce(s.credited_count, 0), ch.goal_count),
         coalesce(s.credited_count, 0) >= ch.goal_count,
         s.achieved_at
    from public.challenges ch
    left join public.challenge_enrollments e on e.challenge_id = ch.id and e.user_id = coalesce(p_user_id, auth.uid())
    left join lateral (
      select (count(*) filter (where l.counted))::int as actual_count,
             (count(*) filter (where l.credited))::int as credited_count,
             min(l.completed_at) filter (where l.credit_no = ch.goal_count) as achieved_at
        from public.challenge_ledger(ch.id, coalesce(p_user_id, auth.uid())) l
    ) s on true
   where ch.id = p_challenge_id
     and auth.uid() is not null
     and (coalesce(p_user_id, auth.uid()) = auth.uid() or public.my_role() = 'super_admin')
     and (ch.active or public.my_role() = 'super_admin');
$$;

-- 참여 현황(운영자): 참여 신청한 모든 사람의 요약(기록이 아직 없는 사람 포함). 인정 횟수 많은 순, 같으면 먼저 달성한 순.
--   마지막 정렬 기준은 회원 id — 닉네임은 겹칠 수 있어, 나눠 읽을 때 순서가 흔들리지 않게 한다.
create or replace function public.challenge_participants(p_challenge_id uuid)
returns table (
  user_id uuid, nickname text, email text, actual_count int, credited_count int, goal_count int,
  progress int, achieved boolean, achieved_at timestamptz, last_credited_at timestamptz, enrolled_at timestamptz, instagram_id text
)
language sql stable
security definer set search_path = public
as $$
  select e.user_id, p.nickname, u.email::text,
         coalesce(s.actual_count, 0), coalesce(s.credited_count, 0), ch.goal_count,
         least(coalesce(s.credited_count, 0), ch.goal_count),
         coalesce(s.credited_count, 0) >= ch.goal_count,
         s.achieved_at, s.last_credited_at, e.enrolled_at, e.instagram_id
    from public.challenges ch
    join public.challenge_enrollments e on e.challenge_id = ch.id
    join public.profiles p on p.id = e.user_id
    left join auth.users u on u.id = e.user_id
    left join (
      select l.user_id,
             (count(*) filter (where l.counted))::int as actual_count,
             (count(*) filter (where l.credited))::int as credited_count,
             min(l.completed_at) filter (where l.credit_no = (select c.goal_count from public.challenges c where c.id = p_challenge_id)) as achieved_at,
             max(l.completed_at) filter (where l.credited) as last_credited_at
        from public.challenge_ledger(p_challenge_id, null) l
       group by l.user_id
    ) s on s.user_id = e.user_id
   where ch.id = p_challenge_id
     and public.my_role() = 'super_admin'
   order by 5 desc, 9 asc nulls last, 2, 1;
$$;

-- ── 9) 실행 권한 ──────────
revoke all on function public.meetup_participants_guard() from public, anon, authenticated;
revoke all on function public.meetups_guard() from public, anon, authenticated;
revoke all on function public.challenges_touch() from public, anon, authenticated;
revoke all on function public.meetup_is_completed(uuid) from public;
revoke all on function public.meetup_complete(uuid, uuid[], uuid[]) from public, anon;
revoke all on function public.meetup_attendance_admin_set(uuid, uuid, text, text) from public, anon;
revoke all on function public.meetup_completion_admin_set(uuid, text, text) from public, anon;
revoke all on function public.meetup_completion_admin_set_time(uuid, timestamptz, text) from public, anon;
revoke all on function public.normalize_instagram_id(text) from public, anon;
revoke all on function public.challenge_join(uuid, text) from public, anon;
revoke all on function public.challenge_leave(uuid) from public, anon;
revoke all on function public.challenge_enrollment_admin_set(uuid, uuid, timestamptz, text, text) from public, anon;
revoke all on function public.challenge_ledger(uuid, uuid) from public, anon, authenticated;   -- 내부용
revoke all on function public.challenge_entries(uuid, uuid) from public, anon;
revoke all on function public.challenge_progress(uuid, uuid) from public, anon;
revoke all on function public.challenge_participants(uuid) from public, anon;
grant execute on function public.meetup_is_completed(uuid) to anon, authenticated, service_role;   -- 삭제 제한 정책이 요청자 권한으로 부른다
grant execute on function public.meetup_complete(uuid, uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.meetup_attendance_admin_set(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.meetup_completion_admin_set(uuid, text, text) to authenticated, service_role;
grant execute on function public.meetup_completion_admin_set_time(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.normalize_instagram_id(text) to authenticated, service_role;
grant execute on function public.challenge_join(uuid, text) to authenticated, service_role;
grant execute on function public.challenge_leave(uuid) to authenticated, service_role;
grant execute on function public.challenge_enrollment_admin_set(uuid, uuid, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.challenge_ledger(uuid, uuid) to service_role;
grant execute on function public.challenge_entries(uuid, uuid) to authenticated, service_role;
grant execute on function public.challenge_progress(uuid, uuid) to authenticated, service_role;
grant execute on function public.challenge_participants(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
