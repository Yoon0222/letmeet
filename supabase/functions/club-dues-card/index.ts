// club-dues-card: 회비 결제 카드 교체·삭제(회원 본인).
//   입력: { action: 'replace', authKey, customerKey } | { action: 'delete' }
//   교체: 실패했거나 재시도 중이던 이번 기간 회비는 새 카드로 곧 다시 시도된다(자동결제 워커).
//   삭제: 카드가 없으면 자동결제를 할 수 없으므로 모든 클럽의 자동결제 동의도 함께 해지된다.
import { CORS, json, tossPost } from '../_shared/billing.ts';
import { adminClient, callerOf } from '../_shared/dues.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const action: string = typeof body?.action === 'string' ? body.action : '';
  const authKey: string = typeof body?.authKey === 'string' ? body.authKey : '';
  const customerKey: string = typeof body?.customerKey === 'string' ? body.customerKey : '';

  const admin = adminClient();
  const caller = await callerOf(admin, req);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  if (action === 'delete') {
    const { data, error } = await admin.rpc('dues_card_delete', { p_user_id: caller.id });
    if (error) return json({ error: 'card_delete_failed' }, 500);
    return json({ ok: true, removed: data === 'ok' });
  }

  if (action !== 'replace' || !authKey || !customerKey) return json({ error: 'invalid_request' }, 400);
  if (customerKey !== caller.id) return json({ error: 'customer_key_mismatch' }, 403);
  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);

  const issue = await tossPost(secret, '/v1/billing/authorizations/issue', { authKey, customerKey }, `dues-issue-${authKey}`);
  if (!issue.ok || !issue.data?.billingKey) return json({ error: 'billing_issue_failed', toss: issue.data }, 402);
  const card = { company: issue.data?.card?.company ?? issue.data?.cardCompany ?? '', masked: issue.data?.card?.number ?? '' };
  const { error } = await admin.rpc('dues_card_upsert', {
    p_user_id: caller.id, p_billing_key: issue.data.billingKey, p_customer_key: customerKey,
    p_card_company: card.company, p_card_masked: card.masked,
  });
  if (error) return json({ error: 'card_save_failed' }, 500);
  return json({ ok: true, card });
});
