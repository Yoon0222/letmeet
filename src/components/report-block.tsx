import { Ionicons } from '@expo/vector-icons';
import { Alert, type AlertButton, Pressable } from 'react-native';

import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { REPORT_REASONS, blockUser, reportContent } from '@/lib/moderation';
import type { ReportTargetType } from '@/lib/types';

// 신고·차단 메뉴 버튼(⋯). UGC 화면(모임/클럽/프로필)에 배치.
export function ReportBlock({
  targetType,
  targetId,
  targetUserId,
  targetLabel,
  onBlocked,
}: {
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string | null;
  targetLabel?: string;
  onBlocked?: () => void;
}) {
  const { session } = useAuth();
  const theme = useTheme();
  const uid = session?.user.id;
  const canBlock = !!targetUserId && targetUserId !== uid;

  async function submitReport(reason: string) {
    if (!uid) return;
    const err = await reportContent({ reporterId: uid, targetType, targetId, targetUserId, reason });
    Alert.alert(err ? '신고 실패' : '신고 접수', err ? err.message : '신고가 접수됐어요. 운영팀이 확인합니다.');
  }

  function openReport() {
    const buttons: AlertButton[] = REPORT_REASONS.map((r) => ({ text: r, onPress: () => submitReport(r) }));
    buttons.push({ text: '취소', style: 'cancel' });
    Alert.alert('신고 사유', '신고 사유를 선택하세요.', buttons);
  }

  function openBlock() {
    if (!uid || !targetUserId) return;
    Alert.alert('사용자 차단', '차단하면 이 사용자의 콘텐츠가 보이지 않아요. 차단할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '차단',
        style: 'destructive',
        onPress: async () => {
          const err = await blockUser(uid, targetUserId);
          if (err) Alert.alert('차단 실패', err.message);
          else {
            Alert.alert('차단 완료', '이 사용자의 콘텐츠가 숨겨져요.');
            onBlocked?.();
          }
        },
      },
    ]);
  }

  function openMenu() {
    const buttons: AlertButton[] = [{ text: '신고하기', onPress: openReport }];
    if (canBlock) buttons.push({ text: '차단하기', style: 'destructive', onPress: openBlock });
    buttons.push({ text: '취소', style: 'cancel' });
    Alert.alert(targetLabel || '신고·차단', undefined, buttons);
  }

  return (
    <Pressable onPress={openMenu} hitSlop={8}>
      <Ionicons name="ellipsis-horizontal" size={22} color={theme.textSecondary} />
    </Pressable>
  );
}
