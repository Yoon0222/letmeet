// 토스 웹훅 — 결제 상태 변경을 서버가 직접 통보받아 court_payments 를 동기화한다.
//   앱 복귀가 막혀도(가상계좌 입금·대시보드 취소/환불 등) 서버가 진실을 반영.
//   ⚠️ 웹훅 바디는 신뢰하지 않는다 → orderId 로 Toss API 를 재조회해 검증(멱등).
// 배포:  supabase functions deploy toss-webhook --no-verify-jwt
//        (웹훅은 토스가 호출하므로 JWT 없음 → --no-verify-jwt 필수)
// 시크릿: supabase secrets set TOSS_SECRET_KEY=...
// 등록:  토스 대시보드 → 웹훅 → URL = https://<ref>.supabase.co/functions/v1/toss-webhook
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function basicAuth(secret: string) {
  return `Basic ${btoa(`${secret}:`)}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const payload = await req.json().catch(() => ({}));
  // 토스 웹훅 형태가 버전/이벤트별로 달라 orderId 를 넓게 탐색
  const data = payload?.data ?? payload ?? {};
  const orderId: string | undefined = data.orderId ?? payload.orderId;
  if (!orderId) return json({ ok: true, skipped: 'no orderId' }); // 관련 없는 이벤트는 무시(200)

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY not configured' }, 501);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // 우리 주문 조회
  const { data: order } = await admin
    .from('court_payments')
    .select('id, amount, status')
    .eq('order_id', orderId)
    .maybeSingle();
  if (!order) return json({ ok: true, skipped: 'unknown order' }); // 우리 주문 아님 → 무시

  // 토스 API 재조회(권위 있는 상태)
  const res = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: basicAuth(secret) },
  });
  if (!res.ok) return json({ ok: false, error: `Toss lookup failed (${res.status})` }, 502);
  const pay = await res.json();
  const status: string = pay?.status;
  const paidOk = status === 'DONE' && Number(pay?.totalAmount) === Number(order.amount);

  if (paidOk) {
    if (order.status !== 'paid') {
      await admin
        .from('court_payments')
        .update({ status: 'paid', provider_tx: pay?.paymentKey ?? null, paid_at: new Date().toISOString() })
        .eq('id', order.id);
    }
    return json({ ok: true, status: 'paid' });
  }

  // 취소/만료/중단 → 홀드 해제(이미 paid 면 환불 상태이므로 예약은 건드리지 않음)
  if (['CANCELED', 'PARTIAL_CANCELED', 'EXPIRED', 'ABORTED'].includes(status)) {
    if (order.status !== 'paid') {
      await admin.from('court_reservations').delete().eq('payment_id', order.id);
      await admin.from('court_payments').update({ status: 'canceled' }).eq('id', order.id);
    } else {
      // 결제 완료 후 취소/환불 → 예약 취소 + 환불 표시
      await admin.from('court_reservations').update({ status: 'cancelled' }).eq('payment_id', order.id);
      await admin.from('court_payments').update({ status: 'refunded' }).eq('id', order.id);
    }
    return json({ ok: true, status: 'canceled' });
  }

  return json({ ok: true, status: status ?? 'unknown' });
});
