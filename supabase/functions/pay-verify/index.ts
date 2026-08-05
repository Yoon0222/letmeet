import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function basicAuth(secret: string) {
  return `Basic ${btoa(`${secret}:`)}`;
}

async function failOrder(admin: ReturnType<typeof createClient>, orderId: string) {
  await admin.from('court_reservations').delete().eq('payment_id', orderId);
  await admin.from('payments').update({ status: 'failed' }).eq('id', orderId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { order_id, paymentId } = await req.json().catch(() => ({}));
  if (!order_id) return json({ error: 'order_id required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller.user) return json({ error: 'unauthorized' }, 401);

  const { data: order } = await admin
    .from('payments')
    .select('id, user_id, amount, status, provider')
    .eq('order_id', order_id)
    .maybeSingle();

  if (!order) return json({ error: 'order not found' }, 404);
  if (order.user_id !== caller.user.id) return json({ error: 'forbidden' }, 403);
  if (order.status === 'paid') return json({ paid: true });

  if (order.provider === 'toss') {
    const secret = Deno.env.get('TOSS_SECRET_KEY');
    if (!secret) return json({ error: 'TOSS_SECRET_KEY is not configured' }, 501);

    // paymentKey 가 없으면(앱2앱 복귀 등 웹뷰 리다이렉트를 못 받은 경우)
    // orderId 로 토스에서 결제를 직접 조회해 paymentKey/상태를 얻는다.
    let payKey: string | undefined = paymentId;
    if (!payKey) {
      const lookRes = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(order_id)}`, {
        headers: { Authorization: basicAuth(secret) },
      });
      const look = await lookRes.json().catch(() => ({}));
      if (!lookRes.ok) return json({ paid: false, pending: true }); // 아직 결제 진행 전/조회 실패 → 실패처리 안 함
      if (look?.status === 'DONE' && Number(look?.totalAmount) === Number(order.amount)) {
        await admin.from('payments').update({ status: 'paid', provider_tx: look?.paymentKey ?? null, paid_at: new Date().toISOString() }).eq('id', order.id);
        return json({ paid: true });
      }
      payKey = look?.paymentKey;
      if (!payKey) return json({ paid: false, pending: true }); // 아직 인증 미완 → 대기
    }

    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: basicAuth(secret),
        'Content-Type': 'application/json',
        'Idempotency-Key': `confirm_${order_id}`,
      },
      body: JSON.stringify({
        paymentKey: payKey,
        orderId: order_id,
        amount: Number(order.amount),
      }),
    });

    const toss = await tossRes.json().catch(() => ({}));
    const paidOk = tossRes.ok && toss?.status === 'DONE' && toss?.orderId === order_id && Number(toss?.totalAmount) === Number(order.amount);
    if (!paidOk) {
      await failOrder(admin, order.id);
      return json({ paid: false, error: toss?.message ?? 'Toss verification mismatch', code: toss?.code });
    }

    await admin.from('payments').update({ status: 'paid', provider_tx: payKey, paid_at: new Date().toISOString() }).eq('id', order.id);
    return json({ paid: true });
  }

  if (order.provider === 'portone') {
    const secret = Deno.env.get('PORTONE_API_SECRET');
    if (!secret) return json({ error: 'PORTONE_API_SECRET is not configured' }, 501);

    const pgRes = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `PortOne ${secret}` },
    });
    if (!pgRes.ok) return json({ paid: false, error: `PortOne lookup failed (${pgRes.status})` }, 502);
    const pg = await pgRes.json();
    const paidOk = pg?.status === 'PAID' && Number(pg?.amount?.total) === Number(order.amount);
    if (!paidOk) {
      await failOrder(admin, order.id);
      return json({ paid: false, error: 'PortOne verification mismatch' });
    }

    await admin.from('payments').update({ status: 'paid', provider_tx: paymentId, paid_at: new Date().toISOString() }).eq('id', order.id);
    return json({ paid: true });
  }

  return json({ error: `unsupported provider: ${order.provider}` }, 400);
});
