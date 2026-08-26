// 코트 환불 정책 평가 유틸.
//   정책 = 단계 배열 [{ days_before, rate }]. "예약일 days_before일 전까지 취소하면 rate% 환불".
//   남은 일수 d(= 예약일 - 오늘, KST)를 days_before 내림차순으로 훑어 d >= days_before 인 첫 rate 적용.
//   해당 없으면(더 임박) 0%. 서버(toss-cancel)와 동일 규칙을 클라에서도 미리 보여주기 위함.
import type { RefundTier } from '@/lib/types';

const DEFAULT_POLICY: RefundTier[] = [{ days_before: 1, rate: 100 }];

/** 값 정제 + days_before 내림차순 정렬. 비면 기본 정책. */
export function normalizeRefundPolicy(policy?: RefundTier[] | null): RefundTier[] {
  const tiers = (Array.isArray(policy) && policy.length ? policy : DEFAULT_POLICY)
    .filter((t) => t && Number.isFinite(t.days_before) && Number.isFinite(t.rate))
    .map((t) => ({
      days_before: Math.max(0, Math.trunc(t.days_before)),
      rate: Math.max(0, Math.min(100, Math.round(t.rate))),
    }))
    .sort((a, b) => b.days_before - a.days_before);
  return tiers.length ? tiers : DEFAULT_POLICY;
}

/** slotDate(YYYY-MM-DD)와 today(YYYY-MM-DD)로 환불율(0~100) 계산. */
export function refundRateFor(policy: RefundTier[] | null | undefined, slotDate: string, today: string): number {
  const d = Math.round((Date.parse(`${slotDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(d) || d < 0) return 0;
  for (const t of normalizeRefundPolicy(policy)) if (d >= t.days_before) return t.rate;
  return 0;
}

/** 정책을 사람이 읽는 문장으로. 예: "3일 전까지 100% · 1일 전까지 50% · 그 외 0%" */
export function refundPolicyText(policy?: RefundTier[] | null): string {
  const tiers = normalizeRefundPolicy(policy);
  const parts = tiers.map((t) => (t.days_before === 0 ? `당일 ${t.rate}%` : `${t.days_before}일 전까지 ${t.rate}%`));
  const hasZeroDay = tiers.some((t) => t.days_before === 0);
  return (hasZeroDay ? parts : [...parts, '그 외 0%']).join(' · ');
}
