import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useNotifications } from '@/contexts/notifications';
import { useTheme } from '@/hooks/use-theme';
import { formatRelative } from '@/lib/format';
import type { AppNotification, NotificationType } from '@/lib/types';

// 알림 종류별 아이콘
const ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  join_request: 'person-add-outline',
  join_approved: 'checkmark-circle-outline',
  comment: 'chatbubble-ellipses-outline',
  match_turn: 'tennisball-outline',
  tie: 'people-outline',
  system: 'megaphone-outline',
};

export default function NotificationsScreen() {
  const theme = useTheme();
  const { items, loading, unread, refresh, markAllRead, openTarget } = useNotifications();

  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: '알림',
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={markAllRead} hitSlop={8}>
                <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 15 }}>
                  모두 읽음
                </Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        ItemSeparatorComponent={() => (
          <View style={[styles.sep, { backgroundColor: theme.border }]} />
        )}
        renderItem={({ item }) => <Row n={item} onPress={() => openTarget(item)} theme={theme} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={40} color={theme.tabIconDefault} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              아직 알림이 없어요
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function Row({
  n,
  onPress,
  theme,
}: {
  n: AppNotification;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const isUnread = !n.read_at;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        { backgroundColor: isUnread ? theme.backgroundSelected : theme.card },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: theme.background }]}>
        <Ionicons name={ICON[n.type] ?? 'notifications-outline'} size={20} color={theme.primary} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {n.title}
        </Text>
        {n.body ? (
          <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={2}>
            {n.body}
          </Text>
        ) : null}
        <Text style={[styles.time, { color: theme.tabIconDefault }]}>
          {formatRelative(n.created_at)}
        </Text>
      </View>
      {isUnread ? <View style={[styles.dot, { backgroundColor: theme.primary }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingVertical: Spacing.half },
  emptyWrap: { flexGrow: 1 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  desc: { fontSize: 13, lineHeight: 18 },
  time: { fontSize: 12, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  emptyText: { fontSize: 15 },
});
