// 클럽 회비 — 표시용 도우미와 서버 호출 모음.
//   앱은 회비 표에 직접 쓰지 않는다: 규칙·납부 처리는 DB 함수(RPC), 카드·결제·환불은 엣지함수(club-dues-*).
//   일부 표는 앱에 안 내려오는 열이 있어 select('*') 가 실패한다 → 아래처럼 열을 명시해 조회한다.
import { won } from '@/lib/club-plan';
import { supabase } from '@/lib/supabase';
import type {
  ClubDues,
  ClubDuesMandate,
  ClubDuesPeriodRow,
  ClubDuesPlan,
  ClubDuesRosterRow,
  ClubDuesSettlement,
  ClubDuesStatus,
  ClubPayoutAccountMasked,
  DuesCycle,
  DuesStatus,
  MemberBillingCard,
} from '@/lib/types';

export const CYCLE_LABEL: Record<DuesCycle, string> = { monthly: '매월', quarterly: '분기마다', yearly: '매년' };
export const CYCLE_NAME: Record<DuesCycle, string> = { monthly: '월 회비', quarterly: '분기 회비', yearly: '연 회비' };
export const DUES_STATUS_LABEL: Record<DuesStatus, string> = {
  open: '미납',
  processing: '결제 중',
  paid: '납부 완료',
  failed: '결제 실패',
  exempt: '면제',
  refunded: '환불됨',
  void: '대상 아님',
};

const CARD_COLUMNS = 'user_id, card_company, card_number_masked, created_at, updated_at';
const SETTLEMENT_COLUMNS =
  'id, club_id, club_name, period_month, gross_amount, refund_amount, fee_amount, net_amount, charge_count, status, confirmed_at, paid_at, created_at, updated_at';

/** 기간 키 → 사람이 읽는 이름. 'M2026-10' → '2026년 10월' / 'Q2026-4' → '2026년 4분기' / 'Y2026-03' → '2026년 3월~ 1년' */
export function periodLabel(key: string): string {
  const m = /^M(\d{4})-(\d{2})$/.exec(key);
  if (m) return `${m[1]}년 ${Number(m[2])}월`;
  const q = /^Q(\d{4})-(\d)$/.exec(key);
  if (q) return `${q[1]}년 ${q[2]}분기`;
  const y = /^Y(\d{4})-(\d{2})$/.exec(key);
  if (y) return `${y[1]}년 ${Number(y[2])}월~ 1년`;
  return key;
}

/** 'YYYY-MM-DD' → 'M월 D일' (시간대 변환 없이 문자열 그대로 읽는다) */
export function dayLabel(date: string): string {
  const [, mm, dd] = date.slice(0, 10).split('-');
  return `${Number(mm)}월 ${Number(dd)}일`;
}

/** 수수료율(만분율) → '3.5%' */
export function feePercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2)}%`;
}

/** 규칙 요약: '매월 30,000원 · 납부일 10일' */
export function planSummary(plan: Pick<ClubDuesPlan, 'cycle' | 'amount' | 'due_day' | 'start_month'>): string {
  const when =
    plan.cycle === 'monthly'
      ? `매월 ${plan.due_day}일`
      : plan.cycle === 'quarterly'
        ? `1·4·7·10월 ${plan.due_day}일`
        : `매년 ${plan.start_month}월 ${plan.due_day}일`;
  return `${CYCLE_LABEL[plan.cycle]} ${won(plan.amount)} · 납부일 ${when}`;
}

/** 자동결제 동의 금액 = 현재 금액과 예약된 금액 중 큰 값(서버 dues_mandate_upsert 와 같은 규칙) */
export function consentAmount(plan: Pick<ClubDuesPlan, 'amount' | 'next_amount'>): number {
  return Math.max(plan.amount, plan.next_amount ?? 0);
}

/** 동의 화면에 보여주고 그대로 서버에 보관하는 안내문 */
export function buildConsentText(clubName: string, plan: ClubDuesPlan): string {
  const amount = consentAmount(plan);
  const when =
    plan.cycle === 'monthly'
      ? `매월 ${plan.due_day}일`
      : plan.cycle === 'quarterly'
        ? `분기 첫 달(1·4·7·10월) ${plan.due_day}일`
        : `매년 ${plan.start_month}월 ${plan.due_day}일`;
  return [
    `[${clubName} 회비 자동결제 동의]`,
    `1. 결제 금액: ${CYCLE_NAME[plan.cycle]} ${won(amount)}${plan.next_amount && plan.next_amount > plan.amount ? ` (${plan.next_amount_from ? dayLabel(plan.next_amount_from) : '다음'} 기간부터. 그 전까지는 ${won(plan.amount)})` : ''}`,
    `2. 결제일: ${when} 오전 (결제에 실패하면 하루 한 번, 최대 4회까지 다시 시도)`,
    '3. 결제 수단: 등록한 카드. 카드 명세서에는 가맹점 "피넛"으로 표시됩니다.',
    '4. 회비는 피넛이 결제를 대신 받아 클럽에 정산합니다. 환불은 클럽 운영진에게 요청할 수 있습니다.',
    '5. 회비 금액이 오르면 다시 동의하기 전까지 자동결제가 멈춥니다.',
    '6. 해지: 클럽 > 회비 화면에서 언제든 자동결제를 해지할 수 있습니다. 해지해도 이미 결제된 회비는 유지됩니다.',
  ].join('\n');
}

// ── 조회 ──────────
// 조회에 실패하면 예외를 던진다. "없음"(카드 없음·회비 없음)과 "못 읽음"을 화면이 구분해야
// 등록된 카드가 있는데 없다고 안내하는 일이 없다. 부르는 쪽은 try/catch 로 "불러오지 못했어요"를 보여줄 것.
function read<T>(res: { data: T | null; error: { message: string } | null }): T | null {
  if (res.error) throw new Error(`dues_load_failed: ${res.error.message}`);
  return res.data;
}

/** 이 클럽의 회비 상태 요약. 이것만은 실패해도 던지지 않고 null 을 돌려준다(메뉴 노출 판단에 쓰여서). */
export async function fetchDuesStatus(clubId: string): Promise<ClubDuesStatus | null> {
  const { data, error } = await supabase.rpc('club_dues_status', { p_club_id: clubId });
  if (error) return null;
  return (data as ClubDuesStatus | null) ?? null;
}

export async function fetchDuesPlan(clubId: string): Promise<ClubDuesPlan | null> {
  return read(await supabase.from('club_dues_plans').select('*').eq('club_id', clubId).maybeSingle()) as ClubDuesPlan | null;
}

export async function fetchMyDues(clubId: string, userId: string): Promise<ClubDues[]> {
  const rows = read(
    await supabase
      .from('club_dues')
      .select('*')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .neq('status', 'void')
      .order('period_start', { ascending: false })
      .limit(36),
  );
  return (rows as ClubDues[] | null) ?? [];
}

export async function fetchMyMandate(clubId: string, userId: string): Promise<ClubDuesMandate | null> {
  return read(await supabase.from('club_dues_mandates').select('*').eq('club_id', clubId).eq('user_id', userId).maybeSingle()) as ClubDuesMandate | null;
}

export async function fetchMyCard(userId: string): Promise<MemberBillingCard | null> {
  return read(await supabase.from('member_billing_cards').select(CARD_COLUMNS).eq('user_id', userId).maybeSingle()) as MemberBillingCard | null;
}

export async function fetchDuesPeriods(clubId: string): Promise<ClubDuesPeriodRow[]> {
  return (read(await supabase.rpc('club_dues_periods', { p_club_id: clubId })) as ClubDuesPeriodRow[] | null) ?? [];
}

export async function fetchDuesRoster(clubId: string, periodKey: string): Promise<ClubDuesRosterRow[]> {
  return (read(await supabase.rpc('club_dues_roster', { p_club_id: clubId, p_period_key: periodKey })) as ClubDuesRosterRow[] | null) ?? [];
}

export async function fetchPayoutAccount(clubId: string): Promise<ClubPayoutAccountMasked | null> {
  return read(await supabase.rpc('club_payout_account_get', { p_club_id: clubId })) as ClubPayoutAccountMasked | null;
}

export async function fetchSettlements(clubId: string): Promise<ClubDuesSettlement[]> {
  const rows = read(
    await supabase.from('club_dues_settlements').select(SETTLEMENT_COLUMNS).eq('club_id', clubId).order('period_month', { ascending: false }).limit(24),
  );
  return (rows as ClubDuesSettlement[] | null) ?? [];
}

/** 오늘(KST) 'YYYY-MM-DD' */
export function todayKst(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

/**
 * 자동결제를 등록하는 순간 바로 결제될 회비(납부 시각이 지난 이번 기간 미납분) — 서버 club-dues-enroll 과 같은 기준.
 * 결제 중(processing)인 행도 돌려준다: 서버는 그 결과를 먼저 확인하고, 결제되지 않은 것으로 확인되면 바로 결제한다.
 */
export function dueNowOnEnroll(rows: ClubDues[], today = todayKst()): ClubDues | null {
  const due = rows
    .filter((d) => (d.status === 'open' || d.status === 'failed' || d.status === 'processing') && d.period_end > today && d.due_date <= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  if (!due || new Date(`${due.due_date}T10:00:00+09:00`).getTime() > Date.now()) return null;
  return due;
}

/** 서버가 이 회비를 자동으로 청구할 조건(동의가 살아 있고, 주기가 같고, 동의한 금액 안이고, 카드가 있다)을 갖췄는가 */
export function autopayCovers(
  mandate: ClubDuesMandate | null,
  plan: Pick<ClubDuesPlan, 'active' | 'cycle' | 'amount'> | null,
  card: MemberBillingCard | null,
  amount?: number,
): boolean {
  if (!mandate || mandate.status !== 'active' || !card || !plan || !plan.active) return false;
  return mandate.consented_cycle === plan.cycle && mandate.consented_amount >= (amount ?? plan.amount);
}

// ── 서버 호출 결과 ──────────
export type DuesFailure = { ok: false; error: string; code: string; retryable: boolean };
type Ok<T = object> = { ok: true } & T;

const DUES_ERRORS: Record<string, string> = {
  // 공통
  unauthorized: '다시 로그인한 뒤 시도해주세요.',
  forbidden: '권한이 없어요.',
  not_found: '정보를 찾을 수 없어요.',
  invalid: '입력한 내용을 확인해주세요.',
  invalid_request: '요청이 올바르지 않아요.',
  disabled: '지금은 회비 기능을 쓸 수 없어요.',
  dues_disabled: '지금은 회비 기능을 쓸 수 없어요.',
  // 규칙·계좌
  plan_required: '프리미엄 플러스 클럽만 회비를 쓸 수 있어요.',
  payout_required: '정산 계좌를 먼저 등록해주세요.',
  cycle_locked: '주기를 바꾸려면 회비를 끈 뒤 다시 설정해주세요.',
  // 납부 처리
  self_not_allowed: '임원은 본인 회비를 직접 처리할 수 없어요. 클럽장에게 요청해주세요.',
  in_progress: '카드 결제가 진행 중이에요. 잠시 후 다시 시도해주세요.',
  already_paid: '이미 납부 처리된 회비예요.',
  card_refund_only: '카드로 결제된 회비는 환불로만 되돌릴 수 있어요.',
  // 등록·결제
  no_plan: '이 클럽은 지금 회비를 받고 있지 않아요.',
  plan_changed: '회비 내용이 바뀌었어요. 다시 확인하고 동의해주세요.',
  not_member: '클럽 회원만 등록할 수 있어요.',
  card_required: '먼저 결제 카드를 등록해주세요.',
  billing_issue_failed: '카드 등록에 실패했어요. 카드 정보를 확인해주세요.',
  customer_key_mismatch: '로그인 정보가 맞지 않아요. 다시 로그인해주세요.',
  charge_failed: '결제에 실패했어요. 카드 상태를 확인해주세요.',
  charge_unknown: '결제 결과를 확인하고 있어요. 잠시 후 다시 확인해주세요.',
  not_payable: '지금은 결제할 수 없는 회비예요.',
  too_many: '결제를 너무 여러 번 시도했어요. 10분쯤 뒤에 다시 시도해주세요.',
  // 환불
  already_refunded: '이미 환불된 결제예요.',
  not_paid: '카드로 결제된 회비만 환불할 수 있어요.',
  settled: '정산이 확정된 결제는 환불할 수 없어요.',
  refund_failed: '환불에 실패했어요. 잠시 후 다시 시도해주세요.',
  commit_failed: '처리 결과를 반영하지 못했어요. 다시 시도하면 이어서 처리돼요.',
};
// 결과를 모르는 오류 — 같은 요청을 다시 보내도 이중으로 결제·환불되지 않는다
const RETRYABLE = new Set(['charge_unknown', 'commit_failed']);

function fail(code: string, fallback: string, extra?: string, retryable = false): DuesFailure {
  const message = DUES_ERRORS[code] ?? fallback;
  return { ok: false, error: extra ? `${message}\n${extra}` : message, code, retryable: retryable || RETRYABLE.has(code) };
}

// RPC 실패: 서버에 닿지 못한 것(오류 코드가 없다)이면 연결 문제로 알린다
function rpcFailure(error: { code?: string } | null, fallback: string): DuesFailure {
  if (error && !error.code) return { ok: false, error: '서버 응답을 받지 못했어요. 네트워크를 확인해주세요.', code: 'network', retryable: true };
  return fail('', fallback);
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// 엣지함수 오류 → 한국어 안내. 응답을 못 받았거나 서버 내부 오류(5xx)면 결과를 알 수 없으므로 retryable.
async function edgeFailure(error: unknown, dataError: unknown, fallback: string): Promise<DuesFailure> {
  let code = typeof dataError === 'string' ? dataError : '';
  let extra: string | undefined;
  let status = 0;
  let reached = !error;
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    reached = true;
    status = context.status;
    const body = safeJson(await context.clone().text().catch(() => ''));
    if (typeof body?.error === 'string') code = body.error;
    const toss = body?.toss as { message?: unknown } | undefined;
    extra = typeof body?.reason === 'string' ? body.reason : typeof toss?.message === 'string' ? toss.message : undefined;
  }
  if (!reached) return { ok: false, error: '서버 응답을 받지 못했어요. 네트워크를 확인해주세요.', code: 'network', retryable: true };
  return fail(code, fallback, extra, status >= 500);
}

/** 안내 제목: 서버에 닿지 못한 것(연결 문제)과 서버가 거절한 것을 구분한다 */
export function failureTitle(f: DuesFailure, fallback: string): string {
  return f.code === 'network' ? '연결 확인' : fallback;
}

// ── 규칙·계좌 (클럽장) ──────────
export async function setDuesPlan(args: {
  clubId: string;
  cycle: DuesCycle;
  amount: number;
  dueDay: number;
  startMonth: number;
  includeOwner: boolean;
}): Promise<Ok | DuesFailure> {
  const { data, error } = await supabase.rpc('club_dues_plan_set', {
    p_club_id: args.clubId,
    p_cycle: args.cycle,
    p_amount: args.amount,
    p_due_day: args.dueDay,
    p_start_month: args.startMonth,
    p_include_owner: args.includeOwner,
  });
  if (error || !data) return rpcFailure(error, '회비 설정을 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
  if (data !== 'ok') return fail(data, '회비 설정을 저장하지 못했어요.');
  return { ok: true };
}

export async function disableDuesPlan(clubId: string): Promise<Ok | DuesFailure> {
  const { data, error } = await supabase.rpc('club_dues_plan_disable', { p_club_id: clubId });
  if (error || !data) return rpcFailure(error, '회비를 끄지 못했어요. 잠시 후 다시 시도해주세요.');
  if (data !== 'ok') return fail(data, '회비를 끄지 못했어요.');
  return { ok: true };
}

export async function setPayoutAccount(args: {
  clubId: string;
  holderType: 'individual' | 'business';
  holderName: string;
  bankName: string;
  accountNumber: string;
  businessNumber: string | null;
  contactPhone: string;
  contactEmail: string | null;
}): Promise<Ok | DuesFailure> {
  const { data, error } = await supabase.rpc('club_payout_account_set', {
    p_club_id: args.clubId,
    p_holder_type: args.holderType,
    p_holder_name: args.holderName,
    p_bank_name: args.bankName,
    p_account_number: args.accountNumber,
    p_business_number: args.businessNumber,
    p_contact_phone: args.contactPhone,
    p_contact_email: args.contactEmail,
  });
  if (error || !data) return rpcFailure(error, '정산 계좌를 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
  if (data === 'invalid') {
    return fail('invalid', '', '예금주·은행 이름, 계좌번호(숫자 8~16자리), 연락처를 확인해주세요. 사업자는 사업자등록번호 10자리가 필요해요.');
  }
  if (data !== 'ok') return fail(data, '정산 계좌를 저장하지 못했어요.');
  return { ok: true };
}

// ── 납부 처리 (클럽장·임원) ──────────
export async function markDues(duesId: string, action: 'cash_paid' | 'exempt' | 'revert', note = ''): Promise<Ok | DuesFailure> {
  const { data, error } = await supabase.rpc('club_dues_mark', { p_dues_id: duesId, p_action: action, p_note: note });
  if (error || !data) return rpcFailure(error, '처리하지 못했어요. 잠시 후 다시 시도해주세요.');
  // 여기서 invalid 는 입력 문제가 아니라 "그 사이 상태가 바뀌어 이 처리를 할 수 없다"는 뜻
  if (data === 'invalid') return { ok: false, error: '그 사이 회비 상태가 바뀌어 이 처리를 할 수 없어요. 명단을 다시 확인해주세요.', code: 'invalid', retryable: false };
  if (data !== 'ok') return fail(data, '처리하지 못했어요.');
  return { ok: true };
}

export async function refundDuesCharge(chargeId: string, reason: string): Promise<Ok<{ amount: number }> | DuesFailure> {
  const { data, error } = await supabase.functions.invoke('club-dues-refund', { body: { chargeId, reason } });
  if (error || data?.error) return edgeFailure(error, data?.error, '환불하지 못했어요. 잠시 후 다시 시도해주세요.');
  return { ok: true, amount: Number(data?.amount ?? 0) };
}

// ── 자동결제 등록·카드·결제 (회원 본인) ──────────
export type DuesChargeOutcome = { status: 'paid' | 'failed' | 'unknown' | 'none'; amount?: number; reason?: string };

export async function enrollDues(args: {
  clubId: string;
  consent: { amount: number; cycle: DuesCycle; text: string };
  authKey?: string;
  customerKey?: string;
}): Promise<Ok<{ card: { company: string; masked: string }; charge: DuesChargeOutcome }> | DuesFailure> {
  const { data, error } = await supabase.functions.invoke('club-dues-enroll', { body: args });
  if (error || data?.error) return edgeFailure(error, data?.error, '자동결제를 등록하지 못했어요. 잠시 후 다시 시도해주세요.');
  return { ok: true, card: data.card, charge: (data.charge as DuesChargeOutcome | undefined) ?? { status: 'none' } };
}

export async function replaceDuesCard(args: { authKey: string; customerKey: string }): Promise<Ok<{ card: { company: string; masked: string } }> | DuesFailure> {
  const { data, error } = await supabase.functions.invoke('club-dues-card', { body: { action: 'replace', ...args } });
  if (error || data?.error) return edgeFailure(error, data?.error, '카드를 바꾸지 못했어요. 잠시 후 다시 시도해주세요.');
  return { ok: true, card: data.card };
}

export async function deleteDuesCard(): Promise<Ok | DuesFailure> {
  const { data, error } = await supabase.functions.invoke('club-dues-card', { body: { action: 'delete' } });
  if (error || data?.error) return edgeFailure(error, data?.error, '카드를 삭제하지 못했어요. 잠시 후 다시 시도해주세요.');
  return { ok: true };
}

export async function payDuesNow(duesId: string): Promise<Ok<{ amount?: number }> | DuesFailure> {
  const { data, error } = await supabase.functions.invoke('club-dues-pay-now', { body: { duesId } });
  if (error || data?.error) return edgeFailure(error, data?.error, '결제하지 못했어요. 잠시 후 다시 시도해주세요.');
  return { ok: true, amount: typeof data?.amount === 'number' ? data.amount : undefined };
}

/** 결과를 모르는 결제의 결과만 확인한다 — 새로 결제하지 않는다. unpaid = 결제되지 않은 것으로 확인됨. */
export async function checkDuesPayment(duesId: string): Promise<Ok<{ status: 'paid' | 'unpaid'; amount?: number }> | DuesFailure> {
  const { data, error } = await supabase.functions.invoke('club-dues-pay-now', { body: { duesId, checkOnly: true } });
  if (error || data?.error) return edgeFailure(error, data?.error, '결제 결과를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
  return { ok: true, status: data?.status === 'paid' ? 'paid' : 'unpaid', amount: typeof data?.amount === 'number' ? data.amount : undefined };
}

export async function revokeDuesMandate(clubId: string): Promise<Ok | DuesFailure> {
  const { data, error } = await supabase.rpc('club_dues_mandate_revoke', { p_club_id: clubId });
  if (error || !data) return rpcFailure(error, '자동결제를 해지하지 못했어요. 잠시 후 다시 시도해주세요.');
  if (data !== 'ok' && data !== 'not_found') return fail(data, '자동결제를 해지하지 못했어요.');
  return { ok: true };
}
