// 코트 예약 결제 오케스트레이션.
// 흐름: 주문(pending) 생성 → 슬롯 홀드 → PG 결제창 → 확정(서버 검증) → paid.
//        실패/취소 → 슬롯 해제 + 주문 canceled/failed.
// provider: 'mock'(개발용 자동성공) | 'portone'(실 SDK·키 필요).
import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';

export type PayResult = { ok: true; free?: boolean } | { ok: false; reason: 'slot' | 'canceled' | 'error'; message?: string };

const PROVIDER = process.env.EXPO_PUBLIC_PAYMENT_PROVIDER ?? 'mock';

/** PG 결제창 호출 추상화. 실제 결제 UI는 provider 별 구현. */
async function launchPayment(order: { order_id: string; amount: number }): Promise<{ ok: boolean; txId?: string }> {
  if (PROVIDER === 'mock') {
    // 개발용: 결제창 없이 즉시 성공 처리 (실 PG 붙이기 전 흐름 검증용)
    return { ok: true, txId: `mock_${order.order_id}` };
  }
  // TODO(portone): @portone/react-native-sdk requestPayment() 로 결제창 호출.
  //   const r = await PortOne.requestPayment({ storeId, channelKey, paymentId: order.order_id, orderName, totalAmount: order.amount, ... });
  //   return r.code == null ? { ok: true, txId: r.paymentId } : { ok: false };
  throw new Error('PG 미설정: EXPO_PUBLIC_PAYMENT_PROVIDER=portone 및 SDK/키 설정이 필요합니다.');
}

async function releaseHold(paymentId: string, status: 'canceled' | 'failed' = 'canceled') {
  await supabase.from('court_reservations').delete().eq('payment_id', paymentId);
  await supabase.from('court_payments').update({ status }).eq('id', paymentId);
}

export async function startCourtPayment(args: {
  court: Pick<Court, 'id' | 'hourly_price'>;
  uid: string;
  slotDate: string;
  hours: number[];
  courtUnit: string;
}): Promise<PayResult> {
  const { court, uid, slotDate, hours, courtUnit } = args;
  const amount = hours.length * court.hourly_price;

  // 무료 코트: 결제 없이 바로 예약
  if (amount <= 0) {
    const { error } = await supabase.from('court_reservations').insert(hours.map((h) => ({ court_id: court.id, user_id: uid, court_unit: courtUnit, slot_date: slotDate, hour: h })));
    if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? 'slot' : 'error', message: error.message };
    return { ok: true, free: true };
  }

  // 1) 주문 생성(pending)
  const orderId = `ord_${uid.slice(0, 8)}_${Date.now()}`;
  const { data: pay, error: payErr } = await supabase
    .from('court_payments')
    .insert({ order_id: orderId, user_id: uid, court_id: court.id, court_unit: courtUnit, slot_date: slotDate, hours, amount, provider: PROVIDER })
    .select('id')
    .single();
  if (payErr || !pay) return { ok: false, reason: 'error', message: payErr?.message };

  // 2) 슬롯 홀드(예약 행 생성 + 주문 연결). 중복이면 이미 예약된 슬롯.
  const { error: resErr } = await supabase
    .from('court_reservations')
    .insert(hours.map((h) => ({ court_id: court.id, user_id: uid, court_unit: courtUnit, slot_date: slotDate, hour: h, payment_id: pay.id })));
  if (resErr) {
    await supabase.from('court_payments').update({ status: 'failed' }).eq('id', pay.id);
    return { ok: false, reason: /duplicate|unique/i.test(resErr.message) ? 'slot' : 'error', message: resErr.message };
  }

  // 3) PG 결제창
  let res: { ok: boolean; txId?: string };
  try {
    res = await launchPayment({ order_id: orderId, amount });
  } catch (e) {
    await releaseHold(pay.id, 'failed');
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) {
    await releaseHold(pay.id);
    return { ok: false, reason: 'canceled' };
  }

  // 4) 결제 확정 — 실 PG는 반드시 서버(Edge Function)에서 검증. mock은 개발용 클라이언트 처리.
  if (PROVIDER === 'mock') {
    await supabase.from('court_payments').update({ status: 'paid', provider_tx: res.txId, paid_at: new Date().toISOString() }).eq('id', pay.id);
    return { ok: true };
  }
  const { data: verify, error: vErr } = await supabase.functions.invoke('pay-verify', { body: { order_id: orderId, paymentId: res.txId } });
  if (vErr || !verify?.paid) {
    await releaseHold(pay.id, 'failed');
    return { ok: false, reason: 'error', message: vErr?.message ?? '결제 검증에 실패했어요.' };
  }
  return { ok: true };
}
