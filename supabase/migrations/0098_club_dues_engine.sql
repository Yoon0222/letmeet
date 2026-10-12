-- 0098: 클럽 회비 — 자동결제 엔진 (서버 전용 함수 + 일일 작업)
--   엣지함수(club-dues-*)가 서비스롤로 호출한다. 앱(로그인 사용자)은 이 함수들을 직접 부를 수 없다.
--   결제 한 번 = club_dues_charges 한 행(주문번호 고유). 흐름:
--     선점(회비 processing + 시도 pending 기록) → 토스 과금 → 결과 반영(paid / failed) — 결과를 모르면 pending 그대로 두고 나중에 조회로 확정.
--   같은 주문번호는 다시 보내지 않는다(다시 시도 = 새 행·새 주문번호).

-- ── 1) 카드 ──────────
-- 카드 등록·교체. 교체하면 실패했던 이번 기간 회비를 다시 시도하도록 예약한다.
--   결과: created / replaced
create or replace function public.dues_card_upsert(
  p_user_id uuid, p_billing_key text, p_customer_key text, p_card_company text, p_card_masked text
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old text;
begin
  select c.billing_key into v_old from public.member_billing_cards c where c.user_id = p_user_id for update;
  insert into public.member_billing_cards (user_id, billing_key, customer_key, card_company, card_number_masked)
  values (p_user_id, p_billing_key, p_customer_key, coalesce(p_card_company, ''), coalesce(p_card_masked, ''))
  on conflict (user_id) do update
    set billing_key = excluded.billing_key, customer_key = excluded.customer_key,
        card_company = excluded.card_company, card_number_masked = excluded.card_number_masked, updated_at = now();
  if v_old is null then return 'created'; end if;
  if v_old is distinct from p_billing_key then
    -- 새 카드: 자동결제가 실패로 끝났거나 재시도 중이던 이번 기간 회비를 곧 다시 시도한다(동의가 살아 있는 클럽만)
    update public.club_dues d
       set status = 'open', attempt_count = 0, last_fail_reason = null, next_attempt_at = now(), updated_at = now()
     where d.user_id = p_user_id and d.period_end > public.dues_today()
       and (d.status = 'failed' or (d.status = 'open' and d.attempt_count > 0))
       and exists (select 1 from public.club_dues_mandates m
                    where m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'active');
  end if;
  return 'replaced';
end;
$$;

-- 카드 삭제. 카드가 없으면 자동결제를 할 수 없으므로 모든 클럽의 동의도 함께 해지한다(다시 쓰려면 다시 동의).
create or replace function public.dues_card_delete(p_user_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.member_billing_cards where user_id = p_user_id;
  if not found then return 'not_found'; end if;
  update public.club_dues_mandates
     set status = 'revoked', revoked_at = now(), revoked_reason = 'card_removed', updated_at = now()
   where user_id = p_user_id and status <> 'revoked';
  return 'ok';
end;
$$;

-- ── 2) 자동결제 동의 ──────────
-- 회원이 화면에서 본 금액·주기가 지금 규칙과 같을 때만 받는다.
--   동의 금액 = 현재 금액과 예약된 금액 중 큰 값(인상이 예약돼 있으면 그 금액까지 동의).
--   결과: ok / disabled / no_plan / not_member / plan_changed / invalid
--   p_check_only = true 면 검사만 하고 저장하지 않는다(카드를 등록하기 전에 거절될 요청을 걸러내는 용도).
drop function if exists public.dues_mandate_upsert(uuid, uuid, int, text, text);
create or replace function public.dues_mandate_upsert(p_club_id uuid, p_user_id uuid, p_amount int, p_cycle text, p_text text, p_check_only boolean default false)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  pl record;
begin
  if not public.dues_enabled_for(p_club_id) or not public.club_plan_usable(p_club_id, 'premium_plus') then return 'disabled'; end if;
  select * into pl from public.club_dues_plans where club_id = p_club_id;
  if not found or not pl.active then return 'no_plan'; end if;
  if not exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = p_user_id and m.status = 'approved') then
    return 'not_member';
  end if;
  if p_cycle is distinct from pl.cycle or p_amount is null or p_amount <> greatest(pl.amount, coalesce(pl.next_amount, 0)) then
    return 'plan_changed';
  end if;
  if coalesce(length(btrim(p_text)), 0) < 10 then return 'invalid'; end if;
  if coalesce(p_check_only, false) then return 'ok'; end if;
  insert into public.club_dues_mandates (club_id, user_id, status, consented_amount, consented_cycle, consent_text)
  values (p_club_id, p_user_id, 'active', p_amount, p_cycle, left(p_text, 2000))
  on conflict (club_id, user_id) do update
    set status = 'active', consented_amount = excluded.consented_amount, consented_cycle = excluded.consented_cycle,
        consent_text = excluded.consent_text, consented_at = now(), revoked_at = null, revoked_reason = null, updated_at = now();
  return 'ok';
end;
$$;

-- ── 3) 결제 선점 ──────────
-- 자동결제 대상 선점: 납부 시각이 된 미납 회비 중 "동의 유효 + 카드 있음 + 클럽 사용 가능"인 것.
--   동의한 금액보다 큰 회비·주기가 달라진 동의는 청구하지 않는다(재동의 필요). 기간이 끝난 회비는 자동으로 청구하지 않는다.
--   클럽을 떠났거나 승인이 취소된 회원도 청구하지 않는다.
--   선점된 회비는 processing 이 되고 결제 시도(pending)가 기록된다. 동시에 여러 번 불려도 겹치지 않는다(skip locked).
create or replace function public.dues_claim_due(p_limit int default 20)
returns table (
  charge_id uuid, dues_id uuid, club_id uuid, user_id uuid, amount int, order_id text,
  billing_key text, customer_key text, club_name text, period_key text
)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  d record;
  v_charge uuid;
  v_order text;
  v_bps int;
  v_fee int;
  v_n int;
begin
  for d in
    select du.id, du.club_id as d_club, du.user_id as d_user, du.amount as d_amount, du.period_key as d_period,
           c.billing_key as d_bk, c.customer_key as d_ck, cl.name as d_club_name, p.nickname as d_payer
      from public.club_dues du
      join public.club_dues_plans pl on pl.club_id = du.club_id and pl.active
      join public.club_dues_mandates m on m.club_id = du.club_id and m.user_id = du.user_id
                                      and m.status = 'active' and m.consented_cycle = pl.cycle and m.consented_amount >= du.amount
      join public.member_billing_cards c on c.user_id = du.user_id
      join public.club_members cm on cm.club_id = du.club_id and cm.user_id = du.user_id and cm.status = 'approved'
      join public.clubs cl on cl.id = du.club_id
      join public.profiles p on p.id = du.user_id
     where du.status = 'open' and du.next_attempt_at is not null and du.next_attempt_at <= now()
       and du.period_end > public.dues_today()
       and public.dues_enabled_for(du.club_id) and public.club_plan_usable(du.club_id, 'premium_plus')
     order by du.next_attempt_at
     limit greatest(coalesce(p_limit, 20), 1)
     for update of du skip locked
  loop
    -- 한 건의 선점이 실패해도(진행 중 시도가 남아 있는 어긋난 행 등) 나머지 회원의 청구는 계속한다
    begin
      select count(*) into v_n from public.club_dues_charges ch where ch.dues_id = d.id;
      v_order := 'due-' || d.id || '-' || (v_n + 1);
      v_bps := public.club_fee_bps(d.d_club);
      v_fee := public.dues_fee_amount(d.d_amount, v_bps);
      insert into public.club_dues_charges
        (dues_id, club_id, user_id, club_name, payer_name, period_key, amount, fee_bps, fee_amount, net_amount, order_id, status, attempt_no, source)
      values
        (d.id, d.d_club, d.d_user, d.d_club_name, d.d_payer, d.d_period, d.d_amount, v_bps, v_fee, d.d_amount - v_fee, v_order, 'pending', v_n + 1, 'auto')
      returning id into v_charge;
      update public.club_dues set status = 'processing', updated_at = now() where id = d.id;
    exception when others then
      raise warning 'dues_claim_due: skip dues % (%)', d.id, sqlerrm;
      -- 같은 실행에서 계속 다시 걸리지 않게 15분 뒤로 미룬다
      update public.club_dues set next_attempt_at = now() + interval '15 minutes', updated_at = now() where id = d.id;
      continue;
    end;
    charge_id := v_charge; dues_id := d.id; club_id := d.d_club; user_id := d.d_user; amount := d.d_amount; order_id := v_order;
    billing_key := d.d_bk; customer_key := d.d_ck; club_name := d.d_club_name; period_key := d.d_period;
    return next;
  end loop;
end;
$$;

-- 회원이 직접 결제('지금 결제', 카드 등록 직후 즉시 결제)할 회비 한 건 선점. 동의는 필요 없고 카드만 있으면 된다.
--   결과: { code: 'ok', claim: {...} } / code: not_found | forbidden | already_paid | in_progress | not_payable | disabled | card_required | too_many
create or replace function public.dues_claim_one(p_dues_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  d record;
  c record;
  v_club_name text;
  v_payer text;
  v_charge uuid;
  v_order text;
  v_bps int;
  v_fee int;
  v_n int;
begin
  select * into d from public.club_dues where id = p_dues_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  if d.user_id <> p_user_id then return jsonb_build_object('code', 'forbidden'); end if;
  if d.status = 'paid' then return jsonb_build_object('code', 'already_paid'); end if;
  if d.status = 'processing' then return jsonb_build_object('code', 'in_progress'); end if;
  if d.status not in ('open', 'failed') then return jsonb_build_object('code', 'not_payable'); end if;
  if not exists (select 1 from public.club_members m where m.club_id = d.club_id and m.user_id = p_user_id and m.status = 'approved') then
    return jsonb_build_object('code', 'forbidden');
  end if;
  if not public.dues_enabled_for(d.club_id) or not public.club_plan_usable(d.club_id, 'premium_plus') then
    return jsonb_build_object('code', 'disabled');
  end if;
  select * into c from public.member_billing_cards where user_id = p_user_id;
  if not found then return jsonb_build_object('code', 'card_required'); end if;
  -- 직접 결제는 10분에 5번까지(카드가 계속 거절되는데 연달아 누르는 경우)
  if (select count(*) from public.club_dues_charges ch
       where ch.dues_id = d.id and ch.source = 'manual' and ch.created_at > now() - interval '10 minutes') >= 5 then
    return jsonb_build_object('code', 'too_many');
  end if;
  select name into v_club_name from public.clubs where id = d.club_id;
  select nickname into v_payer from public.profiles where id = p_user_id;

  select count(*) into v_n from public.club_dues_charges ch where ch.dues_id = d.id;
  v_order := 'due-' || d.id || '-' || (v_n + 1);
  v_bps := public.club_fee_bps(d.club_id);
  v_fee := public.dues_fee_amount(d.amount, v_bps);
  insert into public.club_dues_charges
    (dues_id, club_id, user_id, club_name, payer_name, period_key, amount, fee_bps, fee_amount, net_amount, order_id, status, attempt_no, source)
  values
    (d.id, d.club_id, d.user_id, coalesce(v_club_name, ''), coalesce(v_payer, ''), d.period_key, d.amount, v_bps, v_fee, d.amount - v_fee, v_order, 'pending', v_n + 1, 'manual')
  returning id into v_charge;
  update public.club_dues set status = 'processing', updated_at = now() where id = d.id;
  return jsonb_build_object('code', 'ok', 'claim', jsonb_build_object(
    'charge_id', v_charge, 'dues_id', d.id, 'club_id', d.club_id, 'user_id', d.user_id, 'amount', d.amount, 'order_id', v_order,
    'billing_key', c.billing_key, 'customer_key', c.customer_key, 'club_name', coalesce(v_club_name, ''), 'period_key', d.period_key));
end;
$$;

-- ── 4) 결제 결과 반영 ──────────
-- 결제 승인 반영: 시도 paid + 회비 paid 를 한 트랜잭션으로.
--   ok        반영함
--   duplicate 이미 이 시도가 결제로 반영돼 있음(할 일 없음)
--   closed / mismatch / orphan  반영할 수 없는 결제(이미 실패로 닫힌 시도·금액 불일치·회비 행이 사라짐) → 호출자가 환불한다
create or replace function public.dues_charge_commit_paid(p_charge_id uuid, p_payment_key text, p_amount int)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  d record;
begin
  select * into c from public.club_dues_charges where id = p_charge_id for update;
  if not found then return 'not_found'; end if;
  if c.status = 'paid' then return 'duplicate'; end if;
  if c.status <> 'pending' then return 'closed'; end if;
  if p_amount is distinct from c.amount then return 'mismatch'; end if;
  if c.dues_id is null then return 'orphan'; end if;
  select * into d from public.club_dues where id = c.dues_id for update;
  if not found then return 'orphan'; end if;
  if d.status <> 'processing' then return 'closed'; end if;

  update public.club_dues_charges set status = 'paid', paid_at = now(), toss_payment_key = p_payment_key where id = p_charge_id;
  update public.club_dues
     set status = 'paid', paid_via = 'card', paid_at = now(), next_attempt_at = null, last_fail_reason = null, updated_at = now()
   where id = d.id;
  perform public.push_notify(d.user_id, 'dues', c.club_name || ' 회비 결제 완료',
    to_char(c.amount, 'FM999,999,999') || '원이 결제됐어요.', 'club_dues', d.club_id, null);
  return 'ok';
end;
$$;

-- 결제 실패 반영.
--   p_count_attempt: 카드가 확정 거절한 경우 true(재시도 횟수에 포함). 요청이 전달되지 않았거나 환불로 닫는 경우 false.
--   자동결제는 납부일부터 하루 한 번, 총 4회까지. 다 실패하면 회비는 failed 가 되고 회원이 직접 결제하거나 운영진이 처리한다.
--   전달되지 않은 요청은 15분 뒤 다시 보내되, 시도가 12건을 넘으면 하루 한 번으로 늦춘다(실패로 끝내지는 않는다).
create or replace function public.dues_charge_commit_failed(p_charge_id uuid, p_reason text, p_count_attempt boolean default true)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  d record;
  v_attempts int;
  v_tries int;
  v_reason text := left(coalesce(p_reason, ''), 200);
  c_max constant int := 4;
begin
  select * into c from public.club_dues_charges where id = p_charge_id for update;
  if not found then return 'not_found'; end if;
  if c.status <> 'pending' then return 'closed'; end if;
  update public.club_dues_charges set status = 'failed', fail_reason = v_reason where id = p_charge_id;
  if c.dues_id is null then return 'ok'; end if;
  select * into d from public.club_dues where id = c.dues_id for update;
  if not found or d.status <> 'processing' then return 'ok'; end if;

  if c.source = 'manual' then
    -- 회원이 직접 누른 결제: 자동결제 횟수와 예정은 건드리지 않고 원래 상태로 되돌린다
    update public.club_dues
       set status = case when d.attempt_count >= c_max then 'failed' else 'open' end, last_fail_reason = v_reason, updated_at = now()
     where id = d.id;
    return 'ok';
  end if;

  v_attempts := d.attempt_count + case when coalesce(p_count_attempt, true) then 1 else 0 end;
  select count(*) into v_tries from public.club_dues_charges ch where ch.dues_id = d.id;
  if v_attempts >= c_max then
    update public.club_dues
       set status = 'failed', attempt_count = v_attempts, next_attempt_at = null, last_fail_reason = v_reason, updated_at = now()
     where id = d.id;
    perform public.push_notify(d.user_id, 'dues', c.club_name || ' 회비 결제 실패',
      '카드 결제가 계속 실패해 자동결제를 멈췄어요. 회비 화면에서 카드를 확인하고 직접 결제해주세요.', 'club_dues', d.club_id, null);
  elsif v_tries >= 12 then
    -- 카드가 거절된 게 아니라 결제 요청이 계속 전달되지 않은 경우(결제사 장애 등): 실패로 끝내지 않고 하루 한 번으로 늦춘다.
    -- 회원 잘못이 아니므로 "카드를 확인하라"는 알림도 보내지 않는다(오래된 미확정·밀린 청구는 일일 작업이 운영자에게 알린다).
    update public.club_dues
       set status = 'open', attempt_count = v_attempts, last_fail_reason = v_reason,
           next_attempt_at = public.dues_due_at(public.dues_today() + 1), updated_at = now()
     where id = d.id;
  else
    update public.club_dues
       set status = 'open', attempt_count = v_attempts, last_fail_reason = v_reason,
           -- 확정 거절: 다음 날 오전 10시에 다시. 요청이 전달되지 않은 경우: 곧 다시.
           next_attempt_at = case when coalesce(p_count_attempt, true) then public.dues_due_at(public.dues_today() + 1) else now() + interval '15 minutes' end,
           updated_at = now()
     where id = d.id;
    if coalesce(p_count_attempt, true) and v_attempts = 1 then
      perform public.push_notify(d.user_id, 'dues', c.club_name || ' 회비 결제 실패',
        '카드 결제에 실패했어요. 내일 오전에 다시 시도해요. 회비 화면에서 카드를 확인해주세요.', 'club_dues', d.club_id, null);
    end if;
  end if;
  return 'ok';
end;
$$;

-- ── 5) 환불 ──────────
-- 환불 전 확인(운영진, 정산 확정 전 건만). 통과하면 환불 진행 중으로 표시해 그 사이 정산이 확정되지 않게 한다.
--   결과: { code: 'ok', payment_key, order_id, amount } / code: not_found | forbidden | self_not_allowed | already_refunded | not_paid | settled
create or replace function public.dues_refund_prepare(p_charge_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  v_is_owner boolean;
  v_is_officer boolean;
begin
  select * into c from public.club_dues_charges where id = p_charge_id for update;
  if not found or c.club_id is null then return jsonb_build_object('code', 'not_found'); end if;
  -- 운영진 판정은 is_club_manager 와 같은 기준: 클럽장(clubs.owner_id) 또는 승인된 임원
  select (cl.owner_id = p_actor) into v_is_owner from public.clubs cl where cl.id = c.club_id;
  v_is_officer := exists (select 1 from public.club_members m
                           where m.club_id = c.club_id and m.user_id = p_actor and m.status = 'approved' and m.role = 'officer');
  if not (coalesce(v_is_owner, false) or v_is_officer) then return jsonb_build_object('code', 'forbidden'); end if;
  if c.user_id = p_actor and not coalesce(v_is_owner, false) then return jsonb_build_object('code', 'self_not_allowed'); end if;
  if c.status = 'refunded' then return jsonb_build_object('code', 'already_refunded'); end if;
  if c.status <> 'paid' or c.toss_payment_key is null then return jsonb_build_object('code', 'not_paid'); end if;
  if c.settlement_id is not null then return jsonb_build_object('code', 'settled'); end if;
  update public.club_dues_charges set refund_requested_at = now() where id = p_charge_id;
  return jsonb_build_object('code', 'ok', 'payment_key', c.toss_payment_key, 'order_id', c.order_id, 'amount', c.amount);
end;
$$;

-- 환불 반영(토스 취소가 끝난 뒤). 회비는 '환불됨'이 되고, 그 달의 정산 초안이 있으면 다시 계산한다.
create or replace function public.dues_charge_commit_refund(p_charge_id uuid, p_actor uuid, p_reason text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  v_set uuid;
begin
  select * into c from public.club_dues_charges where id = p_charge_id for update;
  if not found then return 'not_found'; end if;
  if c.status = 'refunded' then return 'duplicate'; end if;
  if c.status <> 'paid' then return 'not_paid'; end if;
  if c.settlement_id is not null then
    -- 카드는 이미 환불됐는데 정산이 확정돼 반영할 수 없는 상태 — 사람이 정산을 바로잡아야 한다
    perform public.push_notify(a.id, 'system', '회비 환불·정산 불일치',
      c.club_name || ' 결제 ' || to_char(c.amount, 'FM999,999,999') || '원이 카드로는 환불됐는데 확정된 정산에 들어가 있어요. 주문번호 ' || c.order_id, null, null, null)
      from public.profiles a where a.role = 'super_admin';
    return 'settled';
  end if;
  update public.club_dues_charges
     set status = 'refunded', refunded_at = now(), refund_reason = left(coalesce(p_reason, ''), 200), refunded_by = p_actor
   where id = p_charge_id;
  update public.club_dues
     set status = 'refunded', next_attempt_at = null, updated_at = now()
   where id = c.dues_id and status = 'paid';
  select s.id into v_set from public.club_dues_settlements s
   where s.club_id = c.club_id and s.status = 'draft'
     and s.period_month = to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM');
  if v_set is not null then perform public.dues_settlement_recalc(v_set); end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (p_actor, (select role from public.profiles where id = p_actor), 'club_dues_charges.refund', 'club_dues_charges', p_charge_id::text,
          jsonb_build_object('status', 'paid'), jsonb_build_object('amount', c.amount, 'order_id', c.order_id, 'reason', left(coalesce(p_reason, ''), 200)));
  if c.user_id is not null then
    perform public.push_notify(c.user_id, 'dues', c.club_name || ' 회비 환불',
      to_char(c.amount, 'FM999,999,999') || '원이 환불됐어요. 카드사에 따라 며칠 걸릴 수 있어요.', 'club_dues', c.club_id, null);
  end if;
  return 'ok';
end;
$$;

-- 환불 진행 표시 지우기 — 토스 조회로 그 결제가 취소되지 않았음이 확인됐을 때만(워커가 부른다)
--   p_expected: 워커가 읽었던 표시 시각. 그 사이 운영진이 환불을 다시 시작했으면(시각이 달라짐) 지우지 않는다.
drop function if exists public.dues_refund_flag_clear(uuid);
create or replace function public.dues_refund_flag_clear(p_charge_id uuid, p_expected timestamptz)
returns void
language sql
security definer set search_path = public
as $$
  update public.club_dues_charges set refund_requested_at = null
   where id = p_charge_id and status = 'paid' and refund_requested_at = p_expected;
$$;

-- ── 6) 일일 작업 ──────────
create or replace function public.dues_job_log(p_job text, p_ok boolean, p_summary jsonb)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.dues_job_runs (job, finished_at, ok, summary) values (p_job, now(), p_ok, p_summary);
$$;

-- 매일 오전 9시(KST): 회비 행 만들기 → 재동의가 필요한 동의 표시 → 납부 사전 안내 → 결제 작업 점검
create or replace function public.dues_daily_tick()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  pl record;
  r record;
  a record;
  v_today date := public.dues_today();
  v_rows int := 0;
  v_reconsent int := 0;
  v_notices int := 0;
  v_alert boolean := false;
  v_stale int := 0;
  v_errors int := 0;
  v_summary jsonb;
begin
  for pl in select club_id from public.club_dues_plans where active loop
    begin
      v_rows := v_rows + public.dues_ensure_rows(pl.club_id);
    exception when others then
      v_errors := v_errors + 1;  -- 한 클럽의 오류가 다른 클럽의 회비 생성·안내를 막지 않게
      raise warning 'dues_daily_tick: ensure_rows failed for club % (%)', pl.club_id, sqlerrm;
    end;
  end loop;

  -- 동의한 금액보다 큰 회비가 생겼거나 주기가 달라진 동의는 자동결제를 멈추고 다시 동의를 받는다
  for r in
    select m.club_id, m.user_id, c.name
      from public.club_dues_mandates m
      join public.club_dues_plans p on p.club_id = m.club_id and p.active
      join public.clubs c on c.id = m.club_id
     where m.status = 'active'
       and (m.consented_cycle <> p.cycle
            or exists (select 1 from public.club_dues d
                        where d.club_id = m.club_id and d.user_id = m.user_id and d.status = 'open' and d.amount > m.consented_amount
                          and d.period_end > v_today and d.next_attempt_at is not null))
  loop
    update public.club_dues_mandates set status = 'needs_reconsent', updated_at = now()
     where club_id = r.club_id and user_id = r.user_id;
    perform public.push_notify(r.user_id, 'dues', r.name || ' 회비 자동결제 다시 동의',
      '회비가 바뀌어 자동결제가 멈췄어요. 회비 화면에서 바뀐 내용을 확인하고 다시 동의해주세요.', 'club_dues', r.club_id, null);
    v_reconsent := v_reconsent + 1;
  end loop;

  -- 납부 사전 안내: 납부일 3일 전부터, 회비마다 한 번(납부일이 지난 채 만들어진 행도 청구 전에 안내한다)
  for r in
    select d.id, d.club_id, d.user_id, d.amount, d.due_date, c.name,
           (coalesce(d.next_attempt_at, public.dues_due_at(d.due_date)) at time zone 'Asia/Seoul')::date as charge_date,
           (exists (select 1 from public.club_dues_mandates m
                     where m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'active' and m.consented_amount >= d.amount)
            and exists (select 1 from public.member_billing_cards b where b.user_id = d.user_id)) as autopay
      from public.club_dues d
      join public.clubs c on c.id = d.club_id
     where d.status = 'open' and d.notified_d3_at is null and d.due_date <= v_today + 3 and d.period_end > v_today
       and public.dues_enabled_for(d.club_id) and public.club_plan_usable(d.club_id, 'premium_plus')
  loop
    if r.autopay then
      perform public.push_notify(r.user_id, 'dues', r.name || ' 회비 자동결제 예정',
        to_char(r.charge_date, 'FMMM"월" FMDD"일"') || ' 오전에 ' || to_char(r.amount, 'FM999,999,999') || '원이 등록한 카드로 결제돼요. 원하지 않으면 회비 화면에서 자동결제를 해지할 수 있어요.',
        'club_dues', r.club_id, null);
    else
      perform public.push_notify(r.user_id, 'dues', r.name || ' 회비 납부 안내',
        '납부일은 ' || to_char(r.due_date, 'FMMM"월" FMDD"일"') || ', ' || to_char(r.amount, 'FM999,999,999') || '원이에요. 회비 화면에서 카드를 등록하면 자동으로 납부돼요.',
        'club_dues', r.club_id, null);
    end if;
    update public.club_dues set notified_d3_at = now() where id = r.id;
    v_notices := v_notices + 1;
  end loop;

  -- 청구할 회비가 하루 넘게 밀려 있는데 결제 작업의 성공 기록이 없으면 운영자에게 알린다
  if exists (
       select 1 from public.club_dues d
         join public.club_dues_mandates m on m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'active' and m.consented_amount >= d.amount
         join public.member_billing_cards b on b.user_id = d.user_id
        where d.status = 'open' and d.next_attempt_at < now() - interval '26 hours' and d.period_end > v_today
          and public.dues_enabled_for(d.club_id) and public.club_plan_usable(d.club_id, 'premium_plus'))
     and not exists (select 1 from public.dues_job_runs j where j.job = 'dues_charge' and j.ok and j.started_at > now() - interval '26 hours') then
    v_alert := true;
    for a in select id from public.profiles where role = 'super_admin' loop
      perform public.push_notify(a.id, 'system', '회비 결제 작업 확인 필요',
        '청구할 회비가 하루 넘게 밀려 있어요. 결제 작업(club-dues-charge)이 돌고 있는지 확인해주세요.', null, null, null);
    end loop;
  end if;

  -- 결과를 모른 채 6시간 넘게 남은 결제 시도(토스 조회가 계속 실패하는 경우 등)
  select count(*) into v_stale from public.club_dues_charges c
   where (c.status = 'pending' and c.created_at < now() - interval '6 hours')
      or (c.status = 'paid' and c.refund_requested_at < now() - interval '6 hours');  -- 끝나지 않은 환불
  if v_stale > 0 or v_errors > 0 then
    for a in select id from public.profiles where role = 'super_admin' loop
      perform public.push_notify(a.id, 'system', '회비 결제 확인 필요',
        '결과가 확정되지 않은 회비 결제·환불이 ' || v_stale || '건, 회비 생성 오류가 ' || v_errors || '건 있어요. 결제 작업(club-dues-charge) 로그를 확인해주세요.', null, null, null);
    end loop;
  end if;

  v_summary := jsonb_build_object('rows_created', v_rows, 'reconsent', v_reconsent, 'notices', v_notices, 'worker_alert', v_alert, 'stale_pending', v_stale, 'errors', v_errors);
  perform public.dues_job_log('dues_daily_tick', true, v_summary);
  return v_summary;
end;
$$;

-- 매월 2일: 지난달 정산 초안 만들기
create or replace function public.dues_settlement_generate_prev_month()
returns int
language sql
security definer set search_path = public
as $$
  select public.dues_settlement_generate(to_char(public.dues_today() - interval '1 month', 'YYYY-MM'));
$$;

-- ── 7) 권한: 전부 서버 전용 ──────────
revoke all on function public.dues_card_upsert(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.dues_card_delete(uuid) from public, anon, authenticated;
revoke all on function public.dues_mandate_upsert(uuid, uuid, int, text, text, boolean) from public, anon, authenticated;
revoke all on function public.dues_claim_due(int) from public, anon, authenticated;
revoke all on function public.dues_claim_one(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dues_charge_commit_paid(uuid, text, int) from public, anon, authenticated;
revoke all on function public.dues_charge_commit_failed(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.dues_refund_prepare(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dues_charge_commit_refund(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.dues_refund_flag_clear(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.dues_refund_flag_clear(uuid, timestamptz) to service_role;
revoke all on function public.dues_job_log(text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.dues_daily_tick() from public, anon, authenticated;
revoke all on function public.dues_settlement_generate_prev_month() from public, anon, authenticated;
grant execute on function public.dues_card_upsert(uuid, text, text, text, text) to service_role;
grant execute on function public.dues_card_delete(uuid) to service_role;
grant execute on function public.dues_mandate_upsert(uuid, uuid, int, text, text, boolean) to service_role;
grant execute on function public.dues_claim_due(int) to service_role;
grant execute on function public.dues_claim_one(uuid, uuid) to service_role;
grant execute on function public.dues_charge_commit_paid(uuid, text, int) to service_role;
grant execute on function public.dues_charge_commit_failed(uuid, text, boolean) to service_role;
grant execute on function public.dues_refund_prepare(uuid, uuid) to service_role;
grant execute on function public.dues_charge_commit_refund(uuid, uuid, text) to service_role;
grant execute on function public.dues_job_log(text, boolean, jsonb) to service_role;
grant execute on function public.dues_daily_tick() to service_role;
grant execute on function public.dues_settlement_generate_prev_month() to service_role;

notify pgrst, 'reload schema';
