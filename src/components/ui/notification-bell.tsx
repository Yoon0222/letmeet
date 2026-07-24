import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { useNotifications } from '@/contexts/notifications';

type Props = {
  /** 헤더 배경에 맞춰 아이콘 색을 넘긴다. 기본은 진회색. */
  color?: string;
  size?: number;
};

/**
 * 알림 종 아이콘 + 안읽음 뱃지.
 * 자체적으로 안읽음 수를 구독하므로 헤더 어디에 놔도 동작한다.
 * (홈 헤더 배치는 디자인 담당이 넣는다 — 이 컴포넌트만 import 해서 우측에 두면 됨)
 */
export function NotificationBell({ color = '#111827', size = 24 }: Props) {
  const router = useRouter();
  const { unread } = useNotifications();

  return (
    <Pressable
      onPress={() => router.push('/notifications' as never)}
      hitSlop={8}
      style={styles.button}
      accessibilityLabel={unread > 0 ? `알림 ${unread}개` : '알림'}
    >
      <Ionicons name="notifications-outline" size={size} color={color} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: -1,
    right: -1,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Brand.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
});
