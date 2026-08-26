// toss-billing-cancel: 구독 해지. 다음 과금을 멈추고, 현재 결제 기간 종료일까지는 이용 유지.
//   입력: { clubId }. 클럽장만. 만료 시 강등은 toss-billing-charge(cron)가 처리.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const clubId: string = typeof body?.clubId === 'string' ? body.clubId : '';
  if (!clubId) return json({ error: 'clubId required' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const { data: sub } = await admin
    .from('club_subscriptions')
    .select('id, owner_id, status, current_period_end')
    .eq('club_id', clubId)
    .maybeSingle();
  if (!sub) return json({ error: 'subscription_not_found' }, 404);
  if (sub.owner_id !== caller.id) return json({ error: 'forbidden' }, 403);
  if (sub.status === 'canceled') {
    return json({ ok: true, alreadyCanceled: true, activeUntil: sub.current_period_end });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from('club_subscriptions')
    .update({ status: 'canceled', canceled_at: now, next_charge_at: null, updated_at: now })
    .eq('id', sub.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, activeUntil: sub.current_period_end });
});
