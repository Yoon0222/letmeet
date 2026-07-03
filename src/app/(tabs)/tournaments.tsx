import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TournamentCard } from '@/components/tournament-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import type { Discipline, TournamentWithCounts } from '@/lib/types';

type DisciplineFilter = 'all' | Discipline;

const FILTERS: { key: DisciplineFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'singles', label: '단식' },
  { key: 'doubles', label: '복식' },
];

export default function TournamentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<TournamentWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<DisciplineFilter>('all');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('tournaments_with_counts')
      .select('*')
      .neq('status', 'cancelled')
      .order('start_at', { ascending: true })
      .limit(100);
    if (error) {
      console.warn('[tournaments] load error', error.message);
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>대회</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          참가 신청하고 대진·결과를 확인하세요
        </Text>
      </View>

      {/* 단식/복식 구분 필터 */}
      <View style={styles.segment}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.segItem,
                { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' },
              ]}>
              <Text
                style={[styles.segText, { color: active ? '#fff' : theme.textSecondary }]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={filter === 'all' ? rows : rows.filter((t) => t.discipline === filter)}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TournamentCard tournament={item} onPress={() => router.push(`/tournament/${item.id}`)} />
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
              <Ionicons name="trophy-outline" size={48} color={theme.tabIconDefault} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {filter === 'all' ? '아직 대회가 없어요' : `${filter === 'singles' ? '단식' : '복식'} 대회가 없어요`}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                열리는 대회가 생기면 여기에 표시됩니다.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.two },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 14, marginTop: 2 },
  segment: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  segItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  segText: { fontSize: 14, fontWeight: '700' },
  list: { padding: Spacing.four, paddingTop: 0, gap: Spacing.three, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14 },
});
