// UGC 신고·차단 (App Store 가이드라인 1.2)
import { supabase } from '@/lib/supabase';
import type { ReportTargetType } from '@/lib/types';

export const REPORT_REASONS = ['스팸/광고', '부적절한 내용', '사기/허위정보', '욕설/괴롭힘', '기타'];

export async function reportContent(args: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string | null;
  reason: string;
  detail?: string;
}) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: args.reporterId,
    target_type: args.targetType,
    target_id: args.targetId,
    target_user_id: args.targetUserId ?? null,
    reason: args.reason,
    detail: args.detail ?? '',
  });
  return error;
}

export async function blockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  return error;
}

export async function unblockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  return error;
}

/** 내가 차단한 사용자 id 목록 */
export async function getBlockedIds(myId: string): Promise<string[]> {
  const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', myId);
  return (data ?? []).map((r) => r.blocked_id);
}
