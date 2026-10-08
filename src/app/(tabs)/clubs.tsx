import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppFAB } from '@/components/ui/app-fab';
import { AppHeader } from '@/components/ui/app-header';
import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { ClubSession, ClubWithCounts } from '@/lib/types';

type ClubView = 'mine' | 'explore';
type ClubFilter = 'all' | 'local' | 'new' | 'popular';
type ClubActivity = {
  nextSession: Pick<ClubSession, 'title' | 'session_date' | 'start_at'> | null;
  newNoticeCount: number;
};

const FILTERS: { key: ClubFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: '전체', icon: 'grid-outline' },
  { key: 'local', label: '내 지역', icon: 'location-outline' },
  { key: 'new', label: '신규', icon: 'sparkles-outline' },
  { key: 'popular', label: '멤버 많은 순', icon: 'people-outline' },
];

function sessionLabel(session: ClubActivity['nextSession']) {
  if (!session) return null;
  const time = session.start_at?.slice(0, 5) || '00:00';
  const date = parseISO(`${session.session_date}T${time}:00`);
  return `${format(date, 'M월 d일 (EEE) a h:mm', { locale: ko })} ${session.title}`;
}

function ClubListCard({ club, activity, membership, onPress }: {
  club: ClubWithCounts;
  activity?: ClubActivity;
  membership: 'member' | 'pending' | 'none';
  onPress: () => void;
}) {
  const theme = useTheme();
  const upcoming = sessionLabel(activity?.nextSession ?? null);
  const detail = upcoming
    ? upcoming
    : activity?.newNoticeCount
      ? `새 공지 ${activity.newNoticeCount}개`
      : membership === 'pending'
        ? '가입 승인을 기다리고 있어요'
        : club.require_approval
          ? '가입 승인 후 활동할 수 있어요'
          : '지금 바로 가입할 수 있어요';
  const detailIcon: keyof typeof Ionicons.glyphMap = upcoming
    ? 'calendar-outline'
    : activity?.newNoticeCount
      ? 'notifications-outline'
      : membership === 'pending'
        ? 'time-outline'
        : 'flash-outline';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.clubCard, membership !== 'none' && styles.clubCardMine, pressed && styles.clubCardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${club.name}, ${club.region || '지역 미설정'}, 멤버 ${club.member_count}명`}
    >
      {club.image_url ? (
        <Image source={{ uri: club.image_url }} style={styles.clubCover} />
      ) : (
        <View style={[styles.clubCover, styles.clubCoverFallback]}>
          <Ionicons name="people-outline" size={28} color={theme.primary} />
        </View>
      )}
      <View style={styles.clubBody}>
        <View style={styles.clubNameRow}>
          <Text style={styles.clubName} numberOfLines={1}>{club.name}</Text>
          {club.tier === 'premium' ? <Badge label="Premium" style={styles.premiumBadge} /> : null}
        </View>
        <Text style={styles.clubMeta} numberOfLines={1}>
          {club.region || '지역 미설정'} · 멤버 {club.member_count}명{membership === 'pending' ? ' · 신청 중' : ''}
        </Text>
        <View style={styles.activityRow}>
          <Ionicons name={detailIcon} size={14} color={theme.primary} />
          <Text style={styles.activityText} numberOfLines={1}>{detail}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.tabIconDefault} />
    </Pressable>
  );
}

export default function ClubsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const profileRegion = profile?.region ?? '';
  const [clubs, setClubs] = useState<ClubWithCounts[]>([]);
  const [myClubIds, setMyClubIds] = useState<Set<string>>(new Set());
  const [pendingClubIds, setPendingClubIds] = useState<Set<string>>(new Set());
  const [activityByClub, setActivityByClub] = useState<Record<string, ClubActivity>>({});
  const [view, setView] = useState<ClubView>('mine');
  const [filter, setFilter] = useState<ClubFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const openCreateClub = useCallback(() => {
    router.push(session ? '/club/create' : '/(auth)/sign-in');
  }, [router, session]);

  const load = useCallback(async () => {
    const [{ data, error }, blocked, { data: myMem }] = await Promise.all([
      supabase.from('clubs_with_counts').select('*').order('member_count', { ascending: false }).limit(100),
      uid ? getBlockedIds(uid) : Promise.resolve([]),
      uid
        ? supabase.from('club_members').select('club_id, status').eq('user_id', uid)
        : Promise.resolve({ data: [] as { club_id: string; status: string }[] }),
    ]);

    const mem = (myMem as { club_id: string; status: string }[] | null) ?? [];
    const approvedIds = mem.filter((item) => item.status === 'approved').map((item) => item.club_id);
    const pendingIds = mem.filter((item) => item.status === 'pending').map((item) => item.club_id);
    setMyClubIds(new Set(approvedIds));
    setPendingClubIds(new Set(pendingIds));

    if (error) {
      console.warn('[clubs] load error', error.message);
      setClubs([]);
    } else {
      const blockedSet = new Set(blocked);
      setClubs((data ?? []).filter((club) => !blockedSet.has(club.owner_id)));
    }

    if (approvedIds.length > 0) {
      const today = format(new Date(), 'yyyy-MM-dd');
      const noticeSince = subDays(new Date(), 7).toISOString();
      const [{ data: sessions }, { data: notices }] = await Promise.all([
        supabase
          .from('club_sessions')
          .select('club_id, title, session_date, start_at')
          .in('club_id', approvedIds)
          .gte('session_date', today)
          .neq('status', 'canceled')
          .order('session_date', { ascending: true })
          .order('start_at', { ascending: true }),
        supabase
          .from('club_posts')
          .select('club_id')
          .in('club_id', approvedIds)
          .eq('is_notice', true)
          .gte('created_at', noticeSince),
      ]);

      const nextActivity: Record<string, ClubActivity> = {};
      approvedIds.forEach((clubId) => {
        nextActivity[clubId] = { nextSession: null, newNoticeCount: 0 };
      });
      ((sessions ?? []) as Pick<ClubSession, 'club_id' | 'title' | 'session_date' | 'start_at'>[]).forEach((item) => {
        if (!nextActivity[item.club_id].nextSession) nextActivity[item.club_id].nextSession = item;
      });
      ((notices ?? []) as { club_id: string }[]).forEach((item) => {
        nextActivity[item.club_id].newNoticeCount += 1;
      });
      setActivityByClub(nextActivity);
    } else {
      setActivityByClub({});
    }

    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const myClubs = useMemo(() => clubs.filter((club) => myClubIds.has(club.id)), [clubs, myClubIds]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesSearch = (club: ClubWithCounts) => !q || `${club.name} ${club.region}`.toLowerCase().includes(q);
    const isLocal = (club: ClubWithCounts) => !profileRegion || club.region.includes(profileRegion) || profileRegion.includes(club.region);
    const isNew = (club: ClubWithCounts) => new Date(club.created_at) >= subDays(new Date(), 45);
    const applyFilter = (items: ClubWithCounts[]) => {
      const filtered = items.filter(matchesSearch).filter((club) => {
        if (filter === 'local') return isLocal(club);
        if (filter === 'new') return isNew(club);
        return true;
      });
      return filter === 'popular' ? [...filtered].sort((a, b) => b.member_count - a.member_count) : filtered;
    };

    if (view === 'mine') return [{ title: '내 클럽', data: applyFilter(myClubs) }];
    const pending = applyFilter(clubs.filter((club) => pendingClubIds.has(club.id) && !myClubIds.has(club.id)));
    const recommendations = applyFilter(clubs.filter((club) => !myClubIds.has(club.id) && !pendingClubIds.has(club.id)));
    return [...(pending.length > 0 ? [{ title: '가입 신청 중', data: pending }] : []), { title: '추천 클럽', data: recommendations }];
  }, [clubs, filter, myClubIds, myClubs, pendingClubIds, profileRegion, query, view]);

  const resultCount = sections.reduce((total, section) => total + section.data.length, 0);
  const emptyTitle = query.trim() || filter !== 'all'
    ? '조건에 맞는 클럽이 없어요'
    : view === 'mine'
      ? '아직 가입한 클럽이 없어요'
      : '둘러볼 클럽이 없어요';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <AppHeader
          title="클럽"
          subtitle="꾸준히 함께 칠 사람들을 만나보세요"
          rightIcon="add"
          rightAccent
          onRightPress={openCreateClub}
          onBack={router.canGoBack() ? () => router.back() : undefined}
        />
      </View>

      <View style={styles.segmentWrap}>
        <Pressable onPress={() => setView('mine')} style={[styles.segment, view === 'mine' && styles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: view === 'mine' }}>
          <Text style={[styles.segmentText, view === 'mine' && styles.segmentTextActive]}>내 클럽 {myClubs.length}</Text>
        </Pressable>
        <Pressable onPress={() => setView('explore')} style={[styles.segment, view === 'explore' && styles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: view === 'explore' }}>
          <Text style={[styles.segmentText, view === 'explore' && styles.segmentTextActive]}>클럽 둘러보기</Text>
        </Pressable>
      </View>

      {!loading && clubs.length > 0 ? (
        <>
          <View style={styles.searchWrap}>
            <View style={styles.search}>
              <Ionicons name="search" size={17} color={theme.tabIconDefault} />
              <TextInput value={query} onChangeText={setQuery} placeholder="클럽 이름 또는 지역 검색" placeholderTextColor={theme.tabIconDefault} style={[styles.searchInput, { color: theme.text }]} returnKeyType="search" />
              {query.length > 0 ? <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="검색어 지우기"><Ionicons name="close-circle" size={17} color={theme.tabIconDefault} /></Pressable> : null}
            </View>
          </View>
          <View style={styles.filterRow}>
            {FILTERS.map((item) => {
              const selected = filter === item.key;
              return (
                <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.filterChip, selected && styles.filterChipActive]} accessibilityRole="button" accessibilityState={{ selected }}>
                  <Ionicons name={item.icon} size={13} color={selected ? theme.primary : theme.textSecondary} />
                  <Text style={[styles.filterText, selected && styles.filterTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {loading ? <View style={styles.center}><ActivityIndicator color={theme.primary} /></View> : (
        <SectionList
          sections={sections}
          keyExtractor={(club) => club.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ClubListCard club={item} activity={activityByClub[item.id]} membership={myClubIds.has(item.id) ? 'member' : pendingClubIds.has(item.id) ? 'pending' : 'none'} onPress={() => router.push(`/club/${item.id}`)} />
            </View>
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>{section.title}</Text>
              <Text style={styles.sectionMeta}>{section.title === '내 클럽' ? '다가오는 활동 순' : `${section.data.length}개`}</Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={view === 'mine' ? 'people-outline' : 'search'} size={46} color={theme.tabIconDefault} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyBody}>{view === 'mine' ? '둘러보기에서 나와 맞는 클럽을 찾아보세요.' : '검색어나 필터를 변경해보세요.'}</Text>
              {view === 'mine' ? <Pressable onPress={() => setView('explore')} style={styles.emptyButton}><Text style={styles.emptyButtonText}>클럽 둘러보기</Text><Ionicons name="arrow-forward" size={16} color="#07110C" /></Pressable> : null}
            </View>
          }
          ListFooterComponent={resultCount > 0 ? <View style={styles.listEndSpace} /> : null}
        />
      )}

      <AppFAB onPress={openCreateClub} style={[styles.fab, { bottom: 86 + Math.max(insets.bottom, 16) }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  segmentWrap: { marginHorizontal: Spacing.four, marginBottom: Spacing.three, padding: 4, flexDirection: 'row', gap: 4, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderCurve: 'continuous' },
  segmentActive: { backgroundColor: 'rgba(22,199,132,0.18)' },
  segmentText: { color: '#8A96A2', fontSize: 14, fontWeight: '800' },
  segmentTextActive: { color: '#16C784' },
  searchWrap: { paddingHorizontal: Spacing.four, paddingBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, flexWrap: 'wrap' },
  filterChip: { minHeight: 34, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 17, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  filterChipActive: { backgroundColor: 'rgba(22,199,132,0.13)', borderColor: 'rgba(22,199,132,0.55)' },
  filterText: { color: '#AAB4C0', fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: '#16C784' },
  list: { paddingHorizontal: Spacing.four, paddingBottom: 124 },
  cardWrap: { marginBottom: 10 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 10 },
  sectionHeader: { fontSize: 17, fontWeight: '900', color: '#F8FAFC' },
  sectionMeta: { fontSize: 12, color: '#707B87' },
  clubCard: { minHeight: 102, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  clubCardMine: { backgroundColor: 'rgba(10,36,29,0.82)', borderColor: 'rgba(22,199,132,0.48)' },
  clubCardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  clubCover: { width: 68, height: 68, borderRadius: 13, borderCurve: 'continuous' },
  clubCoverFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22,199,132,0.12)' },
  clubBody: { flex: 1, minWidth: 0 },
  clubNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 2 },
  clubName: { flexShrink: 1, color: '#F8FAFC', fontSize: 15, fontWeight: '900' },
  premiumBadge: { paddingHorizontal: 7, paddingVertical: 3 },
  clubMeta: { marginTop: 5, color: '#AAB4C0', fontSize: 12 },
  activityRow: { marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  activityText: { flex: 1, color: '#D7DEE5', fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 64, paddingHorizontal: Spacing.four },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', textAlign: 'center' },
  emptyBody: { fontSize: 14, color: '#AAB4C0', textAlign: 'center' },
  emptyButton: { minHeight: 44, marginTop: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#9BE137' },
  emptyButtonText: { color: '#07110C', fontSize: 14, fontWeight: '900' },
  listEndSpace: { height: 12 },
  fab: { position: 'absolute', right: Spacing.four },
});
