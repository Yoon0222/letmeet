import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';

export type CourtPaymentResult =
  | {
      ok: true;
      paymentId: string;
      orderId: string;
      orderName: string;
      amount: number;
    }
  | { ok: false; reason: 'config' | 'slot' | 'error'; message?: string };

export const tossClientKey = process.env.EXPO_PUBLIC_TOSS_CLIENT_KEY ?? '';
export const isTossConfigured =
  tossClientKey.startsWith('test_ck_') ||
  tossClientKey.startsWith('live_ck_');

function randomPart() {
  return Math.random().toString(36).slice(2, 10);
}

function createOrderId() {
  return `court_${Date.now().toString(36)}_${randomPart()}`;
}

export async function createCourtPaymentHold(args: {
  court: Pick<Court, 'id' | 'name' | 'hourly_price'>;
  uid: string;
  slotDate: string;
  hours: number[];
  courtUnit: string;
}): Promise<CourtPaymentResult> {
  const { court, uid, slotDate, hours, courtUnit } = args;
  const amount = court.hourly_price * hours.length;

  if (!isTossConfigured) {
    return { ok: false, reason: 'config', message: 'Toss client key is missing.' };
  }
  if (amount <= 0) {
    return { ok: false, reason: 'error', message: 'Paid reservation amount must be greater than zero.' };
  }

  const orderId = createOrderId();
  const orderName = `${court.name} 코트 예약`;
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      order_id: orderId,
      user_id: uid,
      order_type: 'court',
      target_id: court.id,
      order_name: orderName,
      court_id: court.id,
      court_unit: courtUnit,
      slot_date: slotDate,
      hours,
      amount,
      status: 'pending',
      provider: 'toss',
    })
    .select('id, order_id, order_name, amount')
    .single();

  if (paymentError || !payment) {
    return { ok: false, reason: 'error', message: paymentError?.message };
  }

  const { data: holdStatus, error: holdError } = await supabase.rpc('reserve_court_hold', {
    p_court_id: court.id,
    p_court_unit: courtUnit,
    p_slot_date: slotDate,
    p_hours: hours,
    p_user_id: uid,
    p_payment_id: payment.id,
    p_minutes: 10,
  });

  if (holdError || holdStatus !== 'ok') {
    await supabase.from('payments').update({ status: 'canceled' }).eq('id', payment.id);
    return {
      ok: false,
      reason: holdStatus === 'conflict' ? 'slot' : 'error',
      message: holdError?.message ?? String(holdStatus ?? 'hold failed'),
    };
  }

  return {
    ok: true,
    paymentId: payment.id,
    orderId: payment.order_id,
    orderName: payment.order_name,
    amount: payment.amount,
  };
}

export async function confirmTossPayment(args: {
  paymentId?: string;
  paymentKey?: string;
  orderId: string;
  amount: number;
}) {
  const { data, error } = await supabase.functions.invoke('toss-confirm', { body: args });
  if (error) {
    const context = (error as unknown as { context?: unknown }).context;
    if (context instanceof Response) {
      const bodyText = await context.clone().text().catch(() => '');
      const body = bodyText ? safeJsonParse(bodyText) : null;
      const tossCode =
        typeof body?.toss?.code === 'string'
          ? body.toss.code
          : typeof body?.code === 'string'
            ? body.code
            : undefined;
      const tossMessage =
        typeof body?.toss?.message === 'string'
          ? body.toss.message
          : typeof body?.message === 'string'
            ? body.message
            : undefined;
      const message =
        typeof body?.error === 'string'
          ? [body.error, tossCode, tossMessage].filter(Boolean).join(' - ')
          : tossMessage
            ? [tossCode, tossMessage].filter(Boolean).join(' - ')
            : error.message;
      console.warn('[payment] confirm http error', { status: context.status, body, bodyText });
      throw new Error(message);
    }

    console.warn('[payment] confirm error', {
      message: error.message,
      keys: typeof error === 'object' && error ? Object.keys(error) : [],
      error,
    });
    throw error;
  }
  return data as
    | { ok: true; reservationIds: string[] }
    | { ok: false; pending: true; status?: string; message?: string };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function cancelPendingPayment(paymentId: string) {
  await supabase.from('court_reservations').delete().eq('payment_id', paymentId);
  await supabase.from('payments').update({ status: 'canceled' }).eq('id', paymentId).eq('status', 'pending');
}

// 확정 예약 취소 + 환불(정책: 예약일이 미래면 100% 환불, 당일이면 환불 없이 취소).
export async function cancelCourtReservation(
  reservationIds: string[],
): Promise<{ ok: true; refunded: boolean; amount: number; reason: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('toss-cancel', { body: { reservationIds } });
  if (error) {
    const context = (error as unknown as { context?: unknown }).context;
    let message = error.message;
    if (context instanceof Response) {
      const bodyText = await context.clone().text().catch(() => '');
      const body = bodyText ? safeJsonParse(bodyText) : null;
      message = (typeof body?.error === 'string' ? body.error : undefined) ?? message;
    }
    return { ok: false, error: message };
  }
  if (data?.error) return { ok: false, error: data.error };
  return data as { ok: true; refunded: boolean; amount: number; reason: string };
}
