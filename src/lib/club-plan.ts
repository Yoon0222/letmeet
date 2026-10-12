// 클럽 플랜(등급) 판정 공용.
//   서버가 계산한 effective_plan(clubs_with_counts, 0095 — 체험 만료·해지 후 기간 종료까지 반영)을 우선 쓰고,
//   effective_plan 이 없을 때만 tier·상태·체험 기간으로 근사한다(해지 후 기간 종료는 서버 값에만 반영 — 구독은 클럽장만 조회 가능).
import type { Club, ClubPlan } from '@/lib/types';

type PlanSource = Pick<Club, 'tier' | 'premium_status' | 'premium_trial_ends_at'> & { effective_plan?: ClubPlan | null };

const RANK: Record<ClubPlan, number> = { free: 0, premium: 1, premium_plus: 2 };

export const PLAN_LABEL: Record<ClubPlan, string> = { free: 'Free', premium: 'Premium', premium_plus: 'Premium+' };

export function isTrialActive(club: PlanSource | null | undefined, nowMs = Date.now()) {
  return club?.premium_status === 'trialing' && !!club.premium_trial_ends_at && new Date(club.premium_trial_ends_at).getTime() > nowMs;
}

export function effectiveClubPlan(club: PlanSource | null | undefined, nowMs = Date.now()): ClubPlan {
  if (!club) return 'free';
  if (club.effective_plan) return club.effective_plan;
  if (club.tier !== 'free' && (club.premium_status === 'active' || isTrialActive(club, nowMs))) return 'premium';
  return 'free';
}

export function planAtLeast(plan: ClubPlan, need: ClubPlan) {
  return RANK[plan] >= RANK[need];
}

export function trialDaysLeft(club: PlanSource | null | undefined, nowMs = Date.now()) {
  if (!isTrialActive(club, nowMs) || !club?.premium_trial_ends_at) return null;
  return Math.max(0, Math.ceil((new Date(club.premium_trial_ends_at).getTime() - nowMs) / 86400000));
}
