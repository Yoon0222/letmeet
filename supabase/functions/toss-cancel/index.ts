// toss-cancel: 코트 예약 취소 + 토스 환불.
//   정책(MVP, 전역): 예약일이 미래(내일 이후)면 100% 환불, 당일이면 환불 없이 취소.
//   (코트별 정책은 후속 — courts.refund_policy 도입 예정)
//   입력: { reservationIds: string[] }  또는  { paymentId: string }
//   paymentKey 는 payments.provider_tx 에 저장돼 있음.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// KST(UTC+9) 기준 오늘 날짜 (YYYY-MM-DD)
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const reservationIds: string[] = Array.isArray(body?.reservationIds) ? body.reservationIds : [];
  let paymentId: string | null = typeof body?.paymentId === 'string' ? body.paymentId : null;

  // 예약 id 로 왔으면 payment_id 를 역추적
  if (!paymentId && reservationIds.length > 0) {
    const { data: rows } = await admin
      .from('court_reservations')
      .select('id, user_id, payment_id')
      .in('id', reservationIds);
    const list = rows ?? [];
    if (list.length === 0) return json({ error: 'not_found' }, 404);
    if (list.some((r) => r.user_id !== caller.id)) return json({ error: 'forbidden' }, 403);
    paymentId = (list.find((r) => r.payment_id)?.payment_id as string | null) ?? null;
  }

  // 결제가 없는 예약(무료 등) → 그냥 취소
  if (!paymentId) {
    if (reservationIds.length > 0) {
      await admin.from('court_reservations').delete().in('id', reservationIds).eq('user_id', caller.id);
    }
    return json({ ok: true, refunded: false, reason: 'no_payment' });
  }

  const { data: payment } = await admin
    .from('payments')
    .select('id, user_id, status, amount, slot_date, provider_tx, order_name')
    .eq('id', paymentId)
    .maybeSingle();
  if (!payment) return json({ error: 'payment_not_found' }, 404);
  if (payment.user_id !== caller.id) return json({ error: 'forbidden' }, 403);

  // 정책: 예약일이 오늘 이후면 환불, 당일/과거면 환불 없음
  const eligible = !!payment.slot_date && payment.slot_date > todayKST();
  let refunded = false;
  let refundError: string | null = null;

  if (eligible && payment.status === 'paid' && payment.provider_tx) {
    const secret = Deno.env.get('TOSS_SECRET_KEY');
    if (!secret) return json({ error: 'toss_not_configured' }, 503);
    try {
      const res = await fetch(`https://api.tosspayments.com/v1/payments/${payment.provider_tx}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(secret + ':')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelReason: '고객 예약 취소' }),
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        refunded = true;
        await admin.from('payments').update({ status: 'refunded' }).eq('id', payment.id);
      } else {
        // 이미 취소됐으면 환불된 것으로 간주
        if (/ALREADY_CANCELED/i.test(text)) {
          refunded = true;
          await admin.from('payments').update({ status: 'refunded' }).eq('id', payment.id);
        } else {
          refundError = text.slice(0, 300);
        }
      }
    } catch (e) {
      refundError = String(e);
    }
    if (refundError) return json({ error: 'refund_failed', detail: refundError }, 502);
  }

  // 환불 여부와 무관하게 예약 취소(삭제)
  await admin.from('court_reservations').delete().eq('payment_id', payment.id).eq('user_id', caller.id);

  return json({
    ok: true,
    refunded,
    amount: refunded ? payment.amount : 0,
    reason: refunded ? 'refunded_full' : eligible ? 'not_paid' : 'same_day_no_refund',
  });
});
