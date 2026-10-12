// toss-billing-issue: 클럽 유료 플랜 구독 시작(카드 등록).
//   입력: { clubId, authKey, customerKey, plan? }  (authKey = 카드등록 성공 후 Toss가 준 값)
//   plan 을 안 보내면(구버전 앱) 클럽이 이미 쓰는 플랜을 따른다 — 플러스 클럽이 조용히 프리미엄으로 내려가지 않게.
//   가격은 club_plans(서버)에서 읽는다 — 클라이언트 금액은 받지 않는다.
//   1) authKey → billingKey 교환
//   2) 상황별 처리
//      a) 무료 체험 중        : 과금 없이 카드만 등록, 첫 과금 = 체험 종료일
//      b) 결제한 기간이 남음   : (해지 후 재구독·카드 재등록) 과금 없이 재개. 더 비싼 플랜이면 남은 기간 차액만 결제,
//                                더 싼 플랜이면 다음 결제일부터 변경
//      c) 그 외               : 즉시 첫 과금, 새 1개월 시작
//   3) 구독·과금 이력·클럽 등급을 한 트랜잭션으로 반영(club_billing_commit_issue)
//   같은 authKey 로 다시 호출돼도(응답 유실·재시도) 주문번호가 같아 한 번만 결제된다.
//   결과를 모른 채 끝난 뒤 카드를 새로 등록하면(주문번호가 달라짐) 앞선 주문부터 확정한다 — 결제돼 있었으면 환불 후 진행.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import {
  CORS, addMonthAnchored, chargeWithIntent, json, loadPlans, proratedDiff, rpcWithRetry, settlePendingOrder, sha256Hex, tossPost,
} from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const clubId: string = typeof body?.clubId === 'string' ? body.clubId : '';
  const authKey: string = typeof body?.authKey === 'string' ? body.authKey : '';
  const customerKey: string = typeof body?.customerKey === 'string' ? body.customerKey : '';
  const requestedPlan: string = typeof body?.plan === 'string' ? body.plan : '';
  if (!clubId || !authKey || !customerKey) return json({ error: 'clubId, authKey, customerKey required' }, 400);

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);
  if (customerKey !== caller.id) return json({ error: 'customer_key_mismatch' }, 403);

  const { data: club, error: clubErr } = await admin
    .from('clubs')
    .select('id, owner_id, name, premium_status, premium_started_at, premium_trial_ends_at, premium_plan')
    .eq('id', clubId)
    .maybeSingle();
  if (clubErr) return json({ error: 'club_load_failed' }, 500);
  if (!club) return json({ error: 'club_not_found' }, 404);
  if (club.owner_id !== caller.id) return json({ error: 'forbidden' }, 403);

  // 조회 실패를 "구독 없음"으로 보면 결제 기간이 남은 클럽을 신규로 착각해 다시 결제하게 된다 → 실패하면 중단
  const { data: existing, error: subLoadErr } = await admin.from('club_subscriptions').select('*').eq('club_id', clubId).maybeSingle();
  if (subLoadErr) return json({ error: 'subscription_load_failed' }, 500);

  let plans;
  try {
    plans = await loadPlans(admin);
  } catch (_err) {
    return json({ error: 'plans_load_failed' }, 500);
  }
  const plan: string = requestedPlan || existing?.plan || club.premium_plan || 'premium';
  const target = plans[plan];
  if (!target) return json({ error: 'plan_not_found' }, 400);
  // plan 을 안 보내는 구버전 앱은 화면에 프리미엄 요금만 보여준다 — 다른 요금의 플랜을 그 화면으로 결제시키지 않는다
  if (!requestedPlan && plan !== 'premium') {
    return json({ error: '앱을 최신 버전으로 업데이트한 뒤 다시 시도해주세요.' }, 400);
  }
  // 판매 중지된 플랜은 새로 구독할 수 없다(이미 그 플랜을 쓰던 클럽은 계속 가능)
  if (!target.active && existing?.plan !== plan && club.premium_plan !== plan) return json({ error: 'plan_unavailable' }, 400);

  // 1) authKey → billingKey (같은 authKey 재요청은 Toss 가 같은 응답을 돌려준다)
  const issue = await tossPost(secret, '/v1/billing/authorizations/issue', { authKey, customerKey }, `sub-issue-${authKey}`);
  if (!issue.ok || !issue.data?.billingKey) {
    return json({ error: 'billing_issue_failed', toss: issue.data }, 402);
  }
  const billingKey: string = issue.data.billingKey;
  const cardCompany: string = issue.data?.card?.company ?? issue.data?.cardCompany ?? '';
  const cardMasked: string = issue.data?.card?.number ?? '';
  // 과금 주문번호는 authKey 에서 만든다 → 재시도해도 같은 주문(이중 결제 없음)
  const keyHash = (await sha256Hex(`${clubId}:${authKey}`)).slice(0, 40);

  // 같은 카드 등록(authKey)으로 이미 결제·반영까지 끝난 요청의 재호출(앱이 응답을 못 받은 경우) → 그때의 결과를 그대로 알려준다
  const { data: prior, error: priorErr } = await admin
    .from('club_subscription_charges')
    .select('amount')
    .in('order_id', [`subi-${keyHash}`, `subu-${keyHash}`])
    .eq('status', 'paid')
    .maybeSingle();
  if (priorErr) return json({ error: 'charges_load_failed' }, 500);
  if (prior && existing) {
    return json({
      ok: true, status: existing.status, plan: existing.plan, pendingPlan: existing.pending_plan ?? null, trialing: false,
      chargedNow: true, chargedAmount: prior.amount, monthlyPrice: existing.amount, nextChargeAt: existing.next_charge_at,
      card: { company: cardCompany, masked: cardMasked },
    });
  }

  const now = new Date();
  const trialEnd = club.premium_trial_ends_at ? new Date(club.premium_trial_ends_at) : null;
  // 무료 체험 구간 = 체험 종료일 전이고 아직 한 번도 결제하지 않음.
  // 체험 중 카드를 등록하면 클럽 상태가 'active' 로 바뀌므로 상태가 아니라 날짜와 결제 이력으로 판단한다
  // (그래야 체험 중 카드 재등록·해지 후 재구독·응답 유실 뒤 재시도에서 결제되지 않는다).
  const trialing = !!trialEnd && trialEnd.getTime() > now.getTime() && !existing?.last_charge_at
    && (club.premium_status === 'trialing' || club.premium_status === 'active');
  const paidEnd = existing?.last_charge_at && existing?.current_period_end ? new Date(existing.current_period_end) : null;
  const paidRemaining = !!paidEnd && paidEnd.getTime() > now.getTime();

  let periodStart: Date;
  let periodEnd: Date;
  let nextChargeAt: Date;
  let anchorDay: number;
  let subPlan = plan; // 구독에 기록할 현재 플랜
  let subAmount = target.monthly_price;
  let pendingPlan: string | null = null;
  let chargeAmount = 0;
  let chargeKind: 'initial' | 'upgrade' | null = null;
  let chargeOrderId: string | null = null;
  let chargeName = '';
  let lastChargeAt: string | null = existing?.last_charge_at ?? null;

  if (trialing && trialEnd && !paidRemaining) {
    // a) 체험 중 — 카드만 등록, 첫 과금은 체험 종료일. 체험 중 플랜 전환은 무료.
    periodStart = existing?.current_period_start ? new Date(existing.current_period_start) : now;
    periodEnd = trialEnd;
    nextChargeAt = trialEnd;
    anchorDay = trialEnd.getUTCDate();
    lastChargeAt = null;
  } else if (paidRemaining && paidEnd && existing) {
    // b) 결제한 기간이 남아 있음 — 기간은 그대로 두고 재개
    periodStart = existing.current_period_start ? new Date(existing.current_period_start) : now;
    periodEnd = paidEnd;
    nextChargeAt = paidEnd;
    anchorDay = existing.billing_anchor_day ?? paidEnd.getUTCDate();
    const currentPrice: number = existing.amount ?? plans[existing.plan]?.monthly_price ?? target.monthly_price;
    if (plan === existing.plan) {
      // 같은 플랜(카드 변경·재구독) — 금액과 예약된 변경은 그대로 둔다.
      // 그 사이 가격표가 바뀌었어도 여기서 조용히 적용하거나 차액을 결제하지 않는다(가격 인상은 동의 절차가 따로 필요).
      subAmount = currentPrice;
      pendingPlan = existing.pending_plan ?? null;
    } else if (target.monthly_price > currentPrice) {
      const diff = proratedDiff(target.monthly_price, currentPrice, periodStart, periodEnd, now);
      if (diff > 0) {
        chargeAmount = diff;
        chargeKind = 'upgrade';
        chargeOrderId = `subu-${keyHash}`;
        chargeName = `${club.name} ${target.name} 업그레이드`;
      }
    } else if (target.monthly_price < currentPrice) {
      // 더 싼 플랜 — 이미 결제한 기간은 기존 플랜 유지, 다음 결제일부터 변경
      subPlan = existing.plan;
      subAmount = currentPrice;
      pendingPlan = plan;
    }
  } else {
    // c) 즉시 첫 과금
    chargeAmount = target.monthly_price;
    chargeKind = 'initial';
    chargeOrderId = `subi-${keyHash}`;
    chargeName = `${club.name} ${target.name} 구독`;
    periodStart = now;
    anchorDay = now.getUTCDate();
    periodEnd = addMonthAnchored(now, anchorDay);
    nextChargeAt = periodEnd;
  }

  // 2) 과금(필요할 때만). 앞선 시도의 미확정 주문이 있으면 그것부터 확정한다(_shared/billing.ts).
  let paymentKey: string | null = null;
  if (chargeKind && chargeOrderId) {
    const res = await chargeWithIntent(admin, secret, {
      clubId, kind: chargeKind, billingKey, customerKey, amount: chargeAmount, orderId: chargeOrderId, orderName: chargeName,
    });
    if (res.kind === 'declined') {
      return json({ error: chargeKind === 'upgrade' ? 'upgrade_charge_failed' : 'first_charge_failed', toss: res.toss }, 402);
    }
    if (res.kind === 'unknown') {
      // 결과를 모르면 아무것도 바꾸지 않는다 — 같은 카드 등록으로 다시 시도하면 같은 주문번호로 확인된다
      return json({ error: 'charge_unknown' }, 409);
    }
    paymentKey = res.paymentKey;
    chargeAmount = res.amount; // 실제 결제된 금액(재시도에서 앞선 주문이 확인된 경우 그때의 금액)
    lastChargeAt = now.toISOString();
  } else if ((await settlePendingOrder(admin, secret, clubId)) === 'blocked') {
    // 과금 없이 재개하는 경우에도, 결과를 모르는 앞선 주문이 남아 있으면 구독 상태를 바꾸지 않는다
    return json({ error: 'charge_unknown' }, 409);
  }

  // 3) 구독 + 과금 이력 + 클럽 등급을 한 트랜잭션으로 반영
  const { error: commitErr } = await rpcWithRetry(admin, 'club_billing_commit_issue', {
    p_club_id: clubId,
    p_owner_id: caller.id,
    p_billing_key: billingKey,
    p_customer_key: customerKey,
    p_card_company: cardCompany,
    p_card_masked: cardMasked,
    p_plan: subPlan,
    p_pending_plan: pendingPlan,
    p_amount: subAmount,
    p_period_start: periodStart.toISOString(),
    p_period_end: periodEnd.toISOString(),
    p_next_charge_at: nextChargeAt.toISOString(),
    p_last_charge_at: lastChargeAt,
    p_anchor_day: anchorDay,
    p_charge_amount: chargeAmount,
    p_charge_kind: chargeKind,
    p_charge_order_id: chargeKind ? chargeOrderId : null,
    p_charge_payment_key: paymentKey,
  });
  if (commitErr) {
    // 결제는 됐을 수 있다 — 흔적을 남기고, 같은 카드 등록으로 재시도하면 같은 주문번호라 다시 결제되지 않고 반영만 된다
    console.error('club_billing_commit_issue failed', { clubId, orderId: chargeOrderId, paymentKey, message: commitErr.message });
    return json({ error: 'commit_failed' }, 500);
  }

  return json({
    ok: true,
    status: 'active',
    plan: subPlan,
    pendingPlan,
    trialing,
    chargedNow: chargeAmount > 0 && !!chargeKind,
    chargedAmount: chargeKind ? chargeAmount : 0,
    monthlyPrice: subAmount,
    nextChargeAt: nextChargeAt.toISOString(),
    card: { company: cardCompany, masked: cardMasked },
  });
});
