// toss-billing-issue: 프리미엄 클럽 구독 시작.
//   입력: { clubId, authKey, customerKey }  (authKey = 카드등록 성공 후 Toss가 준 값)
//   1) authKey → billingKey 교환   2) 구독 저장   3) 체험중이면 첫 과금 예약(체험종료일),
//      아니면 즉시 첫 과금   4) clubs.premium_status='active'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const AMOUNT = 5500; // 월 구독료(원)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function basicAuth(secret: string) {
  return `Basic ${btoa(`${secret}:`)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const clubId: string = typeof body?.clubId === 'string' ? body.clubId : '';
  const authKey: string = typeof body?.authKey === 'string' ? body.authKey : '';
  const customerKey: string = typeof body?.customerKey === 'string' ? body.customerKey : '';
  if (!clubId || !authKey || !customerKey) return json({ error: 'clubId, authKey, customerKey required' }, 400);

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);
  if (customerKey !== caller.id) return json({ error: 'customer_key_mismatch' }, 403);

  const { data: club } = await admin
    .from('clubs')
    .select('id, owner_id, name, premium_status, premium_started_at, premium_trial_ends_at')
    .eq('id', clubId)
    .maybeSingle();
  if (!club) return json({ error: 'club_not_found' }, 404);
  if (club.owner_id !== caller.id) return json({ error: 'forbidden' }, 403);

  // 1) authKey → billingKey
  const issueRes = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
    method: 'POST',
    headers: { Authorization: basicAuth(secret), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authKey, customerKey }),
  });
  const issueData = await issueRes.json().catch(() => ({}));
  if (!issueRes.ok || !issueData?.billingKey) {
    return json({ error: 'billing_issue_failed', toss: issueData }, 402);
  }
  const billingKey: string = issueData.billingKey;
  const cardCompany: string = issueData?.card?.company ?? issueData?.cardCompany ?? '';
  const cardMasked: string = issueData?.card?.number ?? '';

  const now = new Date();
  const trialEnd = club.premium_trial_ends_at ? new Date(club.premium_trial_ends_at) : null;
  const trialing = club.premium_status === 'trialing' && !!trialEnd && trialEnd.getTime() > now.getTime();

  let periodEnd: Date;
  let nextChargeAt: Date;
  let firstChargeKey: string | null = null;
  let firstOrderId: string | null = null;

  if (trialing && trialEnd) {
    // 카드만 등록, 첫 과금은 체험 종료일. 그때까지 계속 이용.
    periodEnd = trialEnd;
    nextChargeAt = trialEnd;
  } else {
    // 즉시 첫 과금
    firstOrderId = `sub_${clubId.slice(0, 8)}_${Date.now()}`;
    const chargeRes = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
      method: 'POST',
      headers: { Authorization: basicAuth(secret), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerKey, amount: AMOUNT, orderId: firstOrderId, orderName: `${club.name} 프리미엄 구독` }),
    });
    const chargeData = await chargeRes.json().catch(() => ({}));
    if (!chargeRes.ok || chargeData?.status !== 'DONE') {
      return json({ error: 'first_charge_failed', toss: chargeData }, 402);
    }
    firstChargeKey = typeof chargeData?.paymentKey === 'string' ? chargeData.paymentKey : null;
    periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    nextChargeAt = periodEnd;
  }

  // 2) 구독 upsert (클럽당 1개)
  const { data: sub, error: subErr } = await admin
    .from('club_subscriptions')
    .upsert(
      {
        club_id: clubId,
        owner_id: caller.id,
        billing_key: billingKey,
        customer_key: customerKey,
        card_company: cardCompany,
        card_number_masked: cardMasked,
        amount: AMOUNT,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_charge_at: nextChargeAt.toISOString(),
        last_charge_at: firstChargeKey ? now.toISOString() : null,
        fail_count: 0,
        canceled_at: null,
        updated_at: now.toISOString(),
      },
      { onConflict: 'club_id' },
    )
    .select('id')
    .single();
  if (subErr) return json({ error: subErr.message }, 500);

  // 3) 즉시 과금이면 이력 기록
  if (firstChargeKey) {
    await admin.from('club_subscription_charges').insert({
      subscription_id: sub.id,
      club_id: clubId,
      amount: AMOUNT,
      status: 'paid',
      toss_payment_key: firstChargeKey,
      order_id: firstOrderId,
    });
  }

  // 4) 클럽 프리미엄 확정
  await admin
    .from('clubs')
    .update({
      tier: 'premium',
      premium_status: 'active',
      premium_started_at: club.premium_started_at ?? now.toISOString(),
    })
    .eq('id', clubId);

  return json({
    ok: true,
    status: 'active',
    trialing,
    chargedNow: !!firstChargeKey,
    nextChargeAt: nextChargeAt.toISOString(),
    card: { company: cardCompany, masked: cardMasked },
  });
});
