// club-dues-enroll: 회비 자동결제 등록(회원 본인) — 동의 + 카드 등록.
//   입력: { clubId, consent: { amount, cycle, text }, authKey?, customerKey? }
//     authKey 가 있으면 새 카드를 등록(이미 카드가 있으면 교체)하고, 없으면 등록해 둔 카드로 동의만 한다.
//     consent 는 회원이 화면에서 보고 동의한 내용 — 지금 규칙과 다르면 'plan_changed' 로 거부한다(다시 보여주고 동의받을 것).
//   납부일이 이미 지난 미납 회비가 있으면 바로 결제한다. 이 결제가 실패해도 등록 자체는 유지된다(charge.status 로 알려준다).
//   결과: { ok, card: { company, masked }, charge: { status: 'paid' | 'failed' | 'unknown' | 'none', amount?, reason? } }
import { CORS, json, tossPost } from '../_shared/billing.ts';
import { type DuesClaim, adminClient, callerOf, isUuid, resolvePendingCharge, settleClaim, todayKst } from '../_shared/dues.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const clubId: string = typeof body?.clubId === 'string' ? body.clubId : '';
  const authKey: string = typeof body?.authKey === 'string' ? body.authKey : '';
  const customerKey: string = typeof body?.customerKey === 'string' ? body.customerKey : '';
  const amount: number | null = typeof body?.consent?.amount === 'number' ? body.consent.amount : null;
  const cycle: string = typeof body?.consent?.cycle === 'string' ? body.consent.cycle : '';
  const text: string = typeof body?.consent?.text === 'string' ? body.consent.text : '';
  if (!isUuid(clubId) || amount === null || !cycle || !text) return json({ error: 'invalid_request' }, 400);

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);
  const admin = adminClient();
  const caller = await callerOf(admin, req);
  if (!caller) return json({ error: 'unauthorized' }, 401);
  if (authKey && customerKey !== caller.id) return json({ error: 'customer_key_mismatch' }, 403);

  // 카드를 등록하기 전에, 거절될 요청은 먼저 거른다(규칙 변경·비회원·기능 꺼짐·문구 누락 — 저장 없이 검사만)
  const { data: precheck, error: precheckErr } = await admin.rpc('dues_mandate_upsert', {
    p_club_id: clubId, p_user_id: caller.id, p_amount: amount, p_cycle: cycle, p_text: text, p_check_only: true,
  });
  if (precheckErr) return json({ error: 'consent_check_failed' }, 500);
  if (precheck !== 'ok') return json({ error: precheck }, precheck === 'plan_changed' ? 409 : 400);

  // 1) 카드
  let card: { company: string; masked: string };
  if (authKey) {
    const issue = await tossPost(secret, '/v1/billing/authorizations/issue', { authKey, customerKey }, `dues-issue-${authKey}`);
    if (!issue.ok || !issue.data?.billingKey) return json({ error: 'billing_issue_failed', toss: issue.data }, 402);
    card = { company: issue.data?.card?.company ?? issue.data?.cardCompany ?? '', masked: issue.data?.card?.number ?? '' };
    const { error } = await admin.rpc('dues_card_upsert', {
      p_user_id: caller.id, p_billing_key: issue.data.billingKey, p_customer_key: customerKey,
      p_card_company: card.company, p_card_masked: card.masked,
    });
    if (error) return json({ error: 'card_save_failed' }, 500);
  } else {
    const { data: existing, error } = await admin
      .from('member_billing_cards')
      .select('card_company, card_number_masked')
      .eq('user_id', caller.id)
      .maybeSingle();
    if (error) return json({ error: 'card_load_failed' }, 500);
    if (!existing) return json({ error: 'card_required' }, 400);
    card = { company: existing.card_company, masked: existing.card_number_masked };
  }

  // 2) 동의 — 규칙·회원 자격은 DB 함수가 다시 확인한다
  const { data: consentResult, error: consentErr } = await admin.rpc('dues_mandate_upsert', {
    p_club_id: clubId, p_user_id: caller.id, p_amount: amount, p_cycle: cycle, p_text: text,
  });
  if (consentErr) return json({ error: 'consent_save_failed' }, 500);
  if (consentResult !== 'ok') return json({ error: consentResult }, consentResult === 'plan_changed' ? 409 : 400);

  // 3) 납부 시각이 이미 지난 이번 기간의 미납 회비는 바로 결제
  const today = todayKst();
  const { data: dueRows, error: duesErr } = await admin
    .from('club_dues')
    .select('id, amount, due_date, status')
    .eq('club_id', clubId)
    .eq('user_id', caller.id)
    .in('status', ['open', 'failed', 'processing'])
    .gt('period_end', today)
    .lte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(1);
  if (duesErr) return json({ ok: true, card, charge: { status: 'none' } });
  const due = (dueRows ?? [])[0];
  if (!due || new Date(`${due.due_date}T10:00:00+09:00`).getTime() > Date.now()) {
    return json({ ok: true, card, charge: { status: 'none' } });
  }

  // 결과를 모르는 시도가 남아 있으면 그것부터 확정
  const { data: pend } = await admin
    .from('club_dues_charges')
    .select('id, order_id, amount, created_at')
    .eq('dues_id', due.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (pend) {
    const r = await resolvePendingCharge(admin, secret, pend);
    if (r.outcome !== 'failed') return json({ ok: true, card, charge: { status: r.outcome, amount: due.amount } });
  }
  const { data: claimed, error: claimErr } = await admin.rpc('dues_claim_one', { p_dues_id: due.id, p_user_id: caller.id });
  if (claimErr || claimed?.code !== 'ok') {
    const code = claimed?.code;
    return json({ ok: true, card, charge: { status: code === 'already_paid' ? 'paid' : code === 'in_progress' ? 'unknown' : 'none', amount: due.amount } });
  }
  const result = await settleClaim(admin, secret, claimed.claim as DuesClaim);
  return json({ ok: true, card, charge: { status: result.outcome, amount: due.amount, reason: result.reason } });
});
