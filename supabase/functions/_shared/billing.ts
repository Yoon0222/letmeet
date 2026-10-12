// 토스 빌링 결제 공용 유틸 — 클럽 구독(toss-billing-*)과 클럽 회비(club-dues-*, _shared/dues.ts)가 함께 쓴다.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const TOSS_TIMEOUT_MS = 20_000; // 토스 호출 한 번의 최대 대기 시간

export function basicAuth(secret: string) {
  return `Basic ${btoa(`${secret}:`)}`;
}

export type PlanRow = { plan: string; name: string; monthly_price: number; trial_months: number; active: boolean };

// 가격의 기준은 서버(club_plans). 클라이언트가 보낸 금액은 절대 믿지 않는다.
// 조회에 실패하면 "가격표 없음"으로 넘어가지 않고 예외를 던진다 — 잘못된 금액으로 결제하느니 멈춘다.
// deno-lint-ignore no-explicit-any
export async function loadPlans(admin: any): Promise<Record<string, PlanRow>> {
  const { data, error } = await admin.from('club_plans').select('plan, name, monthly_price, trial_months, active');
  if (error) throw new Error(`club_plans_load_failed: ${error.message}`);
  const map: Record<string, PlanRow> = {};
  for (const row of (data ?? []) as PlanRow[]) map[row.plan] = row;
  if (Object.keys(map).length === 0) throw new Error('club_plans_empty');
  return map;
}

// Toss POST. Idempotency-Key 가 같으면 Toss 는 첫 응답을 그대로 돌려준다(15일) → 같은 요청이 두 번 처리되지 않는다.
export async function tossPost(secret: string, path: string, body: unknown, idempotencyKey?: string) {
  const headers: Record<string, string> = { Authorization: basicAuth(secret), 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 300);
  // 응답이 오래 없으면 끊는다(예외 → 호출한 쪽이 "결과 모름"으로 다룬다)
  const res = await fetch(`https://api.tosspayments.com${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TOSS_TIMEOUT_MS),
  });
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// 과금 결과는 세 가지로 구분한다.
//   approved : 결제됨
//   declined : 카드사·토스가 확정 거절(에러코드가 있는 4xx) — 실패로 기록하고 다음 시도는 새 주문번호
//   unknown  : 결과를 모름(네트워크 오류·5xx·처리 중 409 등) — 실제로는 결제됐을 수 있으므로 실패로 치지 않는다.
//              상태를 바꾸지 않고 같은 주문번호로 다시 시도해야 이중 결제가 나지 않는다.
//   approved.amount 는 "실제로 결제된 금액"이다 — 재시도에서 예전 주문이 확인되면 이번에 요청한 금액과 다를 수 있다.
//   trace 는 진단용 요약(HTTP 상태·토스 상태·코드만 — 키·카드 정보 없음). 로그와 cron 응답에 남긴다.
export type ChargeResult =
  | { kind: 'approved'; paymentKey: string | null; amount: number; trace?: string }
  | { kind: 'declined'; reason: string; code: string; toss: unknown; trace?: string }
  | { kind: 'unknown'; reason: string; trace?: string };

const REPLAY_FRESH_MS = 2 * 60_000; // 승인 시각이 이보다 오래됐으면 예전 승인의 재응답으로 보고 현재 상태를 확인
const PENDING_GRACE_MS = 2 * 60_000; // 이 시간 안에 보낸 주문은 아직 처리 중일 수 있다

export type OrderState = (
  | { state: 'paid'; paymentKey: string | null; amount: number }
  | { state: 'dead'; status: string; toss: unknown } // 결제되지 않고 끝난 주문(ABORTED·EXPIRED·CANCELED)
  | { state: 'none' } // 그런 주문 없음(404)
  | { state: 'unknown' } // 조회 실패·처리 중
) & { trace: string };

function paidAmount(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// 주문번호로 결제 상태를 조회한다.
export async function lookupOrder(secret: string, orderId: string, requestedAmount: number): Promise<OrderState> {
  try {
    const res = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: basicAuth(secret) },
      signal: AbortSignal.timeout(TOSS_TIMEOUT_MS),
    });
    // deno-lint-ignore no-explicit-any
    const data: any = await res.json().catch(() => ({}));
    const trace = `get=${res.status}/${String(data?.status ?? data?.code ?? '-')}`;
    if (res.ok) {
      const status = String(data?.status ?? '');
      if (status === 'DONE') {
        return { state: 'paid', paymentKey: typeof data?.paymentKey === 'string' ? data.paymentKey : null, amount: paidAmount(data?.totalAmount, requestedAmount), trace };
      }
      if (['ABORTED', 'EXPIRED', 'CANCELED'].includes(status)) return { state: 'dead', status, toss: data, trace };
      return { state: 'unknown', trace };
    }
    return res.status === 404 || data?.code === 'NOT_FOUND_PAYMENT' ? { state: 'none', trace } : { state: 'unknown', trace };
  } catch (_err) {
    return { state: 'unknown', trace: 'get=error' };
  }
}

// 빌링키 과금. orderId 를 Idempotency-Key 로도 쓴다.
//   승인 응답이 아니면 항상 주문번호로 한 번 더 조회한다 — 같은 주문이 이미 결제돼 있으면(앞선 시도의 응답 유실 등)
//   이번 응답이 거절이어도 '결제됨'이 맞다. 거절로 확정하는 건 "이번 요청이 확정 거절 + 그 주문번호로 결제된 건이 없음"일 때뿐.
export async function chargeBilling(
  secret: string,
  args: { billingKey: string; customerKey: string; amount: number; orderId: string; orderName: string },
): Promise<ChargeResult> {
  // deno-lint-ignore no-explicit-any
  let res: { ok: boolean; status: number; data: any } | null = null;
  let netError = '';
  try {
    res = await tossPost(
      secret,
      `/v1/billing/${args.billingKey}`,
      { customerKey: args.customerKey, amount: args.amount, orderId: args.orderId, orderName: args.orderName },
      args.orderId,
    );
  } catch (err) {
    netError = String(err).slice(0, 200);
  }
  const post = res ? `post=${res.status}/${String(res.data?.status ?? res.data?.code ?? '-')}` : 'post=error';
  if (res?.ok && res.data?.status === 'DONE') {
    const approvedAt = Date.parse(String(res.data?.approvedAt ?? ''));
    if (Number.isFinite(approvedAt) && Date.now() - approvedAt < REPLAY_FRESH_MS) {
      return { kind: 'approved', paymentKey: typeof res.data?.paymentKey === 'string' ? res.data.paymentKey : null, amount: paidAmount(res.data?.totalAmount, args.amount), trace: post };
    }
    // 예전 승인의 재응답(같은 Idempotency-Key)일 수 있다 — 그 사이 취소·환불됐을 수 있으니 지금 상태로 판단한다
    const current = await lookupOrder(secret, args.orderId, args.amount);
    const trace = `${post}(old) ${current.trace}`;
    if (current.state === 'paid') return { kind: 'approved', paymentKey: current.paymentKey, amount: current.amount, trace };
    if (current.state === 'dead') return { kind: 'declined', reason: `결제 상태 ${current.status}`, code: current.status, toss: current.toss, trace };
    return { kind: 'unknown', reason: 'old approval, current state not confirmed', trace };
  }

  const order = await lookupOrder(secret, args.orderId, args.amount);
  const trace = `${post} ${order.trace}`;
  if (order.state === 'paid') return { kind: 'approved', paymentKey: order.paymentKey, amount: order.amount, trace };

  const code = typeof res?.data?.code === 'string' ? res.data.code : '';
  // 확정 거절: 에러코드가 있는 4xx. 단 409(처리 중·이미 처리됨)·429 는 결과를 알 수 없다.
  const definite = !!res && res.status >= 400 && res.status < 500 && res.status !== 409 && res.status !== 429 && code !== '';
  if (definite) {
    // 조회까지 실패했으면 "이미 결제된 주문이 없다"를 확인하지 못한 것 → 실패로 치지 않는다
    if (order.state === 'unknown') return { kind: 'unknown', reason: `declined ${code}, order lookup failed`, trace };
    return { kind: 'declined', reason: String(res!.data?.message ?? code).slice(0, 200), code, toss: res!.data, trace };
  }
  if (order.state === 'dead') return { kind: 'declined', reason: `결제 상태 ${order.status}`, code: order.status, toss: order.toss, trace };
  // 주문이 아직 없거나(처리 중일 수 있음) 조회 실패 → 여전히 불명
  return { kind: 'unknown', reason: netError || `${res?.status ?? 0} ${code || 'no_code'}`, trace };
}

// 전액 취소. 멱등키는 쓰지 않는다 — 같은 키에는 예전 응답(실패 포함)이 되돌아올 수 있어 재시도가 막힌다.
// 전액 취소는 두 번 보내도 두 번째가 '이미 취소됨'으로 끝나므로 키 없이도 한 번만 환불된다.
export async function refundPayment(secret: string, paymentKey: string, _orderId: string, reason: string): Promise<boolean> {
  try {
    const res = await tossPost(secret, `/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, { cancelReason: reason });
    return res.ok || res.data?.code === 'ALREADY_CANCELED_PAYMENT';
  } catch (_err) {
    return false;
  }
}

// ── 미확정 주문(club_billing_pending_orders, 클럽당 1건) ──────────
// 결제를 보내기 전에 주문을 남기고, 결과가 반영되면(commit 함수) 지운다. 결과를 모른 채 끝난 주문이 남아 있을 때:
//   · 같은 주문번호로 다시 시도 → 과금 호출이 그 주문의 상태를 그대로 확인한다(이중 결제 없음)
//   · 다른 주문번호로 결제하려 함(카드 재등록 등) → 남은 주문부터 확정한다. 결제돼 있었으면 환불하고 새로 진행.
// 반환: 'clear' 남은 주문 없음 / 'same' 같은 주문의 재시도 / 'blocked' 앞선 주문을 아직 확정할 수 없음(지금 결제하면 안 됨)
//   keepOrderId : 이번에 보낼 주문번호(같으면 'same')
//   force       : 방금 만든 주문이라도 바로 확정한다 — 그 주문을 만든 쪽이 스스로 정리할 때만 쓴다
export async function settlePendingOrder(
  // deno-lint-ignore no-explicit-any
  admin: any,
  secret: string,
  clubId: string,
  opts: { keepOrderId?: string | null; force?: boolean } = {},
): Promise<'clear' | 'same' | 'blocked'> {
  const { data: pend, error } = await admin
    .from('club_billing_pending_orders')
    .select('order_id, kind, amount, created_at')
    .eq('club_id', clubId)
    .maybeSingle();
  if (error) return 'blocked';
  if (!pend) return 'clear';
  if (opts.keepOrderId && pend.order_id === opts.keepOrderId) return 'same';

  const order = await lookupOrder(secret, pend.order_id, pend.amount);
  if (order.state === 'unknown') return 'blocked';
  // 방금 만든 주문은 다른 요청이 아직 처리 중일 수 있다 — "없음"도 믿지 않고, 결제돼 있어도(곧 반영될 수 있으니) 환불하지 않는다
  const young = Date.now() - new Date(pend.created_at).getTime() < PENDING_GRACE_MS;
  if (young && !opts.force && order.state !== 'dead') return 'blocked';
  if (order.state === 'paid') {
    // 결제는 됐는데 구독에 반영되지 않은 주문 — 환불하고 새 주문으로 진행한다
    if (!order.paymentKey) return 'blocked';
    if (!(await refundPayment(secret, order.paymentKey, pend.order_id, '구독 결제 미반영 건 자동 환불'))) return 'blocked';
    console.error('unapplied payment refunded', { club: clubId, orderId: pend.order_id, amount: order.amount });
    if (!(await closeOrder(admin, clubId, pend, order.paymentKey, order.amount, '미반영 결제 자동 환불'))) return 'blocked';
  } else if (order.state === 'dead') {
    if (!(await closeOrder(admin, clubId, pend, null, pend.amount, `결제 취소됨(${order.status})`))) return 'blocked';
  }
  const { error: delErr } = await admin.from('club_billing_pending_orders').delete().eq('club_id', clubId).eq('order_id', pend.order_id);
  return delErr ? 'blocked' : 'clear';
}

// 방금 결제됐지만 구독에 반영할 수 없게 된 주문을 바로 환불하고 닫는다(결제한 쪽이 직접 정리).
// 실패하면 false — 미확정 주문 기록이 남아 있으므로 다음 확정·정리 단계가 다시 시도한다.
export async function refundUnapplied(
  // deno-lint-ignore no-explicit-any
  admin: any,
  secret: string,
  clubId: string,
  order: { order_id: string; kind: string; amount: number },
  paymentKey: string | null,
  reason: string,
): Promise<boolean> {
  if (!paymentKey) return (await settlePendingOrder(admin, secret, clubId, { force: true })) === 'clear';
  if (!(await refundPayment(secret, paymentKey, order.order_id, reason))) return false;
  if (!(await closeOrder(admin, clubId, order, paymentKey, order.amount, reason))) return false;
  await admin.from('club_billing_pending_orders').delete().eq('club_id', clubId).eq('order_id', order.order_id);
  return true;
}

// 결제되지 않은 것으로 끝난(환불·취소) 주문을 이력에 '실패'로 남긴다 — 그 주문번호는 다시 쓰지 않는다는 표시.
// (토스는 같은 Idempotency-Key 에 예전 '승인' 응답을 그대로 돌려주므로, 환불한 주문을 다시 보내면 결제된 것처럼 보인다.)
async function closeOrder(
  // deno-lint-ignore no-explicit-any
  admin: any,
  clubId: string,
  pend: { order_id: string; kind: string; amount: number },
  paymentKey: string | null,
  amount: number,
  reason: string,
): Promise<boolean> {
  const { data: updated, error: updErr } = await admin
    .from('club_subscription_charges')
    .update({ status: 'failed', fail_reason: reason })
    .eq('order_id', pend.order_id)
    .select('id');
  if (updErr) return false;
  if (updated && updated.length > 0) return true;
  const { data: sub, error: subErr } = await admin.from('club_subscriptions').select('id').eq('club_id', clubId).maybeSingle();
  if (subErr) return false;
  const { error: insErr } = await admin.from('club_subscription_charges').insert({
    subscription_id: sub?.id ?? null, club_id: clubId, amount, status: 'failed', kind: pend.kind,
    order_id: pend.order_id, toss_payment_key: paymentKey, fail_reason: reason,
  });
  return !insErr;
}

// 과금의 표준 경로: 앞선 미확정 주문 확정 → 이번 주문 기록 → 과금.
//   승인되면 commit 함수가 주문 기록을 지운다. 확정 거절이면 여기서 지운다. 불명이면 남겨 둔다(다음 시도가 확정).
export async function chargeWithIntent(
  // deno-lint-ignore no-explicit-any
  admin: any,
  secret: string,
  args: { clubId: string; kind: 'initial' | 'renewal' | 'upgrade'; billingKey: string; customerKey: string; amount: number; orderId: string; orderName: string },
): Promise<ChargeResult> {
  // 이력이 먼저다: 이미 결과가 기록된 주문번호는 토스에 다시 보내지 않는다.
  const { data: recorded, error: ledgerErr } = await admin
    .from('club_subscription_charges')
    .select('status, amount, toss_payment_key')
    .eq('order_id', args.orderId)
    .maybeSingle();
  if (ledgerErr) return { kind: 'unknown', reason: 'charge history not readable', trace: 'ledger=error' };
  if (recorded?.status === 'paid') {
    return { kind: 'approved', paymentKey: recorded.toss_payment_key ?? null, amount: recorded.amount, trace: 'ledger=paid' };
  }
  if (recorded?.status === 'failed') {
    return { kind: 'declined', reason: '이미 실패·환불로 끝난 주문', code: 'ORDER_CLOSED', toss: null, trace: 'ledger=failed' };
  }

  const settled = await settlePendingOrder(admin, secret, args.clubId, { keepOrderId: args.orderId });
  if (settled === 'blocked') return { kind: 'unknown', reason: 'previous order not settled', trace: 'blocked' };
  if (settled === 'clear') {
    // insert(업서트 아님): 같은 클럽에 다른 결제가 동시에 진행 중이면 여기서 막힌다
    const { error } = await admin
      .from('club_billing_pending_orders')
      .insert({ club_id: args.clubId, order_id: args.orderId, kind: args.kind, amount: args.amount });
    if (error) return { kind: 'unknown', reason: `order not recorded: ${String(error.message).slice(0, 120)}`, trace: 'not-recorded' };
  }
  const res = await chargeBilling(secret, args);
  if (res.kind === 'declined') {
    await admin.from('club_billing_pending_orders').delete().eq('club_id', args.clubId).eq('order_id', args.orderId);
  }
  return { ...res, trace: `${settled} ${res.trace ?? ''}`.trim() };
}

// 주문번호에 넣는 플랜 표시 — 같은 결제 예정일이라도 플랜(금액)이 바뀌면 다른 주문이 되게 한다
export function planTag(plan: string) {
  if (plan === 'premium') return 'p';
  if (plan === 'premium_plus') return 'pp';
  return plan.replace(/[^a-z0-9]/gi, '').slice(0, 6);
}

// 결제 뒤의 DB 반영(club_billing_commit_*)은 일시 오류로 놓치면 안 된다 — 짧게 몇 번 다시 시도한다.
// 반영 함수들은 같은 값으로 다시 불러도 결과가 같다(주문번호 중복은 무시, 이미 넘어간 구독은 'stale').
// deno-lint-ignore no-explicit-any
export async function rpcWithRetry(admin: any, fn: string, args: Record<string, unknown>, tries = 3): Promise<{ data: any; error: any }> {
  // deno-lint-ignore no-explicit-any
  let last: { data: any; error: any } = { data: null, error: null };
  for (let i = 0; i < tries; i++) {
    last = await admin.rpc(fn, args);
    if (!last.error) return last;
    if (i < tries - 1) await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
  }
  return last;
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 다음 달의 같은 기준일(그 달에 없으면 말일). setMonth(+1) 은 1/31 → 3/3 처럼 넘치므로 쓰지 않는다. (UTC 기준)
export function addMonthAnchored(from: Date, anchorDay: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(anchorDay, 1), lastDay);
  return new Date(Date.UTC(y, m, day, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}

// 업그레이드 차액: (새 가격 − 기존 가격) × 남은 시간 / 기간 길이. 10원 단위 올림, 100원 미만이면 0.
export function proratedDiff(newPrice: number, oldPrice: number, periodStart: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - periodStart.getTime();
  const remain = periodEnd.getTime() - now.getTime();
  if (newPrice <= oldPrice || total <= 0 || remain <= 0) return 0;
  const raw = ((newPrice - oldPrice) * Math.min(remain, total)) / total;
  const rounded = Math.ceil(raw / 10) * 10;
  return rounded < 100 ? 0 : rounded;
}
