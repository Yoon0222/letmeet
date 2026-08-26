// 코트 바닥 종류 · 편의시설 공유 상수 (관리자 웹)
import type { RefundTier } from '@/lib/types';

export const SURFACES: { key: string; label: string }[] = [
  { key: 'hard', label: '하드' },
  { key: 'urethane', label: '우레탄' },
  { key: 'artificial_turf', label: '인조잔디' },
  { key: 'modular', label: '모듈러(스포츠코트)' },
  { key: 'asphalt', label: '아스팔트' },
  { key: 'concrete', label: '콘크리트' },
  { key: 'other', label: '기타' },
];
export const surfaceLabel = (k: string) => SURFACES.find((s) => s.key === k)?.label ?? k;

export const AMENITIES: { key: string; label: string; emoji: string }[] = [
  { key: 'parking', label: '주차장', emoji: '🅿️' },
  { key: 'shower', label: '샤워실', emoji: '🚿' },
  { key: 'restroom', label: '화장실', emoji: '🚻' },
  { key: 'locker', label: '탈의실', emoji: '🧳' },
  { key: 'store', label: '매점', emoji: '🏪' },
  { key: 'rental', label: '장비대여', emoji: '🎾' },
  { key: 'lighting', label: '야간조명', emoji: '💡' },
  { key: 'rest_area', label: '휴게공간', emoji: '🛋️' },
];
export const amenityLabel = (k: string) => AMENITIES.find((a) => a.key === k)?.label ?? k;

// 환불 정책 단계 — "예약일 days_before일 전까지 취소하면 rate% 환불". 해당 없으면 0%.
export const DEFAULT_REFUND_POLICY: RefundTier[] = [{ days_before: 1, rate: 100 }];

export const REFUND_PRESETS: { key: string; label: string; tiers: RefundTier[] }[] = [
  { key: 'standard', label: '표준 · 전날까지 100%', tiers: [{ days_before: 1, rate: 100 }] },
  { key: 'moderate', label: '보통 · 3일전 100% / 1일전 50%', tiers: [{ days_before: 3, rate: 100 }, { days_before: 1, rate: 50 }] },
  { key: 'strict', label: '엄격 · 7일전 100% / 3일전 50%', tiers: [{ days_before: 7, rate: 100 }, { days_before: 3, rate: 50 }] },
  { key: 'nonref', label: '환불 불가 (전부 0%)', tiers: [{ days_before: 0, rate: 0 }] },
];

/** 저장 전 정제: 값 클램프 + days_before 중복 제거 + 내림차순 정렬. 비면 기본 정책. */
export function sanitizeRefundPolicy(tiers: RefundTier[]): RefundTier[] {
  const seen = new Set<number>();
  const out = (Array.isArray(tiers) ? tiers : [])
    .filter((t) => t && Number.isFinite(t.days_before) && Number.isFinite(t.rate))
    .map((t) => ({ days_before: Math.max(0, Math.trunc(t.days_before)), rate: Math.max(0, Math.min(100, Math.round(t.rate))) }))
    .sort((a, b) => b.days_before - a.days_before)
    .filter((t) => (seen.has(t.days_before) ? false : (seen.add(t.days_before), true)));
  return out.length ? out : DEFAULT_REFUND_POLICY;
}

/** 정책을 사람이 읽는 문장으로. 예: "3일 전까지 100% · 1일 전까지 50% · 그 외 0%" */
export function refundPolicyLabel(tiers: RefundTier[]): string {
  const norm = sanitizeRefundPolicy(tiers);
  const parts = norm.map((t) => (t.days_before === 0 ? `당일 ${t.rate}%` : `${t.days_before}일 전까지 ${t.rate}%`));
  const hasZeroDay = norm.some((t) => t.days_before === 0);
  return (hasZeroDay ? parts : [...parts, '그 외 0%']).join(' · ');
}
