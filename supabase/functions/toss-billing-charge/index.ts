// toss-billing-charge: 구독 정기 과금 (pg_cron 일1회 호출).
//   인증: x-cron-secret 헤더 == CRON_SECRET. (게이트웨이 통과용 anon Authorization 은 별도)
//   1) 해지 후 기간 만료 구독 → 클럽 강등  2) 도래한 구독 과금(성공=연장 / 실패=재시도·3회 초과 강등)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const MAX_FAILS = 3; // 이 횟수 초과 실패 시 강등

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function basicAuth(secret: string) {
  return `Basic ${btoa(`${secret}:`)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || (req.headers.get('x-cron-secret') ?? '') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const nowIso = new Date().toISOString();

  // 1) 해지 후 기간 만료 → 클럽 강등(멱등: premium_status='active' 인 것만)
  const { data: expired } = await admin
    .from('club_subscriptions')
    .select('id, club_id')
    .eq('status', 'canceled')
    .lte('current_period_end', nowIso);
  for (const e of expired ?? []) {
    await admin.from('clubs').update({ premium_status: 'canceled' }).eq('id', e.club_id).eq('premium_status', 'active');
  }

  // 2) 도래한 과금
  const { data: due } = await admin
    .from('club_subscriptions')
    .select('*')
    .in('status', ['active', 'past_due'])
    .not('next_charge_at', 'is', null)
    .lte('next_charge_at', nowIso);

  let charged = 0;
  let failed = 0;
  for (const s of due ?? []) {
    const orderId = `sub_${String(s.club_id).slice(0, 8)}_${Date.now()}`;
    let ok = false;
    let paymentKey: string | null = null;
    let failReason = '';
    try {
      const res = await fetch(`https://api.tosspayments.com/v1/billing/${s.billing_key}`, {
        method: 'POST',
        headers: { Authorization: basicAuth(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerKey: s.customer_key, amount: s.amount, orderId, orderName: '프리미엄 구독 갱신' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.status === 'DONE') {
        ok = true;
        paymentKey = typeof data?.paymentKey === 'string' ? data.paymentKey : null;
      } else {
        failReason = String(data?.message ?? 'charge_failed').slice(0, 200);
      }
    } catch (err) {
      failReason = String(err).slice(0, 200);
    }

    if (ok) {
      const base = new Date(s.next_charge_at);
      const end = new Date(base);
      end.setMonth(end.getMonth() + 1);
      await admin
        .from('club_subscriptions')
        .update({
          status: 'active',
          current_period_start: base.toISOString(),
          current_period_end: end.toISOString(),
          next_charge_at: end.toISOString(),
          last_charge_at: nowIso,
          fail_count: 0,
          updated_at: nowIso,
        })
        .eq('id', s.id);
      await admin.from('clubs').update({ premium_status: 'active' }).eq('id', s.club_id);
      await admin.from('club_subscription_charges').insert({
        subscription_id: s.id, club_id: s.club_id, amount: s.amount, status: 'paid', toss_payment_key: paymentKey, order_id: orderId,
      });
      charged++;
    } else {
      const fails = (s.fail_count ?? 0) + 1;
      await admin.from('club_subscription_charges').insert({
        subscription_id: s.id, club_id: s.club_id, amount: s.amount, status: 'failed', order_id: orderId, fail_reason: failReason,
      });
      if (fails > MAX_FAILS) {
        // 유예 초과 → 구독 past_due + 클럽 강등
        await admin.from('club_subscriptions').update({ status: 'past_due', fail_count: fails, next_charge_at: null, updated_at: nowIso }).eq('id', s.id);
        await admin.from('clubs').update({ premium_status: 'past_due' }).eq('id', s.club_id);
      } else {
        // 하루 뒤 재시도, 클럽은 유예 유지
        const retry = new Date();
        retry.setDate(retry.getDate() + 1);
        await admin.from('club_subscriptions').update({ status: 'past_due', fail_count: fails, next_charge_at: retry.toISOString(), updated_at: nowIso }).eq('id', s.id);
      }
      failed++;
    }
  }

  return json({ ok: true, charged, failed, expired: (expired ?? []).length });
});
