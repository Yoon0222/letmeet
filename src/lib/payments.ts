// 코트 예약 결제 오케스트레이션.
//   흐름: 주문(pending) 생성 → 슬롯 홀드 → (mock=즉시확정 / toss=인앱 WebView 결제).
//   toss 는 화면 전환(WebView)이 필요하므로, 여기선 주문·홀드만 하고 payload 를 돌려준다.
//   실제 결제창·승인은 payment/webview 화면이 처리한다.
import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';

const PROVIDER = process.env.EXPO_PUBLIC_PAYMENT_PROVIDER ?? 'mock';

export type WebviewPayment = { orderId: string; amount: number; orderName: string; paymentId: string };
export type PayResult =
  | { ok: true; free?: boolean } // 무료·mock 즉시 확정
  | { ok: true; webview: WebviewPayment } // toss → 인앱 WebView 결제로
  | { ok: false; reason: 'slot' | 'canceled' | 'error'; message?: string };

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
    const { error } = await supabase
      .from('court_reservations')
      .insert(hours.map((h) => ({ court_id: court.id, user_id: uid, court_unit: courtUnit, slot_date: slotDate, hour: h })));
    if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? 'slot' : 'error', message: error.message };
    return { ok: true, free: true };
  }

  // 1) 주문 생성(pending)
  const orderId = `ord_${uid.slice(0, 8)}_${Date.now()}`;
  const orderName = `피넛 코트 예약 ${hours.length}시간`;
  const { data: pay, error: payErr } = await supabase
    .from('payments')
    .insert({ order_id: orderId, user_id: uid, order_type: 'court', order_name: orderName, court_id: court.id, court_unit: courtUnit, slot_date: slotDate, hours, amount, provider: PROVIDER })
    .select('id')
    .single();
  if (payErr || !pay) return { ok: false, reason: 'error', message: payErr?.message };

  // 2) 슬롯 홀드(예약 행 생성 + 주문 연결). 중복이면 이미 예약된 슬롯.
  const { error: resErr } = await supabase
    .from('court_reservations')
    .insert(hours.map((h) => ({ court_id: court.id, user_id: uid, court_unit: courtUnit, slot_date: slotDate, hour: h, payment_id: pay.id })));
  if (resErr) {
    await supabase.from('payments').update({ status: 'failed' }).eq('id', pay.id);
    return { ok: false, reason: /duplicate|unique/i.test(resErr.message) ? 'slot' : 'error', message: resErr.message };
  }

  // 3) mock: 즉시 확정 (개발용) / toss: 인앱 WebView 로 결제
  if (PROVIDER === 'mock') {
    await supabase.from('payments').update({ status: 'paid', provider_tx: `mock_${orderId}`, paid_at: new Date().toISOString() }).eq('id', pay.id);
    return { ok: true };
  }
  return { ok: true, webview: { orderId, amount, orderName, paymentId: pay.id } };
}
