import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import type { ClubRole, ClubWithCounts } from '@/lib/types';

// 클럽 상세/하위 페이지가 공용으로 쓰는 접근 권한 훅.
//   - 프리미엄 사용 가능 여부, 클럽장/임원(관리) 여부, 멤버 여부를 한 곳에서 계산.
export function useClubAccess(clubId?: string) {
  const { session } = useAuth();
  const uid = session?.user.id;

  const [club, setClub] = useState<ClubWithCounts | null>(null);
  const [myRole, setMyRole] = useState<ClubRole | null>(null);
  const [myStatus, setMyStatus] = useState<'pending' | 'approved' | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs] = useState(() => Date.now());

  const reload = useCallback(async () => {
    if (!clubId) return;
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('clubs_with_counts').select('*').eq('id', clubId).maybeSingle(),
      uid
        ? supabase.from('club_members').select('role, status').eq('club_id', clubId).eq('user_id', uid).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setClub((c as ClubWithCounts | null) ?? null);
    setMyRole(((m as { role?: ClubRole } | null)?.role as ClubRole) ?? null);
    setMyStatus(((m as { status?: 'pending' | 'approved' } | null)?.status) ?? null);
    setLoading(false);
  }, [clubId, uid]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const isOwner = !!club && club.owner_id === uid;
  const isApprovedMember = myStatus === 'approved';
  const isPending = myStatus === 'pending';
  const isOfficer = myRole === 'officer' && isApprovedMember;
  const canManage = isOwner || isOfficer;
  const isTrialing =
    club?.premium_status === 'trialing' && !!club.premium_trial_ends_at && new Date(club.premium_trial_ends_at).getTime() > nowMs;
  const isPremiumUsable = club?.tier === 'premium' && (club.premium_status === 'active' || isTrialing);
  const trialDaysLeft =
    isTrialing && club?.premium_trial_ends_at
      ? Math.max(0, Math.ceil((new Date(club.premium_trial_ends_at).getTime() - nowMs) / 86400000))
      : null;

  return {
    club,
    uid,
    myRole,
    isOwner,
    isOfficer,
    canManage,
    isApprovedMember,
    isPending,
    isPremiumUsable,
    isTrialing,
    trialDaysLeft,
    loading,
    reload,
  };
}
