// toss-cancel: 코트 예약 취소 + 토스 환불.
//   정책: 코트별 refund_policy(단계 배열)로 남은 일수→환불율 결정 → 부분/전액/무환불.
//   입력: { reservationIds: string[] }  또는  { paymentId: string }
//   paymentKey 는 payments.provider_tx 에 저장돼 있음.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// KST(UTC+9) 기준 오늘 날짜 (YYYY-MM-DD)
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

type RefundTier = { days_before: number; rate: number };
const DEFAULT_POLICY: RefundTier[] = [{ days_before: 1, rate: 100 }];

// 예약일(slotDate)까지 남은 일수(KST) 기준 환불율(0~100).
//   days_before 내림차순으로 훑어 (남은일수 >= days_before) 인 첫 rate 적용, 해당 없으면 0%.
function refundRate(policy: RefundTier[] | null | undefined, slotDate: string | null): number {
  if (!slotDate) return 0;
  const d = Math.round((Date.parse(`${slotDate}T00:00:00Z`) - Date.parse(`${todayKST()}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(d) || d < 0) return 0;
  const tiers = (Array.isArray(policy) && policy.length ? policy : DEFAULT_POLICY)
    .filter((t) => t && Number.isFinite(t.days_before) && Number.isFinite(t.rate))
    .map((t) => ({ days_before: Math.max(0, Math.trunc(t.days_before)), rate: Math.max(0, Math.min(100, Math.round(t.rate))) }))
    .sort((a, b) => b.days_before - a.days_before);
  for (const t of tiers) if (d >= t.days_before) return t.rate;
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const reservationIds: string[] = Array.isArray(body?.reservationIds) ? body.reservationIds : [];
  let paymentId: string | null = typeof body?.paymentId === 'string' ? body.paymentId : null;
  const tournamentId: string | null = typeof body?.tournamentId === 'string' ? body.tournamentId : null;

  // ── 대회 참가 취소 + 환불 (0089) ──────────────────────────────────
  //   정책 v1: 대회 시작 전 취소 = 전액 환불, 시작 후엔 취소 불가.
  //   행 삭제로 대기열 자동 승격(promote_waitlist) 이 이어진다.
  if (tournamentId) {
    const { data: entry } = await admin
      .from('tournament_entries')
      .select('status, paid_at, payment_id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', caller.id)
      .maybeSingle();
    if (!entry) return json({ error: 'entry_not_found' }, 404);

    // 조추첨(대진 생성) 후에는 확정 참가자 취소 불가 (0091) — 대진 파손 방지, 운영자만 처리
    if (entry.status === 'approved') {
      const { count: matchCount } = await admin
        .from('tournament_matches')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);
      if ((matchCount ?? 0) > 0) return json({ error: 'draw_locked' }, 409);
    }

    const { data: tour } = await admin
      .from('tournaments')
      .select('start_at')
      .eq('id', tournamentId)
      .maybeSingle();
    const beforeStart = tour?.start_at ? Date.parse(tour.start_at) > Date.now() : true;

    let refunded = false;
    let refundAmount = 0;

    if (entry.paid_at && entry.payment_id) {
      if (!beforeStart) return json({ error: 'refund_window_closed' }, 409);
      const { data: pay } = await admin
        .from('payments')
        .select('id, status, amount, provider_tx')
        .eq('id', entry.payment_id)
        .maybeSingle();
      if (pay?.status === 'paid' && pay.provider_tx) {
        const secret = Deno.env.get('TOSS_SECRET_KEY');
        if (!secret) return json({ error: 'toss_not_configured' }, 503);
        try {
          const res = await fetch(`https://api.tosspayments.com/v1/payments/${pay.provider_tx}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Basic ${btoa(secret + ':')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cancelReason: '대회 참가 취소' }),
          });
          const text = await res.text().catch(() => '');
          if (res.ok || /ALREADY_CANCELED/i.test(text)) {
            refunded = true;
            refundAmount = pay.amount;
            await admin.from('payments').update({ status: 'refunded', refund_amount: pay.amount }).eq('id', pay.id);
          } else {
            return json({ error: 'refund_failed', detail: text.slice(0, 300) }, 502);
          }
        } catch (e) {
          return json({ error: 'refund_failed', detail: String(e) }, 502);
        }
      }
    } else {
      // 미결제(결제 대기/대기열) — 떠 있는 pending 주문 정리
      await admin
        .from('payments')
        .update({ status: 'canceled' })
        .eq('user_id', caller.id)
        .eq('order_type', 'tournament')
        .eq('target_id', tournamentId)
        .eq('status', 'pending');
    }

    await admin.from('tournament_entries').delete().eq('tournament_id', tournamentId).eq('user_id', caller.id);
    return json({ ok: true, refunded, amount: refundAmount, reason: refunded ? 'refunded_full' : 'no_payment' });
  }

  // 예약 id 로 왔으면 payment_id 를 역추적
  if (!paymentId && reservationIds.length > 0) {
    const { data: rows } = await admin
      .from('court_reservations')
      .select('id, user_id, payment_id')
      .in('id', reservationIds);
    const list = rows ?? [];
    if (list.length === 0) return json({ error: 'not_found' }, 404);
    if (list.some((r) => r.user_id !== caller.id)) return json({ error: 'forbidden' }, 403);
    paymentId = (list.find((r) => r.payment_id)?.payment_id as string | null) ?? null;
  }

  // 결제가 없는 예약(무료 등) → 그냥 취소
  if (!paymentId) {
    if (reservationIds.length > 0) {
      await admin.from('court_reservations').delete().in('id', reservationIds).eq('user_id', caller.id);
    }
    return json({ ok: true, refunded: false, reason: 'no_payment' });
  }

  const { data: payment } = await admin
    .from('payments')
    .select('id, user_id, status, amount, slot_date, provider_tx, order_name, court_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (!payment) return json({ error: 'payment_not_found' }, 404);
  if (payment.user_id !== caller.id) return json({ error: 'forbidden' }, 403);

  // 코트별 환불 정책 → 남은 일수 기준 환불율 → 환불 금액
  let policy: RefundTier[] | null = null;
  if (payment.court_id) {
    const { data: court } = await admin
      .from('courts')
      .select('refund_policy')
      .eq('id', payment.court_id)
      .maybeSingle();
    policy = (court?.refund_policy as RefundTier[] | undefined) ?? null;
  }
  const rate = refundRate(policy, payment.slot_date);
  const cancelAmount = Math.floor((payment.amount * rate) / 100);
  const eligible = rate > 0 && cancelAmount > 0;
  let refunded = false;
  let refundError: string | null = null;

  if (eligible && payment.status === 'paid' && payment.provider_tx) {
    const secret = Deno.env.get('TOSS_SECRET_KEY');
    if (!secret) return json({ error: 'toss_not_configured' }, 503);
    // 부분환불이면 cancelAmount 전달, 전액이면 생략(전체 취소)
    const cancelBody: Record<string, unknown> = { cancelReason: '고객 예약 취소' };
    if (rate < 100) cancelBody.cancelAmount = cancelAmount;
    try {
      const res = await fetch(`https://api.tosspayments.com/v1/payments/${payment.provider_tx}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(secret + ':')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cancelBody),
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        refunded = true;
        await admin.from('payments').update({ status: 'refunded', refund_amount: cancelAmount }).eq('id', payment.id);
      } else if (/ALREADY_CANCELED/i.test(text)) {
        // 이미 취소됐으면 환불된 것으로 간주
        refunded = true;
        await admin.from('payments').update({ status: 'refunded', refund_amount: cancelAmount }).eq('id', payment.id);
      } else {
        refundError = text.slice(0, 300);
      }
    } catch (e) {
      refundError = String(e);
    }
    if (refundError) return json({ error: 'refund_failed', detail: refundError }, 502);
  }

  // 환불 여부와 무관하게 예약 취소(삭제)
  await admin.from('court_reservations').delete().eq('payment_id', payment.id).eq('user_id', caller.id);

  return json({
    ok: true,
    refunded,
    amount: refunded ? cancelAmount : 0,
    rate,
    reason: refunded ? (rate >= 100 ? 'refunded_full' : 'refunded_partial') : rate > 0 ? 'not_paid' : 'no_refund',
  });
});
