// toss-billing-change-plan: 클럽 유료 플랜 변경(업그레이드·다운그레이드). 클럽장만.
//   입력: { clubId, plan, preview?, expectedAmount? }
//     preview=true      계산만 하고 아무것도 바꾸지 않는다(차액 미리보기).
//     expectedAmount    사용자가 확인한 결제 금액. 실제 차액이 이보다 크면(또는 안 보냈는데 결제가 필요하면) 'amount_changed' 로 거부.
//   결과 action:
//     'switched'            무료 체험 중(또는 첫 결제 전) — 과금 없이 즉시 전환
//     'upgraded'            결제 중인 구독 — 남은 기간 차액만 지금 결제하고 즉시 전환, 다음 결제부터 새 요금
//     'downgrade_scheduled' 결제 중인 구독 — 이번 기간은 유지, 다음 결제일부터 낮은 플랜
//     'pending_cleared'     예약된 다운그레이드 취소(현재 플랜 그대로 유지)
//     'noop'                이미 그 플랜
//     'needs_subscription'  결제 가능한 구독이 없음 — 앱이 카드 등록(toss-billing-issue) 으로 보낸다
//   구독·과금 이력·클럽 플랜은 한 트랜잭션으로 반영한다(club_billing_commit_plan_change).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { CORS, chargeWithIntent, json, loadPlans, proratedDiff, rpcWithRetry, ymd } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const clubId: string = typeof body?.clubId === 'string' ? body.clubId : '';
  const plan: string = typeof body?.plan === 'string' ? body.plan : '';
  const preview: boolean = body?.preview === true;
  const expectedAmount: number | null = typeof body?.expectedAmount === 'number' ? body.expectedAmount : null;
  if (!clubId || !plan) return json({ error: 'clubId, plan required' }, 400);

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const { data: club, error: clubErr } = await admin
    .from('clubs')
    .select('id, owner_id, name, tier, premium_status, premium_trial_ends_at, premium_plan')
    .eq('id', clubId)
    .maybeSingle();
  if (clubErr) return json({ error: 'club_load_failed' }, 500);
  if (!club) return json({ error: 'club_not_found' }, 404);
  if (club.owner_id !== caller.id) return json({ error: 'forbidden' }, 403);

  let plans;
  try {
    plans = await loadPlans(admin);
  } catch (_err) {
    return json({ error: 'plans_load_failed' }, 500);
  }
  const target = plans[plan];
  if (!target) return json({ error: 'plan_not_found' }, 400);

  // 조회 실패를 "구독 없음"으로 보지 않는다
  const { data: sub, error: subErr } = await admin.from('club_subscriptions').select('*').eq('club_id', clubId).maybeSingle();
  if (subErr) return json({ error: 'subscription_load_failed' }, 500);
  if (sub && sub.owner_id !== caller.id) return json({ error: 'forbidden' }, 403);

  // deno-lint-ignore no-explicit-any
  const commit = (args: Record<string, unknown>): Promise<{ error: any }> => rpcWithRetry(admin, 'club_billing_commit_plan_change', args);

  const now = new Date();
  const trialEnd = club.premium_trial_ends_at ? new Date(club.premium_trial_ends_at) : null;
  const clubTrialing = club.tier === 'premium' && club.premium_status === 'trialing' && !!trialEnd && trialEnd.getTime() > now.getTime();
  const subActive = !!sub && sub.status === 'active';
  // 카드는 등록했지만 아직 한 번도 결제되지 않은 구독(체험 중 등록) — 첫 결제 전까지는 무료 전환
  const beforeFirstCharge = subActive && !sub.last_charge_at;
  const currentPlan: string = subActive ? sub.plan : (club.premium_plan ?? 'premium');

  // 1) 무료 구간(체험 중 / 첫 결제 전): 과금 없이 즉시 전환
  if (clubTrialing || beforeFirstCharge) {
    const nextChargeAt: string | null = sub?.next_charge_at ?? null;
    if (currentPlan === plan && !sub?.pending_plan) {
      // 구독과 클럽의 플랜이 어긋나 있으면 맞춘다
      if (!preview && club.premium_plan !== plan) {
        await commit({ p_club_id: clubId, p_sub_id: null, p_plan: plan, p_amount: target.monthly_price, p_pending_plan: null, p_set_club_plan: true });
      }
      return json({ ok: true, action: 'noop', plan, chargeAmount: 0, monthlyPrice: target.monthly_price, nextChargeAt });
    }
    if (!target.active && currentPlan !== plan) return json({ error: 'plan_unavailable' }, 400);
    if (preview) {
      return json({ ok: true, action: 'switched', preview: true, plan, chargeAmount: 0, monthlyPrice: target.monthly_price, nextChargeAt });
    }
    const { error } = await commit({
      p_club_id: clubId, p_sub_id: sub?.id ?? null, p_plan: plan, p_amount: target.monthly_price, p_pending_plan: null, p_set_club_plan: true,
    });
    if (error) return json({ error: 'commit_failed' }, 500);
    return json({ ok: true, action: 'switched', plan, chargeAmount: 0, monthlyPrice: target.monthly_price, nextChargeAt });
  }

  // 2) 결제 중인 구독이 없으면 카드 등록부터
  if (!subActive || !sub.current_period_end || !sub.current_period_start) {
    return json({ ok: true, action: 'needs_subscription', plan, chargeAmount: 0, monthlyPrice: target.monthly_price });
  }

  const periodStart = new Date(sub.current_period_start);
  const periodEnd = new Date(sub.current_period_end);
  const currentPrice: number = sub.amount ?? plans[sub.plan]?.monthly_price ?? 0;

  // 3) 같은 플랜: 예약된 다운그레이드가 있으면 취소
  if (plan === sub.plan) {
    if (!sub.pending_plan) {
      // 구독은 이 플랜인데 클럽 표시가 다르면 맞춘다(부분 실패 복구)
      if (!preview && club.premium_plan !== plan) {
        await commit({ p_club_id: clubId, p_sub_id: sub.id, p_plan: plan, p_amount: currentPrice, p_pending_plan: null, p_set_club_plan: true });
      }
      return json({ ok: true, action: 'noop', plan, chargeAmount: 0, monthlyPrice: currentPrice, nextChargeAt: sub.next_charge_at });
    }
    if (!preview) {
      const { error } = await commit({
        p_club_id: clubId, p_sub_id: sub.id, p_plan: sub.plan, p_amount: currentPrice, p_pending_plan: null, p_set_club_plan: false,
      });
      if (error) return json({ error: 'commit_failed' }, 500);
    }
    return json({ ok: true, action: 'pending_cleared', preview, plan, chargeAmount: 0, monthlyPrice: currentPrice, nextChargeAt: sub.next_charge_at });
  }

  // 4) 업그레이드: 남은 기간 차액만 지금 결제, 기간은 그대로
  if (target.monthly_price > currentPrice) {
    if (!target.active) return json({ error: 'plan_unavailable' }, 400);
    const diff = proratedDiff(target.monthly_price, currentPrice, periodStart, periodEnd, now);
    if (preview) {
      return json({ ok: true, action: 'upgraded', preview: true, plan, chargeAmount: diff, monthlyPrice: target.monthly_price, nextChargeAt: sub.next_charge_at });
    }
    // 사용자가 확인한 금액보다 많이 결제하지 않는다(화면을 열어둔 사이 갱신이 지나간 경우 등).
    // 확인한 금액을 안 보낸 요청은 결제가 필요한 변경을 할 수 없다.
    if (diff > 0 && (expectedAmount === null || diff > expectedAmount)) {
      return json({ error: 'amount_changed', chargeAmount: diff }, 409);
    }
    let orderId: string | null = null;
    let paymentKey: string | null = null;
    let charged = diff; // 실제 결제된 금액(재시도에서 앞선 주문이 확인되면 그때의 금액)
    if (diff > 0) {
      // 같은 기간의 같은 시도면 주문번호가 같다 → 버튼을 두 번 눌러도 한 번만 결제. 확정 거절 뒤의 재시도만 차수가 올라간다.
      const { count: failedBefore, error: countErr } = await admin
        .from('club_subscription_charges')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', sub.id)
        .eq('kind', 'upgrade')
        .eq('status', 'failed')
        .gte('charged_at', sub.current_period_start);
      if (countErr) return json({ error: 'charges_load_failed' }, 500);
      orderId = `sub-${sub.id}-up-${ymd(periodEnd)}-${failedBefore ?? 0}`;
      const res = await chargeWithIntent(admin, secret, {
        clubId, kind: 'upgrade', billingKey: sub.billing_key, customerKey: sub.customer_key, amount: diff, orderId,
        orderName: `${club.name} ${target.name} 업그레이드`,
      });
      if (res.kind === 'unknown') {
        // 결제됐을 수도 있다 — 실패로 기록하지 않는다. 다시 누르면 같은 주문번호로 확인된다.
        console.error('upgrade charge result unknown', { subscription: sub.id, orderId, reason: res.reason, trace: res.trace });
        return json({ error: 'charge_unknown' }, 409);
      }
      if (res.kind === 'declined') {
        // 실패 이력이 남아야 다음 시도가 새 주문번호(차수 +1)가 된다 — 같은 주문번호로는 토스가 같은 거절을 다시 돌려준다
        const { error: recErr } = await rpcWithRetry(admin, 'club_billing_record_charge', {
          p_sub_id: sub.id, p_club_id: clubId, p_amount: diff, p_status: 'failed', p_kind: 'upgrade', p_plan: plan,
          p_order_id: orderId, p_payment_key: null, p_fail_reason: res.reason,
        });
        if (recErr) console.error('upgrade failure not recorded', { subscription: sub.id, orderId, message: recErr.message });
        return json({ error: 'upgrade_charge_failed', toss: res.toss }, 402);
      }
      paymentKey = res.paymentKey;
      charged = res.amount;
    }
    const { error } = await commit({
      p_club_id: clubId, p_sub_id: sub.id, p_plan: plan, p_amount: target.monthly_price, p_pending_plan: null, p_set_club_plan: true,
      p_charge_amount: charged, p_charge_order_id: orderId, p_charge_payment_key: paymentKey,
    });
    if (error) {
      // 결제는 됐는데 반영 실패 — 다시 누르면 같은 주문번호라 재결제 없이 반영된다
      console.error('club_billing_commit_plan_change failed', { subscription: sub.id, orderId, paymentKey, message: error.message });
      return json({ error: 'commit_failed' }, 500);
    }
    return json({ ok: true, action: 'upgraded', plan, chargeAmount: charged, monthlyPrice: target.monthly_price, nextChargeAt: sub.next_charge_at });
  }

  // 5) 다운그레이드: 이미 결제한 기간은 유지, 다음 결제일부터 변경
  if (!preview) {
    const { error } = await commit({
      p_club_id: clubId, p_sub_id: sub.id, p_plan: sub.plan, p_amount: currentPrice, p_pending_plan: plan, p_set_club_plan: false,
    });
    if (error) return json({ error: 'commit_failed' }, 500);
  }
  return json({
    ok: true, action: 'downgrade_scheduled', preview, plan, chargeAmount: 0, monthlyPrice: target.monthly_price,
    effectiveAt: sub.current_period_end, nextChargeAt: sub.next_charge_at,
  });
});
