import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeetupCard } from '@/components/meetup-card';
import { AppChip } from '@/components/ui/app-chip';
import { AppFAB } from '@/components/ui/app-fab';
import { AppHeader } from '@/components/ui/app-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts } from '@/lib/types';

export default function MatchesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
        .neq('status', 'cancelled') // 취소된 모임은 목록에서 숨김
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
      setMeetups((data ?? []).filter((m) => !blockedSet.has(m.host_id)));
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppHeader title="번개 모임" subtitle="가까운 코트에서 함께 칠 사람을 찾아보세요" />
      </View>

      {regions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}>
          <AppChip label="전체" active={region === null} onPress={() => setRegion(null)} />
          {regions.map((r) => (
            <AppChip key={r} label={r} active={region === r} onPress={() => setRegion(r)} />
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
              <Ionicons name="flash-outline" size={48} color="#707B87" />
              <Text style={styles.emptyTitle}>아직 모임이 없어요</Text>
              <Text style={styles.emptyBody}>첫 번개 모임을 만들어보세요.</Text>
            </View>
          }
        />
      )}

      <AppFAB
        onPress={() => router.push(session ? '/meetup/create' : '/(auth)/sign-in')}
        style={[styles.fab, { bottom: 86 + Math.max(insets.bottom, 16) }]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: Spacing.four, gap: 8, paddingBottom: Spacing.three, alignItems: 'center' },
  list: { padding: Spacing.four, paddingTop: 0, gap: Spacing.three, paddingBottom: 124 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  emptyBody: { fontSize: 16, color: '#AAB4C0' },
  fab: {
    position: 'absolute',
    right: Spacing.four,
  },
});
