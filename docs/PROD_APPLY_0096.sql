-- ============================================================================
-- PROD 적용: 0096 프리미엄 플러스 플랜 — 가격표·플랜 컬럼·구독 확장
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)
--
-- 내용:
--   · club_plans 가격표(프리미엄 5,500 / 프리미엄 플러스 9,900). 가격의 기준을 서버로 옮김.
--   · clubs.premium_plan — tier 는 'premium' 그대로, 플랜은 이 컬럼으로 구분(구버전 4.0.0 앱은 플러스도 프리미엄으로 인식).
--   · 구독: plan / pending_plan(다운그레이드 예약) / billing_anchor_day(월말 결제일 밀림 방지) / 첫 결제 사전 안내 시각.
--   · 과금 이력: kind / plan + 주문번호 유니크(같은 결제가 두 번 기록되지 않게). subscription_id 는 비워둘 수 있음.
--   · club_effective_plan · start_club_trial(plan) · 보호 트리거를 플랜 인식형으로 갱신.
--   · 이중 결제 방지 장치: 미확정 주문 표(club_billing_pending_orders, 서비스롤 전용) +
--     결제 결과 반영 함수 5개(club_billing_*, 서비스롤 전용 — 구독·이력·클럽 등급을 한 트랜잭션으로 반영).
--
-- ⚠️ 프리미엄 플러스는 판매 중지(active=false) 상태로 들어간다. 회비 기능 출시 때 아래로 켠다:
--      update public.club_plans set active = true, updated_at = now() where plan = 'premium_plus';
--
-- ⚠️ 적용 순서 (반드시 이 순서):
--   1) 이 SQL 실행 (0095 가 먼저 적용돼 있어야 함 — 2026-10-12 적용 완료)
--   2) 엣지함수 배포 (새 함수는 club_plans·새 컬럼에 의존):
--        npx supabase functions deploy toss-billing-issue        --project-ref jbvtdthtmrlndduqiikj --use-api
--        npx supabase functions deploy toss-billing-change-plan  --project-ref jbvtdthtmrlndduqiikj --use-api
--        npx supabase functions deploy toss-billing-charge --no-verify-jwt --project-ref jbvtdthtmrlndduqiikj --use-api
--   3) 그 다음에 이 코드가 든 앱(OTA·스토어 빌드) 배포
--   구버전 앱(4.0.0)은 1)·2) 이후에도 그대로 동작(plan 을 안 보내면 클럽이 쓰던 플랜 = 프리미엄으로 처리).
--   단, 플러스 클럽은 구버전 앱에서 카드 등록을 받지 않는다(화면 요금과 실제 요금이 달라서 "앱 업데이트" 안내).
--   → 플러스 판매를 켤 때는 최소 버전(app_config.min_version)을 이 코드가 든 버전으로 올리는 것을 권장.
--
-- DEV 검증(2026-10-12): 권한·규칙 시험 15개 통과(가격표 조회/수정 권한, API 직접 플랜 변경 무효, 플러스 체험,
--   판매 중지 플랜 거부, 구버전 앱 방식 호환, 결제 키 조회 차단). 토스 테스트 결제로 확인한 것:
--   갱신 성공 / 같은 주문 중복 실행 시 재결제 없음 / 반영 안 된 결제가 남은 채 다른 주문으로 결제 → 앞 결제 자동 환불 /
--   환불된 주문 재시도는 결제로 치지 않음 / 확정 거절 → 재시도 → 성공(기간은 원래 결제일 기준) /
--   다시 시도되지 않은 미확정 주문 정리(결제돼 있으면 환불) / 금액 불일치 → 환불 후 새 주문 / 예약된 다운그레이드 적용 /
--   첫 결제 사전 안내(1회만) / 확인 필요 건 운영자 알림.
--   결제 결과 반영 함수 5개는 서비스롤로 직접 호출해 30항목 확인(반영·재호출·닫힌 주문 거부·상태 변경 시 미반영·4회 실패 후 중지).
--   ※ 카드 등록·업그레이드 차액 결제(로그인 + 카드 등록 필요)는 실기기 확인 대상.
-- 사전 점검(2026-10-12, 읽기 전용): 운영 구독 0건·과금 이력 0건(주문번호 중복 없음).
--   정기결제 작업 `charge-club-subscriptions`(매일 00:10 KST) 등록·활성 확인 — 갱신과 미확정 주문 정리(자동 환불)가 이 작업으로 돈다.
--
-- 실행: npx supabase db query -f docs/PROD_APPLY_0096.sql --linked --project-ref jbvtdthtmrlndduqiikj
-- 전체가 하나의 트랜잭션 — 중간에 실패하면 아무것도 적용되지 않는다. 재실행해도 안전.
-- ============================================================================

begin;

-- 0096: 프리미엄 플러스 플랜 — 가격표·플랜 컬럼·구독 확장
--   등급 저장: clubs.tier 는 'premium' 유지 + premium_plan('premium' | 'premium_plus').
--   → 구버전(4.0.0) 앱은 플러스 클럽도 프리미엄으로 인식(강제 업데이트 불필요).
--   플러스 판매는 club_plans.active 로 켠다 — 회비 기능 출시 전까지 운영은 false(기본).

-- 1) 플랜 가격표 — 가격의 기준은 서버. 앱·엣지함수는 여기서 읽는다(하드코딩 5500 제거).
create table if not exists public.club_plans (
  plan          text primary key check (plan in ('premium', 'premium_plus')),
  name          text not null,
  monthly_price int  not null check (monthly_price > 0),
  trial_months  int  not null default 1 check (trial_months between 0 and 12),
  active        boolean not null default true,   -- false = 신규 체험·구독·업그레이드 중지(기존 구독은 유지)
  sort          int  not null default 0,
  updated_at    timestamptz not null default now()
);
alter table public.club_plans enable row level security;
drop policy if exists "club_plans_select" on public.club_plans;
create policy "club_plans_select" on public.club_plans for select using (true);
drop policy if exists "club_plans_write_admin" on public.club_plans;
create policy "club_plans_write_admin" on public.club_plans
  for all using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

insert into public.club_plans (plan, name, monthly_price, trial_months, active, sort) values
  ('premium', '프리미엄', 5500, 1, true, 1),
  ('premium_plus', '프리미엄 플러스', 9900, 1, false, 2)
on conflict (plan) do nothing;

-- 2) 클럽의 유료 플랜 구분 (tier='premium' 일 때만 의미)
alter table public.clubs
  add column if not exists premium_plan text not null default 'premium'
  check (premium_plan in ('premium', 'premium_plus'));

-- 3) 구독: 현재 플랜·예약된 플랜(다운그레이드)·결제 기준일·첫 결제 사전 안내 시각
alter table public.club_subscriptions
  add column if not exists plan text not null default 'premium' references public.club_plans(plan),
  add column if not exists pending_plan text references public.club_plans(plan),
  add column if not exists billing_anchor_day int check (billing_anchor_day between 1 and 31),
  add column if not exists first_charge_notified_at timestamptz;
-- 0080 의 컬럼 단위 grant 는 새 컬럼에 적용되지 않으므로 클럽장 조회용 컬럼을 추가로 부여
grant select (plan, pending_plan) on public.club_subscriptions to authenticated;

-- 4) 과금 이력: 종류·플랜 + 주문번호 중복 방지(같은 결제가 두 번 기록되지 않도록)
alter table public.club_subscription_charges
  add column if not exists kind text not null default 'renewal' check (kind in ('initial', 'renewal', 'upgrade')),
  add column if not exists plan text;
-- 구독 행이 아직 없는 주문(첫 카드 등록 중 환불된 건)도 이력에 남길 수 있게 subscription_id 는 비워둘 수 있다.
alter table public.club_subscription_charges alter column subscription_id drop not null;
-- 조건 없는 유니크 인덱스(NULL 은 여러 개 허용) — upsert 의 on conflict (order_id) 가 쓸 수 있어야 한다.
drop index if exists public.club_sub_charges_order_uniq;
create unique index club_sub_charges_order_uniq on public.club_subscription_charges (order_id);

-- 5) 사용 가능 플랜 계산: 유료 플랜이면 premium_plan 을 돌려준다
create or replace function public.club_effective_plan(p_club_id uuid)
returns text
language plpgsql
stable security definer set search_path = public
as $$
declare
  c record;
begin
  select tier, premium_status, premium_trial_ends_at, premium_plan into c from public.clubs where id = p_club_id;
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
  return coalesce(c.premium_plan, 'premium');
end;
$$;

-- 6) 무료 체험 시작: 플랜 지정 (클럽장, 클럽당 1회). 시그니처가 바뀌므로 0095 의 (uuid) 버전은 제거.
drop function if exists public.start_club_trial(uuid);
create or replace function public.start_club_trial(p_club_id uuid, p_plan text default 'premium')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_active boolean;
  v_months int;
begin
  select owner_id, premium_status into v_owner, v_status from public.clubs where id = p_club_id for update;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  if v_status <> 'none' then return 'already_used'; end if;
  select active, trial_months into v_active, v_months from public.club_plans where plan = p_plan;
  if v_active is not true then return 'plan_unavailable'; end if;
  if v_months <= 0 then return 'no_trial'; end if;
  update public.clubs
     set tier = 'premium', premium_plan = p_plan, premium_status = 'trialing',
         premium_started_at = now(), premium_trial_ends_at = now() + make_interval(months => v_months)
   where id = p_club_id;
  return 'ok';
end;
$$;
revoke execute on function public.start_club_trial(uuid, text) from public, anon;
grant execute on function public.start_club_trial(uuid, text) to authenticated;

-- 7) 등급 컬럼 보호 트리거: premium_plan 도 보호. 앱의 클럽 생성에서만 플랜 선택을 받아들인다(판매 중인 플랜만).
create or replace function public.protect_club_plan_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_active boolean;
  v_months int;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.tier = 'premium' then
      select active, trial_months into v_active, v_months from public.club_plans where plan = new.premium_plan;
      if v_active is not true or coalesce(v_months, 0) <= 0 then
        -- 판매 중이 아니거나 체험이 없는 플랜을 고르면 기본 프리미엄 체험으로
        new.premium_plan := 'premium';
        select trial_months into v_months from public.club_plans where plan = 'premium';
      end if;
      new.premium_status := 'trialing';
      new.premium_started_at := now();
      new.premium_trial_ends_at := now() + make_interval(months => greatest(coalesce(v_months, 1), 1));
    else
      new.tier := 'free';
      new.premium_plan := 'premium';
      new.premium_status := 'none';
      new.premium_started_at := null;
      new.premium_trial_ends_at := null;
    end if;
    return new;
  end if;

  if new.tier is not distinct from old.tier
     and new.premium_plan is not distinct from old.premium_plan
     and new.premium_status is not distinct from old.premium_status
     and new.premium_started_at is not distinct from old.premium_started_at
     and new.premium_trial_ends_at is not distinct from old.premium_trial_ends_at then
    return new;
  end if;

  -- 구버전 앱의 '1개월 무료 체험 시작'(none → trialing)만 허용: 프리미엄 체험, 날짜는 서버 기준
  if old.premium_status = 'none' and new.premium_status = 'trialing' then
    select trial_months into v_months from public.club_plans where plan = 'premium';
    new.tier := 'premium';
    new.premium_plan := 'premium';
    new.premium_started_at := now();
    new.premium_trial_ends_at := now() + make_interval(months => greatest(coalesce(v_months, 1), 1));
    return new;
  end if;

  -- 그 외 앱의 등급·플랜 변경은 무시(이전 값 유지)
  new.tier := old.tier;
  new.premium_plan := old.premium_plan;
  new.premium_status := old.premium_status;
  new.premium_started_at := old.premium_started_at;
  new.premium_trial_ends_at := old.premium_trial_ends_at;
  return new;
end;
$$;

-- 8) 결제 결과 반영 — 엣지함수(service_role) 전용.

-- 미확정 주문(클럽당 1건): 결제를 보내기 "전에" 남기고, 결과가 반영되면(아래 commit 함수) 같은 트랜잭션에서 지운다.
--   결과를 모른 채 끝난 주문이 남아 있으면, 다른 주문번호로 결제하기 전에 반드시 그 주문부터 확인한다
--   (결제돼 있으면 환불 후 진행) → 카드 재등록처럼 주문번호가 달라지는 경로에서도 이중 결제가 나지 않는다.
create table if not exists public.club_billing_pending_orders (
  club_id    uuid primary key references public.clubs(id) on delete cascade,
  order_id   text not null,
  kind       text not null check (kind in ('initial', 'renewal', 'upgrade')),
  amount     int  not null,
  created_at timestamptz not null default now()
);
alter table public.club_billing_pending_orders enable row level security;  -- 정책 없음 = 서비스롤만
revoke all on public.club_billing_pending_orders from anon, authenticated;

-- 반영 함수들: 구독·과금 이력·클럽 등급을 한 트랜잭션으로 묶어
-- "결제는 됐는데 구독이 안 생긴" 상태나 등급 불일치가 남지 않게 한다.

-- 과금 이력 기록: 주문번호당 1행. 이미 결과가 기록된 주문번호는 건드리지 않는다
-- (실패·환불로 끝난 주문이 나중에 '결제'로 되살아나면 안 된다 — 엣지함수도 기록된 주문번호는 다시 보내지 않는다).
create or replace function public.club_billing_record_charge(
  p_sub_id uuid, p_club_id uuid, p_amount int, p_status text, p_kind text, p_plan text,
  p_order_id text, p_payment_key text, p_fail_reason text
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.club_subscription_charges
    (subscription_id, club_id, amount, status, kind, plan, order_id, toss_payment_key, fail_reason)
  values (p_sub_id, p_club_id, p_amount, p_status, p_kind, p_plan, p_order_id, p_payment_key, p_fail_reason)
  on conflict (order_id) do nothing;
end;
$$;

-- 구독 시작·재개(카드 등록) 반영. p_charge_order_id 가 있으면 과금 이력도 함께.
create or replace function public.club_billing_commit_issue(
  p_club_id uuid, p_owner_id uuid, p_billing_key text, p_customer_key text, p_card_company text, p_card_masked text,
  p_plan text, p_pending_plan text, p_amount int,
  p_period_start timestamptz, p_period_end timestamptz, p_next_charge_at timestamptz, p_last_charge_at timestamptz,
  p_anchor_day int,
  p_charge_amount int default 0, p_charge_kind text default null, p_charge_order_id text default null, p_charge_payment_key text default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  -- 환불·취소로 끝난 주문(다른 요청이 정리함)은 반영하지 않는다
  if p_charge_order_id is not null and exists (
    select 1 from public.club_subscription_charges where order_id = p_charge_order_id and status = 'failed'
  ) then
    raise exception 'order_closed: %', p_charge_order_id;
  end if;

  insert into public.club_subscriptions
    (club_id, owner_id, billing_key, customer_key, card_company, card_number_masked, plan, pending_plan, amount, status,
     current_period_start, current_period_end, next_charge_at, last_charge_at, billing_anchor_day,
     first_charge_notified_at, fail_count, canceled_at, updated_at)
  values
    (p_club_id, p_owner_id, p_billing_key, p_customer_key, coalesce(p_card_company, ''), coalesce(p_card_masked, ''), p_plan, p_pending_plan, p_amount, 'active',
     p_period_start, p_period_end, p_next_charge_at, p_last_charge_at, p_anchor_day,
     null, 0, null, now())
  on conflict (club_id) do update
    set owner_id = excluded.owner_id, billing_key = excluded.billing_key, customer_key = excluded.customer_key,
        card_company = excluded.card_company, card_number_masked = excluded.card_number_masked,
        plan = excluded.plan, pending_plan = excluded.pending_plan, amount = excluded.amount, status = 'active',
        current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
        next_charge_at = excluded.next_charge_at, last_charge_at = excluded.last_charge_at,
        billing_anchor_day = excluded.billing_anchor_day, first_charge_notified_at = null,
        fail_count = 0, canceled_at = null, updated_at = now()
  returning id into v_id;

  if p_charge_order_id is not null then
    perform public.club_billing_record_charge(v_id, p_club_id, p_charge_amount, 'paid', p_charge_kind, p_plan, p_charge_order_id, p_charge_payment_key, null);
  end if;

  update public.clubs
     set tier = 'premium', premium_plan = p_plan, premium_status = 'active',
         premium_started_at = coalesce(premium_started_at, now())
   where id = p_club_id;
  -- 자기 주문의 미확정 기록만 지운다(다른 요청이 진행 중인 주문 기록은 그대로 — 그 결제를 계속 추적해야 한다)
  if p_charge_order_id is not null then
    delete from public.club_billing_pending_orders where club_id = p_club_id and order_id = p_charge_order_id;
  end if;
  return v_id;
end;
$$;

-- 갱신 성공 반영. 구독이 "과금 직전에 본 상태"(결제 예정 시각·실패 차수·플랜·예약 플랜) 그대로일 때만 넘긴다.
--   'ok'        반영함
--   'duplicate' 같은 주문이 이미 반영돼 있음(중복 실행) — 할 일 없음
--   'stale'     결제는 됐지만 그 사이 구독이 바뀜(해지·카드 재등록·플랜 변경) — 반영하지 않는다. 호출자가 환불한다.
--   'closed'    환불·취소로 끝난 주문 — 반영하지 않는다
-- (개발 중 쓰던 11개 인자 버전이 남아 있으면 제거 — 운영에는 만들어진 적 없음)
drop function if exists public.club_billing_commit_renewal(uuid, timestamptz, int, text, int, timestamptz, timestamptz, int, text, text, text);
create or replace function public.club_billing_commit_renewal(
  p_sub_id uuid, p_expect_next timestamptz, p_expect_fails int, p_expect_plan text, p_expect_pending text,
  p_plan text, p_amount int, p_period_start timestamptz, p_period_end timestamptz, p_anchor_day int,
  p_kind text, p_order_id text, p_payment_key text
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  v_recorded text;
begin
  select * into s from public.club_subscriptions where id = p_sub_id for update;
  if not found then return 'not_found'; end if;
  select status into v_recorded from public.club_subscription_charges where order_id = p_order_id;
  if v_recorded = 'failed' then return 'closed'; end if;
  if s.status = 'canceled'
     or s.next_charge_at is distinct from p_expect_next or s.fail_count is distinct from p_expect_fails
     or s.plan is distinct from p_expect_plan or s.pending_plan is distinct from p_expect_pending then
    if v_recorded = 'paid' then
      delete from public.club_billing_pending_orders where club_id = s.club_id and order_id = p_order_id;
      return 'duplicate';
    end if;
    return 'stale';
  end if;
  perform public.club_billing_record_charge(p_sub_id, s.club_id, p_amount, 'paid', p_kind, p_plan, p_order_id, p_payment_key, null);
  delete from public.club_billing_pending_orders where club_id = s.club_id and order_id = p_order_id;
  update public.club_subscriptions
     set status = 'active', plan = p_plan, pending_plan = null, amount = p_amount,
         current_period_start = p_period_start, current_period_end = p_period_end, next_charge_at = p_period_end,
         last_charge_at = now(), billing_anchor_day = p_anchor_day, fail_count = 0, updated_at = now()
   where id = p_sub_id;
  update public.clubs set tier = 'premium', premium_plan = p_plan, premium_status = 'active' where id = s.club_id;
  return 'ok';
end;
$$;

-- 갱신 실패(카드사 확정 거절) 반영. 예정 상태가 같을 때만, 그리고 그 주문이 이미 결제된 게 아닐 때만.
create or replace function public.club_billing_commit_failure(
  p_sub_id uuid, p_expect_next timestamptz, p_expect_fails int,
  p_plan text, p_amount int, p_kind text, p_order_id text, p_reason text,
  p_max_fails int, p_retry_at timestamptz
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  v_fails int;
begin
  select * into s from public.club_subscriptions where id = p_sub_id for update;
  if not found then return 'not_found'; end if;
  -- 확정 거절된 주문이므로 미확정 기록은 정리한다
  delete from public.club_billing_pending_orders where club_id = s.club_id and order_id = p_order_id;
  if s.next_charge_at is distinct from p_expect_next or s.fail_count is distinct from p_expect_fails then
    return 'stale';
  end if;
  if exists (select 1 from public.club_subscription_charges where order_id = p_order_id and status = 'paid') then
    return 'already_paid';
  end if;
  perform public.club_billing_record_charge(p_sub_id, s.club_id, p_amount, 'failed', p_kind, p_plan, p_order_id, null, p_reason);
  v_fails := coalesce(s.fail_count, 0) + 1;
  if v_fails > p_max_fails then
    -- 유예 초과 → 구독 중지 + 클럽 강등
    update public.club_subscriptions set status = 'past_due', fail_count = v_fails, next_charge_at = null, updated_at = now() where id = p_sub_id;
    update public.clubs set premium_status = 'past_due' where id = s.club_id;
  else
    -- 다시 시도. 그동안 클럽은 유예로 계속 이용
    update public.club_subscriptions set status = 'past_due', fail_count = v_fails, next_charge_at = p_retry_at, updated_at = now() where id = p_sub_id;
  end if;
  return 'ok';
end;
$$;

-- 플랜 변경 반영(체험 중 전환 / 업그레이드 / 다운그레이드 예약·취소).
--   p_sub_id 가 null 이면 구독 없이 클럽 플랜만 바꾼다(체험 중·카드 미등록).
--   p_set_club_plan=false 면 클럽 플랜은 그대로(다운그레이드 예약·취소).
create or replace function public.club_billing_commit_plan_change(
  p_club_id uuid, p_sub_id uuid, p_plan text, p_amount int, p_pending_plan text, p_set_club_plan boolean,
  p_charge_amount int default 0, p_charge_order_id text default null, p_charge_payment_key text default null
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_charge_order_id is not null and exists (
    select 1 from public.club_subscription_charges where order_id = p_charge_order_id and status = 'failed'
  ) then
    raise exception 'order_closed: %', p_charge_order_id;
  end if;
  if p_sub_id is not null then
    update public.club_subscriptions
       set plan = p_plan, amount = p_amount, pending_plan = p_pending_plan,
           first_charge_notified_at = case when plan is distinct from p_plan then null else first_charge_notified_at end,
           updated_at = now()
     where id = p_sub_id and club_id = p_club_id;
    if p_charge_order_id is not null then
      perform public.club_billing_record_charge(p_sub_id, p_club_id, p_charge_amount, 'paid', 'upgrade', p_plan, p_charge_order_id, p_charge_payment_key, null);
      delete from public.club_billing_pending_orders where club_id = p_club_id and order_id = p_charge_order_id;
    end if;
  end if;
  if p_set_club_plan then
    update public.clubs set premium_plan = p_plan where id = p_club_id and tier = 'premium';
  end if;
end;
$$;

-- 위 함수들은 엣지함수(service_role) 전용
revoke all on function public.club_billing_record_charge(uuid, uuid, int, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.club_billing_commit_issue(uuid, uuid, text, text, text, text, text, text, int, timestamptz, timestamptz, timestamptz, timestamptz, int, int, text, text, text) from public, anon, authenticated;
revoke all on function public.club_billing_commit_renewal(uuid, timestamptz, int, text, text, text, int, timestamptz, timestamptz, int, text, text, text) from public, anon, authenticated;
revoke all on function public.club_billing_commit_failure(uuid, timestamptz, int, text, int, text, text, text, int, timestamptz) from public, anon, authenticated;
revoke all on function public.club_billing_commit_plan_change(uuid, uuid, text, int, text, boolean, int, text, text) from public, anon, authenticated;
grant execute on function public.club_billing_record_charge(uuid, uuid, int, text, text, text, text, text, text) to service_role;
grant execute on function public.club_billing_commit_issue(uuid, uuid, text, text, text, text, text, text, int, timestamptz, timestamptz, timestamptz, timestamptz, int, int, text, text, text) to service_role;
grant execute on function public.club_billing_commit_renewal(uuid, timestamptz, int, text, text, text, int, timestamptz, timestamptz, int, text, text, text) to service_role;
grant execute on function public.club_billing_commit_failure(uuid, timestamptz, int, text, int, text, text, text, int, timestamptz) to service_role;
grant execute on function public.club_billing_commit_plan_change(uuid, uuid, text, int, text, boolean, int, text, text) to service_role;

-- 9) clubs_with_counts 재생성 — c.* 는 생성 시점에 고정되므로 새 컬럼(premium_plan)을 노출하려면 drop/create
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

commit;

-- ── 적용 후 확인 ─────────────────────────────────────────────────────────────
-- 가격표 2행(플러스는 active=false), 새 컬럼·함수 존재 여부
select p.plan, p.name, p.monthly_price, p.trial_months, p.active,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clubs' and column_name = 'premium_plan') as clubs_premium_plan,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_subscriptions' and column_name = 'pending_plan') as subs_pending_plan,
       (to_regprocedure('public.start_club_trial(uuid,text)') is not null) as trial_fn_new,
       (to_regprocedure('public.start_club_trial(uuid)') is null) as trial_fn_old_removed,
       (to_regclass('public.club_billing_pending_orders') is not null) as pending_orders_table,
       (select count(*) from pg_proc f join pg_namespace n on n.oid = f.pronamespace
         where n.nspname = 'public' and f.proname like 'club\_billing\_%') as billing_fns_expect_5,
       has_table_privilege('authenticated', 'public.club_billing_pending_orders', 'select') as app_can_read_pending_expect_false,
       has_function_privilege('authenticated', 'public.club_billing_record_charge(uuid, uuid, int, text, text, text, text, text, text)', 'execute') as app_can_call_billing_expect_false
  from public.club_plans p
 order by p.sort;
