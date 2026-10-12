// club-dues-pay-now: 내 미납 회비를 등록한 카드로 지금 결제(회원 본인).
//   입력: { duesId, checkOnly? }
//     checkOnly=true  결과를 모르는 시도만 확인하고 새로 결제하지 않는다(화면의 "결과 다시 확인").
//   결과: { ok: true, status: 'paid', amount } / checkOnly 에서 결제되지 않은 것으로 확인되면 { ok: true, status: 'unpaid' }
//         오류: charge_failed(402, 카드 거절) · charge_unknown(409, 결과 확인 중) 등
//   결과를 모르는 시도가 남아 있으면 새로 결제하지 않고 그 시도부터 조회로 확정한다(같은 버튼을 다시 눌러도 이중 결제 없음).
import { CORS, json } from '../_shared/billing.ts';
import { type DuesClaim, adminClient, callerOf, isUuid, resolvePendingCharge, settleClaim } from '../_shared/dues.ts';

const CLAIM_STATUS: Record<string, number> = {
  not_found: 404, forbidden: 403, not_payable: 400, disabled: 400, card_required: 400, too_many: 429,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const duesId: string = typeof body?.duesId === 'string' ? body.duesId : '';
  const checkOnly: boolean = body?.checkOnly === true;
  if (!isUuid(duesId)) return json({ error: 'invalid_request' }, 400);

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);
  const admin = adminClient();
  const caller = await callerOf(admin, req);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  // 결과를 모르는 시도가 남아 있으면 먼저 확정한다
  const { data: pend, error: pendErr } = await admin
    .from('club_dues_charges')
    .select('id, order_id, amount, created_at, user_id')
    .eq('dues_id', duesId)
    .eq('status', 'pending')
    .maybeSingle();
  if (pendErr) return json({ error: 'charges_load_failed' }, 500);
  if (pend) {
    if (pend.user_id !== caller.id) return json({ error: 'forbidden' }, 403);
    const r = await resolvePendingCharge(admin, secret, pend);
    if (r.outcome === 'paid') return json({ ok: true, status: 'paid', amount: pend.amount });
    if (r.outcome === 'unknown') return json({ error: 'charge_unknown' }, 409);
    // failed → 앞선 시도는 결제되지 않은 것으로 확정됐다. 아래에서 새로 결제한다(확인만 하는 요청이면 여기서 끝).
  }
  if (checkOnly) {
    const { data: row, error: rowErr } = await admin.from('club_dues').select('status, user_id, amount').eq('id', duesId).maybeSingle();
    if (rowErr) return json({ error: 'dues_load_failed' }, 500);
    if (!row) return json({ error: 'not_found' }, 404);
    if (row.user_id !== caller.id) return json({ error: 'forbidden' }, 403);
    if (row.status === 'paid') return json({ ok: true, status: 'paid', amount: row.amount });
    if (row.status === 'processing') return json({ error: 'charge_unknown' }, 409);
    return json({ ok: true, status: 'unpaid' });
  }

  const { data: claimed, error: claimErr } = await admin.rpc('dues_claim_one', { p_dues_id: duesId, p_user_id: caller.id });
  if (claimErr) return json({ error: 'claim_failed' }, 500);
  const code: string = claimed?.code ?? 'claim_failed';
  if (code === 'already_paid') return json({ ok: true, status: 'paid', already: true });
  if (code === 'in_progress') return json({ error: 'charge_unknown' }, 409);
  if (code !== 'ok') return json({ error: code === 'disabled' ? 'dues_disabled' : code }, CLAIM_STATUS[code] ?? 400);

  const claim = claimed.claim as DuesClaim;
  const result = await settleClaim(admin, secret, claim);
  if (result.outcome === 'paid') return json({ ok: true, status: 'paid', amount: claim.amount });
  if (result.outcome === 'failed') return json({ error: 'charge_failed', reason: result.reason }, 402);
  return json({ error: 'charge_unknown' }, 409);
});
