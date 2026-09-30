import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
type StatusFilter = 'registration' | 'ongoing' | 'finished';
type SkillFilter = 'all' | 'beginner' | 'intermediate' | 'advanced';
type FeeFilter = 'all' | 'free' | 'paid';

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
  const [status, setStatus] = useState<StatusFilter>('registration');
  const [region, setRegion] = useState('all');
  const [skill, setSkill] = useState<SkillFilter>('all');
  const [fee, setFee] = useState<FeeFilter>('all');
  const [year, setYear] = useState<number | null>(null); // null=전체 연도
  const [month, setMonth] = useState<number | null>(null); // null=전체 월, 0~11
  const [filterOpen, setFilterOpen] = useState(false); // 필터 모달
  const [visibleCount, setVisibleCount] = useState(5);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('tournaments_with_counts')
      .select('*')
      .is('club_id', null) // 클럽 월례대회는 공개 대회 탭에서 제외 — 해당 클럽 화면에서만
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
  const regions = useMemo(() => [...new Set(rows.map((t) => t.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')), [rows]);

  // 적용된 필터 개수·요약 (필터 버튼 뱃지/한 줄 요약용)
  const activeCount = (filter !== 'all' ? 1 : 0) + (region !== 'all' ? 1 : 0) + (skill !== 'all' ? 1 : 0) + (fee !== 'all' ? 1 : 0) + (year !== null ? 1 : 0) + (month !== null ? 1 : 0);
  const periodLabel = year !== null || month !== null
    ? [year !== null ? `${year}년` : null, month !== null ? `${month + 1}월` : null].filter(Boolean).join(' · ')
    : '기간';
  const resetAll = () => {
    setFilter('all');
    setRegion('all');
    setSkill('all');
    setFee('all');
    setYear(null);
    setMonth(null);
    setVisibleCount(5);
  };

  // 날짜순 목록을 월별 섹션으로 (종목 + 연도 + 월 필터 적용)
  const filtered = rows.filter((t) => {
    if (t.status !== status) return false;
    if (filter !== 'all' && t.discipline !== filter) return false;
    if (region !== 'all' && t.region !== region) return false;
    if (fee === 'free' && t.fee > 0) return false;
    if (fee === 'paid' && t.fee === 0) return false;
    if (skill === 'beginner' && t.skill_min > 3) return false;
    if (skill === 'intermediate' && (t.skill_max < 3 || t.skill_min > 4.5)) return false;
    if (skill === 'advanced' && t.skill_max < 4.5) return false;
    const d = new Date(t.start_at);
    if (year !== null && d.getFullYear() !== year) return false;
    if (month !== null && d.getMonth() !== month) return false;
    return true;
  });
  const visibleRows = filtered.slice(0, visibleCount);
  const sections: { key: string; title: string; data: TournamentWithCounts[] }[] = [];
  for (const t of visibleRows) {
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

      <View style={styles.statusTabs}>
        {(['registration', 'ongoing', 'finished'] as const).map((item) => (
          <Pressable key={item} onPress={() => { setStatus(item); setVisibleCount(5); }} style={[styles.statusTab, status === item && styles.statusTabActive]}>
            <Text style={[styles.statusTabText, status === item && styles.statusTabTextActive]}>
              {item === 'registration' ? '접수중' : item === 'ongoing' ? '진행중' : '종료'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <FilterButton label={filter === 'all' ? '종목' : filter === 'singles' ? '단식' : '복식'} active={filter !== 'all'} onPress={() => setFilterOpen(true)} />
        <FilterButton label={region === 'all' ? '지역' : region} active={region !== 'all'} onPress={() => setFilterOpen(true)} />
        <FilterButton label={periodLabel} active={year !== null || month !== null} onPress={() => setFilterOpen(true)} />
        <FilterButton label={skill === 'all' ? '실력' : skill === 'beginner' ? '3.0 이하' : skill === 'intermediate' ? '3.0–4.5' : '4.5 이상'} active={skill !== 'all'} onPress={() => setFilterOpen(true)} />
        <FilterButton label={fee === 'all' ? '참가비' : fee === 'free' ? '무료' : '유료'} active={fee !== 'all'} onPress={() => setFilterOpen(true)} />
        {activeCount > 0 ? <Pressable onPress={resetAll} style={styles.resetIcon}><Ionicons name="refresh" size={18} color="#AAB4C0" /></Pressable> : null}
      </ScrollView>

      <Text style={styles.resultCount}><Text style={styles.resultAccent}>{status === 'registration' ? '접수중' : status === 'ongoing' ? '진행중' : '종료'}</Text> 대회 {filtered.length}개</Text>

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
          ListFooterComponent={filtered.length > visibleCount ? (
            <Pressable onPress={() => setVisibleCount((count) => count + 5)} style={styles.moreButton}>
              <Text style={styles.moreButtonText}>대회 더보기</Text>
              <Ionicons name="chevron-down" size={17} color="#16C784" />
            </Pressable>
          ) : null}
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
                  <AppChip key={f.key} label={f.label} active={filter === f.key} onPress={() => { setFilter(f.key); setVisibleCount(5); }} />
                ))}
              </FilterSection>

              <FilterSection label="지역">
                <AppChip label="전체" active={region === 'all'} onPress={() => { setRegion('all'); setVisibleCount(5); }} />
                {regions.map((item) => <AppChip key={item} label={item} active={region === item} onPress={() => { setRegion(item); setVisibleCount(5); }} />)}
              </FilterSection>

              <FilterSection label="실력">
                {([
                  ['all', '전체'],
                  ['beginner', '3.0 이하'],
                  ['intermediate', '3.0–4.5'],
                  ['advanced', '4.5 이상'],
                ] as const).map(([key, label]) => <AppChip key={key} label={label} active={skill === key} onPress={() => { setSkill(key); setVisibleCount(5); }} />)}
              </FilterSection>

              <FilterSection label="참가비">
                {([['all', '전체'], ['free', '무료'], ['paid', '유료']] as const).map(([key, label]) => <AppChip key={key} label={label} active={fee === key} onPress={() => { setFee(key); setVisibleCount(5); }} />)}
              </FilterSection>

              {years.length > 1 ? (
                <FilterSection label="연도">
                  <AppChip label="전체" active={year === null} onPress={() => { setYear(null); setVisibleCount(5); }} />
                  {years.map((y) => (
                    <AppChip
                      key={y}
                      label={`${y}년`}
                      active={year === y}
                      onPress={() => {
                        const next = year === y ? null : y;
                        setYear(next);
                        setVisibleCount(5);
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
                  <AppChip label="전체" active={month === null} onPress={() => { setMonth(null); setVisibleCount(5); }} />
                  {months.map((m) => (
                    <AppChip key={m} label={`${m + 1}월`} active={month === m} onPress={() => { setMonth(month === m ? null : m); setVisibleCount(5); }} />
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

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-down" size={14} color={active ? '#16C784' : '#AAB4C0'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.two },
  statusTabs: { flexDirection: 'row', height: 46, marginHorizontal: Spacing.four, marginBottom: Spacing.two, borderRadius: 8, overflow: 'hidden', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  statusTab: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.09)' },
  statusTabActive: { backgroundColor: '#16C784' },
  statusTabText: { color: '#AAB4C0', fontSize: 14, fontWeight: '800' },
  statusTabTextActive: { color: '#07100D' },
  filterScroll: { flexGrow: 0, height: 48 },
  filterRow: { height: 48, alignItems: 'flex-start', gap: 8, paddingHorizontal: Spacing.four },
  filterChip: { maxWidth: 150, height: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  filterChipActive: { borderColor: 'rgba(22,199,132,0.65)', backgroundColor: 'rgba(22,199,132,0.10)' },
  filterChipText: { color: '#AAB4C0', fontSize: 13, fontWeight: '800', flexShrink: 1 },
  filterChipTextActive: { color: '#16C784' },
  resetIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  resultCount: { minHeight: 40, color: '#F8FAFC', fontSize: 16, lineHeight: 22, fontWeight: '900', paddingHorizontal: Spacing.four, paddingTop: 2, paddingBottom: Spacing.two },
  resultAccent: { color: '#16C784' },
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
  moreButton: { height: 48, marginTop: Spacing.two, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, borderWidth: 1, borderColor: '#16C784' },
  moreButtonText: { color: '#16C784', fontSize: 14, fontWeight: '900' },
});
