// club-dues-refund: 카드로 결제된 회비 전액 환불(클럽장·임원). 정산이 확정되기 전의 결제만 가능.
//   입력: { chargeId, reason? }
//   임원은 자기 회비를 환불할 수 없다(클럽장은 가능). 피넛 수수료도 함께 환불된다(정산에서 빠진다).
//   토스 취소 → 장부 반영 순서. 반영에 실패해도 같은 요청을 다시 보내면 된다(토스 취소는 한 번만 일어난다).
import { CORS, json, refundPayment, rpcWithRetry } from '../_shared/billing.ts';
import { adminClient, callerOf, isUuid } from '../_shared/dues.ts';

const PREPARE_STATUS: Record<string, number> = {
  not_found: 404, forbidden: 403, self_not_allowed: 403, already_refunded: 409, not_paid: 400, settled: 409,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const chargeId: string = typeof body?.chargeId === 'string' ? body.chargeId : '';
  const reason: string = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
  if (!isUuid(chargeId)) return json({ error: 'invalid_request' }, 400);

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);
  const admin = adminClient();
  const caller = await callerOf(admin, req);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const { data: prep, error: prepErr } = await admin.rpc('dues_refund_prepare', { p_charge_id: chargeId, p_actor: caller.id });
  if (prepErr) return json({ error: 'refund_check_failed' }, 500);
  const code: string = prep?.code ?? 'refund_check_failed';
  if (code !== 'ok') return json({ error: code }, PREPARE_STATUS[code] ?? 400);

  const refunded = await refundPayment(secret, prep.payment_key, prep.order_id, reason || '클럽 회비 환불');
  if (!refunded) return json({ error: 'refund_failed' }, 502);

  const { data: result, error: commitErr } = await rpcWithRetry(admin, 'dues_charge_commit_refund', {
    p_charge_id: chargeId, p_actor: caller.id, p_reason: reason,
  });
  if (commitErr || (result !== 'ok' && result !== 'duplicate')) {
    // 카드 환불은 됐는데 장부 반영 실패 — 같은 요청을 다시 보내면 반영된다
    console.error('dues_charge_commit_refund failed', { chargeId, orderId: prep.order_id, result, message: commitErr?.message });
    return json({ error: 'commit_failed' }, 500);
  }
  return json({ ok: true, amount: prep.amount });
});
