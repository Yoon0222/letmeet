// club-dues-charge: 클럽 회비 자동결제 워커 (pg_cron 이 10:00~20:45 KST 에 15분마다 호출).
//   인증: x-cron-secret 헤더 == CRON_SECRET.
//   1) 결과를 모른 채 남은 결제 시도를 토스 조회로 확정(결제됨 → 반영 / 없음·취소 → 실패 처리)
//   1b) 반영이 끝나지 않은 환불 정리(토스에서 취소됐으면 환불 반영, 취소되지 않았으면 표시 해제) — 정산 확정이 막히지 않게
//   2) 납부 시각이 된 회비를 4건씩 선점해 결제 — 대상 선점은 DB 함수(dues_claim_due, skip locked)라 동시에 돌아도 겹치지 않는다
//   3) 실행 기록(dues_job_runs) — 일일 작업이 이 기록으로 워커가 살아 있는지 본다
//   확정 거절은 다음 날 10시에 다시(총 4회), 결과 모름은 그대로 두고 다음 실행의 1)에서 확정한다.
import { CORS, json, lookupOrder, rpcWithRetry } from '../_shared/billing.ts';
import { type DuesClaim, adminClient, resolvePendingCharge, settleClaim } from '../_shared/dues.ts';

const BATCH = 4; // 한 번에 결제하는 건수
const MAX_PER_RUN = 60; // 한 실행에서 처리하는 최대 건수
const TIME_BUDGET_MS = 100_000; // 엣지함수 제한 시간 안에 끝내기
const PENDING_CHECK_AFTER_MS = 2 * 60_000; // 방금 만든 시도는 아직 처리 중일 수 있다
const REFUND_CHECK_AFTER_MS = 10 * 60_000; // 환불을 시작하고 이만큼 지나도 반영이 안 됐으면 토스 상태로 정리

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || (req.headers.get('x-cron-secret') ?? '') !== cronSecret) return json({ error: 'unauthorized' }, 401);
  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);

  const admin = adminClient();
  const started = Date.now();
  const log: string[] = [];
  let resolvedPaid = 0;
  let resolvedFailed = 0;
  let stillUnknown = 0;
  let paid = 0;
  let failed = 0;
  let unknown = 0;

  // 1) 결과를 모르는 시도 확정
  const cutoff = new Date(Date.now() - PENDING_CHECK_AFTER_MS).toISOString();
  const { data: pendings, error: pendErr } = await admin
    .from('club_dues_charges')
    .select('id, order_id, amount, created_at')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(50);
  if (pendErr) {
    await admin.rpc('dues_job_log', { p_job: 'dues_charge', p_ok: false, p_summary: { error: 'pending_load_failed' } });
    return json({ error: 'pending_load_failed' }, 500);
  }
  for (const p of pendings ?? []) {
    const r = await resolvePendingCharge(admin, secret, p);
    log.push(`${String(p.order_id).slice(-14)} resolve:${r.outcome} [${r.trace ?? ''}]`);
    if (r.outcome === 'paid') resolvedPaid++;
    else if (r.outcome === 'failed') resolvedFailed++;
    else stillUnknown++;
  }

  // 1b) 환불을 시작했는데 반영이 끝나지 않은 건: 토스에서 취소됐으면 환불로 반영, 취소되지 않았으면 표시를 지운다
  let refundFixed = 0;
  const refundCutoff = new Date(Date.now() - REFUND_CHECK_AFTER_MS).toISOString();
  const { data: stuck } = await admin
    .from('club_dues_charges')
    .select('id, order_id, amount, refund_requested_at')
    .eq('status', 'paid')
    .not('refund_requested_at', 'is', null)
    .lt('refund_requested_at', refundCutoff)
    .limit(20);
  for (const c of stuck ?? []) {
    const order = await lookupOrder(secret, c.order_id, c.amount);
    if (order.state === 'dead') {
      const { data: res, error } = await rpcWithRetry(admin, 'dues_charge_commit_refund', {
        p_charge_id: c.id, p_actor: null, p_reason: '환불 반영 복구(토스에서 취소 확인)',
      });
      if (!error && (res === 'ok' || res === 'duplicate')) refundFixed++;
      log.push(`${String(c.order_id).slice(-14)} refund-recover:${error ? 'error' : res} [${order.trace}]`);
    } else if (order.state === 'paid') {
      // 읽었던 표시 그대로일 때만 지운다(그 사이 운영진이 환불을 다시 시작했으면 그대로 둔다)
      await admin.rpc('dues_refund_flag_clear', { p_charge_id: c.id, p_expected: c.refund_requested_at });
      log.push(`${String(c.order_id).slice(-14)} refund-flag-cleared [${order.trace}]`);
    }
  }

  // 2) 납부 시각이 된 회비 결제
  let processed = 0;
  let claimError = false;
  while (processed < MAX_PER_RUN && Date.now() - started < TIME_BUDGET_MS) {
    const { data: claims, error } = await admin.rpc('dues_claim_due', { p_limit: BATCH });
    if (error) {
      console.error('dues_claim_due failed', error.message);
      claimError = true;
      break;
    }
    const batch = (claims ?? []) as DuesClaim[];
    if (batch.length === 0) break;
    const results = await Promise.all(batch.map((c) => settleClaim(admin, secret, c)));
    results.forEach((r, i) => {
      log.push(`${batch[i].order_id.slice(-14)} ${r.outcome} [${r.trace ?? ''}]`);
      if (r.outcome === 'paid') paid++;
      else if (r.outcome === 'failed') failed++;
      else unknown++;
    });
    processed += batch.length;
    // 한 묶음이 전부 결과 모름이면 결제사 쪽 문제일 가능성이 크다 — 더 선점하지 않고 이번 실행을 끝낸다
    // (선점된 회비는 '지금 결제'·운영진 처리가 막히므로 장애 중에 대상을 계속 늘리지 않는다)
    if (results.every((r) => r.outcome === 'unknown')) {
      log.push('stopped: whole batch unknown');
      break;
    }
  }

  const summary = { resolved_paid: resolvedPaid, resolved_failed: resolvedFailed, still_unknown: stillUnknown, refund_fixed: refundFixed, paid, failed, unknown, claim_error: claimError };
  await admin.rpc('dues_job_log', { p_job: 'dues_charge', p_ok: !claimError, p_summary: summary });
  return json({ ok: !claimError, ...summary, log: log.slice(0, 80) }, claimError ? 500 : 200);
});
