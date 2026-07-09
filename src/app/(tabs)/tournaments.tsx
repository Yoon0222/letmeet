import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TournamentCard } from '@/components/tournament-card';
import { AppChip } from '@/components/ui/app-chip';
import { AppHeader } from '@/components/ui/app-header';
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
      .order('start_at', { ascending: false })
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

  // 날짜순 목록을 월별 섹션으로
  const filtered = filter === 'all' ? rows : rows.filter((t) => t.discipline === filter);
  const sections: { key: string; title: string; data: TournamentWithCounts[] }[] = [];
  for (const t of filtered) {
    const d = new Date(t.start_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = sections.find((s) => s.key === key);
    if (!g) {
      g = { key, title: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, data: [] };
      sections.push(g);
    }
    g.data.push(t);
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppHeader title="대회" subtitle="참가 신청하고 대진·결과를 확인하세요" />
      </View>

      {/* 단식/복식 구분 필터 */}
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <AppChip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.monthHeader}>{section.title}</Text>
          )}
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
              <Ionicons name="trophy-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>
                {filter === 'all' ? '아직 대회가 없어요' : `${filter === 'singles' ? '단식' : '복식'} 대회가 없어요`}
              </Text>
              <Text style={styles.emptyBody}>열리는 대회가 생기면 여기에 표시됩니다.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.two },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  list: { padding: Spacing.four, paddingTop: 0, gap: Spacing.three, paddingBottom: 40 },
  monthHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#6B7280',
    backgroundColor: '#F6F7F9',
    paddingTop: 8,
    paddingBottom: 2,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  emptyBody: { fontSize: 16, color: '#6B7280' },
});
