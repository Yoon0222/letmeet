import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClubCard } from '@/components/club-card';
import { AppFAB } from '@/components/ui/app-fab';
import { AppHeader } from '@/components/ui/app-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { ClubWithCounts } from '@/lib/types';

export default function ClubsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [clubs, setClubs] = useState<ClubWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data, error }, blocked] = await Promise.all([
      supabase.from('clubs_with_counts').select('*').order('member_count', { ascending: false }).limit(100),
      uid ? getBlockedIds(uid) : Promise.resolve([]),
    ]);
    if (error) {
      console.warn('[clubs] load error', error.message);
      setClubs([]);
    } else {
      const blockedSet = new Set(blocked);
      setClubs((data ?? []).filter((c) => !blockedSet.has(c.owner_id))); // 차단한 사용자 클럽 숨김
    }
    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppHeader title="클럽" subtitle="함께 꾸준히 칠 동호회를 찾거나 만들어보세요" />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ClubCard club={item} onPress={() => router.push(`/club/${item.id}`)} />
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
              <Ionicons name="people-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>아직 클럽이 없어요</Text>
              <Text style={styles.emptyBody}>첫 번째 클럽을 만들어보세요.</Text>
            </View>
          }
        />
      )}

      <AppFAB onPress={() => router.push('/club/create')} style={styles.fab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  list: { padding: Spacing.four, paddingTop: 0, gap: Spacing.three, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  emptyBody: { fontSize: 16, color: '#6B7280' },
  fab: { position: 'absolute', right: Spacing.four, bottom: Spacing.four },
});
