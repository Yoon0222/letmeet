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

// 대회 참가비 주문 생성 (0089) — 결제 완료(toss-confirm)가 참가를 확정한다
export async function createTournamentEntryPayment(args: {
  tournamentId: string;
  title: string;
  fee: number;
  uid: string;
}): Promise<CourtPaymentResult> {
  if (!isTossConfigured) {
    return { ok: false, reason: 'config', message: 'Toss client key is missing.' };
  }
  if (args.fee <= 0) {
    return { ok: false, reason: 'error', message: '참가비가 0원인 대회는 결제가 필요 없어요.' };
  }
  const orderId = `trn_${Date.now().toString(36)}_${randomPart()}`;
  const orderName = `${args.title} 참가비`;
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      order_id: orderId,
      user_id: args.uid,
      order_type: 'tournament',
      target_id: args.tournamentId,
      order_name: orderName,
      amount: args.fee,
      status: 'pending',
      provider: 'toss',
    })
    .select('id, order_id, order_name, amount')
    .single();
  if (error || !payment) {
    return { ok: false, reason: 'error', message: error?.message };
  }
  return { ok: true, paymentId: payment.id, orderId: payment.order_id, orderName: payment.order_name, amount: payment.amount };
}

// 대회 참가 취소 (0089) — 결제됐으면 환불(시작 전 전액), 행 삭제로 대기열 자동 승격
export async function cancelTournamentEntry(
  tournamentId: string,
): Promise<{ ok: true; refunded: boolean; amount: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('toss-cancel', { body: { tournamentId } });
  if (error) {
    const context = (error as unknown as { context?: unknown }).context;
    let message = error.message;
    if (context instanceof Response) {
      const bodyText = await context.clone().text().catch(() => '');
      const body = bodyText ? safeJsonParse(bodyText) : null;
      const raw = typeof body?.error === 'string' ? body.error : undefined;
      message =
        raw === 'refund_window_closed'
          ? '대회 시작 후에는 취소할 수 없어요.'
          : raw === 'draw_locked'
            ? '대진 확정 후에는 참가를 취소할 수 없어요. 운영자에게 문의해 주세요.'
            : raw === 'refund_failed'
              ? '환불 처리에 실패했어요. 잠시 후 다시 시도해주세요.'
              : raw ?? message;
    }
    return { ok: false, error: message };
  }
  if (data?.error) return { ok: false, error: data.error };
  return data as { ok: true; refunded: boolean; amount: number };
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
    | { ok: true; reservationIds: string[]; entryConfirmed?: boolean; tournamentId?: string }
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

type ClubSubscriptionStarted = {
  ok: true;
  status: string;
  plan?: string;
  pendingPlan?: string | null;
  trialing: boolean;
  chargedNow: boolean;
  chargedAmount?: number; // 지금 결제된 금액(첫 결제 또는 업그레이드 차액)
  monthlyPrice?: number; // 다음 결제부터의 월 요금
  nextChargeAt: string;
  card: { company: string; masked: string };
};

// 구독 결제 함수(toss-billing-*)의 오류 코드 → 사용자 안내
const BILLING_ERRORS: Record<string, string> = {
  billing_issue_failed: '카드 등록에 실패했어요. 카드 정보를 확인해주세요.',
  first_charge_failed: '첫 결제에 실패했어요. 카드 상태를 확인해주세요.',
  upgrade_charge_failed: '결제에 실패했어요. 카드 상태를 확인해주세요.',
  charge_unknown: '결제 결과를 확인하고 있어요. 잠시 후 다시 시도해주세요.',
  commit_failed: '결제 정보를 반영하지 못했어요. 잠시 후 다시 시도해주세요.',
  amount_changed: '결제 금액이 바뀌었어요. 금액을 다시 확인해주세요.',
  plan_unavailable: '지금은 선택할 수 없는 플랜이에요.',
  plan_not_found: '플랜 정보를 찾을 수 없어요.',
  forbidden: '클럽장만 할 수 있어요.',
  club_not_found: '클럽을 찾을 수 없어요.',
  customer_key_mismatch: '로그인 정보가 맞지 않아요. 다시 로그인해주세요.',
  subscription_not_found: '구독 정보를 찾을 수 없어요.',
  unauthorized: '다시 로그인한 뒤 시도해주세요.',
};
// 결과를 모르는 오류 — 같은 요청으로 다시 시도하면 서버가 같은 주문번호로 확인하므로 이중 결제되지 않는다.
const BILLING_RETRYABLE = new Set(['charge_unknown', 'commit_failed']);

export type BillingFailure = { ok: false; error: string; code: string; retryable: boolean };

async function billingFailure(error: unknown, dataError: unknown, fallback: string): Promise<BillingFailure> {
  let code = typeof dataError === 'string' ? dataError : '';
  let tossMsg: string | undefined;
  let status = 0;
  let reached = !error; // 서버 응답을 받았는가
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    reached = true;
    status = context.status;
    const bodyText = await context.clone().text().catch(() => '');
    const body = bodyText ? safeJsonParse(bodyText) : null;
    if (typeof body?.error === 'string') code = body.error;
    tossMsg = typeof body?.toss?.message === 'string' ? body.toss.message : undefined;
  }
  // 응답을 못 받았거나(네트워크) 서버 내부 오류(5xx)면 결제됐는지 알 수 없다 → 같은 요청으로 다시 확인해야 한다
  const retryable = BILLING_RETRYABLE.has(code) || !reached || status >= 500;
  const message = BILLING_ERRORS[code] ?? (reached ? fallback : '서버 응답을 받지 못했어요. 네트워크를 확인해주세요.');
  return { ok: false, error: tossMsg ? `${message}\n${tossMsg}` : message, code, retryable };
}

// 클럽 유료 플랜 구독 시작 — 카드 등록(빌링키) 후 첫 과금 또는 체험 종료 예약. 가격은 서버(club_plans)가 정한다.
// retryable 오류면 같은 authKey 로 다시 호출할 것(새로 카드를 등록하면 주문번호가 달라진다).
export async function startClubSubscription(args: {
  clubId: string;
  authKey: string;
  customerKey: string;
  plan?: 'premium' | 'premium_plus';
}): Promise<ClubSubscriptionStarted | BillingFailure> {
  const { data, error } = await supabase.functions.invoke('toss-billing-issue', { body: args });
  if (error || data?.error) return billingFailure(error, data?.error, '구독을 시작하지 못했어요. 잠시 후 다시 시도해주세요.');
  return data as ClubSubscriptionStarted;
}

export type ClubPlanChangeAction = 'switched' | 'upgraded' | 'downgrade_scheduled' | 'pending_cleared' | 'noop' | 'needs_subscription';
export type ClubPlanChangeResult = {
  ok: true;
  action: ClubPlanChangeAction;
  plan: string;
  chargeAmount: number; // 지금 결제되는(될) 금액 — 업그레이드 차액
  monthlyPrice: number;
  nextChargeAt?: string | null;
  effectiveAt?: string | null; // 다운그레이드가 적용되는 날
};

// 플랜 변경 — 업그레이드(남은 기간 차액 결제)·다운그레이드(다음 결제일부터)·체험 중 전환.
//   preview=true      계산만(차액 미리보기).
//   expectedAmount    사용자가 확인한 결제 금액. 실제 차액이 더 크면 서버가 결제하지 않고 amount_changed 로 거부한다.
export async function changeClubPlan(args: {
  clubId: string;
  plan: 'premium' | 'premium_plus';
  preview?: boolean;
  expectedAmount?: number;
}): Promise<ClubPlanChangeResult | BillingFailure> {
  const { data, error } = await supabase.functions.invoke('toss-billing-change-plan', { body: args });
  if (error || data?.error) return billingFailure(error, data?.error, '플랜을 바꾸지 못했어요. 잠시 후 다시 시도해주세요.');
  return data as ClubPlanChangeResult;
}

// 구독 해지 — 다음 과금 중단, 현재 기간 종료일까지 이용
export async function cancelClubSubscription(
  clubId: string,
): Promise<{ ok: true; activeUntil: string | null } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('toss-billing-cancel', { body: { clubId } });
  if (error || data?.error) {
    const failure = await billingFailure(error, data?.error, '구독을 해지하지 못했어요. 잠시 후 다시 시도해주세요.');
    return { ok: false, error: failure.error };
  }
  return data as { ok: true; activeUntil: string | null };
}
