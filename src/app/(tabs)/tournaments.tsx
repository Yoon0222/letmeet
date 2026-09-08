import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
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
  const [year, setYear] = useState<number | null>(null); // null=전체 연도
  const [month, setMonth] = useState<number | null>(null); // null=전체 월, 0~11
  const [filterOpen, setFilterOpen] = useState(false); // 필터 모달

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('tournaments_with_counts')
      .select('*')
      .is('club_id', null) // 클럽 월례대회는 공개 대회 탭에서 제외 — 해당 클럽 화면에서만
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

  // 목록에 존재하는 연도/월 (최신순 유지) — 필터 모달 칩에 사용.
  //   연도를 고르면 그 해에 있는 월만 노출. (지역·실력 등 새 필터는 모달에 섹션만 추가하면 된다)
  const years: number[] = [];
  for (const t of rows) {
    const y = new Date(t.start_at).getFullYear();
    if (!years.includes(y)) years.push(y);
  }
  const monthPool = year === null ? rows : rows.filter((t) => new Date(t.start_at).getFullYear() === year);
  const months: number[] = [];
  for (const t of monthPool) {
    const m = new Date(t.start_at).getMonth();
    if (!months.includes(m)) months.push(m);
  }

  // 적용된 필터 개수·요약 (필터 버튼 뱃지/한 줄 요약용)
  const activeCount = (filter !== 'all' ? 1 : 0) + (year !== null ? 1 : 0) + (month !== null ? 1 : 0);
  const summary =
    [filter !== 'all' ? (filter === 'singles' ? '단식' : '복식') : null, year !== null ? `${year}년` : null, month !== null ? `${month + 1}월` : null]
      .filter(Boolean)
      .join(' · ') || '전체 대회';
  const resetAll = () => {
    setFilter('all');
    setYear(null);
    setMonth(null);
  };

  // 날짜순 목록을 월별 섹션으로 (종목 + 연도 + 월 필터 적용)
  const filtered = (filter === 'all' ? rows : rows.filter((t) => t.discipline === filter)).filter((t) => {
    const d = new Date(t.start_at);
    if (year !== null && d.getFullYear() !== year) return false;
    if (month !== null && d.getMonth() !== month) return false;
    return true;
  });
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
        <AppHeader title="대회" subtitle="참가 신청하고 대진·결과를 확인하세요" onBack={router.canGoBack() ? () => router.back() : undefined} />
      </View>

      {/* 필터 — 상세 조건은 모달에서. 버튼엔 적용 개수 뱃지, 옆엔 한 줄 요약 */}
      <View style={styles.filterRow}>
        <Pressable onPress={() => setFilterOpen(true)} style={[styles.filterBtn, activeCount > 0 && styles.filterBtnOn]}>
          <Ionicons name="options-outline" size={16} color={activeCount > 0 ? '#07100D' : '#F8FAFC'} />
          <Text style={[styles.filterBtnTxt, activeCount > 0 && styles.filterBtnTxtOn]}>필터</Text>
          {activeCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeTxt}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Text style={styles.filterSummary} numberOfLines={1}>{summary}</Text>
        {activeCount > 0 ? (
          <Pressable onPress={resetAll} hitSlop={8} style={styles.filterClear}>
            <Ionicons name="close-circle" size={18} color="#707B87" />
          </Pressable>
        ) : null}
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
              <Ionicons name="trophy-outline" size={48} color="#707B87" />
              <Text style={styles.emptyTitle}>
                {month
                  ? '이 달엔 대회가 없어요'
                  : filter === 'all'
                    ? '아직 대회가 없어요'
                    : `${filter === 'singles' ? '단식' : '복식'} 대회가 없어요`}
              </Text>
              <Text style={styles.emptyBody}>열리는 대회가 생기면 여기에 표시됩니다.</Text>
            </View>
          }
        />
      )}

      {/* 필터 모달 — 선택 즉시 적용 */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>필터</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8} style={styles.modalClose}>
                <Ionicons name="close" size={20} color="#AAB4C0" />
              </Pressable>
            </View>

            {/* 섹션이 늘어나도(지역·실력 등) 스크롤로 수용 — FilterSection 만 추가하면 된다 */}
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <FilterSection label="종목">
                {FILTERS.map((f) => (
                  <AppChip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
                ))}
              </FilterSection>

              {years.length > 1 ? (
                <FilterSection label="연도">
                  <AppChip label="전체" active={year === null} onPress={() => { setYear(null); }} />
                  {years.map((y) => (
                    <AppChip
                      key={y}
                      label={`${y}년`}
                      active={year === y}
                      onPress={() => {
                        const next = year === y ? null : y;
                        setYear(next);
                        // 바뀐 연도에 없는 월이 선택돼 있으면 해제
                        if (month !== null) {
                          const pool = next === null ? rows : rows.filter((t) => new Date(t.start_at).getFullYear() === next);
                          if (!pool.some((t) => new Date(t.start_at).getMonth() === month)) setMonth(null);
                        }
                      }}
                    />
                  ))}
                </FilterSection>
              ) : null}

              {months.length > 0 ? (
                <FilterSection label="월">
                  <AppChip label="전체" active={month === null} onPress={() => setMonth(null)} />
                  {months.map((m) => (
                    <AppChip key={m} label={`${m + 1}월`} active={month === m} onPress={() => setMonth(month === m ? null : m)} />
                  ))}
                </FilterSection>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable onPress={resetAll} style={styles.resetBtn}>
                <Text style={styles.resetTxt}>초기화</Text>
              </Pressable>
              <Pressable onPress={() => setFilterOpen(false)} style={styles.doneBtn}>
                <Text style={styles.doneTxt}>완료</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// 필터 모달 섹션 — 새 필터(지역·실력·참가비 등)는 이 컴포넌트로 섹션만 추가
function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.modalLabel}>{label}</Text>
      <View style={styles.modalChips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.two },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 14,
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  filterBtnOn: { backgroundColor: '#16C784', borderColor: '#16C784' },
  filterBtnTxt: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  filterBtnTxtOn: { color: '#07100D' },
  filterBadge: { minWidth: 18, height: 18, borderRadius: 999, backgroundColor: '#07100D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeTxt: { color: '#16C784', fontSize: 11, fontWeight: '900' },
  filterSummary: { flex: 1, color: '#AAB4C0', fontSize: 13, fontWeight: '700' },
  filterClear: { padding: 2 },
  // 필터 모달 (가운데 다이얼로그)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.four },
  modalCard: {
    maxHeight: '78%', backgroundColor: '#10161D', borderRadius: 24, borderCurve: 'continuous',
    paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.four,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  modalBody: { flexGrow: 0 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  modalClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#151D25' },
  modalLabel: { color: '#AAB4C0', fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  modalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 20 },
  resetBtn: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#151D25', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  resetTxt: { color: '#AAB4C0', fontSize: 15, fontWeight: '800' },
  doneBtn: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#16C784' },
  doneTxt: { color: '#07100D', fontSize: 15, fontWeight: '900' },
  list: { padding: Spacing.four, paddingTop: 0, gap: Spacing.three, paddingBottom: 124 },
  monthHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#AAB4C0',
    backgroundColor: '#070A0D',
    paddingTop: 8,
    paddingBottom: 2,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  emptyBody: { fontSize: 16, color: '#AAB4C0' },
});
