-- ============================================================================
-- PROD 적용: 0095 클럽 등급 보호 + 회원 셀프 가입 제한 + 공용 등급/권한 함수
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)
--
-- 왜(회비 기능 전 필수 보안):
--   ① 클럽장이 API로 clubs.tier/premium_status 를 직접 바꿔 무료로 프리미엄이 될 수 있었음
--      → 보호 트리거: 앱 쓰기는 조용히 교정(에러 없음). 이미 깔린 4.0.0 앱의 클럽 생성·체험 시작도 그대로 동작.
--   ② 누구나 API로 자기 자신을 '승인된 임원'으로 클럽에 넣을 수 있었음
--      → 셀프 가입은 일반 회원·승인 대기로만 + role/status CHECK.
--   ③ 서버 계산 플랜 effective_plan(체험 만료·해지 후 기간 종료 반영)을 clubs_with_counts 에 노출.
--   ④ 정기모임·클럽 월례대회 생성도 서버에서 프리미엄 이상만(기존엔 앱 화면에서만 막혀 API 직접 호출로 우회 가능).
--
-- ⚠️ 배포 순서: 이 SQL 을 운영에 먼저 적용한 뒤에 새 앱 코드(club-plan.ts·start_club_trial 사용)를 담은
--    OTA(eas update)·스토어 빌드를 내보낼 것. 새 코드는 effective_plan 컬럼·start_club_trial 함수에 의존.
--
-- DEV 검증(2026-10-08): 권한 시험 19개 + QA 보강 시험 21개 통과(임원 셀프 가입 차단, 등급 조작 무효, 체험 1회·서버 날짜,
--   로그인 없는 체험 시작 차단, 무료 클럽 정기모임·월례대회 API 생성 차단, 새 클럽 클럽장 행 자동 생성 정상,
--   비로그인 목록 조회 정상, 4.0.0 앱 요청 형태 호환). 실행 전 운영 데이터 점검 결과:
--   club_members = owner/approved·member/approved·member/pending 만 존재(CHECK 안전), 임원 0명(악용 흔적 없음).
--
-- 실행: Supabase SQL Editor(운영 프로젝트)에 전체 붙여넣기 → Run
--   또는 npx supabase db query -f docs/PROD_APPLY_0095.sql --linked --project-ref jbvtdthtmrlndduqiikj
-- 재실행해도 안전(drop if exists / create or replace).
-- ============================================================================

-- 0095: 클럽 등급 보호 + 회원 셀프 가입 제한 + 공용 등급/권한 함수 (회비 기능 선행 보안)
--   ① clubs.tier / premium_* 는 서버(서비스롤 Edge·security definer 함수·cron)만 바꾼다.
--      앱(로그인 사용자)의 쓰기는 에러 없이 조용히 교정 → 구버전 앱(생성 시 체험, 상세에서 체험 시작)도 안 깨짐.
--   ② club_members 셀프 가입은 일반 회원·승인 대기로만. (기존: 승인된 임원으로 셀프 삽입 가능했음) + role/status CHECK.
--   ③ 공용 함수: club_effective_plan / club_plan_rank / club_plan_usable / is_club_manager / start_club_trial.
--   ④ SQL 의 등급 직접 비교(c.tier = 'premium') 2곳 → club_plan_usable. clubs_with_counts 에 effective_plan 노출.

-- ③ 공용 함수 ------------------------------------------------------------------

-- 지금 실제로 쓸 수 있는 플랜. 체험 만료·해지 후 기간 종료까지 서버 기준으로 판단(club_subscriptions 는 클럽장만 조회 가능 → definer).
create or replace function public.club_effective_plan(p_club_id uuid)
returns text
language plpgsql
stable security definer set search_path = public
as $$
declare
  c record;
begin
  select tier, premium_status, premium_trial_ends_at into c from public.clubs where id = p_club_id;
  if not found or c.tier is distinct from 'premium' then
    return 'free';
  end if;
  if not (c.premium_status = 'active'
          or (c.premium_status = 'trialing' and c.premium_trial_ends_at is not null and c.premium_trial_ends_at > now())) then
    return 'free';
  end if;
  if exists (select 1 from public.club_subscriptions s
              where s.club_id = p_club_id and s.status = 'canceled'
                and s.current_period_end is not null and s.current_period_end <= now()) then
    return 'free';
  end if;
  return 'premium';
end;
$$;

create or replace function public.club_plan_rank(p_plan text)
returns int
language sql
immutable set search_path = public
as $$
  select case p_plan when 'premium_plus' then 2 when 'premium' then 1 else 0 end;
$$;

create or replace function public.club_plan_usable(p_club_id uuid, p_min text default 'premium')
returns boolean
language sql
stable security definer set search_path = public
as $$
  select public.club_plan_rank(public.club_effective_plan(p_club_id)) >= public.club_plan_rank(p_min);
$$;

-- 클럽 관리자 = 클럽장 또는 승인된 임원 (is_club_session_manager 의 클럽 단위 버전)
create or replace function public.is_club_manager(p_club_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (select 1 from public.clubs c where c.id = p_club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members m
                  where m.club_id = p_club_id and m.user_id = auth.uid()
                    and m.role = 'officer' and m.status = 'approved');
$$;

-- 프리미엄 1개월 무료 체험 시작 (클럽장, 클럽당 1회). 날짜는 서버 기준.
create or replace function public.start_club_trial(p_club_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
begin
  select owner_id, premium_status into v_owner, v_status from public.clubs where id = p_club_id for update;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  if v_status <> 'none' then return 'already_used'; end if;
  update public.clubs
     set tier = 'premium', premium_status = 'trialing',
         premium_started_at = now(), premium_trial_ends_at = now() + interval '1 month'
   where id = p_club_id;
  return 'ok';
end;
$$;

-- 뷰(clubs_with_counts)는 비로그인 화면에서도 읽힐 수 있어 effective_plan 은 anon 에도 허용(등급 배지 수준 정보).
revoke execute on function public.club_effective_plan(uuid) from public;
grant execute on function public.club_effective_plan(uuid) to anon, authenticated;
revoke execute on function public.club_plan_rank(text) from public, anon;
grant execute on function public.club_plan_rank(text) to authenticated;
revoke execute on function public.club_plan_usable(uuid, text) from public, anon;
grant execute on function public.club_plan_usable(uuid, text) to authenticated;
revoke execute on function public.is_club_manager(uuid) from public, anon;
grant execute on function public.is_club_manager(uuid) to authenticated;
revoke execute on function public.start_club_trial(uuid) from public, anon;
grant execute on function public.start_club_trial(uuid) to authenticated;

-- ① 등급 컬럼 보호 트리거 ----------------------------------------------------------
-- security invoker(기본): current_user 로 호출 경로를 구분. PostgREST 앱 요청 = authenticated/anon,
-- 서비스롤 Edge = service_role, definer 함수·cron·SQL 편집기 = postgres → 서버 경로는 그대로 통과.
create or replace function public.protect_club_plan_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 앱의 클럽 생성: 프리미엄을 고르면 1개월 체험(서버 시각), 그 외는 무료
    if new.tier = 'premium' then
      new.premium_status := 'trialing';
      new.premium_started_at := now();
      new.premium_trial_ends_at := now() + interval '1 month';
    else
      new.tier := 'free';
      new.premium_status := 'none';
      new.premium_started_at := null;
      new.premium_trial_ends_at := null;
    end if;
    return new;
  end if;

  if new.tier is not distinct from old.tier
     and new.premium_status is not distinct from old.premium_status
     and new.premium_started_at is not distinct from old.premium_started_at
     and new.premium_trial_ends_at is not distinct from old.premium_trial_ends_at then
    return new;
  end if;

  -- 구버전 앱의 '1개월 무료 체험 시작'(none → trialing)만 허용, 날짜는 서버 기준
  if old.premium_status = 'none' and new.premium_status = 'trialing' then
    new.tier := 'premium';
    new.premium_started_at := now();
    new.premium_trial_ends_at := now() + interval '1 month';
    return new;
  end if;

  -- 그 외 앱의 등급 변경은 무시(이전 값 유지)
  new.tier := old.tier;
  new.premium_status := old.premium_status;
  new.premium_started_at := old.premium_started_at;
  new.premium_trial_ends_at := old.premium_trial_ends_at;
  return new;
end;
$$;

drop trigger if exists on_club_protect_plan on public.clubs;
create trigger on_club_protect_plan
  before insert or update on public.clubs
  for each row execute function public.protect_club_plan_columns();

-- ② club_members 셀프 가입 제한 + CHECK ------------------------------------------
-- (클럽장 행은 handle_new_club 트리거(security definer, 테이블 소유자)가 넣으므로 이 정책의 영향 없음)
drop policy if exists "club_members_insert_self" on public.club_members;
create policy "club_members_insert_self" on public.club_members
  for insert with check (auth.uid() = user_id and role = 'member' and status = 'pending');

alter table public.club_members drop constraint if exists club_members_role_check;
alter table public.club_members add constraint club_members_role_check check (role in ('owner', 'officer', 'member'));
alter table public.club_members drop constraint if exists club_members_status_check;
alter table public.club_members add constraint club_members_status_check check (status in ('pending', 'approved'));

-- ④ 등급 직접 비교 → club_plan_usable ------------------------------------------------
drop policy if exists "club_match_results_insert_premium_member" on public.club_match_results;
create policy "club_match_results_insert_premium_member" on public.club_match_results
  for insert with check (
    auth.uid() = recorded_by
    and exists (
      select 1 from public.club_members cm
      where cm.club_id = club_match_results.club_id
        and cm.user_id = auth.uid()
        and cm.status = 'approved'
    )
    and public.club_plan_usable(club_match_results.club_id)
  );

-- 정기모임·클럽 월례대회 생성도 서버에서 프리미엄 이상만 (기존엔 앱 화면에서만 막혀 API 직접 호출로 우회 가능)
drop policy if exists "club_sessions_insert_manager" on public.club_sessions;
create policy "club_sessions_insert_manager" on public.club_sessions
  for insert with check (
    auth.uid() = created_by
    and (
      exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members m
                  where m.club_id = club_sessions.club_id and m.user_id = auth.uid()
                    and m.role = 'officer' and m.status = 'approved')
    )
    and public.club_plan_usable(club_sessions.club_id)
  );

drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer" on public.tournaments
  for insert with check (
    auth.uid() = organizer_id
    and (
      public.my_role() in ('organizer', 'court_manager', 'super_admin')
      or (club_id is not null
          and exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
          and public.club_plan_usable(club_id)) -- 클럽장 월례대회(0064), 프리미엄 이상(0095)
    )
  );

create or replace function public.generate_due_club_sessions(p_club_id uuid default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int := 0;
  r record;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_next date;
begin
  for r in
    select s.* from public.club_session_schedules s
    where s.active
      and (p_club_id is null or s.club_id = p_club_id)
      and public.club_plan_usable(s.club_id)
  loop
    v_next := v_today + ((r.weekday - extract(dow from v_today)::int + 7) % 7);
    if v_today > (v_next - r.vote_close_days) then
      v_next := v_next + 7;
    end if;
    if v_today >= (v_next - r.vote_open_days)
       and not exists (select 1 from public.club_sessions where schedule_id = r.id and session_date = v_next) then
      begin
        insert into public.club_sessions
          (club_id, created_by, schedule_id, title, session_date, start_at, vote_deadline,
           location, court_count, point_target, format, status)
        values
          (r.club_id, r.created_by, r.id, r.title, v_next,
           (v_next + r.start_time) at time zone 'Asia/Seoul',
           ((v_next - r.vote_close_days) + r.start_time) at time zone 'Asia/Seoul',
           r.location, r.court_count, r.point_target, r.format, 'voting');
        v_count := v_count + 1;
      exception when unique_violation then
        null;
      end;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.generate_due_club_sessions(uuid) from public, anon;
grant execute on function public.generate_due_club_sessions(uuid) to authenticated;

-- clubs_with_counts 에 effective_plan 추가 (c.* 는 생성 시점 고정 → drop/create, 0074 방식)
drop view if exists public.clubs_with_counts;
create view public.clubs_with_counts
with (security_invoker = true)
as
select
  c.*,
  p.nickname   as owner_nickname,
  p.avatar_url as owner_avatar_url,
  (select count(*) from public.club_members cm where cm.club_id = c.id and cm.status = 'approved') as member_count,
  public.club_effective_plan(c.id) as effective_plan
from public.clubs c
join public.profiles p on p.id = c.owner_id;

notify pgrst, 'reload schema';

-- ── 적용 후 확인 ─────────────────────────────────────────────────────────────
-- 클럽별 등급·서버 계산 플랜(체험 중이면 premium, 만료면 free).
-- old_app_false_trial = true 인 그룹이 있으면, 구버전(4.0.0) 앱에서 '체험 시작'을 눌렀을 때
-- 실제로는 체험이 시작되지 않는데 성공 알림이 뜰 수 있음(데이터 손상은 없음). false 만 있으면 영향 없음.
select c.tier, c.premium_status, public.club_effective_plan(c.id) as effective_plan,
       (c.tier = 'free' and c.premium_status <> 'none') as old_app_false_trial,
       count(*) as clubs
  from public.clubs c
 group by 1, 2, 3, 4
 order by 1, 2;
