// 클럽 회비 결제 공용 — club-dues-* 엣지함수가 함께 쓴다.
//   결제 한 번 = club_dues_charges 한 행(주문번호 고유). DB 함수(0098)가 선점·반영을 맡고, 여기서는 토스 호출과 결과 분류만 한다.
//   같은 주문번호는 다시 보내지 않는다 — 결과를 모르는 시도는 조회로만 확정하고, 다시 결제할 때는 새 시도(새 주문번호)를 만든다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { chargeBilling, lookupOrder, refundPayment, rpcWithRetry } from './billing.ts';

export type DuesClaim = {
  charge_id: string;
  dues_id: string;
  club_id: string;
  user_id: string;
  amount: number;
  order_id: string;
  billing_key: string;
  customer_key: string;
  club_name: string;
  period_key: string;
};

// paid: 결제·반영 완료 / failed: 결제되지 않음(반영 완료) / unknown: 아직 모름(시도는 pending 으로 남아 다음 확인이 확정)
export type DuesOutcome = { outcome: 'paid' | 'failed' | 'unknown'; reason?: string; trace?: string };

// 이 시간이 지나도록 토스에 주문이 없으면 요청이 전달되지 않은 것으로 본다
const NOT_DELIVERED_AFTER_MS = 10 * 60_000;

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

// deno-lint-ignore no-explicit-any
export async function callerOf(admin: any, req: Request): Promise<{ id: string } | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data?.user ? { id: data.user.id } : null;
}

// 승인된 결제를 장부에 반영한다. 반영할 수 없는 결제(금액 불일치·이미 닫힌 시도·회비가 사라짐)는 바로 환불한다.
async function commitPaid(
  // deno-lint-ignore no-explicit-any
  admin: any,
  secret: string,
  chargeId: string,
  orderId: string,
  paymentKey: string | null,
  amount: number,
  trace: string,
): Promise<DuesOutcome> {
  const { data, error } = await rpcWithRetry(admin, 'dues_charge_commit_paid', {
    p_charge_id: chargeId, p_payment_key: paymentKey, p_amount: amount,
  });
  if (error) {
    // 결제는 됐는데 반영 실패 — 시도가 pending 으로 남아 있으므로 다음 확인(조회)이 다시 반영한다
    console.error('dues_charge_commit_paid failed', { chargeId, orderId, message: error.message });
    return { outcome: 'unknown', trace };
  }
  if (data === 'ok' || data === 'duplicate') return { outcome: 'paid', trace };

  console.error('dues payment not applicable, refund', { chargeId, orderId, result: data, amount });
  const refunded = paymentKey ? await refundPayment(secret, paymentKey, orderId, '회비 결제 미반영 — 자동 환불') : false;
  if (!refunded) return { outcome: 'unknown', trace: `${trace} unapplied:${data} refund=failed` };
  await rpcWithRetry(admin, 'dues_charge_commit_failed', {
    p_charge_id: chargeId, p_reason: '반영할 수 없는 결제 — 자동 환불', p_count_attempt: false,
  });
  return { outcome: 'failed', reason: '결제를 반영할 수 없어 환불했어요.', trace: `${trace} unapplied:${data} refund=ok` };
}

// 선점한 회비 한 건을 결제하고 결과를 반영한다.
// deno-lint-ignore no-explicit-any
export async function settleClaim(admin: any, secret: string, claim: DuesClaim): Promise<DuesOutcome> {
  const res = await chargeBilling(secret, {
    billingKey: claim.billing_key,
    customerKey: claim.customer_key,
    amount: claim.amount,
    orderId: claim.order_id,
    orderName: `${claim.club_name} 회비`.slice(0, 100),
  });
  if (res.kind === 'unknown') {
    console.error('dues charge result unknown', { chargeId: claim.charge_id, orderId: claim.order_id, reason: res.reason, trace: res.trace });
    return { outcome: 'unknown', trace: res.trace };
  }
  if (res.kind === 'declined') {
    const { error } = await rpcWithRetry(admin, 'dues_charge_commit_failed', {
      p_charge_id: claim.charge_id, p_reason: res.reason, p_count_attempt: true,
    });
    if (error) {
      console.error('dues_charge_commit_failed failed', { chargeId: claim.charge_id, message: error.message });
      return { outcome: 'unknown', trace: res.trace };
    }
    return { outcome: 'failed', reason: res.reason, trace: res.trace };
  }
  return commitPaid(admin, secret, claim.charge_id, claim.order_id, res.paymentKey, res.amount, res.trace ?? '');
}

// 결과를 모른 채 남은 시도(pending)를 토스 조회로 확정한다. 토스에 다시 결제를 요청하지 않는다.
export async function resolvePendingCharge(
  // deno-lint-ignore no-explicit-any
  admin: any,
  secret: string,
  charge: { id: string; order_id: string; amount: number; created_at: string },
): Promise<DuesOutcome> {
  const order = await lookupOrder(secret, charge.order_id, charge.amount);
  if (order.state === 'paid') {
    return commitPaid(admin, secret, charge.id, charge.order_id, order.paymentKey, order.amount, order.trace);
  }
  let reason: string | null = null;
  if (order.state === 'dead') reason = `결제 취소됨(${order.status})`;
  else if (order.state === 'none' && Date.now() - new Date(charge.created_at).getTime() > NOT_DELIVERED_AFTER_MS) reason = '결제 요청이 전달되지 않았어요';
  if (!reason) return { outcome: 'unknown', trace: order.trace };
  const { error } = await rpcWithRetry(admin, 'dues_charge_commit_failed', {
    p_charge_id: charge.id, p_reason: reason, p_count_attempt: false,
  });
  if (error) return { outcome: 'unknown', trace: order.trace };
  return { outcome: 'failed', reason, trace: order.trace };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string) {
  return UUID_RE.test(v);
}

// 오늘 날짜(KST) 'YYYY-MM-DD'
export function todayKst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
