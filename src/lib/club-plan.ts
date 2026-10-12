// 클럽 플랜(등급) 판정·가격표 공용.
//   서버가 계산한 effective_plan(clubs_with_counts, 0095 — 체험 만료·해지 후 기간 종료까지 반영)을 우선 쓰고,
//   effective_plan 이 없을 때만 tier·상태·체험 기간으로 근사한다(해지 후 기간 종료는 서버 값에만 반영 — 구독은 클럽장만 조회 가능).
import { supabase } from '@/lib/supabase';
import type { Club, ClubPaidPlan, ClubPlan, ClubPlanRow } from '@/lib/types';

type PlanSource = Pick<Club, 'tier' | 'premium_status' | 'premium_trial_ends_at'> & {
  premium_plan?: ClubPaidPlan | null;
  effective_plan?: ClubPlan | null;
};

const RANK: Record<ClubPlan, number> = { free: 0, premium: 1, premium_plus: 2 };

/** 배지용 짧은 이름 */
export const PLAN_LABEL: Record<ClubPlan, string> = { free: 'Free', premium: 'Premium', premium_plus: 'Premium+' };
/** 문장에 쓰는 한글 이름 */
export const PLAN_NAME: Record<ClubPlan, string> = { free: '무료', premium: '프리미엄', premium_plus: '프리미엄 플러스' };
/** 플랜별 주요 기능(플랜 선택 화면) */
export const PLAN_FEATURES: Record<ClubPaidPlan, string[]> = {
  premium: ['정기모임 참석 투표 · 자동 대진', '경기 결과 기록', '월례대회 운영'],
  premium_plus: ['프리미엄의 모든 기능', '회비 카드 자동결제', '납부 현황 · 정산 관리'],
};

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export function isTrialActive(club: PlanSource | null | undefined, nowMs = Date.now()) {
  return club?.premium_status === 'trialing' && !!club.premium_trial_ends_at && new Date(club.premium_trial_ends_at).getTime() > nowMs;
}

export function effectiveClubPlan(club: PlanSource | null | undefined, nowMs = Date.now()): ClubPlan {
  if (!club) return 'free';
  if (club.effective_plan) return club.effective_plan;
  if (club.tier !== 'free' && (club.premium_status === 'active' || isTrialActive(club, nowMs))) return club.premium_plan ?? 'premium';
  return 'free';
}

export function planAtLeast(plan: ClubPlan, need: ClubPlan) {
  return RANK[plan] >= RANK[need];
}

export function trialDaysLeft(club: PlanSource | null | undefined, nowMs = Date.now()) {
  if (!isTrialActive(club, nowMs) || !club?.premium_trial_ends_at) return null;
  return Math.max(0, Math.ceil((new Date(club.premium_trial_ends_at).getTime() - nowMs) / 86400000));
}

/** 플랜 가격표 — 가격의 기준은 서버(club_plans, 0096). active=false 인 플랜은 새로 고를 수 없다. */
export async function fetchClubPlans(): Promise<ClubPlanRow[]> {
  const { data } = await supabase.from('club_plans').select('*').order('sort', { ascending: true });
  return (data as ClubPlanRow[] | null) ?? [];
}
