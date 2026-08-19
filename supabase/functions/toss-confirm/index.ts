import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ConfirmBody = {
  paymentId?: string;
  paymentKey?: string;
  orderId?: string;
  amount?: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function basicAuth(secretKey: string) {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

function pending(message: string, status?: string, toss?: unknown) {
  return json({ ok: false, pending: true, status, message, toss });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const body = (await req.json().catch(() => ({}))) as ConfirmBody;
  const paymentId = body.paymentId?.trim();
  const paymentKey = body.paymentKey?.trim();
  const orderId = body.orderId?.trim();
  const amount = Number(body.amount);

  if (!orderId || !Number.isFinite(amount)) {
    return json({ error: 'orderId and amount required' }, 400);
  }

  const tossSecretKey = Deno.env.get('TOSS_SECRET_KEY');
  if (!tossSecretKey) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let paymentQuery = admin
    .from('payments')
    .select('id, user_id, order_id, amount, status')
    .eq('user_id', user.id);

  paymentQuery = paymentId ? paymentQuery.eq('id', paymentId) : paymentQuery.eq('order_id', orderId);

  const { data: payment, error: paymentError } = await paymentQuery.maybeSingle();

  if (paymentError) return json({ error: paymentError.message }, 500);
  if (!payment) return json({ error: 'payment not found' }, 404);
  if (payment.user_id !== user.id) return json({ error: 'forbidden' }, 403);
  if (payment.order_id !== orderId || payment.amount !== amount) return json({ error: 'payment mismatch' }, 409);
  if (payment.status === 'paid') {
    const { data: reservations } = await admin
      .from('court_reservations')
      .select('id')
      .eq('payment_id', payment.id);

    return json({
      ok: true,
      alreadyPaid: true,
      reservationIds: (reservations ?? []).map((reservation) => reservation.id),
    });
  }
  if (payment.status !== 'pending') return json({ error: `invalid payment status: ${payment.status}` }, 409);

  let resolvedPaymentKey = paymentKey;
  let tossData: Record<string, unknown> = {};

  const lookupRes = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: basicAuth(tossSecretKey),
    },
  });
  const lookupData = await lookupRes.json().catch(() => ({}));
  if (lookupRes.ok) {
    const lookupPaymentKey = typeof lookupData?.paymentKey === 'string' ? lookupData.paymentKey : undefined;
    if (lookupPaymentKey) resolvedPaymentKey = lookupPaymentKey;

    if (typeof lookupData?.totalAmount === 'number' && lookupData.totalAmount !== amount) {
      return json({ error: 'toss amount mismatch', toss: lookupData }, 409);
    }

    if (lookupData?.status === 'DONE') {
      tossData = lookupData;
    }
  } else if (!resolvedPaymentKey) {
    const tossStatus = typeof lookupData?.status === 'string' ? lookupData.status : undefined;
    const tossCode = typeof lookupData?.code === 'string' ? lookupData.code : undefined;
    return pending('토스 결제 결과가 아직 도착하지 않았어요.', tossStatus ?? tossCode, lookupData);
  }

  if (!resolvedPaymentKey) {
    return pending('토스 결제 승인키가 아직 도착하지 않았어요.');
  }

  if (tossData?.status !== 'DONE') {
    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: basicAuth(tossSecretKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey: resolvedPaymentKey, orderId, amount }),
    });

    tossData = await tossRes.json().catch(() => ({}));
    if (!tossRes.ok) {
      await admin.from('payments').update({ status: 'failed', provider_tx: resolvedPaymentKey }).eq('id', payment.id);
      await admin.from('court_reservations').delete().eq('payment_id', payment.id);
      return json({ error: 'toss confirm failed', toss: tossData }, 402);
    }
  }

  if (tossData?.status !== 'DONE') {
    await admin.from('payments').update({ status: 'failed', provider_tx: resolvedPaymentKey }).eq('id', payment.id);
    await admin.from('court_reservations').delete().eq('payment_id', payment.id);
    return json({ error: 'payment not done', toss: tossData }, 402);
  }

  const paidAt = typeof tossData?.approvedAt === 'string' ? tossData.approvedAt : new Date().toISOString();
  const { error: updateError } = await admin
    .from('payments')
    .update({ status: 'paid', provider_tx: resolvedPaymentKey, paid_at: paidAt })
    .eq('id', payment.id)
    .eq('status', 'pending');

  if (updateError) return json({ error: updateError.message }, 500);

  const { data: reservations, error: reservationError } = await admin
    .from('court_reservations')
    .update({ expires_at: null })
    .eq('payment_id', payment.id)
    .select('id');

  if (reservationError) return json({ error: reservationError.message }, 500);

  return json({
    ok: true,
    paymentKey: resolvedPaymentKey,
    orderId,
    reservationIds: (reservations ?? []).map((reservation) => reservation.id),
  });
});
