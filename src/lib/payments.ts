import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';

export type PayResult = { ok: true; free?: boolean } | { ok: false; reason: 'slot' | 'canceled' | 'error'; message?: string };

const PROVIDER = process.env.EXPO_PUBLIC_PAYMENT_PROVIDER ?? 'mock';
const PAYMENT_RETURN_BASE_URL = process.env.EXPO_PUBLIC_PAYMENT_RETURN_BASE_URL ?? 'https://pinut.org/payment';

type PaymentOrder = {
  order_id: string;
  amount: number;
  orderName: string;
};

function buildPaymentReturnUrls() {
  const successRedirect = Linking.createURL('payment/success');
  const failRedirect = Linking.createURL('payment/fail');

  const successUrl = new URL(`${PAYMENT_RETURN_BASE_URL}/success`);
  successUrl.searchParams.set('redirect', successRedirect);

  const failUrl = new URL(`${PAYMENT_RETURN_BASE_URL}/fail`);
  failUrl.searchParams.set('redirect', failRedirect);

  return {
    successUrl: successUrl.toString(),
    failUrl: failUrl.toString(),
    successRedirect,
  };
}

// 토스 결제창은 클라이언트 SDK 로만 열 수 있다(서버 생성 API 없음).
// → pinut.org/payment/checkout 호스팅 페이지를 열어 거기서 requestPayment() 를 호출한다.
function buildTossCheckoutUrl(order: PaymentOrder) {
  const { successUrl, failUrl } = buildPaymentReturnUrls();
  const url = new URL(`${PAYMENT_RETURN_BASE_URL}/checkout`);
  url.searchParams.set('orderId', order.order_id);
  url.searchParams.set('amount', String(order.amount));
  url.searchParams.set('orderName', order.orderName);
  url.searchParams.set('successUrl', successUrl);
  url.searchParams.set('failUrl', failUrl);
  return url.toString();
}

async function launchPayment(order: PaymentOrder): Promise<{ ok: boolean; txId?: string; message?: string }> {
  if (PROVIDER === 'mock') {
    return { ok: true, txId: `mock_${order.order_id}` };
  }

  if (PROVIDER !== 'toss') {
    throw new Error('지원하지 않는 결제 제공자입니다. EXPO_PUBLIC_PAYMENT_PROVIDER를 확인해주세요.');
  }

  const { successRedirect } = buildPaymentReturnUrls();
  const checkoutUrl = buildTossCheckoutUrl(order);
  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, successRedirect);

  if (result.type !== 'success' || !('url' in result)) {
    return { ok: false };
  }

  const redirected = new URL(result.url);
  const params = redirected.searchParams;
  const code = params.get('code');
  const failMessage = params.get('message');
  if (code) return { ok: false, message: failMessage ?? code };

  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amount = Number(params.get('amount'));

  if (!paymentKey || orderId !== order.order_id || amount !== order.amount) {
    return { ok: false, message: '결제 정보가 일치하지 않아요. 다시 시도해주세요.' };
  }

  return { ok: true, txId: paymentKey };
}

async function releaseHold(paymentId: string, status: 'canceled' | 'failed' = 'canceled') {
  await supabase.from('court_reservations').delete().eq('payment_id', paymentId);
  await supabase.from('payments').update({ status }).eq('id', paymentId);
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

  if (amount <= 0) {
    const { error } = await supabase.from('court_reservations').insert(hours.map((h) => ({ court_id: court.id, user_id: uid, court_unit: courtUnit, slot_date: slotDate, hour: h })));
    if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? 'slot' : 'error', message: error.message };
    return { ok: true, free: true };
  }

  const orderId = `ord_${uid.slice(0, 8)}_${Date.now()}`;
  const orderName = `피넛 코트 예약 ${hours.length}시간`;
  const { data: pay, error: payErr } = await supabase
    .from('payments')
    .insert({ order_id: orderId, user_id: uid, order_type: 'court', order_name: orderName, court_id: court.id, court_unit: courtUnit, slot_date: slotDate, hours, amount, provider: PROVIDER })
    .select('id')
    .single();
  if (payErr || !pay) return { ok: false, reason: 'error', message: payErr?.message };

  const { error: resErr } = await supabase
    .from('court_reservations')
    .insert(hours.map((h) => ({ court_id: court.id, user_id: uid, court_unit: courtUnit, slot_date: slotDate, hour: h, payment_id: pay.id })));
  if (resErr) {
    await supabase.from('payments').update({ status: 'failed' }).eq('id', pay.id);
    return { ok: false, reason: /duplicate|unique/i.test(resErr.message) ? 'slot' : 'error', message: resErr.message };
  }

  let payment: { ok: boolean; txId?: string; message?: string };
  try {
    payment = await launchPayment({
      order_id: orderId,
      amount,
      orderName,
    });
  } catch (e) {
    await releaseHold(pay.id, 'failed');
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }

  if (!payment.ok) {
    await releaseHold(pay.id, payment.message ? 'failed' : 'canceled');
    return { ok: false, reason: payment.message ? 'error' : 'canceled', message: payment.message };
  }

  if (PROVIDER === 'mock') {
    await supabase.from('payments').update({ status: 'paid', provider_tx: payment.txId, paid_at: new Date().toISOString() }).eq('id', pay.id);
    return { ok: true };
  }

  const { data: verify, error: vErr } = await supabase.functions.invoke('pay-verify', {
    body: { order_id: orderId, paymentId: payment.txId },
  });
  if (vErr || !verify?.paid) {
    await releaseHold(pay.id, 'failed');
    return { ok: false, reason: 'error', message: vErr?.message ?? verify?.error ?? '결제 승인에 실패했어요.' };
  }

  return { ok: true };
}
