import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MeetupCard } from '@/components/meetup-card';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts } from '@/lib/types';

// 매칭 = 번개 모임: 함께 칠 사람과 판을 찾는 화면
export default function MatchesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [meetups, setMeetups] = useState<MeetupWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, blocked] = await Promise.all([
      supabase
        .from('meetups_with_counts')
        .select('*')
        .gte('start_time', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order('start_time', { ascending: true })
        .limit(100),
      uid ? getBlockedIds(uid) : Promise.resolve([]),
    ]);
    if (error) {
      console.warn('[matches] load error', error.message);
      setMeetups([]);
    } else {
      const blockedSet = new Set(blocked);
      setMeetups((data ?? []).filter((m) => !blockedSet.has(m.host_id))); // 차단한 사용자 모임 숨김
    }
    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const regions = Array.from(new Set(meetups.map((m) => m.region).filter(Boolean)));
  const visible = region ? meetups.filter((m) => m.region === region) : meetups;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>번개 모임</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          가까운 코트에서 함께 칠 사람을 찾아보세요
        </Text>
      </View>

      {regions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}>
          <Chip label="전체" active={region === null} onPress={() => setRegion(null)} theme={theme} />
          {regions.map((r) => (
            <Chip key={r} label={r} active={region === r} onPress={() => setRegion(r)} theme={theme} />
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MeetupCard meetup={item} onPress={() => router.push(`/meetup/${item.id}`)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="flash-outline" size={48} color={theme.tabIconDefault} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>아직 모임이 없어요</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                첫 번째 번개 모임을 만들어보세요!
              </Text>
            </View>
          }
        />
      )}

      <Pressable
        onPress={() => router.push('/meetup/create')}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
        ]}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? theme.primary : theme.backgroundElement }]}>
      <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 14, marginTop: 2 },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: Spacing.four, gap: 8, paddingBottom: Spacing.three, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: 13, fontWeight: '600' },
  list: { padding: Spacing.four, paddingTop: 0, gap: Spacing.three, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14 },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.four,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
