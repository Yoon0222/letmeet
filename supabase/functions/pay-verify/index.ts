// 코트 예약 결제 서버 검증 — PG(포트원) 결제를 서버에서 재확인 후 주문을 paid 로 확정.
// 클라이언트 성공 콜백은 신뢰하지 않는다(위변조 가능) → 반드시 여기서 PG API 로 재검증.
// 배포:  supabase functions deploy pay-verify
// 시크릿: supabase secrets set PORTONE_API_SECRET=... (포트원 콘솔 > API Keys)
// 호출:  supabase.functions.invoke('pay-verify', { body: { order_id, paymentId } })
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { order_id, paymentId } = await req.json().catch(() => ({}));
  if (!order_id || !paymentId) return json({ error: 'order_id, paymentId required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // 호출자 인증(로그인 사용자만)
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller.user) return json({ error: 'unauthorized' }, 401);

  // 1) 주문 조회(내 주문만)
  const { data: order } = await admin
    .from('court_payments')
    .select('id, user_id, amount, status')
    .eq('order_id', order_id)
    .maybeSingle();
  if (!order) return json({ error: 'order not found' }, 404);
  if (order.user_id !== caller.user.id) return json({ error: 'forbidden' }, 403);
  if (order.status === 'paid') return json({ paid: true }); // 멱등

  // 2) PG 재검증 (포트원 V2)
  const secret = Deno.env.get('PORTONE_API_SECRET');
  if (!secret) return json({ error: 'PG secret not configured' }, 501);
  const pgRes = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${secret}` },
  });
  if (!pgRes.ok) return json({ paid: false, error: `PG lookup failed (${pgRes.status})` }, 502);
  const pg = await pgRes.json();

  // 3) 상태·금액 일치 확인
  const paidOk = pg?.status === 'PAID' && Number(pg?.amount?.total) === Number(order.amount);
  if (!paidOk) {
    // 검증 실패 → 슬롯 해제 + 주문 실패
    await admin.from('court_reservations').delete().eq('payment_id', order.id);
    await admin.from('court_payments').update({ status: 'failed' }).eq('id', order.id);
    return json({ paid: false, error: 'verification mismatch' });
  }

  // 4) 확정
  await admin.from('court_payments').update({ status: 'paid', provider_tx: paymentId, paid_at: new Date().toISOString() }).eq('id', order.id);
  return json({ paid: true });
});
